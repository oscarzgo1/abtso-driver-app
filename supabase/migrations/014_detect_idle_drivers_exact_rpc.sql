-- ============================================================
-- ABTSO Logistics — Migration 014: Exact detect_idle_drivers RPC & idle_alerts link
-- ============================================================

ALTER TABLE public.idle_alerts ADD COLUMN IF NOT EXISTS message TEXT DEFAULT 'Idle for over 2 minutes';
ALTER TABLE public.idle_alerts ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.detect_idle_drivers()
RETURNS void AS $$
BEGIN
  -- Insert into idle_alerts ONLY IF an unresolved alert for this shift doesn't already exist
  INSERT INTO public.idle_alerts (driver_id, shift_id, message, started_at, latitude, longitude, acknowledged, cleared, is_resolved)
  SELECT 
    l.driver_id, 
    l.shift_id, 
    'Idle for over 2 minutes',
    COALESCE(l.recorded_at, NOW()),
    COALESCE(l.latitude, 53.481798),
    COALESCE(l.longitude, -1.086552),
    false,
    false,
    false
  FROM public.live_driver_locations l
  WHERE (l.speed <= 0.5 OR l.speed IS NULL)
     AND EXTRACT(EPOCH FROM (NOW() - l.recorded_at)) >= 120
     AND NOT EXISTS (
       SELECT 1 FROM public.idle_alerts a 
       WHERE a.shift_id = l.shift_id 
         AND (a.is_resolved = FALSE OR a.is_resolved IS NULL)
         AND (a.cleared = FALSE OR a.cleared IS NULL)
     );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
