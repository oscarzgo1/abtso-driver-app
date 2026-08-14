-- ============================================================
-- ABTSO Logistics — Migration 020: Nuclear Fix for Idle Alerts Ghost Block
-- ============================================================
-- Fixes unique constraint blocks on shift_id by deleting stale/cleared
-- ghost alerts prior to inserting new active idle alerts.
-- ============================================================

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
    SELECT s.id AS shift_id, s.driver_id, s.start_time, s.start_lat, s.start_lng 
    FROM public.shifts s 
    WHERE s.status = 'active' 
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

        IF COALESCE(v_started_at, v_last_ping) <= now() - INTERVAL '2 minutes' THEN 
          -- NUCLEAR FIX: Delete any old, cleared ghost alerts for this shift to prevent Unique Constraint blocks 
          DELETE FROM public.idle_alerts WHERE shift_id = v_rec.shift_id; 

          -- Force fresh insert 
          INSERT INTO public.idle_alerts (driver_id, shift_id, message, started_at, latitude, longitude, acknowledged, cleared, is_resolved) 
          VALUES ( 
            v_rec.driver_id, v_rec.shift_id, 'Idle for over 2 minutes', 
            COALESCE(v_started_at, v_last_ping), 
            COALESCE(v_lat, v_rec.start_lat, 53.481798), 
            COALESCE(v_lng, v_rec.start_lng, -1.086552), 
            false, false, false 
          ); 
        END IF; 
    END IF; 
  END LOOP; 
END; 
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Force Cache Reload 
NOTIFY pgrst, 'reload schema';
