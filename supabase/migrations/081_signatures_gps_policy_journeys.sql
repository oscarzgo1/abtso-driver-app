-- ============================================================
-- Migration 081: client feedback batch (Oct 2026)
-- ============================================================
--  A. Signature delivery confirmation (delivery_signatures) — when a
--     proof photo can't be taken, the person receiving the load signs
--     on the driver's phone (first name, last name, signature). Office-
--     assigned loads record it through the existing proof RPC; manual
--     loads through the attach-load Edge Function.
--  B. GPS-offline policy: org settings, gps_offline_events (what the
--     Alert Panel lists), detect_gps_offline() on pg_cron every minute,
--     and frozen-time deduction inside calculate_shift_financials().
--  C. Driver-facing RPCs so the app can read its company's policy.
--  D. Security hardening found while wiring journey history to GPS:
--       - live_driver_locations ran as its owner and was granted to
--         anon, so every company's live driver positions were readable
--         by anyone holding the public anon key;
--       - gps_locations SELECT was `true` for every signed-in user and
--         INSERT was open to anon.
--     Both are now scoped: a company's admins read their own company's
--     rows, a driver reads/writes only their own.
-- ============================================================

-- ── A. Signatures ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  dispatch_load_id UUID REFERENCES public.dispatch_loads(id) ON DELETE CASCADE,
  shift_load_id UUID REFERENCES public.shift_loads(id) ON DELETE CASCADE,
  signer_first_name TEXT NOT NULL CHECK (length(btrim(signer_first_name)) BETWEEN 1 AND 60),
  signer_last_name TEXT NOT NULL CHECK (length(btrim(signer_last_name)) BETWEEN 1 AND 60),
  signature_svg TEXT NOT NULL CHECK (
    length(signature_svg) BETWEEN 40 AND 200000
    AND left(signature_svg, 4) = '<svg'
    AND signature_svg !~* '<script|onload|onerror|javascript:'
  ),
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((dispatch_load_id IS NOT NULL)::int + (shift_load_id IS NOT NULL)::int = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_signatures_one_per_dispatch_load
  ON public.delivery_signatures (dispatch_load_id) WHERE dispatch_load_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS delivery_signatures_one_per_shift_load
  ON public.delivery_signatures (shift_load_id) WHERE shift_load_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS delivery_signatures_org_idx
  ON public.delivery_signatures (organization_id, signed_at DESC);

ALTER TABLE public.delivery_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_signatures_admin_all ON public.delivery_signatures;
CREATE POLICY delivery_signatures_admin_all ON public.delivery_signatures
  FOR ALL TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS delivery_signatures_driver_read ON public.delivery_signatures;
CREATE POLICY delivery_signatures_driver_read ON public.delivery_signatures
  FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'delivery_signatures') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_signatures;
  END IF;
END $$;

-- Proof batch for an office-assigned load: photos as before, plus ONE
-- optional signature entry {pod_type:'signature', first_name, last_name,
-- signature_svg, lat, lng, taken_at}. A signature alone satisfies the
-- "at least one proof" rule.
CREATE OR REPLACE FUNCTION public.record_dispatch_proofs(p_load UUID, p_org UUID, p_driver UUID, p_proofs JSONB)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r JSONB;
  v_prefix TEXT := p_org::text || '/' || p_driver::text || '/';
  v_type TEXT;
  v_path TEXT;
  v_count INTEGER := 0;
  v_signatures INTEGER := 0;
  v_first TEXT;
  v_last TEXT;
  v_svg TEXT;
