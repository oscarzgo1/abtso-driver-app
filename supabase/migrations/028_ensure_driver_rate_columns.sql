-- Migration 028: Ensure rate columns exist on public.drivers table and reload PostgREST schema cache

ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS mon_fri_rate NUMERIC(10,2);
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS saturday_rate NUMERIC(10,2);
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS sunday_rate NUMERIC(10,2);
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS fixed_rate NUMERIC(10,2);
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS rate_type TEXT DEFAULT 'Hourly';
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS agency_name TEXT DEFAULT 'Direct';

-- Reload PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
