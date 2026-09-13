-- ============================================================
-- Migration 038: Per-Organization Alert & Flag Thresholds
-- ============================================================
-- Three values were previously hardcoded identically for every
-- company on the platform:
--   - Long-shift "critical anomaly" flag: > 18 hours (client-side,
--     admin_dashboard/src/App.tsx — Flags & Reviews bell + the
--     detailed shift table's red-tint row)
--   - Idle-alert threshold: 50 minutes stationary (server-side,
--     detect_idle_drivers(), see migration 021)
--   - Night-out gap detection window: 8-15 hours between two of the
--     same driver's shifts (client-side, App.tsx)
--
-- This migration makes each configurable per organization, with
-- defaults matching current live behaviour exactly — applying it
-- changes nothing for any existing company until an admin edits
-- Settings -> Alerts.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ------------------------------------------------------------
-- 1. NEW COLUMNS
-- ------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS long_shift_flag_hours   NUMERIC NOT NULL DEFAULT 18 CHECK (long_shift_flag_hours > 0),
  ADD COLUMN IF NOT EXISTS idle_alert_minutes       INTEGER NOT NULL DEFAULT 50 CHECK (idle_alert_minutes > 0),
  ADD COLUMN IF NOT EXISTS night_out_min_gap_hours  NUMERIC NOT NULL DEFAULT 8  CHECK (night_out_min_gap_hours >= 0),
  ADD COLUMN IF NOT EXISTS night_out_max_gap_hours  NUMERIC NOT NULL DEFAULT 15 CHECK (night_out_max_gap_hours > night_out_min_gap_hours);

-- ------------------------------------------------------------
-- 2. detect_idle_drivers() — reads each shift's own organization's
--    idle_alert_minutes instead of the fixed 50-minute constant
--    from migration 021. LEFT JOIN + COALESCE(..., 50) is a
--    defensive fallback only; organization_id is NOT NULL on
--    drivers (migration 032), so the join should never actually miss.
-- ------------------------------------------------------------
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
    SELECT s.id AS shift_id, s.driver_id, s.start_time, s.start_lat, s.start_lng,
           COALESCE(o.idle_alert_minutes, 50) AS idle_alert_minutes
    FROM public.shifts s
    JOIN public.drivers d ON d.id = s.driver_id
    LEFT JOIN public.organizations o ON o.id = d.organization_id
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';

COMMIT;
