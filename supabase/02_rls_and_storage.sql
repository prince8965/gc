-- ============================================================================
-- Garbage Collector – Smart Urban Waste Reporting & Collection System
-- File: supabase/02_rls_and_storage.sql
-- Purpose: Row Level Security (RLS) policies across all tables, Realtime
--          publication, and private `garbage-reports` Storage bucket + policies.
-- Run this SECOND for a fresh database setup (after 01_schema.sql).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enable Row Level Security on All Tables
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Note: public.user_sessions intentionally has NO direct client policies.
-- Sessions can ONLY be created, inspected, bound, or revoked via SECURITY DEFINER RPCs.

-- ----------------------------------------------------------------------------
-- 2. PROFILES Policies
-- ----------------------------------------------------------------------------
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

DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin"
  ON public.profiles
  FOR UPDATE
  TO anon, authenticated
  USING (
    public.get_current_user_id() IS NOT NULL
    AND (id = public.get_current_user_id() OR public.is_admin())
  )
  WITH CHECK (
    public.get_current_user_id() IS NOT NULL
    AND (id = public.get_current_user_id() OR public.is_admin())
  );

DROP POLICY IF EXISTS "profiles_insert_self_safe" ON public.profiles;

-- ----------------------------------------------------------------------------
-- 3. SERVICE_AREAS Policies
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_areas_select_authenticated" ON public.service_areas;
CREATE POLICY "service_areas_select_authenticated"
  ON public.service_areas
  FOR SELECT
  TO anon, authenticated
  USING (public.get_current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS "service_areas_admin_insert" ON public.service_areas;
CREATE POLICY "service_areas_admin_insert"
  ON public.service_areas
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "service_areas_admin_update" ON public.service_areas;
CREATE POLICY "service_areas_admin_update"
  ON public.service_areas
  FOR UPDATE
  TO anon, authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "service_areas_admin_delete" ON public.service_areas;
CREATE POLICY "service_areas_admin_delete"
  ON public.service_areas
  FOR DELETE
  TO anon, authenticated
  USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. REPORTS Policies (Consistent Non-NULL Collector Area Scoping)
-- ----------------------------------------------------------------------------
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

DROP POLICY IF EXISTS "reports_insert_citizen_or_admin" ON public.reports;
CREATE POLICY "reports_insert_citizen_or_admin"
  ON public.reports
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    public.get_current_user_id() IS NOT NULL
    AND (
      (public.get_my_role() = 'citizen' AND citizen_id = public.get_current_user_id())
      OR public.is_admin()
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

DROP POLICY IF EXISTS "reports_delete_admin_only" ON public.reports;
CREATE POLICY "reports_delete_admin_only"
  ON public.reports
  FOR DELETE
  TO anon, authenticated
  USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. NOTIFICATIONS Policies
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "notifications_select_own_or_admin" ON public.notifications;
CREATE POLICY "notifications_select_own_or_admin"
  ON public.notifications
  FOR SELECT
  TO anon, authenticated
  USING (
    public.get_current_user_id() IS NOT NULL
    AND (user_id = public.get_current_user_id() OR public.is_admin())
  );

DROP POLICY IF EXISTS "notifications_update_own_read" ON public.notifications;
CREATE POLICY "notifications_update_own_read"
  ON public.notifications
  FOR UPDATE
  TO anon, authenticated
  USING (
    public.get_current_user_id() IS NOT NULL
    AND (user_id = public.get_current_user_id() OR public.is_admin())
  )
  WITH CHECK (
    public.get_current_user_id() IS NOT NULL
    AND (user_id = public.get_current_user_id() OR public.is_admin())
  );

DROP POLICY IF EXISTS "notifications_insert_admin_only" ON public.notifications;
CREATE POLICY "notifications_insert_admin_only"
  ON public.notifications
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. REPORT_STATUS_HISTORY Policies
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 7. AUDIT_LOGS Policies (Admin Read-Only)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_logs_admin_select" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_select"
  ON public.audit_logs
  FOR SELECT
  TO anon, authenticated
  USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 8. Enable Supabase Realtime on Notifications & Reports
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Private Storage Bucket (`garbage-reports`) & Hardened Storage RLS
--    Paths:
--      - Citizen before photo: `before/<profile_uuid>/<filename>`
--      - Collector after photo: `after/<report_uuid>/<filename>`
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'garbage-reports',
  'garbage-reports',
  FALSE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

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

GRANT EXECUTE ON FUNCTION public.can_upload_before_image(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_after_image(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_report_image(TEXT) TO authenticated;

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

NOTIFY pgrst, 'reload schema';