BEGIN
  IF p_proofs IS NULL OR jsonb_typeof(p_proofs) <> 'array' OR jsonb_array_length(p_proofs) < 1 THEN
    RAISE EXCEPTION 'Take at least one proof photo, or get a signature, before completing the load.';
  END IF;
  IF jsonb_array_length(p_proofs) > 12 THEN
    RAISE EXCEPTION 'Too many photos.';
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_proofs) LOOP
    v_type := r->>'pod_type';

    IF v_type = 'signature' THEN
      v_signatures := v_signatures + 1;
      IF v_signatures > 1 THEN
        RAISE EXCEPTION 'Only one signature per delivery.';
      END IF;
      v_first := btrim(COALESCE(r->>'first_name', ''));
      v_last := btrim(COALESCE(r->>'last_name', ''));
      v_svg := COALESCE(r->>'signature_svg', '');
      IF v_first = '' OR v_last = '' THEN
        RAISE EXCEPTION 'Enter the first and last name of the person signing.';
      END IF;
      IF left(v_svg, 4) <> '<svg' THEN
        RAISE EXCEPTION 'The signature is missing.';
      END IF;
      INSERT INTO public.delivery_signatures (organization_id, driver_id, dispatch_load_id, signer_first_name, signer_last_name, signature_svg, signed_at, gps_lat, gps_lng)
      VALUES (
        p_org, p_driver, p_load, left(v_first, 60), left(v_last, 60), v_svg,
        COALESCE(NULLIF(r->>'taken_at', '')::timestamptz, now()),
        NULLIF(r->>'lat', '')::double precision,
        NULLIF(r->>'lng', '')::double precision
      );
      v_count := v_count + 1;
      CONTINUE;
    END IF;

    v_path := r->>'path';
    IF v_type NOT IN ('solo_departure', 'empty_trailer', 'paper_pod') THEN
      RAISE EXCEPTION 'Unknown proof type.';
    END IF;
    IF v_path IS NULL OR left(v_path, length(v_prefix)) <> v_prefix THEN
      RAISE EXCEPTION 'That photo doesn''t belong to you.';
    END IF;
    INSERT INTO public.shipment_proofs (organization_id, driver_id, dispatch_load_id, pod_type, photo_path, taken_at, gps_lat, gps_lng)
    VALUES (
      p_org, p_driver, p_load, v_type, v_path,
      COALESCE(NULLIF(r->>'taken_at', '')::timestamptz, now()),
      NULLIF(r->>'lat', '')::double precision,
      NULLIF(r->>'lng', '')::double precision
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.record_dispatch_proofs(UUID, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- ── B. GPS-offline policy ───────────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS gps_offline_detection_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS gps_offline_after_minutes INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS gps_offline_notify_driver BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS gps_offline_action TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS gps_offline_clock_out_minutes INTEGER NOT NULL DEFAULT 60;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_gps_offline_action_check') THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_gps_offline_action_check CHECK (gps_offline_action IN ('none', 'freeze_time', 'clock_out'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_gps_offline_after_check') THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_gps_offline_after_check CHECK (gps_offline_after_minutes BETWEEN 5 AND 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_gps_offline_clock_out_check') THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_gps_offline_clock_out_check CHECK (gps_offline_clock_out_minutes BETWEEN 10 AND 480);
  END IF;
END $$;

COMMENT ON COLUMN public.organizations.gps_offline_action IS
  'What happens while a driver on shift sends no GPS: none = alert only; freeze_time = the offline stretch is deducted from paid hours; clock_out = shift ended at the last GPS ping after gps_offline_clock_out_minutes.';

CREATE TABLE IF NOT EXISTS public.gps_offline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  last_lat DOUBLE PRECISION,
  last_lng DOUBLE PRECISION,
  time_frozen BOOLEAN NOT NULL DEFAULT false,
  action_taken TEXT NOT NULL DEFAULT 'alert' CHECK (action_taken IN ('alert', 'time_frozen', 'clocked_out')),
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gps_offline_one_open_per_shift
  ON public.gps_offline_events (shift_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS gps_offline_events_org_idx
  ON public.gps_offline_events (organization_id, detected_at DESC);

ALTER TABLE public.gps_offline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gps_offline_events_admin_all ON public.gps_offline_events;
CREATE POLICY gps_offline_events_admin_all ON public.gps_offline_events
  FOR ALL TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS gps_offline_events_driver_read ON public.gps_offline_events;
CREATE POLICY gps_offline_events_driver_read ON public.gps_offline_events
  FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'gps_offline_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gps_offline_events;
  END IF;
END $$;

-- A ping that arrives for a shift with an open offline event either
-- resolves it (a fresh ping: tracking is back) or just moves the event's
-- start forward (a queued ping from the gap, uploaded late — that stretch
-- was tracked, only the upload was delayed, so it isn't offline time).
CREATE OR REPLACE FUNCTION public.tr_resolve_gps_offline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.shift_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.recorded_at >= now() - interval '5 minutes' THEN
    UPDATE public.gps_offline_events
       SET resolved_at = GREATEST(NEW.recorded_at, started_at)
     WHERE shift_id = NEW.shift_id AND resolved_at IS NULL;
  ELSE
    UPDATE public.gps_offline_events
       SET started_at = NEW.recorded_at, last_lat = NEW.latitude, last_lng = NEW.longitude
     WHERE shift_id = NEW.shift_id AND resolved_at IS NULL AND NEW.recorded_at > started_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_gps_resolve_offline ON public.gps_locations;
CREATE TRIGGER tr_gps_resolve_offline
  AFTER INSERT ON public.gps_locations
  FOR EACH ROW EXECUTE FUNCTION public.tr_resolve_gps_offline();

-- Runs every minute. Opens an event for any active shift whose last GPS
-- ping is older than the company's threshold, and — only if the company
-- chose "clock_out" — ends the shift at the last ping once the longer
-- clock-out threshold passes.
CREATE OR REPLACE FUNCTION public.detect_gps_offline()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v RECORD;
  v_last TIMESTAMPTZ;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_event UUID;
BEGIN
  -- Close events whose shift has ended.
  UPDATE public.gps_offline_events e
     SET resolved_at = COALESCE(s.end_time, now())
    FROM public.shifts s
   WHERE s.id = e.shift_id
     AND e.resolved_at IS NULL
     AND (s.status <> 'active' OR s.end_time IS NOT NULL);

  FOR v IN
    SELECT s.id AS shift_id, s.driver_id, d.organization_id, s.start_time, s.start_lat, s.start_lng,
           o.gps_offline_after_minutes AS after_min,
           o.gps_offline_action AS action,
           o.gps_offline_clock_out_minutes AS out_min
      FROM public.shifts s
      JOIN public.drivers d ON d.id = s.driver_id
      JOIN public.organizations o ON o.id = d.organization_id
     WHERE s.status = 'active'
       AND s.end_time IS NULL
       AND o.is_active IS NOT FALSE
       AND o.gps_offline_detection_enabled
  LOOP
    SELECT recorded_at, latitude, longitude INTO v_last, v_lat, v_lng
      FROM public.gps_locations
     WHERE shift_id = v.shift_id
     ORDER BY recorded_at DESC
     LIMIT 1;

    IF v_last IS NULL THEN
      v_last := v.start_time;
      v_lat := v.start_lat;
      v_lng := v.start_lng;
    END IF;

    IF v_last > now() - make_interval(mins => v.after_min) THEN
      CONTINUE;
    END IF;

    SELECT id INTO v_event FROM public.gps_offline_events WHERE shift_id = v.shift_id AND resolved_at IS NULL;
    IF v_event IS NULL THEN
      INSERT INTO public.gps_offline_events (organization_id, driver_id, shift_id, started_at, last_lat, last_lng, time_frozen, action_taken)
      VALUES (
        v.organization_id, v.driver_id, v.shift_id, v_last, v_lat, v_lng,
        v.action IN ('freeze_time', 'clock_out'),
        CASE WHEN v.action = 'freeze_time' THEN 'time_frozen' ELSE 'alert' END
      )
      ON CONFLICT DO NOTHING;
    END IF;

    IF v.action = 'clock_out' AND v_last <= now() - make_interval(mins => v.out_min) THEN
      UPDATE public.shifts
         SET end_time = v_last, end_lat = v_lat, end_lng = v_lng, status = 'completed'
       WHERE id = v.shift_id AND status = 'active';
      UPDATE public.gps_offline_events
         SET resolved_at = now(), action_taken = 'clocked_out', time_frozen = true
       WHERE shift_id = v.shift_id AND resolved_at IS NULL;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.detect_gps_offline() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-gps-offline') THEN
    PERFORM cron.schedule('detect-gps-offline', '* * * * *', 'SELECT public.detect_gps_offline();');
  END IF;
END $$;

-- Paid hours: same calculation as before, minus any frozen offline
-- stretch (events recorded under a "freeze_time"/"clock_out" policy).
CREATE OR REPLACE FUNCTION public.calculate_shift_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_week_number INTEGER;
  v_week_year INTEGER;
  v_current_dow INTEGER;
  v_mon_fri_rate NUMERIC(10,2) := 16.00;
  v_sat_rate NUMERIC(10,2) := 17.00;
  v_sun_rate NUMERIC(10,2) := 18.00;
  v_driver_rec RECORD;
  v_is_fixed BOOLEAN := FALSE;
  v_fixed_rate NUMERIC(10,2);
  v_night_out_pay NUMERIC(10,2) := 0.00;
  v_already_locked BOOLEAN;
  v_manager_relock BOOLEAN;
  v_frozen BOOLEAN;
  v_wage_component NUMERIC(10,2);
  v_gross_secs NUMERIC;
  v_offline_secs NUMERIC := 0;
BEGIN
  v_week_number := EXTRACT(WEEK FROM NEW.start_time)::INTEGER;
  v_week_year := EXTRACT(ISOYEAR FROM NEW.start_time)::INTEGER;
  v_current_dow := EXTRACT(ISODOW FROM NEW.start_time);
  NEW.week_number := v_week_number;
  NEW.week_year := v_week_year;
  NEW.updated_at := now();

  v_already_locked := (TG_OP = 'UPDATE' AND OLD.rate_snapshot_timestamp IS NOT NULL);
  v_manager_relock := (
    v_already_locked
    AND NEW.rate_snapshot_timestamp IS DISTINCT FROM OLD.rate_snapshot_timestamp
  );
  v_frozen := v_already_locked AND NOT v_manager_relock;

  IF v_frozen THEN
    -- Locked, ordinary edit: ignore whatever the client sent for these
    -- columns (it should have sent nothing) and keep exactly what was
    -- recorded at lock time.
    NEW.applied_rate_type := OLD.applied_rate_type;
    NEW.applied_rate_amount := OLD.applied_rate_amount;
    NEW.rate_snapshot_timestamp := OLD.rate_snapshot_timestamp;
    NEW.base_hourly_rate := OLD.base_hourly_rate;
    v_is_fixed := (OLD.applied_rate_type = 'fixed_shift');
  ELSIF v_manager_relock THEN
    -- Deliberate manager override — trust the client's new rate exactly.
    v_is_fixed := (NEW.applied_rate_type = 'fixed_shift');
    NEW.base_hourly_rate := NEW.applied_rate_amount;
  ELSE
    -- Never locked before: derive from the driver's current profile.
    BEGIN
      SELECT rate_type, fixed_rate, mon_fri_rate, saturday_rate, sunday_rate, hourly_rate
      INTO v_driver_rec
      FROM public.drivers
      WHERE id = NEW.driver_id;

      IF FOUND THEN
        v_is_fixed := v_driver_rec.rate_type IS NOT NULL AND (
          LOWER(v_driver_rec.rate_type) LIKE '%fixed%' OR
          LOWER(v_driver_rec.rate_type) LIKE '%day%' OR
          LOWER(v_driver_rec.rate_type) LIKE '%flat%'
        );
        v_fixed_rate := COALESCE(v_driver_rec.fixed_rate, v_driver_rec.hourly_rate);
        v_mon_fri_rate := COALESCE(v_driver_rec.mon_fri_rate, v_driver_rec.hourly_rate, v_mon_fri_rate);
        v_sat_rate := COALESCE(v_driver_rec.saturday_rate, v_mon_fri_rate + 1.00);
        v_sun_rate := COALESCE(v_driver_rec.sunday_rate, v_mon_fri_rate + 2.00);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- keep the hardcoded defaults above
    END;

    IF v_is_fixed THEN
      NEW.base_hourly_rate := v_fixed_rate;
    ELSE
      CASE v_current_dow
        WHEN 7 THEN NEW.base_hourly_rate := v_sun_rate;
        WHEN 6 THEN NEW.base_hourly_rate := v_sat_rate;
        ELSE        NEW.base_hourly_rate := v_mon_fri_rate;
      END CASE;
    END IF;
  END IF;

  IF NEW.status = 'completed' AND NEW.end_time IS NOT NULL THEN
    v_gross_secs := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time));

    IF v_gross_secs < 0 THEN
      RAISE EXCEPTION 'Shift end_time (%) is before start_time (%)', NEW.end_time, NEW.start_time;
    END IF;

    -- Offline stretches the company chose to freeze (migration 081).
    BEGIN
      SELECT COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (
               LEAST(COALESCE(e.resolved_at, NEW.end_time), NEW.end_time) - GREATEST(e.started_at, NEW.start_time)
             )))), 0)
        INTO v_offline_secs
        FROM public.gps_offline_events e
       WHERE e.shift_id = NEW.id AND e.time_frozen;
    EXCEPTION WHEN OTHERS THEN
      v_offline_secs := 0;
    END;

    NEW.total_hours := ROUND(GREATEST(0, v_gross_secs - v_offline_secs) / 3600.0, 2);

    BEGIN
      IF NEW.night_out_status = 'approved' THEN
        v_night_out_pay := COALESCE(NEW.night_out_amount, 25.00);
        IF v_night_out_pay = 0.00 THEN
          v_night_out_pay := 25.00;
          NEW.night_out_amount := 25.00;
        END IF;
      ELSE
        v_night_out_pay := 0.00;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_night_out_pay := 0.00;
    END;

    IF NOT v_frozen THEN
      -- Establishing the lock (first completion) or re-locking it
      -- (manager override) — in the override case NEW.applied_rate_type/
      -- applied_rate_amount already carry the client's values untouched.
      IF NOT v_manager_relock THEN
        NEW.applied_rate_type := CASE WHEN v_is_fixed THEN 'fixed_shift' ELSE 'hourly' END;
        NEW.applied_rate_amount := CASE WHEN v_is_fixed THEN v_fixed_rate ELSE NEW.base_hourly_rate END;
      END IF;
      NEW.rate_snapshot_timestamp := COALESCE(NEW.rate_snapshot_timestamp, now());
    END IF;

    NEW.effective_rate := NEW.applied_rate_amount;

    v_wage_component := CASE
      WHEN NEW.applied_rate_type = 'fixed_shift' THEN COALESCE(NEW.applied_rate_amount, 0)
      ELSE ROUND(NEW.total_hours * COALESCE(NEW.applied_rate_amount, 0), 2)
    END;

    -- Micro-shift guard: under 15 minutes reads as a test/accidental
    -- shift rather than real work, unless a manager explicitly marks it
    -- as genuine via the Edit Payroll drawer.
    IF NEW.total_hours < 0.25 AND NOT COALESCE(NEW.is_micro_shift_override, FALSE) THEN
      NEW.total_pay := 0.00;
    ELSE
      NEW.total_pay := ROUND(
        v_wage_component + v_night_out_pay + COALESCE(NEW.extras_amount, 0) - COALESCE(NEW.deduction_amount, 0),
        2
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── C. Driver-facing helpers ────────────────────────────────
CREATE OR REPLACE FUNCTION public.driver_gps_policy()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'detection_enabled', o.gps_offline_detection_enabled,
    'after_minutes', o.gps_offline_after_minutes,
    'notify_driver', o.gps_offline_notify_driver,
    'action', o.gps_offline_action,
    'clock_out_minutes', o.gps_offline_clock_out_minutes
  )
  FROM public.drivers d
  JOIN public.organizations o ON o.id = d.organization_id
  WHERE d.id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.driver_gps_policy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_gps_policy() TO authenticated;

