-- ============================================================
-- Migration 063: Multi-load shifts, roadworthiness sign-offs,
-- odometer mileage, report sharing
-- ============================================================
-- 1. vehicles.mot_due_date / tax_due_date / insurance_expiry_date —
--    what a unit or trailer needs to be legal on the road.
-- 2. shift_loads — one row per load. A shift can carry many loads, each
--    with its own customer, rate, booked delivery time, delivery time and
--    POD photos. shift_revenue (one row per shift) stays as the per-shift
--    roll-up every existing screen reads, maintained by trigger:
--      revenue_amount = sum of load rates once every load is rated, NULL
--      while any is unrated; if no load carries a rate at all, an existing
--      shift-level figure is kept (rates entered before this migration).
--    Existing shift_revenue rows are copied in as one load each.
-- 3. vehicle_risk_acknowledgements — a driver taking a unit/trailer with
--    expired MOT/tax/insurance/inspection or marked VOR signs on screen
--    that they accept responsibility. Surfaced in the Alert Panel.
-- 4. shift_odometer_miles() — miles per shift from the start- and
--    end-of-shift walk-around odometer readings.
-- 5. analytics_share_links — read-only report snapshots for partners.
-- 6. Weekly email report settings.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 1 ─────────────────────────────────────────────────────────
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS mot_due_date DATE,
  ADD COLUMN IF NOT EXISTS tax_due_date DATE,
  ADD COLUMN IF NOT EXISTS insurance_expiry_date DATE;

