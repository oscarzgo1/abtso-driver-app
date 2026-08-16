-- Migration 025: Add rate_type, mon_fri_rate, saturday_rate, sunday_rate, agency_name to drivers, and extras_amount, extras_note to shifts

ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS rate_type TEXT DEFAULT 'Hourly',
ADD COLUMN IF NOT EXISTS mon_fri_rate NUMERIC(10, 2) DEFAULT 16.00,
ADD COLUMN IF NOT EXISTS saturday_rate NUMERIC(10, 2) DEFAULT 17.00,
ADD COLUMN IF NOT EXISTS sunday_rate NUMERIC(10, 2) DEFAULT 18.00,
ADD COLUMN IF NOT EXISTS agency_name TEXT DEFAULT 'Direct';

ALTER TABLE public.shifts
ADD COLUMN IF NOT EXISTS extras_amount NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS extras_note TEXT;
