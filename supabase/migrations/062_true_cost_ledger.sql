-- ============================================================
-- Migration 062: True Cost Ledger + Analytics Settings
-- ============================================================
-- Analytics "profit" was revenue − wages − fuel only. This adds what the
-- business actually pays for beyond that, so Analytics can show TRUE
-- profit:
--   • org_costs — recurring or one-off costs (vehicle finance/lease,
--     insurance, maintenance & tyres, tolls/Dart/ferries, trailer hire,
--     office overheads, agency fees, subcontractors, other), entered
--     monthly, annually or once, optionally per vehicle. Amounts are ex-VAT
--     with a flag saying whether VAT applies. 'pending' costs are shown
--     separately in Analytics, never mixed into the approved figure.
--   • org_analytics_settings — employer NI & pension on-cost % (applied
--     to payroll) and targets: margin %, revenue per truck per day,
--     weekly profit.
-- Payroll admins of the organization only (same gate as shift_revenue).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.org_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'vehicle_finance', 'insurance', 'maintenance', 'tolls', 'trailer_hire',
    'overheads', 'agency_fees', 'subcontractor', 'other'
  )),
  label TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  vat_applicable BOOLEAN NOT NULL DEFAULT true,
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'annual', 'one_off')),
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT org_costs_date_order CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_org_costs_org ON public.org_costs(organization_id);

ALTER TABLE public.org_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_costs_payroll_admin_all" ON public.org_costs;
CREATE POLICY "org_costs_payroll_admin_all"
  ON public.org_costs FOR ALL
  TO authenticated
  USING (public.is_org_payroll_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_payroll_admin() AND organization_id = public.current_org_id());

CREATE TABLE IF NOT EXISTS public.org_analytics_settings (
  organization_id UUID PRIMARY KEY DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  employer_oncost_percent NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (employer_oncost_percent BETWEEN 0 AND 100),
  target_margin_percent NUMERIC(5, 2) NOT NULL DEFAULT 35 CHECK (target_margin_percent BETWEEN -100 AND 100),
  target_revenue_per_truck_day NUMERIC(10, 2),
  target_weekly_profit NUMERIC(12, 2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.org_analytics_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_analytics_settings_payroll_admin_all" ON public.org_analytics_settings;
CREATE POLICY "org_analytics_settings_payroll_admin_all"
  ON public.org_analytics_settings FOR ALL
  TO authenticated
  USING (public.is_org_payroll_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_payroll_admin() AND organization_id = public.current_org_id());

NOTIFY pgrst, 'reload schema';

COMMIT;
