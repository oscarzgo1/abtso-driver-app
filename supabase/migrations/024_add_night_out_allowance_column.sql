-- ============================================================
-- ABTSO Logistics — Migration 024: Add night_out_allowance column
-- ============================================================
-- Adds night_out_allowance numeric column to public.shifts table
-- and reloads PostgREST schema cache.
-- ============================================================

ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS night_out_allowance NUMERIC(10, 2);

-- Force Schema Cache Reload
NOTIFY pgrst, 'reload schema';
