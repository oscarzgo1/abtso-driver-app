-- ============================================================
-- ABTSO Logistics — Migration 019: Fix idle_alerts Table Schema
-- ============================================================

ALTER TABLE public.idle_alerts ADD COLUMN IF NOT EXISTS message TEXT DEFAULT 'Idle for over 2 minutes';
ALTER TABLE public.idle_alerts ADD COLUMN IF NOT EXISTS cleared BOOLEAN DEFAULT FALSE;
ALTER TABLE public.idle_alerts ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN DEFAULT FALSE;
ALTER TABLE public.idle_alerts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Force PostgREST cache reload so the API recognizes the new columns
NOTIFY pgrst, 'reload schema';
