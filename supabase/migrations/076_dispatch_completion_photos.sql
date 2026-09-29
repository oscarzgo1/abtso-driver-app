-- ============================================================
-- Migration 076: Photo evidence when a dispatched load is completed
-- ============================================================
-- Finishing a load now needs three live photos, stored in the existing
-- private delivery-photos bucket (060):
--   1. the trailer, empty
--   2. the delivery confirmation — the documents signed off
--   3. the trailer uncoupled, tractor leaving solo
-- complete_dispatch_load takes all three paths and refuses to complete
-- without them, so an app that skips the photos can't complete a load.
-- Paths must sit under the driver's own <org>/<driver>/ folder, the same
-- shape the bucket's upload policy already enforces.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.dispatch_loads
  ADD COLUMN IF NOT EXISTS photo_empty_trailer_path TEXT,
  ADD COLUMN IF NOT EXISTS photo_delivery_docs_path TEXT,
  ADD COLUMN IF NOT EXISTS photo_uncoupled_path TEXT;

DROP FUNCTION IF EXISTS public.complete_dispatch_load(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.complete_dispatch_load(
  p_id UUID,
  p_odometer INTEGER,
  p_empty_trailer_path TEXT,
  p_delivery_docs_path TEXT,
  p_uncoupled_path TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_start INTEGER;
  v_org UUID;
  v_prefix TEXT;
  v_path TEXT;
BEGIN
  SELECT odometer_start, organization_id INTO v_start, v_org FROM public.dispatch_loads
   WHERE id = p_id AND driver_id = auth.uid() AND status = 'in_progress';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This load isn''t in progress.';
  END IF;
  IF p_odometer IS NULL OR p_odometer < COALESCE(v_start, 0) THEN
    RAISE EXCEPTION 'The ending odometer can''t be lower than the starting one (%).', v_start;
  END IF;

  v_prefix := v_org::text || '/' || auth.uid()::text || '/';
  FOREACH v_path IN ARRAY ARRAY[p_empty_trailer_path, p_delivery_docs_path, p_uncoupled_path] LOOP
    IF v_path IS NULL OR btrim(v_path) = '' THEN
      RAISE EXCEPTION 'Take all three photos: empty trailer, signed delivery documents, and trailer uncoupled.';
    END IF;
    IF left(v_path, length(v_prefix)) <> v_prefix THEN
      RAISE EXCEPTION 'That photo doesn''t belong to you.';
    END IF;
  END LOOP;

  UPDATE public.dispatch_loads
     SET status = 'completed', odometer_end = p_odometer, completed_at = now(),
         photo_empty_trailer_path = p_empty_trailer_path,
         photo_delivery_docs_path = p_delivery_docs_path,
         photo_uncoupled_path = p_uncoupled_path
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_dispatch_load(UUID, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_dispatch_load(UUID, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
