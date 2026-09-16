-- ============================================================
-- Migration 044: defect-photos Storage bucket + RLS
-- ============================================================
-- Private bucket for driver-submitted defect evidence photos. Files
-- are stored at "<organization_id>/<driver_id>/<filename>" so RLS can
-- scope access by path prefix, exactly like every other org-scoped
-- table in this app. Not public — the admin panel resolves each
-- stored path to a short-lived signed URL when actually displaying
-- it (see DefectInspectionDrawer.tsx), rather than exposing photos
-- via permanent public links.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('defect-photos', 'defect-photos', false, 8388608, ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- A driver may upload only under their own org/driver-id prefix.
-- storage.objects.name for this bucket is "<org_id>/<driver_id>/<file>".
DROP POLICY IF EXISTS "defect_photos_driver_insert" ON storage.objects;
CREATE POLICY "defect_photos_driver_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'defect-photos'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Org admins (either role) can read any photo under their own org's
-- prefix; drivers can also read back their own uploads.
DROP POLICY IF EXISTS "defect_photos_org_read" ON storage.objects;
CREATE POLICY "defect_photos_org_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'defect-photos'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR (public.is_org_admin() AND (storage.foldername(name))[1] = public.current_org_id()::text)
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
