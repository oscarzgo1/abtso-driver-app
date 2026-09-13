-- ============================================================
-- Tachyo — Idle-Alert Threshold Verification
-- ============================================================
-- Confirms detect_idle_drivers() actually honours each company's
-- OWN idle-alert threshold (Settings -> Alerts, migration 038)
-- instead of always alerting at the old fixed 50-minute mark.
--
-- Background: the idle threshold used to be hardcoded to 50 minutes
-- inside detect_idle_drivers() (migration 021). Migration 038 made
-- it a per-organization setting (organizations.idle_alert_minutes)
-- and rewrote the function to read it — but that rewrite has never
-- been directly verified against multiple real threshold values.
-- This script exercises 10, 20, and 50-minute thresholds (plus an
-- exact-boundary case) end to end: it sets an org's threshold,
-- simulates a driver going idle for a specific number of minutes,
-- runs the real detection function, and checks whether an alert
-- was (or wasn't) created.
--
-- IMPORTANT: this only proves anything once migration 038 is live.
-- Run against a database that still has the migration-021 version of
-- detect_idle_drivers() deployed and every threshold-mismatch case
-- below (10 and 20 minutes) is EXPECTED to fail — that failure is
-- the diagnostic signal that the deploy is still pending, not a bug
-- in this test. Once 038 is applied, every case should pass.
--
-- Run in the Supabase SQL Editor, or:
--   npx supabase db query --linked --file supabase/tests/idle_alert_threshold_test.sql
--
-- Everything below runs inside one transaction that is rolled back
-- at the end (see ROLLBACK), so no test data is left behind in
-- either the pass or the fail case.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_org_id UUID;
  v_driver_id UUID;
  v_shift_id UUID;
  v_alert_count INT;
  v_all_passed BOOLEAN := true;
  v_case_passed BOOLEAN;

  -- One row per case: [threshold_minutes, idle_for_minutes, expect_alert].
  -- "idle_for_minutes" is how long ago the driver's one and only GPS
  -- ping was recorded, stationary — i.e. how long they've actually
  -- been idle by the time detect_idle_drivers() runs.
  v_cases CONSTANT TEXT[][] := ARRAY[
    ['10', '8',  'false'],  -- 2 min short of a 10-minute threshold
    ['10', '12', 'true'],   -- 2 min past a 10-minute threshold
    ['20', '18', 'false'],
    ['20', '22', 'true'],
    ['50', '48', 'false'],  -- the old hardcoded default, still exercised
    ['50', '52', 'true'],
    ['15', '15', 'true']    -- exact boundary: idle for precisely the threshold
  ];
  v_case TEXT[];
  v_threshold INT;
  v_idle_minutes_ago INT;
  v_expect_alert BOOLEAN;
BEGIN
  RAISE NOTICE '--- IDLE-ALERT THRESHOLD VERIFICATION ---';

  -- Isolated test organization, so its idle_alert_minutes can be
  -- changed freely between cases without touching any real company.
  INSERT INTO public.organizations (name, slug, plan, idle_alert_minutes)
  VALUES (
    'Idle Threshold Test Co',
    'idle-threshold-test-' || substr(gen_random_uuid()::text, 1, 8),
    'free',
    50
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.drivers (driver_id, pin_hash, full_name, organization_id)
  VALUES ('DRV-IDLE-TEST', crypt('123456', gen_salt('bf')), 'Idle Threshold Test Driver', v_org_id)
  RETURNING id INTO v_driver_id;

  FOREACH v_case SLICE 1 IN ARRAY v_cases
  LOOP
    v_threshold := v_case[1]::INT;
    v_idle_minutes_ago := v_case[2]::INT;
    v_expect_alert := v_case[3]::BOOLEAN;

    -- Set this org's threshold for this case.
    UPDATE public.organizations SET idle_alert_minutes = v_threshold WHERE id = v_org_id;

    -- A fresh active shift with a single stationary GPS ping recorded
    -- v_idle_minutes_ago minutes ago. Being the only ping on the
    -- shift, it unambiguously marks how long the driver has been idle.
    INSERT INTO public.shifts (driver_id, start_time, status)
    VALUES (v_driver_id, now() - (v_idle_minutes_ago || ' minutes')::interval, 'active')
    RETURNING id INTO v_shift_id;

    INSERT INTO public.gps_locations (driver_id, shift_id, latitude, longitude, speed, recorded_at)
    VALUES (v_driver_id, v_shift_id, 53.4808, -1.0876, 0, now() - (v_idle_minutes_ago || ' minutes')::interval);

    PERFORM public.detect_idle_drivers();

    SELECT count(*) INTO v_alert_count FROM public.idle_alerts WHERE shift_id = v_shift_id;

    v_case_passed := (v_alert_count > 0) = v_expect_alert;
    v_all_passed := v_all_passed AND v_case_passed;

    RAISE NOTICE '[%] threshold=% min, idle for % min -> expected alert=%, got %',
      CASE WHEN v_case_passed THEN 'PASS' ELSE 'FAIL' END,
      v_threshold, v_idle_minutes_ago, v_expect_alert, (v_alert_count > 0);

    -- Close the shift out so it drops out of detect_idle_drivers()'s
    -- "active shifts" scan for every case that follows.
    UPDATE public.shifts SET status = 'completed', end_time = now() WHERE id = v_shift_id;
  END LOOP;

  IF v_all_passed THEN
    RAISE NOTICE '--- ALL IDLE-ALERT THRESHOLD CASES PASSED ---';
  ELSE
    RAISE EXCEPTION '--- IDLE-ALERT THRESHOLD TEST FAILED — see NOTICE output above for which case(s) ---';
  END IF;
END $$;

ROLLBACK;
