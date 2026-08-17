-- Migration 029: Ensure extras columns exist on public.shifts table and reload PostgREST schema cache

ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS extras_amount NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS extras_note TEXT;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS total_pay NUMERIC(10,2);
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS night_out_amount NUMERIC(10,2);

-- Reload PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
