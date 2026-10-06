-- 082: Tenant isolation for GPS data.
--
-- Found in production:
--   * gps_select_authenticated used USING (true), so any signed-in user
--     (another company's admin, or any driver) could read every company's
--     GPS history.
--   * gps_insert_anon let signed-out callers insert GPS points, i.e. spoof
--     any driver's location and trip idle alerts.
--   * live_driver_locations was a SECURITY DEFINER view, so it bypassed RLS
--     and served live driver positions to the anon key.
--
-- The driver app always inserts as the signed-in driver (auth.uid() =
-- drivers.id) and the dashboard reads through org-admin RLS, so both keep
-- working with these narrower rules.

DROP POLICY IF EXISTS gps_insert_anon ON public.gps_locations;
DROP POLICY IF EXISTS gps_insert_authenticated ON public.gps_locations;
DROP POLICY IF EXISTS gps_select_authenticated ON public.gps_locations;

CREATE POLICY gps_insert_own ON public.gps_locations
  FOR INSERT TO authenticated
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY gps_select_own_or_org_admin ON public.gps_locations
  FOR SELECT TO authenticated
  USING (
    driver_id = auth.uid()
    OR (public.is_org_admin() AND organization_id = public.current_org_id())
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.gps_locations FROM anon;

-- Run the view with the caller's rights so the RLS above (and on drivers /
-- shifts) applies to it.
ALTER VIEW public.live_driver_locations SET (security_invoker = true);
REVOKE ALL ON public.live_driver_locations FROM anon;
