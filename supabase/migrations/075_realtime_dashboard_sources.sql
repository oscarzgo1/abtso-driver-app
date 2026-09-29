-- The admin dashboard, live board and tables are built from these tables;
-- publishing them lets a change made anywhere (a load attached or
-- delivered, an employee or vehicle edited, a depot moved) reach every
-- open admin panel instantly. Row Level Security still decides which rows
-- each viewer is sent, so this exposes nothing new.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['shift_loads', 'shift_revenue', 'drivers', 'vehicles', 'depots'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t)
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
