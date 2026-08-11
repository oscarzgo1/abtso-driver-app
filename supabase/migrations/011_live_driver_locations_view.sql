-- ============================================================
-- ABTSO Logistics — Migration 011: Live Driver Locations View
-- ============================================================

CREATE OR REPLACE VIEW public.live_driver_locations AS
SELECT DISTINCT ON (l.driver_id)
  l.driver_id,
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

-- Grant permissions to public/anon/authenticated roles
GRANT SELECT ON public.live_driver_locations TO anon, authenticated, service_role;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
