-- 083: Stop exposing internal SECURITY DEFINER functions to the public API.
--
-- These functions do no caller checks and were executable by anon (the key
-- shipped in the web bundle) through /rest/v1/rpc/*:
--   * verify_driver_pin       - PIN-guessing oracle that skips the lockout
--   * create_driver_profile   - creates drivers with no organization (unused)
--   * record_audit            - forges security_audit_log entries for any org
--   * hash_secret, verify_org_signup_code
--   * recalculate_driver_shifts, sync_shift_revenue_from_loads,
--     sweep_stale_review_approvals - internal recalcs / cron work
-- Every legitimate caller is an edge function using the service role.
--
-- detect_idle_drivers and request_night_out are called by signed-in admins /
-- drivers, so they keep authenticated access and only lose anon.

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.verify_driver_pin(text, text)',
    'public.create_driver_profile(text, text, text, text)',
    'public.record_audit(uuid, text, text, uuid, text, jsonb)',
    'public.hash_secret(text)',
    'public.verify_org_signup_code(text, text, text)',
    'public.recalculate_driver_shifts(uuid)',
    'public.sync_shift_revenue_from_loads(uuid)',
    'public.sweep_stale_review_approvals()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;

  FOREACH fn IN ARRAY ARRAY[
    'public.detect_idle_drivers()',
    'public.request_night_out(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;
