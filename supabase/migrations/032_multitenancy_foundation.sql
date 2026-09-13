-- ============================================================
-- Migration 032: Multi-Tenancy Foundation
-- ============================================================
-- Introduces organizations as a first-class concept so this
-- platform can serve more than one company safely.
--
-- Scope of this migration (deliberately conservative):
--   1. organizations table (name, plan: free/standard/premium)
--   2. organization_id added to: user_roles, drivers, depots,
--      employee_rates, shifts (all backfilled + NOT NULL)
--   3. organization_id added to gps_locations/idle_alerts/sos_alerts
--      too (backfilled, kept in sync via trigger) but their RLS
--      policies are NOT rewritten here — those went through several
--      live drop/recreate cycles (migrations 016-020) and the
--      current deployed state should be inspected directly before
--      touching them, rather than guessed at from migration files.
--   4. is_org_admin() / current_org_id() / has_feature() helpers
--   5. Org-scoped RLS on: user_roles, drivers, shifts, depots,
--      employee_rates
--   6. Legacy tables RENAMED (not dropped) to _deprecated_* —
--      rate_configurations, admin_users, weekly_rate_overrides —
--      confirmed superseded during this session's architecture
--      review, but kept recoverable rather than destroyed.
--
-- All existing data is backfilled into a single placeholder
-- organization ("Legacy Data") so nothing currently in production
-- breaks. Purging ABTSO-specific content is a separate, later step.
-- ============================================================

BEGIN;

-- Fail fast and cleanly instead of deadlocking if something else
-- (e.g. the admin dashboard's own 15-second live-refresh polling, if
-- left open in a browser tab) is holding a conflicting lock on one of
-- these tables when this migration's ALTER TABLE statements run.
SET LOCAL lock_timeout = '5s';

-- ------------------------------------------------------------
-- 1. ORGANIZATIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'standard', 'premium')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Placeholder org that all pre-existing rows get assigned to below.
-- Rename/replace this row once the real branding + first tenant exist.
INSERT INTO public.organizations (id, name, slug, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'Legacy Data', 'legacy-data', 'premium')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 2. HELPER FUNCTIONS
-- ------------------------------------------------------------

-- Is the caller an admin (any role) of some organization at all?
-- Matched by email only — the live user_roles table has no user_id
-- column (confirmed by direct query; migration 009's definition of
-- it was apparently never actually applied in production).
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE email = auth.email()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Is the caller specifically a payroll_admin? Self-contained rather
-- than calling the original migration-009 is_payroll_admin() — that
-- function turns out not to exist live either (confirmed by this same
-- migration failing on it), so any RLS built on top of it depends on
-- something that was never actually deployed. Defined fresh here
-- using only the columns directly confirmed to exist.
CREATE OR REPLACE FUNCTION public.is_org_payroll_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE email = auth.email() AND role = 'payroll_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Resolves the caller's own organization — via user_roles for admins,
-- falling back to their own driver record for driver logins.
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.user_roles
  WHERE email = auth.email()
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    RETURN v_org_id;
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.drivers
  WHERE id = auth.uid()
  LIMIT 1;

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Plan -> feature gate. Feature keys match the Core/Recommended/Optional
-- classification agreed on for the Free/Standard/Premium tiers.
-- Unknown feature keys default closed (false), not open.
CREATE OR REPLACE FUNCTION public.has_feature(p_feature TEXT, p_org_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  v_org_id UUID := COALESCE(p_org_id, public.current_org_id());
  v_plan TEXT;
  v_core TEXT[] := ARRAY[
    'clock_in_out', 'live_tracking', 'driver_profiles', 'live_dispatch_board',
    'payroll_calculator', 'legal_documents'
  ];
  v_recommended TEXT[] := ARRAY[
    'sos_alerts', 'idle_detection', 'alert_monitors',
    'stuck_shift_detection', 'multi_role_admin'
  ];
  v_premium_only TEXT[] := ARRAY[
    'night_out_allowance', 'fixed_rate_payroll', 'agency_grouping',
    'excel_template_export', 'multi_depot', 'self_service_signup'
  ];
BEGIN
  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT plan INTO v_plan FROM public.organizations WHERE id = v_org_id;
  IF v_plan IS NULL THEN
    RETURN false;
  END IF;

  IF p_feature = ANY(v_core) THEN
    RETURN true;
  END IF;

  IF p_feature = ANY(v_recommended) THEN
    RETURN v_plan IN ('standard', 'premium');
  END IF;

  IF p_feature = ANY(v_premium_only) THEN
    RETURN v_plan = 'premium';
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ------------------------------------------------------------
-- 3. organization_id COLUMNS — added nullable, backfilled, then
--    locked to NOT NULL so nothing can be inserted tenant-less.
-- ------------------------------------------------------------

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
UPDATE public.user_roles SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE public.user_roles ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
UPDATE public.drivers SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE public.drivers ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.depots ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
UPDATE public.depots SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE public.depots ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.employee_rates ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
UPDATE public.employee_rates er SET organization_id = d.organization_id
  FROM public.drivers d WHERE er.driver_id = d.id AND er.organization_id IS NULL;
UPDATE public.employee_rates SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE public.employee_rates ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
UPDATE public.shifts s SET organization_id = d.organization_id
  FROM public.drivers d WHERE s.driver_id = d.id AND s.organization_id IS NULL;
ALTER TABLE public.shifts ALTER COLUMN organization_id SET NOT NULL;

-- Denormalized onto the child telemetry/alert tables too, for RLS
-- performance later — kept nullable for now since their policies
-- aren't being rewritten in this migration (see header note).
ALTER TABLE public.gps_locations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
UPDATE public.gps_locations g SET organization_id = d.organization_id
  FROM public.drivers d WHERE g.driver_id = d.id AND g.organization_id IS NULL;

ALTER TABLE public.idle_alerts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
UPDATE public.idle_alerts a SET organization_id = d.organization_id
  FROM public.drivers d WHERE a.driver_id = d.id AND a.organization_id IS NULL;

ALTER TABLE public.sos_alerts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
UPDATE public.sos_alerts a SET organization_id = d.organization_id
  FROM public.drivers d WHERE a.driver_id = d.id AND a.organization_id IS NULL;

-- ------------------------------------------------------------
-- 4. SYNC TRIGGERS — new rows auto-inherit organization_id from
--    their driver, so no client ever has to (or gets to) set it
--    directly. Trusting a client-supplied org_id would defeat the
--    whole point of the tenant boundary.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_organization_id_from_driver()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.driver_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.drivers WHERE id = NEW.driver_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_org_id_shifts ON public.shifts;
CREATE TRIGGER trg_sync_org_id_shifts
  BEFORE INSERT ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.sync_organization_id_from_driver();

DROP TRIGGER IF EXISTS trg_sync_org_id_gps ON public.gps_locations;
CREATE TRIGGER trg_sync_org_id_gps
  BEFORE INSERT ON public.gps_locations
  FOR EACH ROW EXECUTE FUNCTION public.sync_organization_id_from_driver();

DROP TRIGGER IF EXISTS trg_sync_org_id_idle ON public.idle_alerts;
CREATE TRIGGER trg_sync_org_id_idle
  BEFORE INSERT ON public.idle_alerts
  FOR EACH ROW EXECUTE FUNCTION public.sync_organization_id_from_driver();

DROP TRIGGER IF EXISTS trg_sync_org_id_sos ON public.sos_alerts;
CREATE TRIGGER trg_sync_org_id_sos
  BEFORE INSERT ON public.sos_alerts
  FOR EACH ROW EXECUTE FUNCTION public.sync_organization_id_from_driver();

-- ------------------------------------------------------------
-- 5. ORG-SCOPED RLS — replaces the "any admin sees everything"
--    policies with "any admin sees their own organization's data".
--    Driver-side self-access policies (id/driver_id = auth.uid())
--    are left untouched — they were already correctly scoped to a
--    single row and need no org check.
-- ------------------------------------------------------------

-- organizations: an admin can read their own org's row.
DROP POLICY IF EXISTS "organizations_read_own" ON public.organizations;
CREATE POLICY "organizations_read_own"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (id = public.current_org_id());

-- user_roles
DROP POLICY IF EXISTS "user_roles_read_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;

CREATE POLICY "user_roles_read_own"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (
    email = auth.email()
    OR (public.is_org_payroll_admin() AND organization_id = public.current_org_id())
  );

CREATE POLICY "user_roles_org_admin_all"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.is_org_payroll_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_payroll_admin() AND organization_id = public.current_org_id());

