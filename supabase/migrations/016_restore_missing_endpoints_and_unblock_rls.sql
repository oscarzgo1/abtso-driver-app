-- ============================================================
-- ABTSO Logistics — Migration 016: Restore Endpoints & Unblock RLS
-- ============================================================

-- 1. Restore missing employee_rates table (Fixes React 404)
CREATE TABLE IF NOT EXISTS public.employee_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE,
  rate_type TEXT,
  mon_fri_rate NUMERIC,
  sat_rate NUMERIC,
  sun_rate NUMERIC,
  agency_name TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_rates TO anon, authenticated, service_role;

-- 2. Restore missing request_night_out RPC (Fixes Flutter 404)
CREATE OR REPLACE FUNCTION public.request_night_out(p_shift_id UUID)
RETURNS void AS $$ 
BEGIN   
  UPDATE public.shifts SET night_out_status = 'pending' WHERE id = p_shift_id; 
END; 
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.request_night_out(UUID) TO anon, authenticated, service_role;

-- 3. Bulletproof the idle_alerts table schema (Fixes silent RPC crashes)
CREATE TABLE IF NOT EXISTS public.idle_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES public.drivers(id),
  shift_id UUID REFERENCES public.shifts(id),
  message TEXT DEFAULT 'Idle for over 2 minutes',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  acknowledged BOOLEAN DEFAULT FALSE,
  cleared BOOLEAN DEFAULT FALSE,
  is_resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist in case the table was created but missing them
ALTER TABLE public.idle_alerts ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN DEFAULT FALSE;
ALTER TABLE public.idle_alerts ADD COLUMN IF NOT EXISTS cleared BOOLEAN DEFAULT FALSE;
ALTER TABLE public.idle_alerts ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN DEFAULT FALSE;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.idle_alerts TO anon, authenticated, service_role;

-- 4. Unblock GPS Uploads (Bypass RLS restrictions temporarily for testing)
ALTER TABLE public.gps_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gps_admin_all" ON public.gps_locations;
DROP POLICY IF EXISTS "gps_driver_insert" ON public.gps_locations;
DROP POLICY IF EXISTS "gps_driver_select" ON public.gps_locations;
DROP POLICY IF EXISTS "allow_all_inserts_testing" ON public.gps_locations;
DROP POLICY IF EXISTS "allow_all_select_testing" ON public.gps_locations;

CREATE POLICY "allow_all_inserts_testing" ON public.gps_locations
  FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_all_select_testing" ON public.gps_locations
  FOR SELECT USING (true);

-- 5. CRITICAL: Force PostgREST to rebuild its API cache
NOTIFY pgrst, 'reload schema';
