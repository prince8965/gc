-- ============================================================================
-- Garbage Collector – Secure Admin Provisioning Script
-- File: supabase/03_admin_bootstrap.sql
-- Purpose: Securely create or authorize the initial Administrator account by
--          phone number directly in Supabase SQL Editor.
--          Public registration as Admin on the login page is strictly blocked.
--
-- HOW TO USE:
-- 1. Replace v_admin_name and v_admin_phone below with your chosen Admin details.
-- 2. Run this script in Supabase Dashboard -> SQL Editor.
-- 3. On the website login page, select "Admin", enter that Name & Phone, and click LOGIN.
-- ============================================================================

DO $$
DECLARE
  v_admin_name TEXT := 'Admin';            -- <-- CHANGE TO YOUR ADMIN NAME
  v_admin_phone TEXT := '9999999999';      -- <-- CHANGE TO YOUR 10-DIGIT ADMIN PHONE
  v_digits TEXT;
  v_user_id UUID;
BEGIN
  v_digits := regexp_replace(trim(v_admin_phone), '[^0-9]', '', 'g');
  IF char_length(v_digits) = 12 AND left(v_digits, 2) = '91' THEN
    v_digits := right(v_digits, 10);
  END IF;

  IF char_length(v_digits) < 10 THEN
    RAISE EXCEPTION 'Please provide a valid 10-digit phone number.';
  END IF;

  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_digits
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET role = 'admin',
        full_name = v_admin_name,
        phone = v_digits,
        assigned_area_id = NULL,
        updated_at = now()
    WHERE id = v_user_id;
  ELSE
    INSERT INTO public.profiles (full_name, phone, role)
    VALUES (v_admin_name, v_digits, 'admin')
    RETURNING id INTO v_user_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, details)
  VALUES (
    v_user_id,
    'BOOTSTRAP_ADMIN',
    'profiles',
    v_user_id,
    jsonb_build_object('phone', v_digits, 'full_name', v_admin_name)
  );

  RAISE NOTICE 'Authorized Admin ready: % (phone %, id %)', v_admin_name, v_digits, v_user_id;
END;
$$;
