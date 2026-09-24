-- ============================================================
-- Migration 054: Overnight Parking Expenses
-- ============================================================
-- Driver-submitted, admin-approved overnight parking expense claims
-- (photo of the receipt + amount + where), mirroring the
-- fuel_receipts pattern (migration 047) almost exactly: private
-- Storage bucket keyed by "<org_id>/<driver_id>/<file>", same
-- org-sync trigger, same driver-insert / org-admin-review RLS shape.
--
-- The one real difference from fuel receipts: this money is owed
-- BACK to the driver, not a company cost to track — so approving a
-- claim (in the admin panel) also adds its amount onto the linked
-- shift's existing extras_amount/extras_note, which is already the
-- live "extra pay on top of the base rate" bucket getShiftFinancials()
-- folds into gross pay. No new payroll-calculation path needed; this
-- reuses the one that's already there and already trusted.
--
-- shift_id is nullable (a driver might log this before the admin's
-- shift record settles, or without an active shift open), but an
-- admin can't actually approve a claim into payroll until it's tied
-- to a real shift — the admin panel enforces that, not this migration.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.parking_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  shift_id UUID REFERENCES public.shifts(id),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  location TEXT,
  parking_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_photo_path TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_parking_expenses_org ON public.parking_expenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_parking_expenses_driver ON public.parking_expenses(driver_id);
CREATE INDEX IF NOT EXISTS idx_parking_expenses_shift ON public.parking_expenses(shift_id);

DROP TRIGGER IF EXISTS trg_sync_org_id_parking_expenses ON public.parking_expenses;
CREATE TRIGGER trg_sync_org_id_parking_expenses
  BEFORE INSERT ON public.parking_expenses
  FOR EACH ROW EXECUTE FUNCTION public.sync_organization_id_from_driver();

ALTER TABLE public.parking_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parking_expenses_driver_insert" ON public.parking_expenses;
CREATE POLICY "parking_expenses_driver_insert"
  ON public.parking_expenses FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "parking_expenses_driver_select" ON public.parking_expenses;
CREATE POLICY "parking_expenses_driver_select"
  ON public.parking_expenses FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "parking_expenses_org_admin_all" ON public.parking_expenses;
CREATE POLICY "parking_expenses_org_admin_all"
  ON public.parking_expenses FOR ALL
  TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

-- ------------------------------------------------------------
-- Storage — private bucket, identical shape to fuel-receipts
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('parking-receipts', 'parking-receipts', false, 8388608, ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "parking_receipts_driver_insert" ON storage.objects;
CREATE POLICY "parking_receipts_driver_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'parking-receipts'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "parking_receipts_org_read" ON storage.objects;
CREATE POLICY "parking_receipts_org_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'parking-receipts'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR (public.is_org_admin() AND (storage.foldername(name))[1] = public.current_org_id()::text)
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
