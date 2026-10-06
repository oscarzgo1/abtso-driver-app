-- 085: Make the driver PIN lock-out actually count failures.
--
-- After a wrong PIN the driver app is signed out, so its follow-up
-- `select ... from drivers` ran as anon, RLS returned nothing, and
-- register_pin_failure (not executable by anon anyway) was never called.
-- pin_failed_attempts stayed at 0 forever: the lock-out never triggered.
--
-- driver_id is only unique per company (drivers_org_driver_id_key), so the
-- old driver_lock_state(driver_id) could also report another company's
-- driver. Both lookups are now keyed on company code (organizations.slug)
-- + driver ID, and callable before sign-in. Unknown drivers return no row,
-- so these don't reveal which IDs exist.

CREATE OR REPLACE FUNCTION public.driver_lock_state(p_company_slug text, p_driver_id text)
RETURNS TABLE(locked_until timestamptz, lock_level integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT d.pin_locked_until, d.pin_lock_level
    FROM public.drivers d
    JOIN public.organizations o ON o.id = d.organization_id
   WHERE o.slug = lower(trim(p_company_slug))
     AND upper(d.driver_id) = upper(trim(p_driver_id))
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.register_driver_login_failure(p_company_slug text, p_driver_id text)
RETURNS TABLE(locked_until timestamptz, lock_level integer, attempts_remaining integer, pin_pending boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_status text;
BEGIN
  SELECT d.id, d.pin_status INTO v_id, v_status
    FROM public.drivers d
    JOIN public.organizations o ON o.id = d.organization_id
   WHERE o.slug = lower(trim(p_company_slug))
     AND upper(d.driver_id) = upper(trim(p_driver_id))
   LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;
  IF v_status = 'pending' THEN
    RETURN QUERY SELECT NULL::timestamptz, 0, 0, true;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT r.locked_until, r.lock_level, r.attempts_remaining, false
      FROM public.register_pin_failure(v_id) r;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.driver_lock_state(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_driver_login_failure(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_lock_state(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_driver_login_failure(text, text) TO anon, authenticated, service_role;
