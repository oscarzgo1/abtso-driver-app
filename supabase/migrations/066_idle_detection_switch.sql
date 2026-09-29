-- ============================================================
-- Migration 066: Company-wide idle detection switch
-- ============================================================
-- Settings → Alerts can now turn idle detection off for a whole company
-- (organizations.idle_detection_enabled, default true). Idle alerts are
-- created by TWO server-side paths, and both must honour the switch or
-- turning it off would only hide alerts in the browser while new ones
-- kept being created:
--   1. detect_idle_drivers()  — pg_cron, every 2 minutes.
--   2. tr_detect_idle_driver() — trigger tr_gps_idle_check on every GPS
--      ping (hardcoded 50-minute window; left as is apart from the switch).
-- Neither filters by profession, so drivers, mechanics and logistics
-- staff are all covered when detection is on.
-- Turning the switch off does not delete existing alerts; the admin
-- panel just stops showing idle ones until it's turned back on.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS idle_detection_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.organizations.idle_detection_enabled IS
  'false = no idle alerts are created for this company (cron and GPS trigger both check it).';

-- 1. Cron path: skip companies that switched idle detection off.
CREATE OR REPLACE FUNCTION public.detect_idle_drivers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rec RECORD;
  v_started_at TIMESTAMPTZ;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_last_ping TIMESTAMPTZ;
  v_speed NUMERIC;
BEGIN
  FOR v_rec IN
    SELECT s.id AS shift_id, s.driver_id, s.start_time, s.start_lat, s.start_lng,
           COALESCE(o.idle_alert_minutes, 50) AS idle_alert_minutes
    FROM public.shifts s
    JOIN public.drivers d ON d.id = s.driver_id
    LEFT JOIN public.organizations o ON o.id = d.organization_id
    WHERE s.status = 'active'
      AND COALESCE(o.idle_detection_enabled, true)
  LOOP
    -- Check if there is ALREADY an unresolved/active alert. If so, skip.
    IF EXISTS (
      SELECT 1 FROM public.idle_alerts
      WHERE shift_id = v_rec.shift_id
        AND (cleared = false OR is_resolved = false OR acknowledged = false)
    ) THEN
      CONTINUE;
    END IF;

    -- Get latest ping
    SELECT recorded_at, speed, latitude, longitude
    INTO v_last_ping, v_speed, v_lat, v_lng
    FROM public.gps_locations
    WHERE shift_id = v_rec.shift_id
    ORDER BY recorded_at DESC
    LIMIT 1;

    -- Check idle threshold
    IF (v_speed IS NULL OR v_speed < 0.5) THEN
        SELECT MIN(recorded_at) INTO v_started_at
        FROM public.gps_locations
        WHERE shift_id = v_rec.shift_id
          AND (speed IS NULL OR speed < 0.5)
          AND recorded_at > COALESCE(
            (SELECT MAX(recorded_at) FROM public.gps_locations WHERE shift_id = v_rec.shift_id AND speed >= 0.5),
            '1970-01-01'::timestamptz
          );

        -- PER-ORGANIZATION SETTING (default 50 minutes, migration 038)
        IF COALESCE(v_started_at, v_last_ping) <= now() - (v_rec.idle_alert_minutes || ' minutes')::interval THEN
          -- Delete any old, cleared ghost alerts for this shift to prevent Unique Constraint blocks
          DELETE FROM public.idle_alerts WHERE shift_id = v_rec.shift_id;

          INSERT INTO public.idle_alerts (driver_id, shift_id, message, started_at, latitude, longitude, acknowledged, cleared, is_resolved)
          VALUES (
            v_rec.driver_id, v_rec.shift_id,
            'Idle for over ' || v_rec.idle_alert_minutes || ' minutes',
            COALESCE(v_started_at, v_last_ping),
            COALESCE(v_lat, v_rec.start_lat, 53.481798),
            COALESCE(v_lng, v_rec.start_lng, -1.086552),
            false, false, false
          );
        END IF;
    END IF;
  END LOOP;
END;
$$;

-- 2. GPS-ping trigger path: same body as before, plus an early exit when
--    the driver's company has switched idle detection off.
CREATE OR REPLACE FUNCTION public.tr_detect_idle_driver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.drivers d
    JOIN public.organizations o ON o.id = d.organization_id
    WHERE d.id = NEW.driver_id
      AND o.idle_detection_enabled = false
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.idle_alerts (driver_id, shift_id, started_at, latitude, longitude)
  SELECT DISTINCT ON (gl.driver_id)
    gl.driver_id,
    gl.shift_id,
    (
      SELECT MIN(g2.recorded_at)
      FROM public.gps_locations g2
      WHERE g2.driver_id = gl.driver_id
        AND g2.shift_id = gl.shift_id
        AND (g2.speed IS NULL OR g2.speed < 0.5)
        AND g2.recorded_at > COALESCE(
          (
            SELECT MAX(g_move.recorded_at)
            FROM public.gps_locations g_move
            WHERE g_move.driver_id = gl.driver_id
              AND g_move.shift_id = gl.shift_id
              AND g_move.speed >= 0.5
          ),
          '1970-01-01 00:00:00+00'::TIMESTAMPTZ
        )
    ) AS started_at,
    gl.latitude,
    gl.longitude
  FROM public.gps_locations gl
  JOIN public.shifts s ON s.id = gl.shift_id AND s.status = 'active'
  WHERE gl.driver_id = NEW.driver_id
    AND gl.recorded_at >= now() - INTERVAL '5 minutes'
    -- Ensure NO movement in the last 50 minutes (stationary threshold)
    AND NOT EXISTS (
      SELECT 1
      FROM public.gps_locations g3
      WHERE g3.driver_id = gl.driver_id
        AND g3.shift_id = gl.shift_id
        AND g3.speed >= 0.5
        AND g3.recorded_at >= now() - INTERVAL '50 minutes'
    )
    -- Verify they uploaded at least 10 pings in the last 50 minutes (sanity check)
    AND (
      SELECT COUNT(*)
      FROM public.gps_locations g4
      WHERE g4.driver_id = gl.driver_id
        AND g4.shift_id = gl.shift_id
        AND g4.recorded_at >= now() - INTERVAL '50 minutes'
    ) >= 10
    -- Don't duplicate unacknowledged alerts for the same shift
    AND NOT EXISTS (
      SELECT 1
      FROM public.idle_alerts ia
      WHERE ia.driver_id = gl.driver_id
        AND ia.shift_id = gl.shift_id
        AND ia.acknowledged = false
    )
    -- B: LOOP GUARD - Skip if the latest acknowledged alert was created LESS than 50 minutes ago
    AND NOT EXISTS (
      SELECT 1 FROM public.idle_alerts ia
      WHERE ia.driver_id = gl.driver_id
        AND ia.shift_id = gl.shift_id
        AND ia.acknowledged = true
        AND ia.created_at > now() - INTERVAL '50 minutes'
    )
  ORDER BY gl.driver_id, gl.recorded_at DESC
  LIMIT 1;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
