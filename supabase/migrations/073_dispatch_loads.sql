-- ============================================================
-- Migration 073: Dispatch — assign a load to a driver
-- ============================================================
-- The office assigns a load (VRID, origin, destination, booking
-- cut-off, pre-assigned trailer) to a driver; the driver sees a quiet
-- banner in the app, reviews it, and accepts it (status assigned →
-- in_progress, odometer at coupling recorded), later completing it
-- (odometer at the end). Completed loads make up the driver's load
-- history.
--
-- Separate from shift_loads (063), which is the driver-attached,
-- per-shift record that carries revenue/POD: a dispatched load exists
-- BEFORE the driver is on a shift and has no revenue. Kept apart so the
-- profit ledger's readers of shift_loads don't change.
--
-- Drivers never write this table directly: accept/complete go through
-- SECURITY DEFINER functions that check the load is theirs and in the
-- right state. Org admins manage rows (RLS, own org only). Assigning is
-- part of the loads_pod plan feature, enforced at the row's own org.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.dispatch_loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  vrid TEXT NOT NULL CHECK (length(btrim(vrid)) > 0),
  origin TEXT,
  destination TEXT,
  booking_cutoff_at TIMESTAMPTZ,
  trailer_number TEXT,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'cancelled')),
  odometer_start INTEGER CHECK (odometer_start IS NULL OR odometer_start >= 0),
  odometer_end INTEGER CHECK (odometer_end IS NULL OR odometer_end >= 0),
  assigned_by TEXT,
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (odometer_end IS NULL OR odometer_start IS NULL OR odometer_end >= odometer_start)
);

CREATE INDEX IF NOT EXISTS idx_dispatch_loads_driver_status ON public.dispatch_loads(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_dispatch_loads_org_created ON public.dispatch_loads(organization_id, created_at DESC);

-- Organization always comes from the driver, never the caller.
CREATE OR REPLACE FUNCTION public.dispatch_loads_before_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM public.drivers WHERE id = NEW.driver_id;
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' AND NOT public.org_has_feature(NEW.organization_id, 'loads_pod') THEN
    RAISE EXCEPTION 'Assigning loads isn''t included in your plan.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_loads_before_write ON public.dispatch_loads;
CREATE TRIGGER trg_dispatch_loads_before_write
  BEFORE INSERT OR UPDATE ON public.dispatch_loads
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_loads_before_write();

ALTER TABLE public.dispatch_loads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dispatch_loads_org_admin_all" ON public.dispatch_loads;
CREATE POLICY "dispatch_loads_org_admin_all"
  ON public.dispatch_loads FOR ALL TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS "dispatch_loads_driver_read_own" ON public.dispatch_loads;
CREATE POLICY "dispatch_loads_driver_read_own"
  ON public.dispatch_loads FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

-- Driver accepts: assigned → in_progress, with the odometer at coupling.
CREATE OR REPLACE FUNCTION public.accept_dispatch_load(p_id UUID, p_odometer INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_odometer IS NULL OR p_odometer < 0 THEN
    RAISE EXCEPTION 'Enter the odometer reading before coupling.';
  END IF;
  UPDATE public.dispatch_loads
     SET status = 'in_progress', odometer_start = p_odometer, accepted_at = now()
   WHERE id = p_id AND driver_id = auth.uid() AND status = 'assigned';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This load is no longer waiting for you to accept it.';
  END IF;
END;
$$;

-- Driver completes: in_progress → completed, with the ending odometer.
CREATE OR REPLACE FUNCTION public.complete_dispatch_load(p_id UUID, p_odometer INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_start INTEGER;
BEGIN
  SELECT odometer_start INTO v_start FROM public.dispatch_loads
   WHERE id = p_id AND driver_id = auth.uid() AND status = 'in_progress';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This load isn''t in progress.';
  END IF;
  IF p_odometer IS NULL OR p_odometer < COALESCE(v_start, 0) THEN
    RAISE EXCEPTION 'The ending odometer can''t be lower than the starting one (%).', v_start;
  END IF;
  UPDATE public.dispatch_loads
     SET status = 'completed', odometer_end = p_odometer, completed_at = now()
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_dispatch_load(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_dispatch_load(UUID, INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.complete_dispatch_load(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_dispatch_load(UUID, INTEGER) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dispatch_loads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_loads;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
