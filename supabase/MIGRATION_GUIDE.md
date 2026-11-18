# Supabase Setup, Simple Login Architecture & Migration Guide

## 1. Run SQL Scripts in Supabase SQL Editor

Open your Supabase Dashboard for project **Garbage Collector** (`rkfeyocckbkqzwdjxtek`) -> **SQL Editor**:

### Fresh Database Setup
1. Run **`supabase/01_schema.sql`** — creates `service_areas`, `profiles`, `user_sessions`, `reports`, `notifications`, `report_status_history`, `audit_logs`, priority calculation engine, triggers, and server-side RPCs (`gc_simple_login`, `gc_get_session`, `gc_simple_logout`, and admin RPCs).
2. Run **`supabase/02_rls_and_storage.sql`** — enables Row Level Security on all tables, configures Realtime, and creates the private `garbage-reports` Storage bucket + policies.
3. Run **`supabase/03_admin_bootstrap.sql`** — edit `v_admin_name` and `v_admin_phone` to create/authorize your initial Administrator phone number.

### Upgrading an Existing Database (Preserves All Existing Data)
If you already created the tables earlier and have existing data:
1. Run **`supabase/04_simple_login_migration.sql`** (drops only `profiles_id_fkey` so existing rows stay intact while allowing simple-login profiles, adds unique normalized phone index and `user_sessions`).
2. Re-run **`supabase/01_schema.sql`** (idempotent — updates functions & triggers without deleting any data).
3. Re-run **`supabase/02_rls_and_storage.sql`** (updates RLS policies to use `public.get_current_user_id()`).
4. Run **`supabase/03_admin_bootstrap.sql`** with your chosen Admin phone number.

## 2. Enable Anonymous Sign-Ins for Private Image Storage (1 Click)

To keep the `garbage-reports` Storage bucket **private** with strict RLS while allowing Citizens & Collectors to upload/view photos without passwords or OTP:
1. Go to **Supabase Dashboard -> Authentication -> Sign In / Providers** (or **Authentication -> Settings**).
2. Enable **Allow anonymous sign-ins**.

When a user clicks **LOGIN**, the frontend silently obtains a real Supabase anonymous JWT in the background and binds it to their database profile in `public.user_sessions`. Private Storage uploads and signed URLs then verify authorization cleanly through `auth.uid()` -> `user_sessions` -> `profiles`.

## 3. Security Documentation: Simplified Demonstration Login

- **No password, email, or OTP is requested.** Users log in by selecting a role (`Citizen`, `Garbage Collector`, or `Admin`) and entering their **User Name** and **Phone Number**.
- **Important limitation:** A username and phone number alone do **not** cryptographically verify identity. Anyone who knows another registered user's phone number can log into that account. This login flow is intended for **simplified demonstration / academic prototype use**—for real-world municipal production deployment, re-enable verified password or SMS OTP authentication.
- **Server-side protections enforced:**
  - Public registration as **Admin** is strictly blocked in `public.gc_simple_login()`.
  - Duplicate accounts on the same phone number under a different role are blocked with a clear message.
  - Database RLS and triggers never trust role values sent from the browser—every permission check resolves `role` from `public.profiles` via the server-side `public.user_sessions` table.

## 4. Legacy LocalStorage (`gc_db`) Backup & Migration

If old prototype data still exists in your browser's `localStorage` under `gc_db`, it is never deleted silently. Sign in and visit **Profile** to download a JSON backup or migrate legacy service areas/reports into Supabase.
