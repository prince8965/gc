-- ============================================================================
-- Garbage Collector – Smart Urban Waste Reporting & Collection System
-- File: supabase/01_schema.sql
-- Purpose: Core tables, constraints, server-side sessions for simplified
--          demonstration login, priority engine, workflow triggers, audit
--          logging, and secure administrative RPCs.
-- Run this FIRST for a fresh database setup in Supabase SQL Editor.
-- (If you already ran an earlier version of 01_schema.sql, run
--  supabase/04_simple_login_migration.sql instead to preserve all data.)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Helper: Updated-At Timestamp Trigger Function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. SERVICE_AREAS Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_name TEXT NOT NULL CHECK (char_length(trim(area_name)) >= 2),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  radius DOUBLE PRECISION NOT NULL CHECK (radius > 0 AND radius <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_areas_name ON public.service_areas (area_name);

DROP TRIGGER IF EXISTS trg_service_areas_updated_at ON public.service_areas;
CREATE TRIGGER trg_service_areas_updated_at
  BEFORE UPDATE ON public.service_areas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. PROFILES Table (Simplified Identity Profiles + Existing Data Compatible)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2),
  phone TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'citizen' CHECK (role IN ('citizen', 'collector', 'admin')),
  assigned_area_id UUID REFERENCES public.service_areas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_area ON public.profiles (assigned_area_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_normalized
  ON public.profiles ((regexp_replace(phone, '[^0-9]', '', 'g')))
  WHERE phone IS NOT NULL AND trim(phone) <> '';

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. USER_SESSIONS Table (Server-Side Session Mapping for Simple Login)
-- NOTE: Simplified demonstration login without OTP/password. Sessions are
--       created and validated exclusively via SECURITY DEFINER functions.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_sessions (
  token TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(32), 'hex'),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  auth_uid UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_auth_uid ON public.user_sessions (auth_uid) WHERE auth_uid IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5. REPORTS Table
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.report_number_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number TEXT UNIQUE NOT NULL,
  citizen_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (
    category IN (
      'Overflowing Dustbin',
      'Roadside Garbage',
      'Illegal Dumping',
      'Plastic Waste',
      'Other'
    )
  ),
  severity TEXT NOT NULL CHECK (severity IN ('Low', 'Medium', 'High')),
  description TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  location_accuracy DOUBLE PRECISION,
  location_verified BOOLEAN NOT NULL DEFAULT FALSE,
  before_image_url TEXT NOT NULL CHECK (
    char_length(trim(before_image_url)) > 0
    AND before_image_url NOT LIKE 'data:%'
  ),
  after_image_url TEXT CHECK (
    after_image_url IS NULL
    OR (char_length(trim(after_image_url)) > 0 AND after_image_url NOT LIKE 'data:%')
  ),
  area_id UUID REFERENCES public.service_areas(id) ON DELETE SET NULL,
  assigned_collector_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High')),
  priority_score INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'OPEN', 'IN_PROGRESS', 'RESOLVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reports_citizen ON public.reports (citizen_id);
CREATE INDEX IF NOT EXISTS idx_reports_area ON public.reports (area_id);
CREATE INDEX IF NOT EXISTS idx_reports_collector ON public.reports (assigned_collector_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_priority ON public.reports (priority, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_coords ON public.reports (latitude, longitude);

DROP TRIGGER IF EXISTS trg_reports_updated_at ON public.reports;
CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. NOTIFICATIONS Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications (user_id, is_read) WHERE is_read = FALSE;

-- ----------------------------------------------------------------------------
-- 7. REPORT_STATUS_HISTORY Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  old_status TEXT CHECK (old_status IS NULL OR old_status IN ('PENDING', 'OPEN', 'IN_PROGRESS', 'RESOLVED')),
  new_status TEXT NOT NULL CHECK (new_status IN ('PENDING', 'OPEN', 'IN_PROGRESS', 'RESOLVED')),
  remarks TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_history_report_created ON public.report_status_history (report_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 8. AUDIT_LOGS Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs (created_at DESC);

-- ----------------------------------------------------------------------------
-- 9. Server-Side Identity & Role Resolution Helpers (SECURITY DEFINER)
-- Resolves active profile from:
--   (1) x-gc-session request header -> user_sessions
--   (2) auth.uid() bound in user_sessions (for Storage/Realtime anonymous JWT)
--   (3) auth.uid() directly (backward compatibility with auth.users profiles)
-- Never trusts a role value supplied by the browser.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_session_header_token()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_headers TEXT;
  v_json JSONB;
BEGIN
  v_headers := current_setting('request.headers', true);
  IF v_headers IS NULL OR v_headers = '' THEN
    RETURN NULL;
  END IF;
  v_json := v_headers::JSONB;
  RETURN NULLIF(trim(COALESCE(v_json ->> 'x-gc-session', '')), '');
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
  v_uid UUID;
  v_auth UUID;
BEGIN
  v_token := public.get_session_header_token();
  IF v_token IS NOT NULL THEN
    SELECT s.user_id INTO v_uid
    FROM public.user_sessions s
    WHERE s.token = v_token
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
    LIMIT 1;
    IF v_uid IS NOT NULL THEN
      RETURN v_uid;
    END IF;
  END IF;

  v_auth := auth.uid();
  IF v_auth IS NOT NULL THEN
    SELECT s.user_id INTO v_uid
    FROM public.user_sessions s
    WHERE s.auth_uid = v_auth
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
    ORDER BY s.created_at DESC
    LIMIT 1;
    IF v_uid IS NOT NULL THEN
      RETURN v_uid;
    END IF;

    -- Fallback: direct match for legacy auth.users-backed profiles
    SELECT p.id INTO v_uid FROM public.profiles p WHERE p.id = v_auth LIMIT 1;
    RETURN v_uid;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = public.get_current_user_id();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.profiles WHERE id = public.get_current_user_id()), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_collector()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT role = 'collector' FROM public.profiles WHERE id = public.get_current_user_id()), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.get_my_area_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT assigned_area_id FROM public.profiles WHERE id = public.get_current_user_id();
$$;

-- ----------------------------------------------------------------------------
-- 10. Simplified Identity Login / Session / Logout RPCs (Server-Enforced)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gc_simple_login(
  p_full_name TEXT,
  p_phone TEXT,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  v_digits TEXT;
  v_role TEXT;
  v_profile public.profiles%ROWTYPE;
  v_token TEXT;
  v_is_new BOOLEAN := FALSE;
BEGIN
  v_name := trim(COALESCE(p_full_name, ''));
  v_digits := regexp_replace(trim(COALESCE(p_phone, '')), '[^0-9]', '', 'g');
  IF char_length(v_digits) = 12 AND left(v_digits, 2) = '91' THEN
    v_digits := right(v_digits, 10);
  END IF;
  v_role := lower(trim(COALESCE(p_role, '')));

  IF char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'Please enter your name (at least 2 characters).';
  END IF;
  IF char_length(v_digits) < 10 OR char_length(v_digits) > 15 THEN
    RAISE EXCEPTION 'Please enter a valid 10-digit phone number.';
  END IF;
  IF v_role NOT IN ('citizen', 'collector', 'admin') THEN
    RAISE EXCEPTION 'Invalid role selected.';
  END IF;

  -- Check if phone number is already registered
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_digits
  LIMIT 1;

  IF FOUND THEN
    -- Prevent duplicate accounts or unauthorized cross-role access
    IF v_profile.role <> v_role THEN
      RAISE EXCEPTION 'This phone number is already registered as a %. Select % to log in, or ask an Admin to update your role.',
        initcap(v_profile.role), initcap(v_profile.role);
    END IF;

    -- Keep admin display name controlled unless updated inside profile settings
    IF v_profile.role <> 'admin' AND v_profile.full_name IS DISTINCT FROM v_name THEN
      UPDATE public.profiles
      SET full_name = v_name, updated_at = now()
      WHERE id = v_profile.id
      RETURNING * INTO v_profile;
    END IF;
  ELSE
    -- SECURITY RULE: Never allow public self-registration as Admin
    IF v_role = 'admin' THEN
      RAISE EXCEPTION 'This phone number is not an authorized Admin account. Admins must be provisioned via SQL or an existing Administrator.';
    END IF;

    INSERT INTO public.profiles (full_name, phone, role)
    VALUES (v_name, v_digits, v_role)
    RETURNING * INTO v_profile;
    v_is_new := TRUE;
  END IF;

  -- Revoke any prior active session mapped to the same anonymous auth_uid
  IF auth.uid() IS NOT NULL THEN
    UPDATE public.user_sessions
    SET revoked_at = now()
    WHERE auth_uid = auth.uid() AND revoked_at IS NULL;
  END IF;

  INSERT INTO public.user_sessions (user_id, auth_uid)
  VALUES (v_profile.id, auth.uid())
  RETURNING token INTO v_token;

  RETURN jsonb_build_object(
    'session_token', v_token,
    'is_new_user', v_is_new,
    'profile', to_jsonb(v_profile)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.gc_get_session()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_profile public.profiles%ROWTYPE;
BEGIN
  v_uid := public.get_current_user_id();
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_profile);
END;
$$;

CREATE OR REPLACE FUNCTION public.gc_simple_logout()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := public.get_session_header_token();
  IF v_token IS NOT NULL THEN
    UPDATE public.user_sessions SET revoked_at = now() WHERE token = v_token;
  END IF;
  IF auth.uid() IS NOT NULL THEN
    UPDATE public.user_sessions SET revoked_at = now() WHERE auth_uid = auth.uid() AND revoked_at IS NULL;
  END IF;
END;
$$;

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

-- Prevent non-admin users from escalating their own role or modifying assigned_area_id
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

DROP TRIGGER IF EXISTS trg_profiles_protect_fields ON public.profiles;
CREATE TRIGGER trg_profiles_protect_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_fields();

-- ----------------------------------------------------------------------------
-- 11. Distance, Auto-Area Matching & Priority Calculation Engine
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calc_distance_km(
  lat1 DOUBLE PRECISION,
  lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lng2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT sqrt(
    power((lat2 - lat1) * 111.0, 2) +
    power((lng2 - lng1) * 111.0 * cos(radians(lat1)), 2)
  );
$$;

CREATE OR REPLACE FUNCTION public.calculate_priority_score(
  p_severity TEXT,
  p_created_at TIMESTAMPTZ,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score INTEGER;
  v_hours DOUBLE PRECISION;
  v_nearby INTEGER;
BEGIN
  v_score := CASE p_severity
    WHEN 'High' THEN 3
    WHEN 'Medium' THEN 2
    ELSE 1
  END;

  v_hours := EXTRACT(EPOCH FROM (now() - COALESCE(p_created_at, now()))) / 3600.0;
  IF v_hours > 8 THEN
    v_score := v_score + 2;
  ELSIF v_hours > 4 THEN
    v_score := v_score + 1;
  END IF;

  SELECT count(*) INTO v_nearby
  FROM public.reports r
  WHERE (p_exclude_id IS NULL OR r.id <> p_exclude_id)
    AND r.status <> 'RESOLVED'
    AND abs(r.latitude - p_lat) < 0.001
    AND abs(r.longitude - p_lng) < 0.001;

  IF v_nearby >= 3 THEN
    v_score := v_score + 2;
  ELSIF v_nearby >= 1 THEN
    v_score := v_score + 1;
  END IF;

  RETURN v_score;
END;
$$;

CREATE OR REPLACE FUNCTION public.priority_label_from_score(p_score INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_score >= 5 THEN 'High'
    WHEN p_score >= 3 THEN 'Medium'
    ELSE 'Low'
  END;
$$;

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
      v_score := public.calculate_priority_score(rec.severity, rec.created_at, rec.latitude, rec.longitude, rec.id);
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
      v_score := public.calculate_priority_score(rec.severity, rec.created_at, rec.latitude, rec.longitude, rec.id);
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
-- 12. Report Lifecycle Triggers
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

  IF NEW.area_id IS NULL THEN
    SELECT sa.id INTO v_matched_area
    FROM public.service_areas sa
    WHERE public.calc_distance_km(sa.latitude, sa.longitude, NEW.latitude, NEW.longitude) <= sa.radius
    ORDER BY public.calc_distance_km(sa.latitude, sa.longitude, NEW.latitude, NEW.longitude) ASC
    LIMIT 1;
    NEW.area_id := v_matched_area;
  END IF;

  v_score := public.calculate_priority_score(NEW.severity, now(), NEW.latitude, NEW.longitude, NEW.id);
  NEW.priority_score := v_score;
  NEW.priority := public.priority_label_from_score(v_score);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_before_insert_report ON public.reports;
CREATE TRIGGER trg_before_insert_report
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.before_insert_report();

CREATE OR REPLACE FUNCTION public.after_insert_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.report_status_history (report_id, updated_by, old_status, new_status, remarks)
  VALUES (NEW.id, NEW.citizen_id, NULL, NEW.status, 'Waste report submitted by citizen');

  PERFORM public.refresh_nearby_priorities(NEW.latitude, NEW.longitude);

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

DROP TRIGGER IF EXISTS trg_after_insert_report ON public.reports;
CREATE TRIGGER trg_after_insert_report
  AFTER INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.after_insert_report();

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
  IF v_uid IS NULL THEN
    IF current_user IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'Unauthorized: Active authenticated session required to update a report.';
    END IF;
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

  IF OLD.status = 'RESOLVED' THEN
    RAISE EXCEPTION 'Resolved reports cannot be modified by collectors.';
  END IF;

  IF OLD.assigned_collector_id IS NOT NULL AND OLD.assigned_collector_id <> v_uid THEN
    RAISE EXCEPTION 'Forbidden: This report is assigned to another collector.';
  END IF;

  IF OLD.assigned_collector_id IS NULL THEN
    v_my_area := public.get_my_area_id();
    IF v_my_area IS NULL THEN
      RAISE EXCEPTION 'Forbidden: You must be assigned to a service area before claiming unassigned reports.';
    END IF;
    IF OLD.area_id IS NULL OR OLD.area_id <> v_my_area THEN
      RAISE EXCEPTION 'Forbidden: This report is outside your assigned service area.';
    END IF;
  END IF;

  IF NEW.assigned_collector_id IS NOT NULL AND NEW.assigned_collector_id <> v_uid THEN
    RAISE EXCEPTION 'Collectors cannot assign reports to another collector.';
  END IF;

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

DROP TRIGGER IF EXISTS trg_before_update_report ON public.reports;
CREATE TRIGGER trg_before_update_report
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.before_update_report();

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
  v_uid := public.get_current_user_id();
  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = v_uid;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
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
        'Your report ' || NEW.report_number || ' has been cleaned and resolved.'
      );
      PERFORM public.refresh_nearby_priorities(NEW.latitude, NEW.longitude);
    END IF;
  END IF;

  IF NEW.assigned_collector_id IS NOT NULL
     AND NEW.assigned_collector_id IS DISTINCT FROM OLD.assigned_collector_id
     AND NEW.assigned_collector_id IS DISTINCT FROM v_uid THEN
    INSERT INTO public.notifications (user_id, report_id, title, message)
    VALUES (
      NEW.assigned_collector_id,
      NEW.id,
      'Report Assigned to You',
      'Report ' || NEW.report_number || ' (' || NEW.category || ') has been assigned to you.'
    );
  END IF;

  IF NEW.area_id IS NOT NULL AND NEW.area_id IS DISTINCT FROM OLD.area_id THEN
    INSERT INTO public.notifications (user_id, report_id, title, message)
    SELECT
      p.id,
      NEW.id,
      'Report Assigned to Your Area',
      'Report ' || NEW.report_number || ' assigned to your service area.'
    FROM public.profiles p
    WHERE p.role = 'collector'
      AND p.assigned_area_id = NEW.area_id
      AND p.id IS DISTINCT FROM NEW.assigned_collector_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_update_report ON public.reports;
CREATE TRIGGER trg_after_update_report
  AFTER UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.after_update_report();

-- ----------------------------------------------------------------------------
-- 13. Secure Admin RPCs (Server-Verified Admin Role + Audit Log)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  p_target_user_id UUID,
  p_new_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_role TEXT;
  v_admin_count INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin access required.';
  END IF;

  IF p_new_role NOT IN ('citizen', 'collector', 'admin') THEN
    RAISE EXCEPTION 'Invalid role: %', p_new_role;
  END IF;

  SELECT role INTO v_old_role FROM public.profiles WHERE id = p_target_user_id;
  IF v_old_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  IF v_old_role = 'admin' AND p_new_role <> 'admin' THEN
    SELECT count(*) INTO v_admin_count FROM public.profiles WHERE role = 'admin';
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the last remaining administrator.';
    END IF;
  END IF;

  UPDATE public.profiles
  SET role = p_new_role,
      assigned_area_id = CASE WHEN p_new_role = 'collector' THEN assigned_area_id ELSE NULL END
  WHERE id = p_target_user_id;

  INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, details)
  VALUES (
    public.get_current_user_id(),
    'UPDATE_USER_ROLE',
    'profiles',
    p_target_user_id,
    jsonb_build_object('old_role', v_old_role, 'new_role', p_new_role)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_assign_collector_area(
  p_collector_id UUID,
  p_area_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin access required.';
  END IF;

  UPDATE public.profiles
  SET assigned_area_id = p_area_id
  WHERE id = p_collector_id AND role = 'collector';

  INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, details)
  VALUES (
    public.get_current_user_id(),
    'ASSIGN_COLLECTOR_AREA',
    'profiles',
    p_collector_id,
    jsonb_build_object('assigned_area_id', p_area_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_report_assignment(
  p_report_id UUID,
  p_area_id UUID DEFAULT NULL,
  p_collector_id UUID DEFAULT NULL,
  p_priority TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin access required.';
  END IF;

  IF p_priority IS NOT NULL AND p_priority NOT IN ('Low', 'Medium', 'High') THEN
    RAISE EXCEPTION 'Invalid priority value.';
  END IF;

  v_score := CASE p_priority
    WHEN 'High' THEN 5
    WHEN 'Medium' THEN 3
    WHEN 'Low' THEN 1
    ELSE NULL
  END;

  UPDATE public.reports
  SET area_id = p_area_id,
      assigned_collector_id = p_collector_id,
      priority = COALESCE(p_priority, priority),
      priority_score = COALESCE(v_score, priority_score)
  WHERE id = p_report_id;

  INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, details)
  VALUES (
    public.get_current_user_id(),
    'UPDATE_REPORT_ASSIGNMENT',
    'reports',
    p_report_id,
    jsonb_build_object('area_id', p_area_id, 'assigned_collector_id', p_collector_id, 'priority', p_priority)
  );
END;
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.service_areas, public.reports, public.notifications, public.report_status_history TO anon, authenticated;
GRANT SELECT ON public.audit_logs TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.report_number_seq TO anon, authenticated;
REVOKE ALL ON public.user_sessions FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.calculate_priority_score(TEXT, TIMESTAMPTZ, DOUBLE PRECISION, DOUBLE PRECISION, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.priority_label_from_score(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_nearby_priorities(DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_open_report_priorities() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.before_insert_report() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.after_insert_report() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.before_update_report() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.after_update_report() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_privileged_fields() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.recalculate_open_report_priorities() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_current_user_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_area_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_collector() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gc_simple_login(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gc_get_session() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gc_simple_logout() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gc_bind_auth_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_collector_area(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_report_assignment(UUID, UUID, UUID, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
