-- ============================================================
-- Migration 101: idle detection carries out an action, like GPS-offline
-- ============================================================
-- Idle (stationary for the company's idle threshold, Settings -> Alerts) used
-- to only raise an alert for the office. It now also does what the company
-- chooses, the same way the GPS-offline policy does:
--   idle_action          'none'       = alert only
--                        'freeze_time'= the idle stretch is deducted from paid hours
--   idle_notify_driver   tell the driver what happened (in the app)
--
-- Implementation reuses gps_offline_events (one row per stretch) with a new
-- `kind` ('offline' | 'idle'). The pay engine already deducts every
-- time_frozen event, so frozen idle time needs no change there. An idle event
-- ends when the driver starts moving again (a ping with speed); an offline
-- event still ends on any fresh ping.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS idle_action TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS idle_notify_driver BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_idle_action_check') THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_idle_action_check CHECK (idle_action IN ('none', 'freeze_time'));
  END IF;
END $$;

ALTER TABLE public.gps_offline_events ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'offline';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gps_offline_events_kind_check') THEN
    ALTER TABLE public.gps_offline_events ADD CONSTRAINT gps_offline_events_kind_check CHECK (kind IN ('offline', 'idle'));
  END IF;
END $$;

-- One open event per shift PER KIND.
DROP INDEX IF EXISTS public.gps_offline_one_open_per_shift;
CREATE UNIQUE INDEX IF NOT EXISTS gps_offline_one_open_per_shift_kind
  ON public.gps_offline_events (shift_id, kind) WHERE resolved_at IS NULL;

-- A ping resolves an OFFLINE event (tracking is back) exactly as before; an
-- IDLE event is resolved only when the driver is moving again.
CREATE OR REPLACE FUNCTION public.tr_resolve_gps_offline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.shift_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.recorded_at >= now() - interval '5 minutes' THEN
    UPDATE public.gps_offline_events
       SET resolved_at = GREATEST(NEW.recorded_at, started_at)
     WHERE shift_id = NEW.shift_id AND resolved_at IS NULL AND kind = 'offline';
  ELSE
    UPDATE public.gps_offline_events
       SET started_at = NEW.recorded_at, last_lat = NEW.latitude, last_lng = NEW.longitude
     WHERE shift_id = NEW.shift_id AND resolved_at IS NULL AND kind = 'offline' AND NEW.recorded_at > started_at;
  END IF;
  -- Moving again ends an idle stretch.
  IF NEW.speed IS NOT NULL AND NEW.speed >= 0.5 THEN
    UPDATE public.gps_offline_events
       SET resolved_at = GREATEST(NEW.recorded_at, started_at)
     WHERE shift_id = NEW.shift_id AND resolved_at IS NULL AND kind = 'idle';
  END IF;
  RETURN NEW;
END;
$$;

-- detect_gps_offline(): same as 081, but it only looks at / ends OFFLINE events.
CREATE OR REPLACE FUNCTION public.detect_gps_offline()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v RECORD;
  v_last TIMESTAMPTZ;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_event UUID;
BEGIN
  -- Close events whose shift has ended.
  UPDATE public.gps_offline_events e
     SET resolved_at = COALESCE(s.end_time, now())
    FROM public.shifts s
   WHERE s.id = e.shift_id
     AND e.resolved_at IS NULL
     AND (s.status <> 'active' OR s.end_time IS NOT NULL);

  FOR v IN
    SELECT s.id AS shift_id, s.driver_id, d.organization_id, s.start_time, s.start_lat, s.start_lng,
           o.gps_offline_after_minutes AS after_min,
           o.gps_offline_action AS action,
           o.gps_offline_clock_out_minutes AS out_min
      FROM public.shifts s
      JOIN public.drivers d ON d.id = s.driver_id
      JOIN public.organizations o ON o.id = d.organization_id
     WHERE s.status = 'active'
       AND s.end_time IS NULL
       AND o.is_active IS NOT FALSE
       AND o.gps_offline_detection_enabled
  LOOP
    SELECT recorded_at, latitude, longitude INTO v_last, v_lat, v_lng
      FROM public.gps_locations
     WHERE shift_id = v.shift_id
     ORDER BY recorded_at DESC
     LIMIT 1;

    IF v_last IS NULL THEN
      v_last := v.start_time;
      v_lat := v.start_lat;
      v_lng := v.start_lng;
    END IF;

    IF v_last > now() - make_interval(mins => v.after_min) THEN
      CONTINUE;
    END IF;

    SELECT id INTO v_event FROM public.gps_offline_events WHERE shift_id = v.shift_id AND resolved_at IS NULL AND kind = 'offline';
    IF v_event IS NULL THEN
      INSERT INTO public.gps_offline_events (organization_id, driver_id, shift_id, started_at, last_lat, last_lng, time_frozen, action_taken, kind)
      VALUES (
        v.organization_id, v.driver_id, v.shift_id, v_last, v_lat, v_lng,
        v.action IN ('freeze_time', 'clock_out'),
        CASE WHEN v.action = 'freeze_time' THEN 'time_frozen' ELSE 'alert' END,
        'offline'
      )
      ON CONFLICT DO NOTHING;
    END IF;

    IF v.action = 'clock_out' AND v_last <= now() - make_interval(mins => v.out_min) THEN
      UPDATE public.shifts
         SET end_time = v_last, end_lat = v_lat, end_lng = v_lng, status = 'completed'
       WHERE id = v.shift_id AND status = 'active';
      UPDATE public.gps_offline_events
         SET resolved_at = now(), action_taken = 'clocked_out', time_frozen = true
       WHERE shift_id = v.shift_id AND resolved_at IS NULL AND kind = 'offline';
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.detect_gps_offline() FROM PUBLIC, anon, authenticated;

-- detect_idle_drivers(): as before (idle alert for the office) plus, in the
-- same step, the company's idle action for the driver.
CREATE OR REPLACE FUNCTION public.detect_idle_drivers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rec RECORD;
  v_started_at TIMESTAMPTZ;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_last_ping TIMESTAMPTZ;
  v_speed NUMERIC;
  v_idle_start TIMESTAMPTZ;
BEGIN
  FOR v_rec IN
    SELECT s.id AS shift_id, s.driver_id, s.start_time, s.start_lat, s.start_lng, d.organization_id,
           COALESCE(o.idle_alert_minutes, 50) AS idle_alert_minutes,
           COALESCE(o.idle_action, 'none') AS idle_action
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

        IF COALESCE(v_started_at, v_last_ping) <= now() - (v_rec.idle_alert_minutes || ' minutes')::interval THEN
          v_idle_start := COALESCE(v_started_at, v_last_ping);

          -- Delete any old, cleared ghost alerts for this shift to prevent Unique Constraint blocks
          DELETE FROM public.idle_alerts WHERE shift_id = v_rec.shift_id;

          INSERT INTO public.idle_alerts (driver_id, shift_id, message, started_at, latitude, longitude, acknowledged, cleared, is_resolved)
          VALUES (
            v_rec.driver_id, v_rec.shift_id,
            'Idle for over ' || v_rec.idle_alert_minutes || ' minutes',
            v_idle_start,
            COALESCE(v_lat, v_rec.start_lat, 53.481798),
            COALESCE(v_lng, v_rec.start_lng, -1.086552),
            false, false, false
          );

          -- The company's idle action: one event per idle stretch. With
          -- freeze_time the whole stationary stretch is deducted from paid
          -- hours; either way the driver is told (if the company chose to).
          INSERT INTO public.gps_offline_events (organization_id, driver_id, shift_id, started_at, last_lat, last_lng, time_frozen, action_taken, kind)
          VALUES (
            v_rec.organization_id, v_rec.driver_id, v_rec.shift_id, v_idle_start, v_lat, v_lng,
            v_rec.idle_action = 'freeze_time',
            CASE WHEN v_rec.idle_action = 'freeze_time' THEN 'time_frozen' ELSE 'alert' END,
            'idle'
          )
          ON CONFLICT DO NOTHING;
        END IF;
    END IF;
  END LOOP;
END;
$function$;

-- What the driver app reads: idle policy joins the GPS policy.
CREATE OR REPLACE FUNCTION public.driver_gps_policy()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'detection_enabled', o.gps_offline_detection_enabled,
    'after_minutes', o.gps_offline_after_minutes,
    'notify_driver', o.gps_offline_notify_driver,
    'action', o.gps_offline_action,
    'clock_out_minutes', o.gps_offline_clock_out_minutes,
    'idle_enabled', COALESCE(o.idle_detection_enabled, true),
    'idle_minutes', COALESCE(o.idle_alert_minutes, 50),
    'idle_action', o.idle_action,
    'idle_notify_driver', o.idle_notify_driver
  )
  FROM public.drivers d
  JOIN public.organizations o ON o.id = d.organization_id
  WHERE d.id = auth.uid();
$function$;

-- The driver's recent events (offline AND idle) so each can be shown once.
DROP FUNCTION IF EXISTS public.my_recent_gps_offline();
CREATE OR REPLACE FUNCTION public.my_recent_gps_offline()
RETURNS TABLE(started_at timestamp with time zone, resolved_at timestamp with time zone, action_taken text, time_frozen boolean, kind text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT e.started_at, e.resolved_at, e.action_taken, e.time_frozen, e.kind
    FROM public.gps_offline_events e
   WHERE e.driver_id = auth.uid() AND e.detected_at > now() - interval '12 hours'
   ORDER BY e.detected_at DESC
   LIMIT 5;
$function$;
REVOKE ALL ON FUNCTION public.my_recent_gps_offline() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_recent_gps_offline() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
