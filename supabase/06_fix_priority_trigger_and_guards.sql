-- ============================================================================
-- Garbage Collector – Final Audited Upgrade Migration
-- File: supabase/06_fix_priority_trigger_and_guards.sql
--
-- USE THIS FILE TO UPGRADE AN EXISTING LIVE SUPABASE DATABASE.
-- (For a brand-new database, run supabase/RUN_ALL_SETUP.sql instead.)
--
-- SAFETY & SECURITY GUARANTEES:
-- 1. Non-destructive & Idempotent: Never drops tables, never deletes existing
--    users/reports/areas/history, never disables RLS, safely rerunnable.
-- 2. PostgreSQL-valid `\m...\M` word-boundary regex for single-column status
--    CHECK constraints only — preserves all unrelated validation constraints.
-- 3. New citizen reports receive status `PENDING`; existing `OPEN` reports
--    remain valid and untouched.
-- 4. Fixes `Unauthorized modification of protected report fields.` during
--    nearby cluster priority recalculation via a 4-factor unabusable guard in
--    SECURITY INVOKER `before_update_report()`.
-- 5. Properly supports `service_role` server-side operations while blocking
--    unauthenticated `anon`/`authenticated` requests fail-closed.
-- 6. Revokes direct browser RPC access to all internal priority and trigger
--    functions; grants only minimum required permissions.
-- 7. Enforces consistent Collector service-area scoping (non-NULL area match)
--    across reports SELECT/UPDATE, history SELECT, profiles SELECT, Storage
--    SELECT/INSERT, and report notifications.
-- 8. Validates Collector `after_image_url` belongs to `after/<report_id>/...`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Defensive Sequence Guard (No-Op If Already Present; Never Resets Value)
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.report_number_seq START WITH 1 INCREMENT BY 1;

