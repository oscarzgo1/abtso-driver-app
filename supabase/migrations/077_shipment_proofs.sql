-- ============================================================
-- Migration 077: Proof of delivery (shipment_proofs) + cargo evidence
-- ============================================================
-- One flow for BOTH kinds of load — office-assigned (dispatch_loads, 073)
-- and manually attached by the driver (shift_loads, 063):
--
--   Load start / coupling: an optional cargo photo, OR the driver ticks
--   "Trailer sealed" when a photo isn't possible (seal applied).
--   Load complete: at least ONE proof photo, each tagged with a type:
--     solo_departure — tractor leaving alone / bobtail (e.g. a Drop & Hook yard exit)
--     empty_trailer  — the empty trailer interior (clean bed)
--     paper_pod      — the paper POD / CMR stamped
--   Every photo is a shipment_proofs row: type, storage path, when it was
--   taken and the device GPS at that moment, for the admin's POD inspector.
--
-- Photos live in the existing private delivery-photos bucket (060).
-- Drivers never write shipment_proofs directly: the SECURITY DEFINER
-- functions below (and the attach-load Edge Function, service role)
-- validate ownership and the "at least one" rule.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.shipment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  dispatch_load_id UUID REFERENCES public.dispatch_loads(id) ON DELETE CASCADE,
  shift_load_id UUID REFERENCES public.shift_loads(id) ON DELETE CASCADE,
  pod_type TEXT NOT NULL CHECK (pod_type IN ('solo_departure', 'empty_trailer', 'paper_pod')),
  photo_path TEXT NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(dispatch_load_id, shift_load_id) = 1)
);

CREATE INDEX IF NOT EXISTS idx_shipment_proofs_dispatch ON public.shipment_proofs(dispatch_load_id);
CREATE INDEX IF NOT EXISTS idx_shipment_proofs_shift_load ON public.shipment_proofs(shift_load_id);
CREATE INDEX IF NOT EXISTS idx_shipment_proofs_org ON public.shipment_proofs(organization_id, created_at DESC);

ALTER TABLE public.shipment_proofs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shipment_proofs_org_admin_read" ON public.shipment_proofs;
CREATE POLICY "shipment_proofs_org_admin_read"
  ON public.shipment_proofs FOR SELECT TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS "shipment_proofs_driver_read_own" ON public.shipment_proofs;
CREATE POLICY "shipment_proofs_driver_read_own"
  ON public.shipment_proofs FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

-- Start evidence and delivery notes on both load kinds.
ALTER TABLE public.dispatch_loads
  ADD COLUMN IF NOT EXISTS cargo_photo_path TEXT,
  ADD COLUMN IF NOT EXISTS trailer_sealed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_notes TEXT;

ALTER TABLE public.shift_loads
  ADD COLUMN IF NOT EXISTS cargo_photo_path TEXT,
  ADD COLUMN IF NOT EXISTS trailer_sealed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_notes TEXT;

-- Existing completed loads keep their photos: fold the old fixed slots
-- into proof rows (empty trailer / paper POD / solo departure).
INSERT INTO public.shipment_proofs (organization_id, driver_id, dispatch_load_id, pod_type, photo_path, taken_at)
SELECT d.organization_id, d.driver_id, d.id, v.pod_type, v.path, COALESCE(d.completed_at, d.updated_at)
FROM public.dispatch_loads d
CROSS JOIN LATERAL (VALUES
  ('empty_trailer', d.photo_empty_trailer_path),
  ('paper_pod', d.photo_delivery_docs_path),
  ('solo_departure', d.photo_uncoupled_path)
) AS v(pod_type, path)
WHERE v.path IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.shipment_proofs p WHERE p.dispatch_load_id = d.id);

INSERT INTO public.shipment_proofs (organization_id, driver_id, shift_load_id, pod_type, photo_path, taken_at)
SELECT s.organization_id, s.driver_id, l.id, v.pod_type, v.path, COALESCE(l.delivered_at, l.updated_at)
FROM public.shift_loads l
JOIN public.shifts s ON s.id = l.shift_id
CROSS JOIN LATERAL (VALUES
  ('paper_pod', l.delivery_paperwork_path),
  ('empty_trailer', l.delivery_evidence_path)
) AS v(pod_type, path)
WHERE v.path IS NOT NULL AND s.organization_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.shipment_proofs p WHERE p.shift_load_id = l.id);

