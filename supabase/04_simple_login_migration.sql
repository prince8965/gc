-- ============================================================================
-- Garbage Collector – Non-Destructive Simple Login Migration
-- File: supabase/04_simple_login_migration.sql
-- Purpose: Upgrades an EXISTING Supabase database (that already ran the earlier
--          schema) to support simplified Name + Phone + Role login while
--          preserving 100% of existing profiles, reports, areas, notifications,
--          and status history records.
--
-- Run this in Supabase SQL Editor, followed by 02_rls_and_storage.sql and
-- 03_admin_bootstrap.sql.
-- ============================================================================

-- 1. Allow profiles.id to auto-generate UUIDs without requiring an auth.users row
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 2. Prevent duplicate phone numbers across roles
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_normalized
  ON public.profiles ((regexp_replace(phone, '[^0-9]', '', 'g')))
  WHERE phone IS NOT NULL AND trim(phone) <> '';

-- 3. Create server-side session table if not already present
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

-- Note: After running this migration, run supabase/01_schema.sql (idempotent:
-- updates functions/triggers without dropping any table or data) and
-- supabase/02_rls_and_storage.sql, then supabase/03_admin_bootstrap.sql.
