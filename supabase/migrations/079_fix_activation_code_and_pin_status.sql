-- ============================================================
-- Migration 079: Fix activation-code issuance + a stuck pending PIN
-- ============================================================
-- issue_driver_activation_code() (migration 065) calls gen_random_bytes(),
-- which lives in the `extensions` schema (Supabase's pgcrypto install
-- location), but the function's search_path was only 'public'. Every call
-- failed with "function gen_random_bytes(integer) does not exist" —
-- breaking both "create employee" (the first activation code) and
-- "Reset PIN" (same RPC, reason='reset_admin'/'reset_driver'), and by
-- extension a driver's own "Forgot PIN" request, which an admin resolves
-- through the same Reset PIN action.
--
-- That failure is very likely why an admin resorted to the Edit Employee
-- form's direct "New PIN" field instead — which had its own bug (fixed in
-- the admin dashboard the same day): it hashed the PIN correctly but never
-- set pin_status to 'set', so the driver stayed permanently locked out
-- with "Your PIN hasn't been set up yet" no matter how correct the PIN
-- was. This migration repairs any driver caught in that state too.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.issue_driver_activation_code(p_driver_id UUID, p_reason TEXT DEFAULT 'created')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_alphabet TEXT := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_body TEXT := '';
  v_code TEXT;
  v_org UUID;
  i INT;
BEGIN
  IF NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'Only admins can issue activation codes.' USING ERRCODE = '42501';
  END IF;
  IF p_reason NOT IN ('created', 'reset_admin', 'reset_driver') THEN
    RAISE EXCEPTION 'Unknown reason.';
  END IF;

  SELECT organization_id INTO v_org FROM public.drivers WHERE id = p_driver_id;
  IF v_org IS NULL OR v_org <> public.current_org_id() THEN
    RAISE EXCEPTION 'Driver not found.';
  END IF;

  FOR i IN 1..5 LOOP
    v_body := v_body || substr(v_alphabet, (get_byte(gen_random_bytes(1), 0) % length(v_alphabet)) + 1, 1);
  END LOOP;
  v_code := 'TCH-' || v_body;

  UPDATE public.driver_activation_codes SET cancelled_at = now()
   WHERE driver_id = p_driver_id AND consumed_at IS NULL AND cancelled_at IS NULL;

  INSERT INTO public.driver_activation_codes (driver_id, code_hash, code_prefix, reason, issued_by)
  VALUES (p_driver_id, public.hash_secret(v_code), substr(v_code, 1, 4), p_reason, auth.email());

  UPDATE public.drivers SET pin_status = 'pending' WHERE id = p_driver_id;

  -- Close any open PIN-reset request; the admin is now handling it.
  UPDATE public.driver_pin_reset_requests
     SET handled_at = now(), handled_by = auth.email()
   WHERE driver_id = p_driver_id AND handled_at IS NULL;

  PERFORM public.record_audit(v_org, 'activation_code_issued', auth.email(), p_driver_id, NULL,
    jsonb_build_object('reason', p_reason));

  RETURN v_code;
END;
$$;

-- One-time repair: any driver with a real bcrypt hash already in pin_hash
-- (an admin set a PIN through the old Edit Employee form's direct write)
-- but stuck on pin_status='pending' from creation — driver-login refuses
-- login outright while pending, regardless of whether the PIN is correct.
UPDATE public.drivers
   SET pin_status = 'set', pin_set_at = COALESCE(pin_set_at, now())
 WHERE pin_status = 'pending' AND pin_hash IS NOT NULL AND pin_hash <> '';

COMMIT;
