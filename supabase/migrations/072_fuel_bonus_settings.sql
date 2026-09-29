-- ============================================================
-- Migration 072: Fuel Efficiency Bonus Settings
-- ============================================================
-- A company can reward drivers whose fuel economy falls inside a
-- qualifying MPG range with a bonus — but the amount itself is always
-- a plain number the admin sets, never a formula computed here. This
-- migration is the configuration layer only (mirrors org_analytics_settings'
-- shape exactly, migration 062): who qualifies and how much they'd get,
-- set from the admin dashboard's Settings → Fuel Bonus panel. It does
-- NOT yet compute who qualifies each period or add anything to payroll —
-- that's a separate, deliberately not-yet-built step, since crediting
-- real pay needs its own design (which fuel logs count, how a period
-- closes off, how it shows on a payslip) rather than guessing it here.
--
-- min_mpg/max_mpg define the qualifying band against the same
-- calculated_mpg the fuel theft engine already computes (migration
-- 070/071) — a driver has to be economical AND not flagged as a
-- suspected skim to ever be considered, once the award step exists.
-- max_mpg is nullable: some companies may only want a floor ("7.5 MPG
-- or better") with no upper bound.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.org_fuel_bonus_settings (
  organization_id UUID PRIMARY KEY DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  min_mpg NUMERIC(5, 2) NOT NULL DEFAULT 8.0 CHECK (min_mpg > 0),
  max_mpg NUMERIC(5, 2) CHECK (max_mpg IS NULL OR max_mpg > min_mpg),
  bonus_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (bonus_amount >= 0),
  period TEXT NOT NULL DEFAULT 'weekly' CHECK (period IN ('weekly', 'monthly')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

COMMENT ON TABLE public.org_fuel_bonus_settings IS 'Admin-configured fuel efficiency bonus preferences (settings only — no automatic award/payout logic yet). One row per organization.';
COMMENT ON COLUMN public.org_fuel_bonus_settings.min_mpg IS 'Lower bound of the qualifying MPG range, compared against fuel_receipts.calculated_mpg (migration 070).';
COMMENT ON COLUMN public.org_fuel_bonus_settings.max_mpg IS 'Upper bound of the qualifying range. NULL means no ceiling — anything at or above min_mpg qualifies.';
COMMENT ON COLUMN public.org_fuel_bonus_settings.bonus_amount IS 'A plain £ amount the admin sets directly — never computed by a formula here.';

ALTER TABLE public.org_fuel_bonus_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_fuel_bonus_settings_payroll_admin_all" ON public.org_fuel_bonus_settings;
CREATE POLICY "org_fuel_bonus_settings_payroll_admin_all"
  ON public.org_fuel_bonus_settings FOR ALL
  TO authenticated
  USING (public.is_org_payroll_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_payroll_admin() AND organization_id = public.current_org_id());

NOTIFY pgrst, 'reload schema';

COMMIT;
