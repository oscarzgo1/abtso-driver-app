-- 090: Make driver "Change PIN" work.
--
-- change_own_pin() runs with search_path = public and writes the plain PIN
-- to drivers.pin_hash; the hash_driver_pin trigger then calls pgcrypto's
-- gen_salt()/crypt(), which live in the extensions schema. The trigger has
-- no search_path of its own, so it inherited "public" and failed with
-- "function gen_salt(unknown) does not exist" — every in-app PIN change
-- errored (the activation flow only worked because it runs through an edge
-- function with the default search path). verify_driver_pin had the same
-- latent problem.

ALTER FUNCTION public.hash_driver_pin() SET search_path = public, extensions;
ALTER FUNCTION public.verify_driver_pin(text, text) SET search_path = public, extensions;
ALTER FUNCTION public.change_own_pin(text) SET search_path = public, extensions;
