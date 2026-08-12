-- ============================================================
-- ABTSO Logistics — Migration 015: Fix Idle Detection Pipeline (2-Min Threshold)
-- ============================================================

-- 1. Ensure live_driver_locations view exposes shift_id column
CREATE OR REPLACE VIEW public.live_driver_locations AS
SELECT DISTINCT ON (l.driver_id)
  l.driver_id,
  l.shift_id,
  d.full_name,
  d.driver_id as emp_code,
  l.latitude,
  l.longitude,
  l.speed,
  l.recorded_at,
  s.status as shift_status
FROM public.gps_locations l
JOIN public.drivers d ON d.id = l.driver_id
JOIN public.shifts s ON s.id = l.shift_id
WHERE s.status = 'active'
ORDER BY l.driver_id, l.recorded_at DESC;

GRANT SELECT ON public.live_driver_locations TO anon, authenticated, service_role;

-- 2. Ensure idle_alerts table schema supports message & is_resolved
ALTER TABLE public.idle_alerts ADD COLUMN IF NOT EXISTS message TEXT DEFAULT 'Idle for over 2 minutes';
ALTER TABLE public.idle_alerts ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN DEFAULT FALSE;
ALTER TABLE public.idle_alerts ADD COLUMN IF NOT EXISTS cleared BOOLEAN DEFAULT FALSE;
ALTER TABLE public.idle_alerts ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN DEFAULT FALSE;

-- 3. Update detect_idle_drivers RPC to 2-minute testing threshold
CREATE OR REPLACE FUNCTION public.detect_idle_drivers()
RETURNS void AS $$
DECLARE
  v_rec RECORD;
  v_started_at TIMESTAMPTZ;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_last_ping TIMESTAMPTZ;
  v_speed NUMERIC;
BEGIN
  FOR v_rec IN
    SELECT s.id AS shift_id, s.driver_id, s.start_time, s.start_lat, s.start_lng, d.full_name, d.driver_id AS driver_code
    FROM public.shifts s
    JOIN public.drivers d ON d.id = s.driver_id
    WHERE s.status = 'active'
  LOOP
    -- Skip if driver already has an unacknowledged or uncleared idle alert for this shift
    IF EXISTS (
      SELECT 1 FROM public.idle_alerts 
      WHERE shift_id = v_rec.shift_id 
        AND (acknowledged = false OR acknowledged IS NULL)
        AND (cleared = false OR cleared IS NULL)
        AND (is_resolved = false OR is_resolved IS NULL)
    ) THEN
      CONTINUE;
    END IF;

    -- Check latest GPS location for this shift
    SELECT recorded_at, speed, latitude, longitude
    INTO v_last_ping, v_speed, v_lat, v_lng
    FROM public.gps_locations
    WHERE shift_id = v_rec.shift_id
    ORDER BY recorded_at DESC
    LIMIT 1;

    IF v_last_ping IS NULL THEN
      -- Driver clocked in > 2 minutes ago with 0 pings
      IF v_rec.start_time <= now() - INTERVAL '2 minutes' THEN
        INSERT INTO public.idle_alerts (driver_id, shift_id, message, started_at, latitude, longitude, acknowledged, cleared, is_resolved)
        VALUES (
          v_rec.driver_id,
          v_rec.shift_id,
          'Idle for over 2 minutes (No GPS pings)',
          v_rec.start_time,
          COALESCE(v_rec.start_lat, 53.481798),
          COALESCE(v_rec.start_lng, -1.086552),
          false,
          false,
          false
        ) ON CONFLICT DO NOTHING;
      END IF;
    ELSE
      -- Driver has pings: check if last ping > 2 mins ago OR speed < 0.5 for > 2 mins
      IF v_last_ping <= now() - INTERVAL '2 minutes' OR (v_speed IS NULL OR v_speed < 0.5) THEN
        -- Check how long driver has been stationary
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

        IF v_last_ping <= now() - INTERVAL '2 minutes' OR COALESCE(v_started_at, v_last_ping) <= now() - INTERVAL '2 minutes' THEN
          INSERT INTO public.idle_alerts (driver_id, shift_id, message, started_at, latitude, longitude, acknowledged, cleared, is_resolved)
          VALUES (
            v_rec.driver_id,
            v_rec.shift_id,
            'Idle for over 2 minutes',
            COALESCE(v_started_at, v_last_ping),
            COALESCE(v_lat, v_rec.start_lat, 53.481798),
            COALESCE(v_lng, v_rec.start_lng, -1.086552),
            false,
            false,
            false
          ) ON CONFLICT DO NOTHING;
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update tr_detect_idle_driver trigger to 2-minute testing threshold
CREATE OR REPLACE FUNCTION public.tr_detect_idle_driver()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.detect_idle_drivers();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_gps_idle_check ON public.gps_locations;
CREATE TRIGGER tr_gps_idle_check
  AFTER INSERT ON public.gps_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_detect_idle_driver();

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