-- The driver's most recent offline event in the last 12 hours, so the app
-- can tell them what happened when they reopen it.
CREATE OR REPLACE FUNCTION public.my_recent_gps_offline()
RETURNS TABLE (started_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ, action_taken TEXT, time_frozen BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT e.started_at, e.resolved_at, e.action_taken, e.time_frozen
    FROM public.gps_offline_events e
   WHERE e.driver_id = auth.uid() AND e.detected_at > now() - interval '12 hours'
   ORDER BY e.detected_at DESC
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.my_recent_gps_offline() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_recent_gps_offline() TO authenticated;

-- ── D. Security hardening ───────────────────────────────────
ALTER VIEW public.live_driver_locations SET (security_invoker = true);
REVOKE ALL ON public.live_driver_locations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.live_driver_locations FROM authenticated;
GRANT SELECT ON public.live_driver_locations TO authenticated;

DROP POLICY IF EXISTS gps_select_authenticated ON public.gps_locations;
DROP POLICY IF EXISTS gps_select_org_admin ON public.gps_locations;
CREATE POLICY gps_select_org_admin ON public.gps_locations
  FOR SELECT TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id());
DROP POLICY IF EXISTS gps_select_own ON public.gps_locations;
CREATE POLICY gps_select_own ON public.gps_locations
  FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS gps_insert_anon ON public.gps_locations;
DROP POLICY IF EXISTS gps_insert_authenticated ON public.gps_locations;
DROP POLICY IF EXISTS gps_insert_own ON public.gps_locations;
CREATE POLICY gps_insert_own ON public.gps_locations
  FOR INSERT TO authenticated
  WITH CHECK (driver_id = auth.uid());

NOTIFY pgrst, 'reload schema';
