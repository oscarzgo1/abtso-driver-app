-- ============================================================
-- ABTSO Logistics — Migration 006: Idle Alert Detection
-- ============================================================
-- Uses pg_cron to check every 2 minutes for drivers whose
-- GPS speed has been 0 for 50+ consecutive minutes.
-- New alerts are written to idle_alerts, which triggers
-- a Supabase Realtime push to the admin dashboard.
-- ============================================================

-- ------------------------------------------------------------
-- Function: Check for idle drivers and create alerts
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_idle_drivers()
RETURNS void AS $$
BEGIN
  INSERT INTO public.idle_alerts (driver_id, shift_id, started_at, latitude, longitude)
  SELECT DISTINCT ON (gl.driver_id)
    gl.driver_id,
    gl.shift_id,
    -- Find when the current continuous idle period started (oldest stationary ping since the last moving ping)
    (
      SELECT MIN(g2.recorded_at)
      FROM public.gps_locations g2
      WHERE g2.driver_id = gl.driver_id
        AND g2.shift_id = gl.shift_id
        AND (g2.speed IS NULL OR g2.speed < 0.5)  -- < 0.5 m/s ≈ stationary
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
  WHERE
    -- Recent reading
    gl.recorded_at >= now() - INTERVAL '5 minutes'
    -- Check that ALL readings in last 50 min show speed ≈ 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.gps_locations g3
      WHERE g3.driver_id = gl.driver_id
        AND g3.shift_id = gl.shift_id
        AND g3.speed >= 0.5  -- Any non-zero speed reading
        AND g3.recorded_at >= now() - INTERVAL '50 minutes'
    )
    -- Must have at least 10 GPS readings in the window (sanity check)
    AND (
      SELECT COUNT(*)
      FROM public.gps_locations g4
      WHERE g4.driver_id = gl.driver_id
        AND g4.shift_id = gl.shift_id
        AND g4.recorded_at >= now() - INTERVAL '50 minutes'
    ) >= 10
    -- Don't create duplicate unacknowledged alerts for the same shift
    AND NOT EXISTS (
      SELECT 1
      FROM public.idle_alerts ia
      WHERE ia.driver_id = gl.driver_id
        AND ia.shift_id = gl.shift_id
        AND ia.acknowledged = false
    )
  ORDER BY gl.driver_id, gl.recorded_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Schedule the check every 2 minutes via pg_cron
-- NOTE: pg_cron must be enabled first in Supabase Dashboard
--       (Database → Extensions → pg_cron → Enable)
-- ------------------------------------------------------------
-- Uncomment after enabling pg_cron:
--
-- SELECT cron.schedule(
--   'detect-idle-drivers',
--   '*/2 * * * *',
--   $$SELECT public.detect_idle_drivers();$$
-- );