-- ----------------------------------------------------------------------------
-- 1. Precise, Rerunnable Single-Column Status CHECK Constraint Updates
--    Uses PostgreSQL POSIX word boundaries (`\m`, `\M`) on single-column
--    constraints only so unrelated constraints are never touched.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_con RECORD;
BEGIN
  -- 1a. public.reports.status
  FOR v_con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = c.conkey[1]
    WHERE c.conrelid = 'public.reports'::regclass
      AND c.contype = 'c'
      AND array_length(c.conkey, 1) = 1
      AND a.attname = 'status'
      AND (
        c.conname = 'reports_status_check'
        OR pg_get_constraintdef(c.oid) ~* '\mstatus\M.*(= ANY|IN)\s*\('
      )
  LOOP
    EXECUTE format('ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;

  ALTER TABLE public.reports
    ADD CONSTRAINT reports_status_check
    CHECK (status IN ('PENDING', 'OPEN', 'IN_PROGRESS', 'RESOLVED'));

  ALTER TABLE public.reports
    ALTER COLUMN status SET DEFAULT 'PENDING';

  -- 1b. public.report_status_history.old_status
  FOR v_con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = c.conkey[1]
    WHERE c.conrelid = 'public.report_status_history'::regclass
      AND c.contype = 'c'
      AND array_length(c.conkey, 1) = 1
      AND a.attname = 'old_status'
      AND (
        c.conname = 'report_status_history_old_status_check'
        OR pg_get_constraintdef(c.oid) ~* '\mold_status\M.*(= ANY|IN)\s*\('
      )
  LOOP
    EXECUTE format('ALTER TABLE public.report_status_history DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;

  ALTER TABLE public.report_status_history
    ADD CONSTRAINT report_status_history_old_status_check
    CHECK (old_status IS NULL OR old_status IN ('PENDING', 'OPEN', 'IN_PROGRESS', 'RESOLVED'));

  -- 1c. public.report_status_history.new_status
  FOR v_con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = c.conkey[1]
    WHERE c.conrelid = 'public.report_status_history'::regclass
      AND c.contype = 'c'
      AND array_length(c.conkey, 1) = 1
      AND a.attname = 'new_status'
      AND (
        c.conname = 'report_status_history_new_status_check'
        OR pg_get_constraintdef(c.oid) ~* '\mnew_status\M.*(= ANY|IN)\s*\('
      )
  LOOP
    EXECUTE format('ALTER TABLE public.report_status_history DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;

  ALTER TABLE public.report_status_history
    ADD CONSTRAINT report_status_history_new_status_check
    CHECK (new_status IN ('PENDING', 'OPEN', 'IN_PROGRESS', 'RESOLVED'));
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Bind Anonymous Auth JWT to Existing Verified Session (`gc_bind_auth_session`)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gc_bind_auth_session()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
  v_auth UUID;
  v_updated INTEGER;
BEGIN
  v_auth := auth.uid();
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Anonymous Supabase Auth session is not active.';
  END IF;

  v_token := public.get_session_header_token();
  IF v_token IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.user_sessions
      WHERE auth_uid = v_auth AND revoked_at IS NULL AND expires_at > now()
    ) THEN
      RETURN TRUE;
    END IF;
    RAISE EXCEPTION 'No active application session found. Please log in again.';
  END IF;

  UPDATE public.user_sessions
  SET auth_uid = NULL
  WHERE auth_uid = v_auth AND token <> v_token;

  UPDATE public.user_sessions
  SET auth_uid = v_auth
  WHERE token = v_token
    AND revoked_at IS NULL
    AND expires_at > now();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Application session expired or revoked. Please log in again.';
  END IF;

  RETURN TRUE;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Internal Server-Only Priority Functions (SECURITY DEFINER)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_nearby_priorities(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  v_score INTEGER;
  v_label TEXT;
BEGIN
  PERFORM set_config('gc.internal_priority_update', 'on', true);

  BEGIN
    FOR rec IN
      SELECT id, severity, created_at, latitude, longitude, priority_score, priority
      FROM public.reports
      WHERE status <> 'RESOLVED'
        AND abs(latitude - p_lat) < 0.001
        AND abs(longitude - p_lng) < 0.001
    LOOP
      v_score := public.calculate_priority_score(
        rec.severity, rec.created_at, rec.latitude, rec.longitude, rec.id
      );
      v_label := public.priority_label_from_score(v_score);

      IF rec.priority_score IS DISTINCT FROM v_score OR rec.priority IS DISTINCT FROM v_label THEN
        UPDATE public.reports
        SET priority_score = v_score,
            priority = v_label
        WHERE id = rec.id;
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('gc.internal_priority_update', 'off', true);
    RAISE;
  END;

  PERFORM set_config('gc.internal_priority_update', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_open_report_priorities()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  v_score INTEGER;
  v_label TEXT;
  v_updated INTEGER := 0;
  v_jwt_role TEXT;
BEGIN
  -- Block browser roles (anon/authenticated); allow postgres / pg_cron / service_role
  IF session_user = 'authenticator' THEN
    v_jwt_role := COALESCE(
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      'anon'
    );
    IF v_jwt_role <> 'service_role' THEN
      RAISE EXCEPTION 'Forbidden: Priority batch recalculation is server-only.';
    END IF;
  END IF;

  PERFORM set_config('gc.internal_priority_update', 'on', true);

  BEGIN
    FOR rec IN
      SELECT id, severity, created_at, latitude, longitude, priority_score, priority
      FROM public.reports
      WHERE status <> 'RESOLVED'
    LOOP
      v_score := public.calculate_priority_score(
        rec.severity, rec.created_at, rec.latitude, rec.longitude, rec.id
      );
      v_label := public.priority_label_from_score(v_score);

      IF rec.priority_score IS DISTINCT FROM v_score OR rec.priority IS DISTINCT FROM v_label THEN
        UPDATE public.reports
        SET priority_score = v_score,
            priority = v_label
        WHERE id = rec.id;
        v_updated := v_updated + 1;
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('gc.internal_priority_update', 'off', true);
    RAISE;
  END;

  PERFORM set_config('gc.internal_priority_update', 'off', true);
  RETURN v_updated;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Report Lifecycle Triggers (Fail-Closed + Area-Scoped + Recursion-Safe)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.before_insert_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq BIGINT;
  v_matched_area UUID;
  v_score INTEGER;
  v_uid UUID;
  v_role TEXT;
  v_jwt_role TEXT;
BEGIN
  v_uid := public.get_current_user_id();

  -- Fail closed for unauthenticated anon/authenticated API requests
  IF v_uid IS NULL THEN
    IF session_user = 'authenticator' THEN
      v_jwt_role := COALESCE(
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
        'anon'
      );
      IF v_jwt_role <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: Active authenticated session required to submit a report.';
      END IF;
    ELSIF current_user IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'Unauthorized: Active authenticated session required to submit a report.';
    END IF;

    -- Direct SQL Editor / postgres / service_role maintenance path
    IF NEW.report_number IS NULL OR trim(NEW.report_number) = '' THEN
      v_seq := nextval('public.report_number_seq');
      NEW.report_number := 'GC-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::TEXT, 6, '0');
    END IF;
    NEW.status := COALESCE(NULLIF(trim(NEW.status), ''), 'PENDING');
    v_score := public.calculate_priority_score(NEW.severity, now(), NEW.latitude, NEW.longitude, NEW.id);
    NEW.priority_score := v_score;
    NEW.priority := public.priority_label_from_score(v_score);
    RETURN NEW;
  END IF;

  v_role := public.get_my_role();
  IF v_role NOT IN ('citizen', 'admin') THEN
    RAISE EXCEPTION 'Forbidden: Only citizens or administrators can submit waste reports.';
  END IF;

  IF NEW.report_number IS NULL OR trim(NEW.report_number) = '' THEN
    v_seq := nextval('public.report_number_seq');
    NEW.report_number := 'GC-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::TEXT, 6, '0');
  END IF;

  -- Citizens can never set citizen_id, status, area_id, assigned_collector_id,
  -- after_image_url, resolved_at, or priority.
  IF v_role <> 'admin' THEN
    NEW.citizen_id := v_uid;
    NEW.status := 'PENDING';
    NEW.area_id := NULL;
    NEW.assigned_collector_id := NULL;
    NEW.after_image_url := NULL;
    NEW.resolved_at := NULL;
  ELSE
    NEW.citizen_id := COALESCE(NEW.citizen_id, v_uid);
    NEW.status := COALESCE(NULLIF(trim(NEW.status), ''), 'PENDING');
  END IF;

  -- Auto-assign closest matching service area within radius
  IF NEW.area_id IS NULL THEN
    SELECT sa.id INTO v_matched_area
    FROM public.service_areas sa
    WHERE public.calc_distance_km(sa.latitude, sa.longitude, NEW.latitude, NEW.longitude) <= sa.radius
    ORDER BY public.calc_distance_km(sa.latitude, sa.longitude, NEW.latitude, NEW.longitude) ASC
    LIMIT 1;
    NEW.area_id := v_matched_area;
  END IF;

  -- Compute priority exclusively on the server
  v_score := public.calculate_priority_score(NEW.severity, now(), NEW.latitude, NEW.longitude, NEW.id);
  NEW.priority_score := v_score;
  NEW.priority := public.priority_label_from_score(v_score);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.after_insert_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Record initial status history (`PENDING`)
  INSERT INTO public.report_status_history (report_id, updated_by, old_status, new_status, remarks)
  VALUES (NEW.id, NEW.citizen_id, NULL, NEW.status, 'Waste report submitted by citizen');

  -- 2. Recalculate nearby unresolved reports' priority safely
  PERFORM public.refresh_nearby_priorities(NEW.latitude, NEW.longitude);

  -- 3. Notify all admins and assigned collector or collectors assigned to NEW.area_id
  INSERT INTO public.notifications (user_id, report_id, title, message)
  SELECT DISTINCT
    p.id,
    NEW.id,
    'New ' || NEW.severity || ' Waste Report',
    'New ' || NEW.severity || ' report ' || NEW.report_number || ': ' || NEW.category
  FROM public.profiles p
  WHERE p.role = 'admin'
     OR (
       p.role = 'collector'
       AND (
         (NEW.assigned_collector_id IS NOT NULL AND p.id = NEW.assigned_collector_id)
         OR (NEW.assigned_collector_id IS NULL AND NEW.area_id IS NOT NULL AND p.assigned_area_id = NEW.area_id)
       )
     );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.after_update_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_actor_name TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_uid := public.get_current_user_id();
  IF v_uid IS NOT NULL THEN
    SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = v_uid;
  END IF;

  INSERT INTO public.report_status_history (report_id, updated_by, old_status, new_status, remarks)
  VALUES (
    NEW.id,
    v_uid,
    OLD.status,
    NEW.status,
    CASE
      WHEN NEW.status = 'IN_PROGRESS' THEN 'Cleaning started by ' || COALESCE(v_actor_name, 'Collector')
      WHEN NEW.status = 'RESOLVED' THEN 'Cleaned and verified with after-cleaning photo by ' || COALESCE(v_actor_name, 'Collector')
      ELSE 'Status updated to ' || NEW.status
    END
  );

  IF NEW.status = 'IN_PROGRESS' THEN
    INSERT INTO public.notifications (user_id, report_id, title, message)
    VALUES (
      NEW.citizen_id,
      NEW.id,
      'Cleaning Started',
      'Cleaning started for ' || NEW.report_number || ' by ' || COALESCE(v_actor_name, 'Collector')
    );
  ELSIF NEW.status = 'RESOLVED' THEN
    INSERT INTO public.notifications (user_id, report_id, title, message)
    VALUES (
      NEW.citizen_id,
      NEW.id,
      'Report Resolved',
      'Waste cleaned and verified for report ' || NEW.report_number || ' by ' || COALESCE(v_actor_name, 'Collector')
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.before_update_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_role TEXT;
  v_my_area UUID;
  v_jwt_role TEXT;
  v_is_internal_prio BOOLEAN;
BEGIN
  v_jwt_role := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );

  -- Trusted internal priority recalculation check:
  -- Unabusable by anon/authenticated browser clients because:
  --  1. `gc.internal_priority_update = 'on'` (set only by SECURITY DEFINER owner functions)
  --  2. `current_user NOT IN ('anon', 'authenticated')` (false for all direct browser UPDATEs)
  --  3. Inside a trigger chain (pg_trigger_depth() >= 2), non-HTTP server job, or service_role
  --  4. Strictly ZERO changes to any column other than priority / priority_score
  v_is_internal_prio :=
    current_setting('gc.internal_priority_update', true) = 'on'
    AND current_user NOT IN ('anon', 'authenticated')
    AND (
      pg_trigger_depth() >= 2
      OR session_user <> 'authenticator'
      OR v_jwt_role = 'service_role'
    )
    AND NEW.report_number IS NOT DISTINCT FROM OLD.report_number
    AND NEW.citizen_id IS NOT DISTINCT FROM OLD.citizen_id
    AND NEW.category IS NOT DISTINCT FROM OLD.category
    AND NEW.severity IS NOT DISTINCT FROM OLD.severity
    AND NEW.description IS NOT DISTINCT FROM OLD.description
    AND NEW.latitude IS NOT DISTINCT FROM OLD.latitude
    AND NEW.longitude IS NOT DISTINCT FROM OLD.longitude
    AND NEW.location_accuracy IS NOT DISTINCT FROM OLD.location_accuracy
    AND NEW.location_verified IS NOT DISTINCT FROM OLD.location_verified
    AND NEW.before_image_url IS NOT DISTINCT FROM OLD.before_image_url
    AND NEW.after_image_url IS NOT DISTINCT FROM OLD.after_image_url
    AND NEW.area_id IS NOT DISTINCT FROM OLD.area_id
    AND NEW.assigned_collector_id IS NOT DISTINCT FROM OLD.assigned_collector_id
    AND NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.resolved_at IS NOT DISTINCT FROM OLD.resolved_at
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at;

  IF v_is_internal_prio THEN
    RETURN NEW;
  END IF;

  v_uid := public.get_current_user_id();

  -- Fail closed: unauthenticated anon/authenticated API calls can NEVER bypass validation
  IF v_uid IS NULL THEN
    IF current_user IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'Unauthorized: Active authenticated session required to update a report.';
    END IF;
    -- Direct SQL Editor / postgres / service_role maintenance only
    RETURN NEW;
  END IF;

  v_role := public.get_my_role();

  IF v_role = 'admin' THEN
    IF NEW.status = 'RESOLVED' AND OLD.status <> 'RESOLVED' THEN
      NEW.resolved_at := COALESCE(NEW.resolved_at, now());
    ELSIF NEW.status <> 'RESOLVED' THEN
      NEW.resolved_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- Non-admins (Citizens and Collectors) can NEVER modify immutable/admin fields
  IF NEW.report_number IS DISTINCT FROM OLD.report_number
     OR NEW.citizen_id IS DISTINCT FROM OLD.citizen_id
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.severity IS DISTINCT FROM OLD.severity
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude
     OR NEW.location_accuracy IS DISTINCT FROM OLD.location_accuracy
     OR NEW.location_verified IS DISTINCT FROM OLD.location_verified
     OR NEW.before_image_url IS DISTINCT FROM OLD.before_image_url
     OR NEW.area_id IS DISTINCT FROM OLD.area_id
     OR NEW.priority IS DISTINCT FROM OLD.priority
     OR NEW.priority_score IS DISTINCT FROM OLD.priority_score
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Unauthorized modification of protected report fields.';
  END IF;

  IF v_role <> 'collector' THEN
    RAISE EXCEPTION 'Citizens cannot update submitted reports.';
  END IF;

  -- Collector Authorization Checks (Defense-in-Depth alongside RLS):
  IF OLD.status = 'RESOLVED' THEN
    RAISE EXCEPTION 'Resolved reports cannot be modified by collectors.';
  END IF;

  -- 1. If already assigned to another collector, deny immediately
  IF OLD.assigned_collector_id IS NOT NULL AND OLD.assigned_collector_id <> v_uid THEN
    RAISE EXCEPTION 'Forbidden: This report is assigned to another collector.';
  END IF;

  -- 2. If unassigned, collector MUST have a non-NULL assigned service area matching OLD.area_id
  IF OLD.assigned_collector_id IS NULL THEN
    v_my_area := public.get_my_area_id();
    IF v_my_area IS NULL THEN
      RAISE EXCEPTION 'Forbidden: You must be assigned to a service area before claiming unassigned reports.';
    END IF;
    IF OLD.area_id IS NULL OR OLD.area_id <> v_my_area THEN
      RAISE EXCEPTION 'Forbidden: This report is outside your assigned service area.';
    END IF;
  END IF;

  -- 3. Prevent reassigning report to a different collector
  IF NEW.assigned_collector_id IS NOT NULL AND NEW.assigned_collector_id <> v_uid THEN
    RAISE EXCEPTION 'Collectors cannot assign reports to another collector.';
  END IF;

  -- 4. Enforce strict workflow transitions & verify after-cleaning photo belongs to THIS report
  IF OLD.status IN ('PENDING', 'OPEN') AND NEW.status = 'IN_PROGRESS' THEN
    NEW.assigned_collector_id := v_uid;
    NEW.after_image_url := OLD.after_image_url;
    NEW.resolved_at := NULL;
  ELSIF OLD.status = 'IN_PROGRESS' AND NEW.status = 'RESOLVED' THEN
    IF NEW.after_image_url IS NULL
       OR trim(NEW.after_image_url) = ''
       OR NEW.after_image_url LIKE 'data:%'
       OR position('..' IN NEW.after_image_url) > 0
       OR array_length(string_to_array(NEW.after_image_url, '/'), 1) <> 3
       OR split_part(NEW.after_image_url, '/', 1) <> 'after'
       OR split_part(NEW.after_image_url, '/', 2) <> OLD.id::TEXT
       OR char_length(trim(split_part(NEW.after_image_url, '/', 3))) = 0 THEN
      RAISE EXCEPTION 'A valid after-cleaning photograph uploaded for this report is required to resolve it.';
    END IF;
    NEW.assigned_collector_id := v_uid;
    NEW.resolved_at := now();
  ELSE
    RAISE EXCEPTION 'Invalid report status transition from % to %.', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

-- Also harden profile privileged-field guard against unauthenticated API calls
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_jwt_role TEXT;
BEGIN
  v_uid := public.get_current_user_id();
  IF v_uid IS NULL THEN
    IF session_user = 'authenticator' THEN
      v_jwt_role := COALESCE(
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
        'anon'
      );
      IF v_jwt_role <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: Active authenticated session required.';
      END IF;
    ELSIF current_user IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'Unauthorized: Active authenticated session required.';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Only administrators can change user roles.';
    END IF;
    IF NEW.assigned_area_id IS DISTINCT FROM OLD.assigned_area_id THEN
      RAISE EXCEPTION 'Only administrators can modify assigned service areas.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Private Storage Bucket & Consistent Area-Scoped Storage Helper Functions
--    Matches exact frontend paths:
--      - Citizen before photo: `before/<profile_uuid>/<filename>`
--      - Collector after photo: `after/<report_uuid>/<filename>`
-- ----------------------------------------------------------------------------
UPDATE storage.buckets
SET public = FALSE,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'garbage-reports';

CREATE OR REPLACE FUNCTION public.can_upload_before_image(p_object_path TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.get_current_user_id() IS NOT NULL
    AND public.get_my_role() IN ('citizen', 'admin')
    AND array_length(string_to_array(p_object_path, '/'), 1) = 3
    AND split_part(p_object_path, '/', 1) = 'before'
    AND split_part(p_object_path, '/', 2) = public.get_current_user_id()::TEXT
    AND char_length(trim(split_part(p_object_path, '/', 3))) > 0
    AND position('..' IN p_object_path) = 0;
$$;

CREATE OR REPLACE FUNCTION public.can_upload_after_image(p_object_path TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.get_current_user_id() IS NOT NULL
    AND array_length(string_to_array(p_object_path, '/'), 1) = 3
    AND split_part(p_object_path, '/', 1) = 'after'
    AND char_length(trim(split_part(p_object_path, '/', 3))) > 0
    AND position('..' IN p_object_path) = 0
    AND (
      public.is_admin()
      OR (
        public.is_collector()
        AND EXISTS (
          SELECT 1 FROM public.reports r
          WHERE r.id::TEXT = split_part(p_object_path, '/', 2)
            AND r.status = 'IN_PROGRESS'
            AND (
              r.assigned_collector_id = public.get_current_user_id()
              OR (
                r.assigned_collector_id IS NULL
                AND public.get_my_area_id() IS NOT NULL
                AND r.area_id = public.get_my_area_id()
              )
            )
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_report_image(p_object_path TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.get_current_user_id() IS NOT NULL
    AND position('..' IN p_object_path) = 0
    AND (
      public.is_admin()
      OR (
        array_length(string_to_array(p_object_path, '/'), 1) = 3
        AND split_part(p_object_path, '/', 1) = 'before'
        AND split_part(p_object_path, '/', 2) = public.get_current_user_id()::TEXT
      )
      OR public.can_upload_after_image(p_object_path)
      OR EXISTS (
        SELECT 1 FROM public.reports r
        WHERE (r.before_image_url = p_object_path OR r.after_image_url = p_object_path)
          AND (
            r.citizen_id = public.get_current_user_id()
            OR (
              public.is_collector()
              AND (
                r.assigned_collector_id = public.get_current_user_id()
                OR (
                  r.assigned_collector_id IS NULL
                  AND public.get_my_area_id() IS NOT NULL
                  AND r.area_id = public.get_my_area_id()
                )
              )
            )
          )
      )
    );
$$;

-- ----------------------------------------------------------------------------
-- 6. Minimum Safe Function EXECUTE Grants
-- ----------------------------------------------------------------------------
-- Revoke direct RPC access to internal priority & trigger functions
REVOKE ALL ON FUNCTION public.calculate_priority_score(
  TEXT, TIMESTAMPTZ, DOUBLE PRECISION, DOUBLE PRECISION, UUID
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.priority_label_from_score(INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_nearby_priorities(DOUBLE PRECISION, DOUBLE PRECISION)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_open_report_priorities()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.before_insert_report()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.after_insert_report()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.before_update_report()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.after_update_report()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_privileged_fields()
  FROM PUBLIC, anon, authenticated;

-- Allow only server-side service_role (and owner postgres) to run batch recalculation
GRANT EXECUTE ON FUNCTION public.recalculate_open_report_priorities() TO service_role;

-- Explicit minimum grants for session/role helpers & Storage helpers
GRANT EXECUTE ON FUNCTION public.get_current_user_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_area_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_collector() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gc_bind_auth_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_before_image(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_after_image(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_report_image(TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Consistent RLS Policies Across Reports, Profiles, History & Storage
--    Collector with NULL assigned_area_id sees ONLY reports explicitly
--    assigned to them — never unassigned reports from other areas.
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (
    public.get_current_user_id() IS NOT NULL
    AND (
      id = public.get_current_user_id()
      OR public.is_admin()
      OR (
        public.is_collector()
        AND EXISTS (
          SELECT 1 FROM public.reports r
          WHERE (r.citizen_id = profiles.id OR r.assigned_collector_id = profiles.id)
            AND (
              r.assigned_collector_id = public.get_current_user_id()
              OR (
                r.assigned_collector_id IS NULL
                AND public.get_my_area_id() IS NOT NULL
                AND r.area_id = public.get_my_area_id()
              )
            )
        )
      )
    )
  );

DROP POLICY IF EXISTS "reports_select_scoped" ON public.reports;
CREATE POLICY "reports_select_scoped"
  ON public.reports
  FOR SELECT
  TO anon, authenticated
  USING (
    public.get_current_user_id() IS NOT NULL
    AND (
      public.is_admin()
      OR (public.get_my_role() = 'citizen' AND citizen_id = public.get_current_user_id())
      OR (
        public.is_collector()
        AND (
          assigned_collector_id = public.get_current_user_id()
          OR (
            assigned_collector_id IS NULL
            AND public.get_my_area_id() IS NOT NULL
            AND area_id = public.get_my_area_id()
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "reports_update_collector_or_admin" ON public.reports;
CREATE POLICY "reports_update_collector_or_admin"
  ON public.reports
  FOR UPDATE
  TO anon, authenticated
  USING (
    public.get_current_user_id() IS NOT NULL
    AND (
      public.is_admin()
      OR (
        public.is_collector()
        AND (
          assigned_collector_id = public.get_current_user_id()
          OR (
            assigned_collector_id IS NULL
            AND public.get_my_area_id() IS NOT NULL
            AND area_id = public.get_my_area_id()
          )
        )
      )
    )
  )
  WITH CHECK (
    public.get_current_user_id() IS NOT NULL
    AND (
      public.is_admin()
      OR (
        public.is_collector()
        AND assigned_collector_id = public.get_current_user_id()
      )
    )
  );

DROP POLICY IF EXISTS "history_select_authorized_report" ON public.report_status_history;
CREATE POLICY "history_select_authorized_report"
  ON public.report_status_history
  FOR SELECT
  TO anon, authenticated
  USING (
    public.get_current_user_id() IS NOT NULL
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.reports r
        WHERE r.id = report_status_history.report_id
          AND (
            r.citizen_id = public.get_current_user_id()
            OR (
              public.is_collector()
              AND (
                r.assigned_collector_id = public.get_current_user_id()
                OR (
                  r.assigned_collector_id IS NULL
                  AND public.get_my_area_id() IS NOT NULL
                  AND r.area_id = public.get_my_area_id()
                )
              )
            )
          )
      )
    )
  );

-- Private Storage Object Policies (`garbage-reports`)
DROP POLICY IF EXISTS "gc_storage_select_authorized" ON storage.objects;
CREATE POLICY "gc_storage_select_authorized"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'garbage-reports'
    AND public.can_access_report_image(name)
  );

DROP POLICY IF EXISTS "gc_storage_insert_before_citizen" ON storage.objects;
DROP POLICY IF EXISTS "gc_storage_insert_authorized" ON storage.objects;
CREATE POLICY "gc_storage_insert_authorized"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'garbage-reports'
    AND (
      public.can_upload_before_image(name)
      OR public.can_upload_after_image(name)
    )
  );

DROP POLICY IF EXISTS "gc_storage_update_admin" ON storage.objects;
CREATE POLICY "gc_storage_update_admin"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'garbage-reports'
    AND public.is_admin()
  )
  WITH CHECK (
    bucket_id = 'garbage-reports'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "gc_storage_delete_admin" ON storage.objects;
CREATE POLICY "gc_storage_delete_admin"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'garbage-reports'
    AND public.is_admin()
  );

-- Ensure triggers remain attached
DROP TRIGGER IF EXISTS trg_before_insert_report ON public.reports;
CREATE TRIGGER trg_before_insert_report
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.before_insert_report();

DROP TRIGGER IF EXISTS trg_after_insert_report ON public.reports;
CREATE TRIGGER trg_after_insert_report
  AFTER INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.after_insert_report();

DROP TRIGGER IF EXISTS trg_before_update_report ON public.reports;
CREATE TRIGGER trg_before_update_report
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.before_update_report();

DROP TRIGGER IF EXISTS trg_after_update_report ON public.reports;
CREATE TRIGGER trg_after_update_report
  AFTER UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.after_update_report();

NOTIFY pgrst, 'reload schema';
