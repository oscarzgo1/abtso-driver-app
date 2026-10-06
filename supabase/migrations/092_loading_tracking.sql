-- ============================================================
-- 092: Track loading, not just delivery.
-- A driver now marks "Start loading" and "Finished loading" on a load, so
-- the office can see whether the trailer is still being loaded, how long
-- loading took, and where the shipment is in its journey.
-- ============================================================
ALTER TABLE public.dispatch_loads
  ADD COLUMN IF NOT EXISTS loading_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loading_completed_at TIMESTAMPTZ;

ALTER TABLE public.shift_loads
  ADD COLUMN IF NOT EXISTS loading_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loading_completed_at TIMESTAMPTZ;

-- The signed-in driver records a loading event on one of their own loads.
--   p_kind  'dispatch' (office-assigned) | 'shift' (attached by the driver)
--   p_event 'started' | 'finished'
CREATE OR REPLACE FUNCTION public.record_load_loading(p_kind TEXT, p_load_id UUID, p_event TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in.';
  END IF;
  IF p_event NOT IN ('started', 'finished') THEN
    RAISE EXCEPTION 'Unknown loading event.';
  END IF;

  IF p_kind = 'dispatch' THEN
    UPDATE public.dispatch_loads
       SET loading_started_at = CASE WHEN p_event = 'started' THEN COALESCE(loading_started_at, now()) ELSE COALESCE(loading_started_at, now()) END,
           loading_completed_at = CASE WHEN p_event = 'finished' THEN COALESCE(loading_completed_at, now()) ELSE loading_completed_at END
     WHERE id = p_load_id
       AND driver_id = auth.uid()
       AND status IN ('assigned', 'in_progress');
    v_ok := FOUND;
  ELSIF p_kind = 'shift' THEN
    UPDATE public.shift_loads sl
       SET loading_started_at = COALESCE(sl.loading_started_at, now()),
           loading_completed_at = CASE WHEN p_event = 'finished' THEN COALESCE(sl.loading_completed_at, now()) ELSE sl.loading_completed_at END
      FROM public.shifts s
     WHERE sl.id = p_load_id
       AND s.id = sl.shift_id
       AND s.driver_id = auth.uid()
       AND sl.delivered_at IS NULL;
    v_ok := FOUND;
  ELSE
    RAISE EXCEPTION 'Unknown load type.';
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'That load is not open for you.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.record_load_loading(TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_load_loading(TEXT, UUID, TEXT) TO authenticated;
