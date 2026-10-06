-- 088: Stop false idle alerts early in a shift.
--
-- Two paths created idle alerts:
--   * detect_idle_drivers() — pg_cron every 2 minutes (and the dashboard
--     poll). Correct: stationary since >= organizations.idle_alert_minutes.
--   * tr_gps_idle_check → tr_detect_idle_driver() on every GPS insert.
--     It only checked "no movement in the last 50 minutes" and ">= 10 pings",
--     which is trivially true for any shift younger than 50 minutes, so a
--     driver doing a walk-around at the depot was flagged idle after ~10
--     pings (~20 minutes on a phone), ignored the per-company threshold, and
--     left the message at the column default "Idle for over 2 minutes".
--
-- The cron path already covers detection, so the trigger is dropped.

DROP TRIGGER IF EXISTS tr_gps_idle_check ON public.gps_locations;
