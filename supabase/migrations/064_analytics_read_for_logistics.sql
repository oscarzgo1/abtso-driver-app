-- ============================================================
-- Migration 064: Logistics can read Analytics' cost inputs
-- ============================================================
-- Analytics brief E3: logistics staff see driver profitability, so the
-- whole Analytics tab opens to them. They may READ the cost ledger and
-- targets (so their true-profit figures match payroll's) but only payroll
-- admins change them. Share links stay payroll-admin only.
-- ============================================================
BEGIN;
DROP POLICY IF EXISTS "org_costs_admin_read" ON public.org_costs;
CREATE POLICY "org_costs_admin_read" ON public.org_costs FOR SELECT TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id());
DROP POLICY IF EXISTS "org_analytics_settings_admin_read" ON public.org_analytics_settings;
CREATE POLICY "org_analytics_settings_admin_read" ON public.org_analytics_settings FOR SELECT TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id());
NOTIFY pgrst, 'reload schema';
COMMIT;
