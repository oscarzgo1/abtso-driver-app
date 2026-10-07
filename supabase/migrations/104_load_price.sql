-- ============================================================
-- Migration 104: a price on every load
-- ============================================================
-- A load can carry its price (revenue), so revenue is tracked per load:
--   * read from the carrier file when it has a price / rate column
--     (price_source = 'file'), or
--   * typed in by the office (price_source = 'manual').
-- A manual price is never overwritten by a later file; a file only fills or
-- updates a price that was not typed in by hand.
-- carrier_loads.price is the one price of a load; dispatch_loads.price mirrors
-- it for the driver the load is assigned to, so it follows any later change.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.carrier_loads
  ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) CHECK (price IS NULL OR price >= 0),
  ADD COLUMN IF NOT EXISTS price_source TEXT CHECK (price_source IN ('file', 'manual'));

ALTER TABLE public.dispatch_loads
  ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) CHECK (price IS NULL OR price >= 0),
  ADD COLUMN IF NOT EXISTS price_source TEXT CHECK (price_source IN ('file', 'manual'));

-- Import: reads the price from each row (if the file had one).
CREATE OR REPLACE FUNCTION public.import_carrier_loads(p_rows JSONB, p_source_file TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org UUID := public.current_org_id();
  r JSONB;
  v_vrid TEXT;
  v_status TEXT;
  v_price NUMERIC;
  v_inserted INT := 0;
  v_updated INT := 0;
  v_skipped INT := 0;
  v_priced INT := 0;
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
    v_price := CASE WHEN (r->>'price') ~ '^\d+(\.\d+)?$' THEN round((r->>'price')::numeric, 2) END;
    IF v_price IS NOT NULL THEN v_priced := v_priced + 1; END IF;

    INSERT INTO public.carrier_loads (organization_id, vrid, origin, destination, booking_cutoff_at, trailer_number, carrier_name, source_file, status, price, price_source)
    VALUES (
      v_org, v_vrid,
      NULLIF(btrim(r->>'origin'), ''), NULLIF(btrim(r->>'destination'), ''),
      NULLIF(r->>'booking_cutoff_at', '')::timestamptz,
      NULLIF(upper(btrim(r->>'trailer_number')), ''),
      NULLIF(btrim(r->>'carrier_name'), ''),
      left(p_source_file, 200), v_status,
      v_price, CASE WHEN v_price IS NOT NULL THEN 'file' END
    )
    ON CONFLICT (organization_id, vrid) DO UPDATE SET
      origin = COALESCE(EXCLUDED.origin, carrier_loads.origin),
      destination = COALESCE(EXCLUDED.destination, carrier_loads.destination),
      booking_cutoff_at = COALESCE(EXCLUDED.booking_cutoff_at, carrier_loads.booking_cutoff_at),
      trailer_number = COALESCE(EXCLUDED.trailer_number, carrier_loads.trailer_number),
      carrier_name = COALESCE(EXCLUDED.carrier_name, carrier_loads.carrier_name),
      source_file = EXCLUDED.source_file,
      price = CASE WHEN carrier_loads.price_source = 'manual' THEN carrier_loads.price ELSE COALESCE(EXCLUDED.price, carrier_loads.price) END,
      price_source = CASE WHEN carrier_loads.price_source = 'manual' THEN 'manual'
                          WHEN EXCLUDED.price IS NOT NULL THEN 'file'
                          ELSE carrier_loads.price_source END,
      status = CASE WHEN carrier_loads.status IN ('assigned', 'in_progress') THEN carrier_loads.status ELSE EXCLUDED.status END,
      updated_at = now()
    RETURNING (xmax = 0) INTO v_was_insert;

    IF v_was_insert THEN v_inserted := v_inserted + 1; ELSE v_updated := v_updated + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped, 'priced', v_priced);
END;
$$;

REVOKE ALL ON FUNCTION public.import_carrier_loads(JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_carrier_loads(JSONB, TEXT) TO authenticated;

-- A newly assigned load carries the price of its pool load.
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
    NEW.price := c.price;
    NEW.price_source := c.price_source;
  END IF;
  RETURN NEW;
END;
$$;

-- A price changed on the pool load (typed in, or from a newer file) follows
-- to the driver's load.
CREATE OR REPLACE FUNCTION public.carrier_loads_sync_price()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.dispatch_loads
     SET price = NEW.price, price_source = NEW.price_source
   WHERE carrier_load_id = NEW.id
     AND (price IS DISTINCT FROM NEW.price OR price_source IS DISTINCT FROM NEW.price_source);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_carrier_loads_sync_price ON public.carrier_loads;
CREATE TRIGGER trg_carrier_loads_sync_price
  AFTER UPDATE OF price, price_source ON public.carrier_loads
  FOR EACH ROW EXECUTE FUNCTION public.carrier_loads_sync_price();

NOTIFY pgrst, 'reload schema';

COMMIT;
