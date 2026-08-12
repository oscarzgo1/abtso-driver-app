-- ============================================================
-- ABTSO Logistics — Migration 012: Idle Alert Detection RPC (2-min threshold)
-- ============================================================

CREATE OR REPLACE FUNCTION public.detect_idle_drivers()
RETURNS void AS $$
DECLARE
  v_rec RECORD;
  v_started_at TIMESTAMPTZ;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_ping_count INTEGER;
  v_latest_speed NUMERIC;
  v_last_ping_time TIMESTAMPTZ;
BEGIN
  -- Loop through all active shifts
  FOR v_rec IN 
    SELECT s.id AS shift_id, s.driver_id, s.start_time, s.start_lat, s.start_lng, d.full_name, d.driver_id AS driver_code
    FROM public.shifts s
    JOIN public.drivers d ON d.id = s.driver_id
    WHERE s.status = 'active'
  LOOP
    -- Skip if driver already has an unacknowledged active alert for this shift
    IF EXISTS (
      SELECT 1 FROM public.idle_alerts 
      WHERE shift_id = v_rec.shift_id 
        AND (acknowledged = false OR acknowledged IS NULL)
        AND (cleared = false OR cleared IS NULL)
    ) THEN
      CONTINUE;
    END IF;

    -- Count total pings for this shift
    SELECT COUNT(*) INTO v_ping_count
    FROM public.gps_locations
    WHERE shift_id = v_rec.shift_id;

    IF v_ping_count = 0 THEN
      -- CASE 1: Active shift with no GPS pings yet
      IF v_rec.start_time <= now() - INTERVAL '2 minutes' THEN
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
      -- CASE 2: Driver has pings
      SELECT recorded_at, COALESCE(speed, 0), latitude, longitude
      INTO v_last_ping_time, v_latest_speed, v_lat, v_lng
      FROM public.gps_locations
      WHERE shift_id = v_rec.shift_id
      ORDER BY recorded_at DESC
      LIMIT 1;

      -- Check if latest ping is older than 2 minutes OR speed <= 0.5 for at least 2 minutes
      IF v_last_ping_time <= now() - INTERVAL '2 minutes' OR v_latest_speed < 0.5 THEN
        -- Find oldest stationary ping in current idle window
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

        IF v_last_ping_time <= now() - INTERVAL '2 minutes' OR COALESCE(v_started_at, v_last_ping_time) <= now() - INTERVAL '2 minutes' THEN
          INSERT INTO public.idle_alerts (driver_id, shift_id, started_at, latitude, longitude)
          VALUES (
            v_rec.driver_id, 
            v_rec.shift_id, 
            COALESCE(v_started_at, v_last_ping_time, now()), 
            COALESCE(v_lat, v_rec.start_lat, 53.481798), 
            COALESCE(v_lng, v_rec.start_lng, -1.086552)
          )
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
