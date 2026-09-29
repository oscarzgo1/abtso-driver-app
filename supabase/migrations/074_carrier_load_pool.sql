-- ============================================================
-- Migration 074: Load pool — loads read from the carrier file drop
-- ============================================================
-- The department drops the carrier's load file (Amazon Relay etc.) and
-- every load in it lands here as a row: waiting for delivery, or already
-- completed. Later an Amazon API feed can write the same table
-- (source = 'amazon_api') without any other change.
--
-- Dispatch (073) now only ever assigns a load FROM this pool, and only
-- one that is still 'waiting'. The pool status follows the driver's
-- progress automatically: assigned → in_progress → completed, and a
-- cancelled assignment puts the load back to 'waiting'.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.carrier_loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  vrid TEXT NOT NULL CHECK (length(btrim(vrid)) > 0),
  origin TEXT,
  destination TEXT,
  booking_cutoff_at TIMESTAMPTZ,
  trailer_number TEXT,
  carrier_name TEXT,
  source TEXT NOT NULL DEFAULT 'file' CHECK (source IN ('file', 'amazon_api')),
  source_file TEXT,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'assigned', 'in_progress', 'completed')),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, vrid)
);

CREATE INDEX IF NOT EXISTS idx_carrier_loads_org_status ON public.carrier_loads(organization_id, status);

ALTER TABLE public.carrier_loads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "carrier_loads_org_admin_all" ON public.carrier_loads;
CREATE POLICY "carrier_loads_org_admin_all"
  ON public.carrier_loads FOR ALL TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

ALTER TABLE public.dispatch_loads
  ADD COLUMN IF NOT EXISTS carrier_load_id UUID REFERENCES public.carrier_loads(id) ON DELETE SET NULL;

-- Import: one call per dropped file. A load already assigned or in
-- progress keeps its status (the file can't undo work in flight); a
-- waiting/completed one follows the file.
CREATE OR REPLACE FUNCTION public.import_carrier_loads(p_rows JSONB, p_source_file TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org UUID := public.current_org_id();
  r JSONB;
  v_vrid TEXT;
  v_status TEXT;
  v_inserted INT := 0;
  v_updated INT := 0;
  v_skipped INT := 0;
  v_was_insert BOOLEAN;
BEGIN
  IF NOT public.is_org_admin() OR v_org IS NULL THEN
    RAISE EXCEPTION 'Forbidden.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.org_has_feature(v_org, 'loads_pod') THEN
    RAISE EXCEPTION 'Load files aren''t included in your plan.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 5000 THEN
    RAISE EXCEPTION 'Send between 1 and 5000 loads at a time.';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_vrid := NULLIF(btrim(r->>'vrid'), '');
    IF v_vrid IS NULL THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    v_status := CASE WHEN r->>'status' = 'completed' THEN 'completed' ELSE 'waiting' END;

    INSERT INTO public.carrier_loads (organization_id, vrid, origin, destination, booking_cutoff_at, trailer_number, carrier_name, source_file, status)
    VALUES (
      v_org, v_vrid,
      NULLIF(btrim(r->>'origin'), ''), NULLIF(btrim(r->>'destination'), ''),
      NULLIF(r->>'booking_cutoff_at', '')::timestamptz,
      NULLIF(upper(btrim(r->>'trailer_number')), ''),
      NULLIF(btrim(r->>'carrier_name'), ''),
      left(p_source_file, 200), v_status
    )
    ON CONFLICT (organization_id, vrid) DO UPDATE SET
      origin = COALESCE(EXCLUDED.origin, carrier_loads.origin),
      destination = COALESCE(EXCLUDED.destination, carrier_loads.destination),
      booking_cutoff_at = COALESCE(EXCLUDED.booking_cutoff_at, carrier_loads.booking_cutoff_at),
      trailer_number = COALESCE(EXCLUDED.trailer_number, carrier_loads.trailer_number),
      carrier_name = COALESCE(EXCLUDED.carrier_name, carrier_loads.carrier_name),
      source_file = EXCLUDED.source_file,
      status = CASE WHEN carrier_loads.status IN ('assigned', 'in_progress') THEN carrier_loads.status ELSE EXCLUDED.status END,
      updated_at = now()
    RETURNING (xmax = 0) INTO v_was_insert;

    IF v_was_insert THEN v_inserted := v_inserted + 1; ELSE v_updated := v_updated + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.import_carrier_loads(JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_carrier_loads(JSONB, TEXT) TO authenticated;

-- Dispatch may only assign a load that is still waiting in the pool; the
-- details are copied from the pool row so the driver sees exactly what
-- the file said.
CREATE OR REPLACE FUNCTION public.dispatch_loads_before_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.carrier_loads%ROWTYPE;
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM public.drivers WHERE id = NEW.driver_id;
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    IF NOT public.org_has_feature(NEW.organization_id, 'loads_pod') THEN
      RAISE EXCEPTION 'Assigning loads isn''t included in your plan.' USING ERRCODE = '42501';
    END IF;
    IF NEW.carrier_load_id IS NULL THEN
      RAISE EXCEPTION 'Choose a load from the load list — import the carrier file first.';
    END IF;
    SELECT * INTO c FROM public.carrier_loads
     WHERE id = NEW.carrier_load_id AND organization_id = NEW.organization_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That load isn''t in your load list.';
    END IF;
    IF c.status <> 'waiting' THEN
      RAISE EXCEPTION 'Load % is not waiting for delivery (it is %).', c.vrid, c.status;
    END IF;
    NEW.vrid := c.vrid;
    NEW.origin := c.origin;
    NEW.destination := c.destination;
    NEW.booking_cutoff_at := c.booking_cutoff_at;
    NEW.trailer_number := COALESCE(NEW.trailer_number, c.trailer_number);
  END IF;
  RETURN NEW;
END;
$$;

-- The pool follows the assignment.
CREATE OR REPLACE FUNCTION public.dispatch_loads_sync_pool()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.carrier_load_id IS NOT NULL THEN
    UPDATE public.carrier_loads
       SET status = CASE NEW.status
                      WHEN 'assigned' THEN 'assigned'
                      WHEN 'in_progress' THEN 'in_progress'
                      WHEN 'completed' THEN 'completed'
                      ELSE 'waiting' END,
           updated_at = now()
     WHERE id = NEW.carrier_load_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_loads_sync_pool ON public.dispatch_loads;
CREATE TRIGGER trg_dispatch_loads_sync_pool
  AFTER INSERT OR UPDATE OF status ON public.dispatch_loads
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_loads_sync_pool();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'carrier_loads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.carrier_loads;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
