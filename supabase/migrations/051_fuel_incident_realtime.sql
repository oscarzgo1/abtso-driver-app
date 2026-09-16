-- ============================================================
-- Migration 051: Add fuel_receipts and incident_reports to the
-- supabase_realtime publication.
-- ============================================================
-- Real, confirmed gap found while investigating a reported admin-panel
-- sync issue: the admin dashboard already subscribes to postgres_changes
-- on fuel_receipts (App.tsx's realtime_fuel_receipts channel, added
-- when the Fuel Receipts modal was built) and would have subscribed to
-- incident_reports the same way, but NEITHER table was ever added to
-- the supabase_realtime publication itself. Postgres's logical
-- replication only emits change events for tables in that publication —
-- without this, both subscriptions were silently inert no-ops. New
-- rows still landed in the database correctly (RLS/triggers on both
-- tables were already verified correct), they just never pushed a live
-- update to an already-open admin session; only the existing 15-second
-- polling loop (or a manual reload) would eventually surface them.
--
-- shifts, idle_alerts, sos_alerts, and gps_locations were already
-- correctly in the publication (migration 032/033-era work) — this
-- migration only adds the two that were missing.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'fuel_receipts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fuel_receipts;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'incident_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.incident_reports;
  END IF;
END $$;

COMMIT;
