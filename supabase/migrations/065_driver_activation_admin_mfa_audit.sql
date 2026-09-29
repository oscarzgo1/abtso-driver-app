-- ============================================================
-- Migration 065: Driver activation codes, PIN safety, security log,
--                load booking times
-- ============================================================
-- Admins can no longer set a driver's PIN. When an admin adds a driver
-- or resets one, an activation code (TCH-XXXXX) is issued and shown
-- once; the driver enters it in the app and chooses their own 6-digit
-- PIN. Codes expire after 48 h and each is single-use.
--
-- Wrong-PIN lock-out: 15 free tries per rolling day, then 1 min, then
-- 5 min, then 15 min; a successful login clears the counter but keeps
-- the current lock level so someone slowly cycling wrong PINs still
-- hits the wall.
--
-- Easy PINs (all one digit, straight/reverse runs, xyxyxy patterns) are
-- rejected server-side, so both the app and any future channel share
-- the rule.
--
-- Every activation, PIN change, admin login and failed attempt lands in
-- security_audit_log, shown to admins under Settings → Security.
--
-- Booked departure/arrival times on shift_loads so the driver enters
-- them and on-time % is measured against real bookings.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── Booking times on loads ──────────────────────────────────
ALTER TABLE public.shift_loads
  ADD COLUMN IF NOT EXISTS booked_departure_at TIMESTAMPTZ;

-- ── Driver activation codes ─────────────────────────────────
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS pin_status TEXT NOT NULL DEFAULT 'pending' CHECK (pin_status IN ('pending', 'set')),
  ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pin_lock_level INT NOT NULL DEFAULT 0 CHECK (pin_lock_level BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pin_failed_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_failed_since TIMESTAMPTZ;

-- Existing drivers with a PIN already hashed are treated as 'set' so
-- the live app keeps working; only new drivers start 'pending'.
UPDATE public.drivers SET pin_status = 'set', pin_set_at = created_at
 WHERE pin_status = 'pending' AND pin_hash IS NOT NULL AND pin_hash <> '';

CREATE TABLE IF NOT EXISTS public.driver_activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id),
  code_hash TEXT NOT NULL,
  code_prefix TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'created' CHECK (reason IN ('created', 'reset_admin', 'reset_driver')),
  issued_by TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours'),
  consumed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_driver_activation_codes_driver ON public.driver_activation_codes(driver_id, consumed_at, cancelled_at);
CREATE INDEX IF NOT EXISTS idx_driver_activation_codes_org ON public.driver_activation_codes(organization_id);

DROP TRIGGER IF EXISTS trg_sync_org_id_driver_activation_codes ON public.driver_activation_codes;
CREATE TRIGGER trg_sync_org_id_driver_activation_codes
  BEFORE INSERT ON public.driver_activation_codes
  FOR EACH ROW EXECUTE FUNCTION public.sync_organization_id_from_driver();

ALTER TABLE public.driver_activation_codes ENABLE ROW LEVEL SECURITY;
-- Only SECURITY DEFINER functions / the service role touch codes.

-- ── PIN reset requests ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.driver_pin_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_at TIMESTAMPTZ,
  handled_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_pin_reset_requests_open ON public.driver_pin_reset_requests(organization_id, handled_at) WHERE handled_at IS NULL;

DROP TRIGGER IF EXISTS trg_sync_org_id_pin_reset_requests ON public.driver_pin_reset_requests;
CREATE TRIGGER trg_sync_org_id_pin_reset_requests
  BEFORE INSERT ON public.driver_pin_reset_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_organization_id_from_driver();

ALTER TABLE public.driver_pin_reset_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pin_reset_admin_all" ON public.driver_pin_reset_requests;
CREATE POLICY "pin_reset_admin_all" ON public.driver_pin_reset_requests
  FOR ALL TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'driver_pin_reset_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_pin_reset_requests;
  END IF;
END $$;

-- ── Security audit log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  actor_email TEXT,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  driver_ref TEXT,
  detail JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_org ON public.security_audit_log(organization_id, created_at DESC);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_admin_read" ON public.security_audit_log;
CREATE POLICY "audit_admin_read" ON public.security_audit_log FOR SELECT TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id());

