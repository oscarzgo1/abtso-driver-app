-- ============================================================
-- ABTSO Logistics — Reset Operational Test Data Script
-- ============================================================
-- Run this in Supabase SQL Editor to wipe all test telemetry, 
-- shifts, and alerts, bringing the database to a fresh state.
-- 
-- PRESERVED TABLES (NOT TOUCHED):
--   - drivers
--   - depots
--   - employee_rates
--   - admin_users
--   - rate_configurations
-- ============================================================

-- 1. Truncate test telemetry, alerts, and shift records
TRUNCATE TABLE public.gps_locations CASCADE;
TRUNCATE TABLE public.idle_alerts CASCADE;
TRUNCATE TABLE public.sos_alerts CASCADE;
TRUNCATE TABLE public.shifts CASCADE;

-- 2. Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

-- 3. Verify clean state
SELECT 'gps_locations' as table_name, count(*) as record_count FROM public.gps_locations
UNION ALL
SELECT 'idle_alerts', count(*) FROM public.idle_alerts
UNION ALL
SELECT 'sos_alerts', count(*) FROM public.sos_alerts
UNION ALL
SELECT 'shifts', count(*) FROM public.shifts;
