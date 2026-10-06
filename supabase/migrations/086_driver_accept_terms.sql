-- 086: Record driver terms acceptance.
--
-- The driver app ticks "I accept the Terms & Conditions and Privacy Policy"
-- and then updated drivers.terms_accepted directly — but drivers have no
-- UPDATE policy on their own row (only drivers_read_own / org-admin), so
-- the update silently matched nothing and terms_accepted stayed NULL for
-- every driver. This SECURITY DEFINER function lets a signed-in driver set
-- the flag on their own row only, and stamps when it happened.

ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

CREATE OR REPLACE FUNCTION public.accept_driver_terms()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.drivers
     SET terms_accepted = true,
         terms_accepted_at = coalesce(terms_accepted_at, now())
   WHERE id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.accept_driver_terms() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_driver_terms() TO authenticated, service_role;
