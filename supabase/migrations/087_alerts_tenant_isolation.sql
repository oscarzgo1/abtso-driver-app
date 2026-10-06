-- 087: Tenant isolation for SOS and idle alerts.
--
-- is_admin() is just is_org_admin() — "is an admin of *some* company" —
-- so sos_alerts_admin_all / idle_alerts_admin_all let any customer's admin
-- read, acknowledge, clear or delete every other customer's SOS and idle
-- alerts. idle_alerts_driver_select was USING (true), so any signed-in
-- user (including drivers) could read all of them. Every row already has
-- organization_id (trg_sync_org_id_*), so scope by it like the other
-- org tables. The unused _deprecated_weekly_rate_overrides table was also
-- writable by anon; close it.

DROP POLICY IF EXISTS sos_alerts_admin_all ON public.sos_alerts;
CREATE POLICY sos_alerts_org_admin_all ON public.sos_alerts
  FOR ALL TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS sos_alerts_driver_select_own ON public.sos_alerts;
CREATE POLICY sos_alerts_driver_select_own ON public.sos_alerts
  FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS idle_alerts_admin_all ON public.idle_alerts;
DROP POLICY IF EXISTS idle_alerts_driver_select ON public.idle_alerts;
CREATE POLICY idle_alerts_org_admin_all ON public.idle_alerts
  FOR ALL TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());
CREATE POLICY idle_alerts_driver_select_own ON public.idle_alerts
  FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "Allow all access to weekly_rate_overrides" ON public._deprecated_weekly_rate_overrides;
REVOKE ALL ON public._deprecated_weekly_rate_overrides FROM anon, authenticated;
