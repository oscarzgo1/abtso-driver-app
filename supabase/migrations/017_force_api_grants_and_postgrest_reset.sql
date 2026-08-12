-- ============================================================
-- ABTSO Logistics — Migration 017: Force API Grants & PostgREST Reset
-- ============================================================

-- 1. Create/Verify Tables
CREATE TABLE IF NOT EXISTS public.employee_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE,
  rate_type TEXT,
  mon_fri_rate NUMERIC,
  sat_rate NUMERIC,
  sun_rate NUMERIC,
  agency_name TEXT
);

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

-- 2. FORCE GRANTS FOR API ACCESS (Crucial to fix 404s)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.employee_rates TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.idle_alerts TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.gps_locations TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.shifts TO anon, authenticated, service_role;

-- 3. Rebuild request_night_out RPC and GRANT EXECUTE
CREATE OR REPLACE FUNCTION public.request_night_out(p_shift_id UUID)
RETURNS void AS $$ 
BEGIN   
  UPDATE public.shifts SET night_out_status = 'pending' WHERE id = p_shift_id; 
END; 
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.request_night_out(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.detect_idle_drivers() TO anon, authenticated, service_role;

-- 4. BYPASS RLS FOR GPS UPLOADS (Testing only)
ALTER TABLE public.gps_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gps_admin_all" ON public.gps_locations;
DROP POLICY IF EXISTS "gps_driver_insert" ON public.gps_locations;
DROP POLICY IF EXISTS "allow_all_inserts_testing" ON public.gps_locations;

CREATE POLICY "allow_all_inserts_testing" ON public.gps_locations
  FOR INSERT WITH CHECK (true);

-- 5. HARD RESET POSTGREST CACHE
NOTIFY pgrst, 'reload schema';