-- ── Helpers ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_pin_easy(p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  d INT;
  same BOOLEAN := TRUE;
  seq_up BOOLEAN := TRUE;
  seq_down BOOLEAN := TRUE;
BEGIN
  IF p_pin IS NULL OR length(p_pin) <> 6 OR p_pin !~ '^[0-9]{6}$' THEN
    RETURN TRUE;
  END IF;
  FOR d IN 1..5 LOOP
    IF substr(p_pin, d, 1) <> substr(p_pin, 1, 1) THEN same := FALSE; END IF;
    IF (substr(p_pin, d + 1, 1)::INT - substr(p_pin, d, 1)::INT) <> 1 THEN seq_up := FALSE; END IF;
    IF (substr(p_pin, d, 1)::INT - substr(p_pin, d + 1, 1)::INT) <> 1 THEN seq_down := FALSE; END IF;
  END LOOP;
  IF same OR seq_up OR seq_down THEN RETURN TRUE; END IF;
  -- xyxyxy repeating pair (121212, 989898…).
  IF substr(p_pin, 1, 2) = substr(p_pin, 3, 2) AND substr(p_pin, 1, 2) = substr(p_pin, 5, 2) THEN
    RETURN TRUE;
  END IF;
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_audit(
  p_org_id UUID, p_event TEXT, p_actor_email TEXT, p_driver_id UUID, p_driver_ref TEXT, p_detail JSONB
) RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.security_audit_log (organization_id, event, actor_email, driver_id, driver_ref, detail)
  VALUES (p_org_id, p_event, p_actor_email, p_driver_id, p_driver_ref, p_detail);
$$;

-- ── Issue an activation code (admin-only) ───────────────────
CREATE OR REPLACE FUNCTION public.issue_driver_activation_code(p_driver_id UUID, p_reason TEXT DEFAULT 'created')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

REVOKE ALL ON FUNCTION public.issue_driver_activation_code(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_driver_activation_code(UUID, TEXT) TO authenticated;

-- ── Driver's own "I forgot my PIN" ──────────────────────────
CREATE OR REPLACE FUNCTION public.request_pin_reset()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_org UUID;
BEGIN
  SELECT organization_id INTO v_org FROM public.drivers WHERE id = auth.uid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Only drivers can request a PIN reset.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.driver_pin_reset_requests (driver_id)
  SELECT auth.uid()
   WHERE NOT EXISTS (SELECT 1 FROM public.driver_pin_reset_requests WHERE driver_id = auth.uid() AND handled_at IS NULL);
  PERFORM public.record_audit(v_org, 'pin_reset_requested', NULL, auth.uid(), NULL, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.request_pin_reset() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_pin_reset() TO authenticated;

-- ── Wrong-PIN lock-out state ────────────────────────────────
-- Returns lock info without changing anything, so the login screen can
-- show "Try again in 5 minutes" straight away.
CREATE OR REPLACE FUNCTION public.driver_lock_state(p_driver_id TEXT)
RETURNS TABLE (locked_until TIMESTAMPTZ, lock_level INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT pin_locked_until, pin_lock_level FROM public.drivers
   WHERE upper(driver_id) = upper(p_driver_id) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.driver_lock_state(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_lock_state(TEXT) TO anon, authenticated;

-- ── Record a failed PIN attempt + return the lock state ─────
-- Called by the driver-login function after a bad PIN.
CREATE OR REPLACE FUNCTION public.register_pin_failure(p_driver_id UUID)
RETURNS TABLE (locked_until TIMESTAMPTZ, lock_level INT, attempts_remaining INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_since TIMESTAMPTZ;
  v_attempts INT;
  v_level INT;
  v_until TIMESTAMPTZ;
  v_org UUID;
BEGIN
  SELECT organization_id, pin_failed_since, pin_failed_attempts, pin_lock_level
    INTO v_org, v_since, v_attempts, v_level FROM public.drivers WHERE id = p_driver_id;
  IF v_since IS NULL OR v_since < now() - interval '1 day' THEN
    v_since := now();
    v_attempts := 0;
  END IF;
  v_attempts := v_attempts + 1;

  -- 15 free tries, then 1m → 5m → 15m. Repeated wrong tries after a
  -- lock lifts push to the next level.
  IF v_attempts <= 15 THEN
    v_until := NULL;
  ELSIF v_attempts = 16 THEN
    v_level := LEAST(v_level + 1, 3);
    v_until := now() + CASE v_level WHEN 1 THEN interval '1 minute' WHEN 2 THEN interval '5 minutes' ELSE interval '15 minutes' END;
    v_attempts := 15;
    PERFORM public.record_audit(v_org, 'pin_locked', NULL, p_driver_id, NULL, jsonb_build_object('level', v_level));
  ELSE
    v_until := NULL;
  END IF;

  UPDATE public.drivers
     SET pin_failed_since = v_since, pin_failed_attempts = v_attempts,
         pin_lock_level = v_level,
         pin_locked_until = COALESCE(v_until, pin_locked_until)
   WHERE id = p_driver_id;

  RETURN QUERY SELECT v_until, v_level, GREATEST(0, 15 - v_attempts);
END;
$$;

REVOKE ALL ON FUNCTION public.register_pin_failure(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_pin_failure(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_pin_failures(p_driver_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.drivers
     SET pin_failed_attempts = 0, pin_failed_since = NULL, pin_locked_until = NULL
   WHERE id = p_driver_id;
$$;
REVOKE ALL ON FUNCTION public.clear_pin_failures(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_pin_failures(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
