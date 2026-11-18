-- ============================================================================
-- Garbage Collector – Private Storage RLS Policies (Standalone Reference)
-- File: supabase/05_storage_rls_policies.sql
--
-- NOTE: All functions and policies in this file are ALSO included in:
--   - `supabase/02_rls_and_storage.sql` (for fresh setups via RUN_ALL_SETUP.sql)
--   - `supabase/06_fix_priority_trigger_and_guards.sql` (for live upgrades)
-- Keep this file only if you need to re-apply Storage policies independently.
-- ============================================================================

UPDATE storage.buckets
SET public = FALSE,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'garbage-reports';

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

GRANT EXECUTE ON FUNCTION public.gc_bind_auth_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_area_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_collector() TO anon, authenticated;
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
