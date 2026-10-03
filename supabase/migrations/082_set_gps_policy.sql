-- ============================================================
-- 082: Settings -> Alerts -> "GPS tracking" save path.
-- Admins of a company change their GPS-offline policy (organizations
-- gps_offline_*, migration 081) through this RPC, so the Settings screen
-- does not depend on an edge function being redeployed.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_gps_policy(
  p_enabled BOOLEAN,
  p_after_minutes INTEGER,
  p_notify_driver BOOLEAN,
  p_action TEXT,
  p_clock_out_minutes INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'Only a company admin can change the GPS tracking policy.';
  END IF;
  IF p_action NOT IN ('none', 'freeze_time', 'clock_out') THEN
    RAISE EXCEPTION 'Unknown action.';
  END IF;
  IF p_after_minutes NOT BETWEEN 5 AND 120 THEN
    RAISE EXCEPTION 'Offline threshold must be between 5 and 120 minutes.';
  END IF;
  IF p_clock_out_minutes NOT BETWEEN 10 AND 480 THEN
    RAISE EXCEPTION 'Auto clock-out must be between 10 and 480 minutes.';
  END IF;
  UPDATE public.organizations
     SET gps_offline_detection_enabled = p_enabled,
         gps_offline_after_minutes = p_after_minutes,
         gps_offline_notify_driver = p_notify_driver,
         gps_offline_action = p_action,
         gps_offline_clock_out_minutes = p_clock_out_minutes
   WHERE id = public.current_org_id();
END;
$$;
REVOKE ALL ON FUNCTION public.set_gps_policy(BOOLEAN, INTEGER, BOOLEAN, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_gps_policy(BOOLEAN, INTEGER, BOOLEAN, TEXT, INTEGER) TO authenticated;
