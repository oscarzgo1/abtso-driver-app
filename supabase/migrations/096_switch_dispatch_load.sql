-- ============================================================
-- Migration 096: assign / switch a driver's load in one step
-- ============================================================
-- Assigning a load while the driver still has an open one used to leave
-- two open loads. assign_dispatch_load() cancels whatever the driver has
-- open (assigned or in progress — the cancelled load goes back to
-- 'waiting' in the pool through the existing sync trigger) and assigns the
-- new one, all in one transaction: if the new load can't be assigned, the
-- old one stays exactly as it was.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.assign_dispatch_load(
  p_driver UUID,
  p_carrier_load_id UUID,
  p_trailer TEXT DEFAULT NULL,
  p_carrier_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'Only an administrator can assign loads.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = p_driver AND organization_id = public.current_org_id()) THEN
    RAISE EXCEPTION 'Employee not found.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.dispatch_loads
     SET status = 'cancelled'
   WHERE driver_id = p_driver
     AND status IN ('assigned', 'in_progress');

  INSERT INTO public.dispatch_loads (driver_id, carrier_load_id, trailer_number, carrier_name)
  VALUES (p_driver, p_carrier_load_id, NULLIF(btrim(p_trailer), ''), NULLIF(btrim(p_carrier_name), ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_dispatch_load(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_dispatch_load(UUID, UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
