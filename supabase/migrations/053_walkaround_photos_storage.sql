-- ============================================================
-- Migration 053: walkaround-photos Storage bucket + RLS
-- ============================================================
-- Private bucket for walk-around check photos (Oil level, cab
-- interior, door pocket, outside views, defect images, etc. — up to
-- ~13 photo fields per check across the Safety Check and End of
-- Shift Inspection forms). Same path shape and RLS pattern as
-- defect-photos (migration 044): "<organization_id>/<driver_id>/
-- <filename>", not public.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('walkaround-photos', 'walkaround-photos', false, 8388608, ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "walkaround_photos_driver_insert" ON storage.objects;
CREATE POLICY "walkaround_photos_driver_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'walkaround-photos'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "walkaround_photos_org_read" ON storage.objects;
CREATE POLICY "walkaround_photos_org_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'walkaround-photos'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR (public.is_org_admin() AND (storage.foldername(name))[1] = public.current_org_id()::text)
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
