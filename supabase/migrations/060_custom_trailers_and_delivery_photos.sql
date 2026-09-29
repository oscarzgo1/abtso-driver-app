-- ============================================================
-- Migration 060: Custom Trailers + Delivery Photo Evidence
-- ============================================================
-- custom_trailer_number: drivers often pull a trailer that isn't in
-- the org's own fleet register (a customer's or carrier's trailer, e.g.
-- Amazon or Katem). shifts.trailer_id / walkaround_checks.trailer_id
-- stay FKs to vehicles for fleet trailers; this free-text column holds
-- the typed trailer number when it isn't one of them. At most one of
-- the two is set.
--
-- delivery_paperwork_path / delivery_evidence_path: when a driver
-- confirms delivery the app now requires two camera photos — the
-- signed paperwork and the back of the emptied trailer — stored in the
-- private delivery-photos bucket and written through the attach-load
-- Edge Function (shift_revenue still has no driver-facing RLS).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS custom_trailer_number TEXT;
ALTER TABLE public.walkaround_checks ADD COLUMN IF NOT EXISTS custom_trailer_number TEXT;

COMMENT ON COLUMN public.shifts.custom_trailer_number IS
  'Trailer number typed by the driver for a trailer not in the org''s fleet register (trailer_id is then NULL).';
COMMENT ON COLUMN public.walkaround_checks.custom_trailer_number IS
  'Trailer number typed by the driver for a trailer not in the org''s fleet register (trailer_id is then NULL).';

ALTER TABLE public.shift_revenue
  ADD COLUMN IF NOT EXISTS delivery_paperwork_path TEXT,
  ADD COLUMN IF NOT EXISTS delivery_evidence_path TEXT;

COMMENT ON COLUMN public.shift_revenue.delivery_paperwork_path IS
  'delivery-photos storage path: photo of the delivery paperwork, taken when the driver confirmed delivery.';
COMMENT ON COLUMN public.shift_revenue.delivery_evidence_path IS
  'delivery-photos storage path: photo of the back of the trailer after unloading, taken when the driver confirmed delivery.';

-- Private bucket, same "<organization_id>/<driver_id>/<file>" shape and
-- RLS pattern as walkaround-photos (migration 053).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('delivery-photos', 'delivery-photos', false, 8388608, ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "delivery_photos_driver_insert" ON storage.objects;
CREATE POLICY "delivery_photos_driver_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'delivery-photos'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "delivery_photos_org_read" ON storage.objects;
CREATE POLICY "delivery_photos_org_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'delivery-photos'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR (public.is_org_admin() AND (storage.foldername(name))[1] = public.current_org_id()::text)
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
