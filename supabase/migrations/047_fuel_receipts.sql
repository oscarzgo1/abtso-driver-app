-- ============================================================
-- Migration 047: Driver Fuel Receipts
-- ============================================================
-- Replaces GPS-mileage-estimated fuel cost with real, driver-submitted
-- fuel receipts (photo + liters + cost + vendor), reviewed by an org
-- admin before counting toward the Profitability ledger's Actual Fuel
-- Cost figure. Mirrors the incident_reports / defect-photos pattern
-- from migrations 040/043/044 exactly: a private Storage bucket keyed
-- by "<org_id>/<driver_id>/<file>", the same org-sync trigger, the
-- same driver-insert / org-admin-review RLS shape.
--
-- shift_id is nullable — a driver might log fuel between shifts, or a
-- receipt might arrive before the admin's shift record settles — but
-- when present it's what lets the ledger attribute "Fuel Incurred" to
-- a specific shift row. vehicle_id is nullable for the same reason
-- (a driver may not always know/select the exact unit).
--
-- status starts 'pending': an unreviewed receipt does NOT count toward
-- Actual Fuel Cost. Only 'approved' receipts feed the KPI and ledger —
-- an unverified photo isn't a confirmed cost yet.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.fuel_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  shift_id UUID REFERENCES public.shifts(id),
  vehicle_id UUID REFERENCES public.vehicles(id),
  liters NUMERIC,
  total_cost NUMERIC NOT NULL CHECK (total_cost > 0),
  vendor TEXT,
  receipt_photo_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fuel_receipts_org ON public.fuel_receipts(organization_id);
CREATE INDEX IF NOT EXISTS idx_fuel_receipts_shift ON public.fuel_receipts(shift_id);
CREATE INDEX IF NOT EXISTS idx_fuel_receipts_driver ON public.fuel_receipts(driver_id);

DROP TRIGGER IF EXISTS trg_sync_org_id_fuel_receipts ON public.fuel_receipts;
CREATE TRIGGER trg_sync_org_id_fuel_receipts
  BEFORE INSERT ON public.fuel_receipts
  FOR EACH ROW EXECUTE FUNCTION public.sync_organization_id_from_driver();

ALTER TABLE public.fuel_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fuel_receipts_driver_insert" ON public.fuel_receipts;
CREATE POLICY "fuel_receipts_driver_insert"
  ON public.fuel_receipts FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "fuel_receipts_driver_select" ON public.fuel_receipts;
CREATE POLICY "fuel_receipts_driver_select"
  ON public.fuel_receipts FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "fuel_receipts_org_admin_all" ON public.fuel_receipts;
CREATE POLICY "fuel_receipts_org_admin_all"
  ON public.fuel_receipts FOR ALL
  TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

-- ------------------------------------------------------------
-- Storage — private bucket, identical shape to defect-photos
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fuel-receipts', 'fuel-receipts', false, 8388608, ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "fuel_receipts_photos_driver_insert" ON storage.objects;
CREATE POLICY "fuel_receipts_photos_driver_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fuel-receipts'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "fuel_receipts_photos_org_read" ON storage.objects;
CREATE POLICY "fuel_receipts_photos_org_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'fuel-receipts'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR (public.is_org_admin() AND (storage.foldername(name))[1] = public.current_org_id()::text)
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
