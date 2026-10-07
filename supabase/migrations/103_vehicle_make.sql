-- ============================================================
-- Migration 103: vehicle make (brand)
-- ============================================================
-- Shown with the tractor's picture in Live Tracking (DAF, Volvo, Scania ...).
-- Free text on purpose: the admin panel offers the common makes and "Other".
-- ============================================================
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS make TEXT;
NOTIFY pgrst, 'reload schema';
