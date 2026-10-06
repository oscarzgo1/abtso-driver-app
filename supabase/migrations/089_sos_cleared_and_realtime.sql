-- 089: Make "Dismiss" stick for SOS alerts, and stream parking claims live.
--
-- The dashboard's Dismiss button writes cleared = true, but sos_alerts had
-- no cleared column, so the update failed (PGRST204) and a dismissed SOS
-- came back on every reload / for every other dispatcher. idle_alerts
-- already has the column.
--
-- parking_expenses (and sos_alerts) were missing from the supabase_realtime
-- publication, so a driver's new parking claim only appeared in the Alert
-- Panel after a page reload even though the dashboard subscribes to it.

ALTER TABLE public.sos_alerts ADD COLUMN IF NOT EXISTS cleared boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'parking_expenses') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.parking_expenses;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sos_alerts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_alerts;
  END IF;
END $$;
