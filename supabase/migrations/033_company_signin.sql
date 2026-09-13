-- ============================================================
-- Migration 033: Company-Aware Sign-In
-- ============================================================
-- Sign-in/sign-up never learned about the multi-tenancy foundation
-- laid down in migration 032: admin signup validated against two
-- GLOBAL Deno secrets (one company only), and driver_id was UNIQUE
-- across the whole table (two companies could never both have a
-- driver called "DRV-001"). This migration adds what the edge
-- functions need to make both flows company-scoped:
--   1. Per-organization hashed signup codes (logistics/payroll)
--   2. hash_secret()/verify_org_signup_code() helpers
--   3. drivers.driver_id uniqueness scoped to (organization_id, driver_id)
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ------------------------------------------------------------
-- 1. PER-ORG SIGNUP CODES
-- ------------------------------------------------------------
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS signup_code_logistics_hash TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS signup_code_payroll_hash TEXT;

-- ------------------------------------------------------------
-- 2. HELPERS — same crypt()/gen_salt('bf') pattern already used
--    for drivers.pin_hash (see hash_driver_pin()).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hash_secret(p_plain TEXT)
RETURNS TEXT AS $$
  SELECT extensions.crypt(p_plain, extensions.gen_salt('bf'));
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions;

-- Resolves an org by slug and checks the code against the right
-- department's hash. Returns the organization id on success, NULL
-- otherwise. Only ever called from edge functions using the
-- service-role key, so no anon grant is needed.
CREATE OR REPLACE FUNCTION public.verify_org_signup_code(p_slug TEXT, p_role TEXT, p_code TEXT)
RETURNS UUID AS $$
DECLARE
  v_org RECORD;
  v_hash TEXT;
BEGIN
  SELECT id, signup_code_logistics_hash, signup_code_payroll_hash
    INTO v_org
    FROM public.organizations
    WHERE slug = p_slug AND is_active = true;

  IF v_org.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_hash := CASE p_role
    WHEN 'payroll_admin' THEN v_org.signup_code_payroll_hash
    WHEN 'logistics' THEN v_org.signup_code_logistics_hash
    ELSE NULL
  END;

  IF v_hash IS NULL THEN
    RETURN NULL;
  END IF;

  IF extensions.crypt(p_code, v_hash) = v_hash THEN
    RETURN v_org.id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- ------------------------------------------------------------
-- 3. drivers.driver_id — scope uniqueness to the organization.
--    Live constraint confirmed as drivers_driver_id_key via
--    `supabase db query --linked` before writing this migration.
-- ------------------------------------------------------------
ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS drivers_driver_id_key;
ALTER TABLE public.drivers ADD CONSTRAINT drivers_org_driver_id_key UNIQUE (organization_id, driver_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