-- Validates + inserts a batch of proofs for one load. Shared by the
-- dispatch completion function below.
CREATE OR REPLACE FUNCTION public.record_dispatch_proofs(p_load UUID, p_org UUID, p_driver UUID, p_proofs JSONB)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r JSONB;
  v_prefix TEXT := p_org::text || '/' || p_driver::text || '/';
  v_type TEXT;
  v_path TEXT;
  v_count INTEGER := 0;
BEGIN
  IF p_proofs IS NULL OR jsonb_typeof(p_proofs) <> 'array' OR jsonb_array_length(p_proofs) < 1 THEN
    RAISE EXCEPTION 'Take at least one proof photo before completing the load.';
  END IF;
  IF jsonb_array_length(p_proofs) > 12 THEN
    RAISE EXCEPTION 'Too many photos.';
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_proofs) LOOP
    v_type := r->>'pod_type';
    v_path := r->>'path';
    IF v_type NOT IN ('solo_departure', 'empty_trailer', 'paper_pod') THEN
      RAISE EXCEPTION 'Unknown proof type.';
    END IF;
    IF v_path IS NULL OR left(v_path, length(v_prefix)) <> v_prefix THEN
      RAISE EXCEPTION 'That photo doesn''t belong to you.';
    END IF;
    INSERT INTO public.shipment_proofs (organization_id, driver_id, dispatch_load_id, pod_type, photo_path, taken_at, gps_lat, gps_lng)
    VALUES (
      p_org, p_driver, p_load, v_type, v_path,
      COALESCE(NULLIF(r->>'taken_at', '')::timestamptz, now()),
      NULLIF(r->>'lat', '')::double precision,
      NULLIF(r->>'lng', '')::double precision
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.record_dispatch_proofs(UUID, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- Accept & couple: odometer, plus the optional cargo photo / sealed tick.
DROP FUNCTION IF EXISTS public.accept_dispatch_load(UUID, INTEGER);
CREATE OR REPLACE FUNCTION public.accept_dispatch_load(
  p_id UUID,
  p_odometer INTEGER,
  p_cargo_photo_path TEXT DEFAULT NULL,
  p_trailer_sealed BOOLEAN DEFAULT false
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_org UUID;
BEGIN
  IF p_odometer IS NULL OR p_odometer < 0 THEN
    RAISE EXCEPTION 'Enter the odometer reading before coupling.';
  END IF;
  SELECT organization_id INTO v_org FROM public.dispatch_loads WHERE id = p_id AND driver_id = auth.uid();
  IF p_cargo_photo_path IS NOT NULL AND left(p_cargo_photo_path, length(v_org::text || '/' || auth.uid()::text || '/')) <> v_org::text || '/' || auth.uid()::text || '/' THEN
    RAISE EXCEPTION 'That photo doesn''t belong to you.';
  END IF;
  UPDATE public.dispatch_loads
     SET status = 'in_progress', odometer_start = p_odometer, accepted_at = now(),
         cargo_photo_path = p_cargo_photo_path, trailer_sealed = COALESCE(p_trailer_sealed, false)
   WHERE id = p_id AND driver_id = auth.uid() AND status = 'assigned';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This load is no longer waiting for you to accept it.';
  END IF;
END;
$$;

-- Complete: odometer, notes, and 1+ typed proof photos.
DROP FUNCTION IF EXISTS public.complete_dispatch_load(UUID, INTEGER, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.complete_dispatch_load(
  p_id UUID,
  p_odometer INTEGER,
  p_proofs JSONB,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_start INTEGER;
  v_org UUID;
BEGIN
  SELECT odometer_start, organization_id INTO v_start, v_org FROM public.dispatch_loads
   WHERE id = p_id AND driver_id = auth.uid() AND status = 'in_progress';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This load isn''t in progress.';
  END IF;
  IF p_odometer IS NULL OR p_odometer < COALESCE(v_start, 0) THEN
    RAISE EXCEPTION 'The ending odometer can''t be lower than the starting one (%).', v_start;
  END IF;

  PERFORM public.record_dispatch_proofs(p_id, v_org, auth.uid(), p_proofs);

  UPDATE public.dispatch_loads
     SET status = 'completed', odometer_end = p_odometer, completed_at = now(),
         delivery_notes = NULLIF(btrim(left(COALESCE(p_notes, ''), 1000)), '')
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_dispatch_load(UUID, INTEGER, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_dispatch_load(UUID, INTEGER, TEXT, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.complete_dispatch_load(UUID, INTEGER, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_dispatch_load(UUID, INTEGER, JSONB, TEXT) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shipment_proofs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shipment_proofs;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