-- drivers
DROP POLICY IF EXISTS "drivers_admin_all" ON public.drivers;

CREATE POLICY "drivers_org_admin_all"
  ON public.drivers FOR ALL
  TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

-- shifts
DROP POLICY IF EXISTS "shifts_admin_all" ON public.shifts;

CREATE POLICY "shifts_org_admin_all"
  ON public.shifts FOR ALL
  TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

-- depots
DROP POLICY IF EXISTS "depots_read_authenticated" ON public.depots;

CREATE POLICY "depots_org_read"
  ON public.depots FOR SELECT
  TO authenticated
  USING (organization_id = public.current_org_id());

DROP POLICY IF EXISTS "depots_org_admin_write" ON public.depots;
CREATE POLICY "depots_org_admin_write"
  ON public.depots FOR ALL
  TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

-- employee_rates
DROP POLICY IF EXISTS "employee_rates_payroll_admin_all" ON public.employee_rates;

CREATE POLICY "employee_rates_org_payroll_admin_all"
  ON public.employee_rates FOR ALL
  TO authenticated
  USING (public.is_org_payroll_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_payroll_admin() AND organization_id = public.current_org_id());

-- ------------------------------------------------------------
-- 6. LEGACY CLEANUP — renamed, not dropped, so this is reversible
--    if any of these turn out to still be load-bearing somewhere.
-- ------------------------------------------------------------

-- Safety net before renaming admin_users away: the original is_admin()
-- (migration 004) reads from admin_users directly, and this migration
-- doesn't touch whichever policies on gps_locations/idle_alerts might
-- still call it after their several live rewrites (016-020) — state
-- that can't be confirmed from migration files alone. Redefining
-- is_admin() to delegate to the new, confirmed-working org-admin check
-- means any such policy keeps functioning (and gets the *correct*
-- answer for once — admin_users has no row for any real admin account
-- in use today, so is_admin() was almost certainly already returning
-- false everywhere it might still be called).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.is_org_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

ALTER TABLE IF EXISTS public.rate_configurations RENAME TO _deprecated_rate_configurations;
ALTER TABLE IF EXISTS public.admin_users RENAME TO _deprecated_admin_users;
ALTER TABLE IF EXISTS public.weekly_rate_overrides RENAME TO _deprecated_weekly_rate_overrides;

NOTIFY pgrst, 'reload schema';

COMMIT;