-- 2 ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shift_loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id),
  load_reference TEXT,
  carrier_name TEXT,
  revenue_amount NUMERIC(12, 2) CHECK (revenue_amount IS NULL OR revenue_amount >= 0),
  booked_delivery_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  delivery_paperwork_path TEXT,
  delivery_evidence_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_loads_shift ON public.shift_loads(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_loads_org ON public.shift_loads(organization_id);

CREATE OR REPLACE FUNCTION public.shift_loads_set_org()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM public.shifts WHERE id = NEW.shift_id;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_loads_set_org ON public.shift_loads;
CREATE TRIGGER trg_shift_loads_set_org
  BEFORE INSERT OR UPDATE ON public.shift_loads
  FOR EACH ROW EXECUTE FUNCTION public.shift_loads_set_org();

CREATE OR REPLACE FUNCTION public.sync_shift_revenue_from_loads(p_shift_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_count INT;
  v_rated INT;
  v_sum NUMERIC;
  v_refs TEXT;
  v_carriers TEXT;
  v_undelivered INT;
  v_last_delivered TIMESTAMPTZ;
  v_paper TEXT;
  v_evidence TEXT;
  v_existing NUMERIC;
BEGIN
  SELECT count(*), count(revenue_amount), sum(revenue_amount),
         string_agg(load_reference, ', ' ORDER BY created_at) FILTER (WHERE load_reference IS NOT NULL),
         string_agg(DISTINCT carrier_name, ', ') FILTER (WHERE carrier_name IS NOT NULL),
         count(*) FILTER (WHERE delivered_at IS NULL),
         max(delivered_at)
    INTO v_count, v_rated, v_sum, v_refs, v_carriers, v_undelivered, v_last_delivered
    FROM public.shift_loads WHERE shift_id = p_shift_id;

  IF v_count = 0 THEN
    RETURN;
  END IF;

  SELECT delivery_paperwork_path, delivery_evidence_path INTO v_paper, v_evidence
    FROM public.shift_loads
   WHERE shift_id = p_shift_id AND delivered_at IS NOT NULL
   ORDER BY delivered_at DESC LIMIT 1;

  SELECT revenue_amount INTO v_existing FROM public.shift_revenue WHERE shift_id = p_shift_id;

  INSERT INTO public.shift_revenue (shift_id, revenue_amount, load_reference, carrier_name, delivered_at, delivery_paperwork_path, delivery_evidence_path)
  VALUES (
    p_shift_id,
    CASE WHEN v_rated = 0 THEN v_existing WHEN v_rated = v_count THEN v_sum ELSE NULL END,
    v_refs, v_carriers,
    CASE WHEN v_undelivered = 0 THEN v_last_delivered ELSE NULL END,
    v_paper, v_evidence
  )
  ON CONFLICT (shift_id) DO UPDATE SET
    revenue_amount = EXCLUDED.revenue_amount,
    load_reference = EXCLUDED.load_reference,
    carrier_name = EXCLUDED.carrier_name,
    delivered_at = EXCLUDED.delivered_at,
    delivery_paperwork_path = EXCLUDED.delivery_paperwork_path,
    delivery_evidence_path = EXCLUDED.delivery_evidence_path;
END;
$$;

CREATE OR REPLACE FUNCTION public.shift_loads_after_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.sync_shift_revenue_from_loads(COALESCE(NEW.shift_id, OLD.shift_id));
  IF TG_OP = 'UPDATE' AND NEW.shift_id <> OLD.shift_id THEN
    PERFORM public.sync_shift_revenue_from_loads(OLD.shift_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_loads_sync ON public.shift_loads;
CREATE TRIGGER trg_shift_loads_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.shift_loads
  FOR EACH ROW EXECUTE FUNCTION public.shift_loads_after_change();

-- Backfill: every existing per-shift load becomes one shift_loads row.
INSERT INTO public.shift_loads (shift_id, load_reference, carrier_name, revenue_amount, delivered_at, delivery_paperwork_path, delivery_evidence_path, created_at)
SELECT sr.shift_id, sr.load_reference, sr.carrier_name, sr.revenue_amount, sr.delivered_at, sr.delivery_paperwork_path, sr.delivery_evidence_path, COALESCE(sr.updated_at, now())
  FROM public.shift_revenue sr
 WHERE (sr.load_reference IS NOT NULL OR sr.revenue_amount IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM public.shift_loads sl WHERE sl.shift_id = sr.shift_id);

ALTER TABLE public.shift_loads ENABLE ROW LEVEL SECURITY;

-- Same wall as shift_revenue: admins only. Drivers reach loads only via
-- the attach-load Edge Function, which never returns revenue.
DROP POLICY IF EXISTS "shift_loads_org_admin_all" ON public.shift_loads;
CREATE POLICY "shift_loads_org_admin_all"
  ON public.shift_loads FOR ALL
  TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

-- 3 ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_risk_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  issues TEXT[] NOT NULL,
  context TEXT NOT NULL DEFAULT 'coupling',
  signer_name TEXT NOT NULL,
  signature_svg TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_vehicle_risk_ack_org ON public.vehicle_risk_acknowledgements(organization_id, acknowledged_at DESC);

DROP TRIGGER IF EXISTS trg_sync_org_id_vehicle_risk_ack ON public.vehicle_risk_acknowledgements;
CREATE TRIGGER trg_sync_org_id_vehicle_risk_ack
  BEFORE INSERT ON public.vehicle_risk_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.sync_organization_id_from_driver();

ALTER TABLE public.vehicle_risk_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicle_risk_ack_driver_insert" ON public.vehicle_risk_acknowledgements;
CREATE POLICY "vehicle_risk_ack_driver_insert"
  ON public.vehicle_risk_acknowledgements FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = auth.uid() AND reviewed_at IS NULL);

DROP POLICY IF EXISTS "vehicle_risk_ack_driver_read" ON public.vehicle_risk_acknowledgements;
CREATE POLICY "vehicle_risk_ack_driver_read"
  ON public.vehicle_risk_acknowledgements FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "vehicle_risk_ack_admin_all" ON public.vehicle_risk_acknowledgements;
CREATE POLICY "vehicle_risk_ack_admin_all"
  ON public.vehicle_risk_acknowledgements FOR ALL
  TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

-- 4 ─────────────────────────────────────────────────────────
-- Odometer value from a check's items array (key 'odometer').
CREATE OR REPLACE FUNCTION public.shift_odometer_miles(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (shift_id UUID, start_odometer NUMERIC, end_odometer NUMERIC, miles NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH readings AS (
    SELECT w.shift_id, w.check_type,
           (SELECT NULLIF(regexp_replace(item->>'value', '[^0-9.]', '', 'g'), '')::NUMERIC
              FROM jsonb_array_elements(w.items) item
             WHERE item->>'key' = 'odometer' LIMIT 1) AS odo,
           w.completed_at
      FROM public.walkaround_checks w
      JOIN public.shifts s ON s.id = w.shift_id
     WHERE public.is_org_admin()
       AND s.organization_id = public.current_org_id()
       AND s.start_time >= p_from AND s.start_time < p_to
       AND w.completed_at IS NOT NULL
  ), per_shift AS (
    SELECT r.shift_id,
           max(r.odo) FILTER (WHERE r.check_type = 'start_of_shift') AS start_odometer,
           max(r.odo) FILTER (WHERE r.check_type = 'end_of_shift') AS end_odometer
      FROM readings r GROUP BY r.shift_id
  )
  SELECT ps.shift_id, ps.start_odometer, ps.end_odometer,
         CASE WHEN ps.end_odometer - ps.start_odometer BETWEEN 0 AND 1500
              THEN ps.end_odometer - ps.start_odometer END
    FROM per_shift ps
   WHERE ps.start_odometer IS NOT NULL OR ps.end_odometer IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.shift_odometer_miles(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shift_odometer_miles(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- 5 ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analytics_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  label TEXT NOT NULL,
  report JSONB NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

ALTER TABLE public.analytics_share_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_share_links_payroll_admin_all" ON public.analytics_share_links;
CREATE POLICY "analytics_share_links_payroll_admin_all"
  ON public.analytics_share_links FOR ALL
  TO authenticated
  USING (public.is_org_payroll_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_payroll_admin() AND organization_id = public.current_org_id());

-- 6 ─────────────────────────────────────────────────────────
ALTER TABLE public.org_analytics_settings
  ADD COLUMN IF NOT EXISTS weekly_report_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weekly_report_emails TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'vehicle_risk_acknowledgements') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicle_risk_acknowledgements;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
