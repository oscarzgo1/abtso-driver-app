-- ============================================================
-- ABTSO Logistics — Migration 006: Idle Alert Detection
-- ============================================================
-- Uses pg_cron to check every 2 minutes for drivers whose
-- GPS speed has been 0 for 50+ consecutive minutes.
-- New alerts are written to idle_alerts, which triggers
-- a Supabase Realtime push to the admin dashboard.
-- ============================================================

-- 1. Create Performance Indexes for 200+ Driver Scale
CREATE INDEX IF NOT EXISTS idx_gps_locations_shift_rec 
  ON public.gps_locations(shift_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_gps_locations_speed_rec 
  ON public.gps_locations(shift_id, speed, recorded_at);

CREATE INDEX IF NOT EXISTS idx_shifts_active 
  ON public.shifts(id, status) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_idle_alerts_lookup 
  ON public.idle_alerts(shift_id, acknowledged);


CREATE OR REPLACE FUNCTION public.detect_idle_drivers()
RETURNS void AS $$
DECLARE
  v_rec RECORD;
  v_started_at TIMESTAMPTZ;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_ping_count INTEGER;
  v_latest_speed NUMERIC;
BEGIN
  -- Loop through all active shifts
  FOR v_rec IN 
    SELECT s.id AS shift_id, s.driver_id, s.start_time, s.start_lat, s.start_lng, d.full_name, d.driver_id AS driver_code
    FROM public.shifts s
    JOIN public.drivers d ON d.id = s.driver_id
    WHERE s.status = 'active'
  LOOP
    -- A: Skip if they have an unacknowledged alert for this shift
    IF EXISTS (
      SELECT 1 FROM public.idle_alerts 
      WHERE shift_id = v_rec.shift_id AND acknowledged = false
    ) THEN
      CONTINUE;
    END IF;

    -- B: LOOP GUARD - Skip if they have an acknowledged alert created less than 50 minutes ago
    IF EXISTS (
      SELECT 1 FROM public.idle_alerts ia
      WHERE ia.shift_id = v_rec.shift_id 
        AND ia.acknowledged = true
        AND ia.created_at > now() - INTERVAL '50 minutes'
    ) THEN
      CONTINUE;
    END IF;

    -- Count total pings for this shift
    SELECT COUNT(*) INTO v_ping_count
    FROM public.gps_locations
    WHERE shift_id = v_rec.shift_id;

    IF v_ping_count = 0 THEN
      -- CASE 1: Manual clock-in (has no GPS pings yet)
      -- Check if they have been active/stationary since the start_time (using production 50-minute threshold)
      IF v_rec.start_time <= now() - INTERVAL '50 minutes' THEN
        INSERT INTO public.idle_alerts (driver_id, shift_id, started_at, latitude, longitude)
        VALUES (
          v_rec.driver_id,
          v_rec.shift_id,
          v_rec.start_time,
          COALESCE(v_rec.start_lat, 53.481798),
          COALESCE(v_rec.start_lng, -1.086552)
        ) ON CONFLICT DO NOTHING;
      END IF;
    ELSE
      -- CASE 2: Normal check (has pings)
      -- Check latest ping speed to confirm they are currently stationary
      SELECT COALESCE(speed, 0) INTO v_latest_speed
      FROM public.gps_locations
      WHERE shift_id = v_rec.shift_id
      ORDER BY recorded_at DESC
      LIMIT 1;

      -- Find oldest stationary ping in the current idle block
      SELECT MIN(recorded_at) INTO v_started_at
      FROM public.gps_locations
      WHERE shift_id = v_rec.shift_id
        AND (speed IS NULL OR speed < 0.5)
        AND recorded_at > COALESCE(
          (
            SELECT MAX(recorded_at)
            FROM public.gps_locations
            WHERE shift_id = v_rec.shift_id AND speed >= 0.5
          ),
          '1970-01-01 00:00:00+00'::TIMESTAMPTZ
        );

      -- If they are currently stationary, and have been for at least 50 minutes
      IF v_latest_speed < 0.5 AND v_started_at <= now() - INTERVAL '50 minutes' THEN
        -- Get latest ping coordinates for the alert location
        SELECT latitude, longitude INTO v_lat, v_lng
        FROM public.gps_locations
        WHERE shift_id = v_rec.shift_id
        ORDER BY recorded_at DESC
        LIMIT 1;

        INSERT INTO public.idle_alerts (driver_id, shift_id, started_at, latitude, longitude)
        VALUES (v_rec.driver_id, v_rec.shift_id, COALESCE(v_started_at, now()), v_lat, v_lng)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Trigger-Based Realtime Idle Check (Fires on every GPS insert)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tr_detect_idle_driver()
RETURNS TRIGGER AS $$
BEGIN
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
    -- B: LOOP GUARD - Skip if they have an acknowledged alert created less than 50 minutes ago
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_gps_idle_check ON public.gps_locations;
CREATE TRIGGER tr_gps_idle_check
  AFTER INSERT ON public.gps_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_detect_idle_driver();

-- Add cleared column to idle_alerts and sos_alerts
ALTER TABLE public.idle_alerts ADD COLUMN IF NOT EXISTS cleared BOOLEAN DEFAULT false;
ALTER TABLE public.sos_alerts ADD COLUMN IF NOT EXISTS cleared BOOLEAN DEFAULT false;
