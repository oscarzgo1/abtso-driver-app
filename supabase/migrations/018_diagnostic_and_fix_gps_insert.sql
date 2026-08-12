-- ============================================================
-- ABTSO Logistics — Migration 018: GPS Insert Diagnostic & Fix
-- ============================================================
-- Run this in Supabase SQL Editor.
-- ============================================================

-- STEP 1: Show current RLS policies on gps_locations
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'gps_locations'
ORDER BY policyname;

-- STEP 2: Show latest GPS records (last 5)
SELECT id, driver_id, shift_id, latitude, longitude, speed, accuracy, recorded_at
FROM public.gps_locations
ORDER BY recorded_at DESC
LIMIT 5;

-- STEP 3: Show all currently active shifts with driver info
SELECT 
  s.id as shift_id,
  s.driver_id,
  d.full_name,
  d.driver_id as emp_code,
  s.start_time,
  s.status,
  NOW() - s.start_time as shift_duration
FROM public.shifts s
JOIN public.drivers d ON d.id = s.driver_id
WHERE s.status = 'active';

-- STEP 4: Drop ALL existing GPS policies and rebuild them cleanly
ALTER TABLE public.gps_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gps_admin_all" ON public.gps_locations;
DROP POLICY IF EXISTS "gps_driver_insert" ON public.gps_locations;
DROP POLICY IF EXISTS "gps_driver_select" ON public.gps_locations;
DROP POLICY IF EXISTS "allow_all_inserts_testing" ON public.gps_locations;
DROP POLICY IF EXISTS "gps_insert_authenticated" ON public.gps_locations;
DROP POLICY IF EXISTS "gps_insert_anon" ON public.gps_locations;
DROP POLICY IF EXISTS "gps_select_authenticated" ON public.gps_locations;

-- Allow ANY authenticated user (drivers) to insert GPS pings
CREATE POLICY "gps_insert_authenticated"
  ON public.gps_locations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow anonymous inserts (web/testing)
CREATE POLICY "gps_insert_anon"
  ON public.gps_locations FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow all authenticated users to read GPS data
CREATE POLICY "gps_select_authenticated"
  ON public.gps_locations FOR SELECT
  TO authenticated
  USING (true);

-- STEP 5: Ensure grants
GRANT ALL PRIVILEGES ON TABLE public.gps_locations TO anon, authenticated, service_role;

-- STEP 6: Force PostgREST cache reload
NOTIFY pgrst, 'reload schema';

-- STEP 7: Verify final state
SELECT policyname, roles, cmd
FROM pg_policies
WHERE tablename = 'gps_locations'
ORDER BY policyname;
