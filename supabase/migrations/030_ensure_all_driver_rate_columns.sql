-- Migration 030: Ensure all driver rate columns exist and force PostgREST schema cache reload
-- This resolves "Could not find the 'mon_fri_rate' column of 'drivers' in the schema cache" errors

ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS mon_fri_rate   NUMERIC(10,2) DEFAULT 16.00;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS saturday_rate  NUMERIC(10,2) DEFAULT 17.00;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS sunday_rate    NUMERIC(10,2) DEFAULT 18.00;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS fixed_rate     NUMERIC(10,2);
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS rate_type      TEXT          DEFAULT 'Hourly';
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS agency_name    TEXT          DEFAULT 'Direct';
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS hourly_rate    NUMERIC(10,2) DEFAULT 16.00;

-- Backfill hourly_rate from mon_fri_rate where it is null
UPDATE public.drivers SET hourly_rate = mon_fri_rate WHERE hourly_rate IS NULL AND mon_fri_rate IS NOT NULL;

-- Force PostgREST to reload schema cache immediately
NOTIFY pgrst, 'reload schema';
