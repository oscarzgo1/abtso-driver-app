-- 091: "Deactivate Account" actually stops a driver using the app.
--
-- Deactivating only set drivers.is_active = false. Nothing on the sign-in
-- path checked it: the driver app signs in with Supabase Auth directly, so
-- a dismissed driver kept signing in, clocking in and sending GPS, and
-- driver-activate would even accept a fresh activation code for them.
--
-- Drivers' auth user id is drivers.id, so mirror is_active onto
-- auth.users.banned_until: Supabase Auth then refuses password sign-in and
-- token refresh for a deactivated driver, and reactivating lifts the ban.

CREATE OR REPLACE FUNCTION public.sync_driver_auth_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    UPDATE auth.users
       SET banned_until = CASE WHEN NEW.is_active THEN NULL ELSE 'infinity'::timestamptz END
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_driver_auth_ban() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_driver_auth_ban ON public.drivers;
CREATE TRIGGER trg_sync_driver_auth_ban
  AFTER UPDATE OF is_active ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.sync_driver_auth_ban();

-- Bring existing deactivated drivers in line.
UPDATE auth.users u
   SET banned_until = 'infinity'::timestamptz
  FROM public.drivers d
 WHERE d.id = u.id AND d.is_active = false AND u.banned_until IS NULL;
