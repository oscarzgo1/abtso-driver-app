-- Follow-up to 065_driver_activation_admin_mfa_audit.sql.
--
-- Two functions were applied directly to the live database while building
-- the driver PIN self-service flow, but were never saved into a migration
-- file, so a fresh environment restored from the migrations folder alone
-- would be missing them. This file captures both, exactly as they exist
-- live (verified via pg_get_functiondef before writing this file).
--
-- verify_secret(): generic bcrypt-style comparison helper used by the
-- driver-activate Edge Function to check an activation code without
-- consuming it (the "verify" action).
--
-- change_own_pin(): lets a signed-in driver set their own PIN directly
-- (used by the driver app's "Change PIN" screen). This fixes a real bug
-- found this session: the app previously tried to UPDATE drivers.pin_hash
-- directly from the client, which RLS silently refused (drivers only have
-- a SELECT-own policy, not UPDATE-own). Writing through this
-- SECURITY DEFINER function fixes that, while the existing
-- trigger_hash_driver_pin BEFORE INSERT/UPDATE trigger (created in
-- 002_create_tables.sql) still bcrypts pin_hash on write, so no plaintext
-- PIN is ever stored.

create or replace function public.verify_secret(p_plain text, p_hash text)
returns boolean
language sql
security definer
set search_path to 'public', 'extensions'
as $$
  select extensions.crypt(p_plain, p_hash) = p_hash;
$$;

create or replace function public.change_own_pin(p_new_pin text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid;
begin
  if p_new_pin is null or p_new_pin !~ '^[0-9]{6}$' then
    raise exception 'Your PIN must be 6 digits.';
  end if;
  if public.is_pin_easy(p_new_pin) then
    raise exception 'That PIN is too easy to guess. Pick a mix of digits.';
  end if;
  select organization_id into v_org from public.drivers where id = auth.uid();
  if v_org is null then
    raise exception 'Sign in again before changing your PIN.' using errcode = '42501';
  end if;
  update public.drivers
     set pin_hash = p_new_pin, pin_status = 'set', pin_set_at = now(),
         pin_locked_until = null, pin_lock_level = 0, pin_failed_attempts = 0, pin_failed_since = null
   where id = auth.uid();
  perform public.record_audit(v_org, 'pin_changed', null, auth.uid(), null, null);
end;
$$;

grant execute on function public.verify_secret(text, text) to service_role;
grant execute on function public.change_own_pin(text) to authenticated;
