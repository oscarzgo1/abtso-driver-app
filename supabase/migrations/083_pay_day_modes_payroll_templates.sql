-- ============================================================
-- 083: Pay calculation modes + payroll templates
--
-- A. How a company's day rates (Mon-Fri / Saturday / Sunday) are applied,
--    chosen in Settings -> Payroll (organizations.pay_day_mode):
--      shift_start_day  The whole shift is paid at the rate of the day it
--                       STARTED. This is what the system always did, so it
--                       stays the default and nobody's pay changes.
--      split_by_day     Each calendar day (UK time) is paid at its own rate:
--                       Fri 10h at the Friday rate, Sat 10h at the Saturday
--                       rate, Sun 10h at the Sunday rate. A shift that
--                       runs past midnight is split at midnight.
--      week_top_rate    The highest day rate worked in the Sunday-Saturday
--                       week applies to every hourly shift that week.
--    Only shifts completed after the setting is changed are affected;
--    completed shifts keep their locked pay.
--
--    Also fixed here: the day of week was read in UTC, so in summer a
--    shift starting 00:30 UK time on a Sunday was paid the Saturday rate.
--    It is now read in Europe/London.
--
-- B. payroll_templates: the spreadsheet templates a company's accountant
--    needs filled, with the column mapping, saved per company.
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS pay_day_mode TEXT NOT NULL DEFAULT 'shift_start_day';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_pay_day_mode_check') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_pay_day_mode_check CHECK (pay_day_mode IN ('shift_start_day', 'split_by_day', 'week_top_rate'));
  END IF;
END $$;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS pay_mode_applied TEXT,
  ADD COLUMN IF NOT EXISTS rate_card JSONB,
  ADD COLUMN IF NOT EXISTS rate_breakdown JSONB;

COMMENT ON COLUMN public.shifts.pay_mode_applied IS 'How this shift was priced: fixed | shift_start_day | split_by_day | week_top_rate | manual (a manager set the rate).';
COMMENT ON COLUMN public.shifts.rate_card IS 'The driver''s Mon-Fri/Sat/Sun rates frozen when the shift was priced: {mf, sat, sun}.';
COMMENT ON COLUMN public.shifts.rate_breakdown IS 'Hours, rate and amount per day that make up the hourly wage, for audit and payroll exports.';

-- Day-type rate lookup (1=Mon .. 7=Sun)
CREATE OR REPLACE FUNCTION public.shift_day_rate(p_card JSONB, p_isodow INTEGER)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_isodow
    WHEN 7 THEN (p_card->>'sun')::numeric
    WHEN 6 THEN (p_card->>'sat')::numeric
    ELSE (p_card->>'mf')::numeric
  END;
$$;

-- Split a shift at UK midnights and price each day at its own rate.
-- Hours per day are cumulative-rounded so they always add up exactly to the
-- shift's total_hours, and time frozen by GPS-offline events is excluded.
CREATE OR REPLACE FUNCTION public.compute_split_wage(
  p_shift_id UUID, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ, p_card JSONB,
  OUT wage NUMERIC, OUT breakdown JSONB, OUT total_hours NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_cursor TIMESTAMPTZ := p_start;
  v_next TIMESTAMPTZ;
  v_gross NUMERIC;
  v_off NUMERIC;
  v_net NUMERIC;
  v_cum_secs NUMERIC := 0;
  v_prev_cum NUMERIC := 0;
  v_cum NUMERIC;
  v_hours NUMERIC;
  v_dow INTEGER;
  v_rate NUMERIC;
  v_sum NUMERIC := 0;
  v_items JSONB := '[]'::jsonb;
BEGIN
  WHILE v_cursor < p_end LOOP
    v_next := LEAST(p_end, (date_trunc('day', v_cursor AT TIME ZONE 'Europe/London') + INTERVAL '1 day') AT TIME ZONE 'Europe/London');
    v_gross := EXTRACT(EPOCH FROM (v_next - v_cursor));
    SELECT COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (
             LEAST(COALESCE(e.resolved_at, p_end), v_next, p_end) - GREATEST(e.started_at, v_cursor)
           )))), 0)
      INTO v_off
      FROM public.gps_offline_events e
     WHERE e.shift_id = p_shift_id AND e.time_frozen;
    v_net := GREATEST(0, v_gross - v_off);
    v_cum_secs := v_cum_secs + v_net;
    v_cum := ROUND(v_cum_secs / 3600.0, 2);
    v_hours := v_cum - v_prev_cum;
    v_prev_cum := v_cum;
    v_dow := EXTRACT(ISODOW FROM (v_cursor AT TIME ZONE 'Europe/London'))::int;
    v_rate := public.shift_day_rate(p_card, v_dow);
    v_sum := v_sum + v_hours * v_rate;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'from', v_cursor, 'to', v_next, 'dow', v_dow,
      'day', CASE WHEN v_dow = 7 THEN 'sun' WHEN v_dow = 6 THEN 'sat' ELSE 'mf' END,
      'hours', v_hours, 'rate', v_rate, 'amount', ROUND(v_hours * v_rate, 2)
    ));
    v_cursor := v_next;
  END LOOP;
  wage := ROUND(v_sum, 2);
  breakdown := v_items;
  total_hours := v_prev_cum;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_shift_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_local TIMESTAMP;
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
  v_auto_relock BOOLEAN := FALSE;
  v_frozen BOOLEAN;
  v_wage_component NUMERIC(10,2);
  v_gross_secs NUMERIC;
  v_offline_secs NUMERIC := 0;
  v_mode TEXT := 'shift_start_day';
  v_card JSONB;
  v_split RECORD;
  v_top NUMERIC;
  v_week_start DATE;
  v_day_name TEXT;
BEGIN
  v_local := NEW.start_time AT TIME ZONE 'Europe/London';
  v_week_number := EXTRACT(WEEK FROM v_local)::INTEGER;
  v_week_year := EXTRACT(ISOYEAR FROM v_local)::INTEGER;
  v_current_dow := EXTRACT(ISODOW FROM v_local);
  v_day_name := CASE WHEN v_current_dow = 7 THEN 'sun' WHEN v_current_dow = 6 THEN 'sat' ELSE 'mf' END;
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
    NEW.applied_rate_type := OLD.applied_rate_type;
    NEW.applied_rate_amount := OLD.applied_rate_amount;
    NEW.rate_snapshot_timestamp := OLD.rate_snapshot_timestamp;
    NEW.base_hourly_rate := OLD.base_hourly_rate;
    NEW.pay_mode_applied := OLD.pay_mode_applied;
    NEW.rate_card := OLD.rate_card;
    v_is_fixed := (OLD.applied_rate_type = 'fixed_shift');
  ELSIF v_manager_relock THEN
    v_is_fixed := (NEW.applied_rate_type = 'fixed_shift');
    NEW.base_hourly_rate := NEW.applied_rate_amount;
    -- A rate raised automatically by the week-top-rate rule keeps its mode;
    -- anything else here is a manager typing a rate in.
    v_auto_relock := COALESCE(current_setting('tachyo.auto_rate', true), '') = '1';
    IF NOT v_auto_relock THEN
      NEW.pay_mode_applied := 'manual';
    END IF;
  ELSE
    BEGIN
      SELECT rate_type, fixed_rate, mon_fri_rate, saturday_rate, sunday_rate, hourly_rate, organization_id
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
        SELECT COALESCE(o.pay_day_mode, 'shift_start_day') INTO v_mode
          FROM public.organizations o WHERE o.id = v_driver_rec.organization_id;
        v_mode := COALESCE(v_mode, 'shift_start_day');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    v_card := jsonb_build_object('mf', v_mon_fri_rate, 'sat', v_sat_rate, 'sun', v_sun_rate);

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
      IF NOT v_manager_relock THEN
        NEW.applied_rate_type := CASE WHEN v_is_fixed THEN 'fixed_shift' ELSE 'hourly' END;
        IF v_is_fixed THEN
          NEW.applied_rate_amount := v_fixed_rate;
          NEW.pay_mode_applied := 'fixed';
          NEW.rate_card := v_card;
        ELSE
          NEW.pay_mode_applied := v_mode;
          NEW.rate_card := v_card;
          IF v_mode = 'week_top_rate' THEN
            -- Highest day rate worked this Sunday-Saturday week (UK time)
            v_week_start := v_local::date - EXTRACT(DOW FROM v_local)::int;
            SELECT COALESCE(MAX(public.shift_day_rate(v_card, EXTRACT(ISODOW FROM (s.start_time AT TIME ZONE 'Europe/London'))::int)), 0)
              INTO v_top
              FROM public.shifts s
             WHERE s.driver_id = NEW.driver_id
               AND s.id <> NEW.id
               AND s.status = 'completed'
               AND s.applied_rate_type = 'hourly'
               AND (s.start_time AT TIME ZONE 'Europe/London')::date >= v_week_start
               AND (s.start_time AT TIME ZONE 'Europe/London')::date < v_week_start + 7;
            v_top := GREATEST(COALESCE(v_top, 0), public.shift_day_rate(v_card, v_current_dow));
            NEW.applied_rate_amount := v_top;
            NEW.base_hourly_rate := v_top;
          ELSIF v_mode = 'split_by_day' THEN
            SELECT * INTO v_split FROM public.compute_split_wage(NEW.id, NEW.start_time, NEW.end_time, v_card);
            NEW.applied_rate_amount := CASE WHEN NEW.total_hours > 0 THEN ROUND(v_split.wage / NEW.total_hours, 2) ELSE NEW.base_hourly_rate END;
          ELSE
            NEW.applied_rate_amount := NEW.base_hourly_rate;
          END IF;
        END IF;
      END IF;
      NEW.rate_snapshot_timestamp := COALESCE(NEW.rate_snapshot_timestamp, now());
    END IF;

    NEW.effective_rate := NEW.applied_rate_amount;

    IF NEW.applied_rate_type = 'fixed_shift' THEN
      v_wage_component := COALESCE(NEW.applied_rate_amount, 0);
      NEW.rate_breakdown := NULL;
    ELSIF NEW.pay_mode_applied = 'split_by_day' AND NEW.rate_card IS NOT NULL THEN
      SELECT * INTO v_split FROM public.compute_split_wage(NEW.id, NEW.start_time, NEW.end_time, NEW.rate_card);
      v_wage_component := v_split.wage;
      NEW.rate_breakdown := v_split.breakdown;
    ELSE
      v_wage_component := ROUND(NEW.total_hours * COALESCE(NEW.applied_rate_amount, 0), 2);
      NEW.rate_breakdown := jsonb_build_array(jsonb_build_object(
        'from', NEW.start_time, 'to', NEW.end_time, 'dow', v_current_dow, 'day', v_day_name,
        'hours', NEW.total_hours, 'rate', COALESCE(NEW.applied_rate_amount, 0),
        'amount', v_wage_component
      ));
    END IF;

    IF NEW.total_hours < 0.25 AND NOT COALESCE(NEW.is_micro_shift_override, FALSE) THEN
      NEW.total_pay := 0.00;
    ELSE
      NEW.total_pay := ROUND(
        v_wage_component + v_night_out_pay + COALESCE(NEW.extras_amount, 0) - COALESCE(NEW.deduction_amount, 0),
        2
      );
    END IF;

    -- Week-top-rate: this shift may have raised the week's top rate, so
    -- lift the week's earlier automatically-priced shifts to match.
    IF NOT v_frozen AND NOT v_manager_relock AND NEW.pay_mode_applied = 'week_top_rate' AND NEW.applied_rate_type = 'hourly' THEN
      PERFORM set_config('tachyo.auto_rate', '1', true);
      UPDATE public.shifts s
         SET applied_rate_amount = NEW.applied_rate_amount,
             rate_snapshot_timestamp = now()
       WHERE s.driver_id = NEW.driver_id
         AND s.id <> NEW.id
         AND s.status = 'completed'
         AND s.applied_rate_type = 'hourly'
         AND s.pay_mode_applied = 'week_top_rate'
         AND s.applied_rate_amount < NEW.applied_rate_amount
         AND (s.start_time AT TIME ZONE 'Europe/London')::date >= v_week_start
         AND (s.start_time AT TIME ZONE 'Europe/London')::date < v_week_start + 7;
      PERFORM set_config('tachyo.auto_rate', '', true);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Company admins (payroll) choose the mode in Settings -> Payroll.
CREATE OR REPLACE FUNCTION public.set_pay_day_mode(p_mode TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_payroll_admin() THEN
    RAISE EXCEPTION 'Only a payroll admin can change how pay is calculated.';
  END IF;
  IF p_mode NOT IN ('shift_start_day', 'split_by_day', 'week_top_rate') THEN
    RAISE EXCEPTION 'Unknown pay calculation mode.';
  END IF;
  UPDATE public.organizations SET pay_day_mode = p_mode WHERE id = public.current_org_id();
END;
$$;
REVOKE ALL ON FUNCTION public.set_pay_day_mode(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pay_day_mode(TEXT) TO authenticated;

-- ── B. Payroll templates ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  file_name TEXT NOT NULL,
  file_b64 TEXT NOT NULL CHECK (length(file_b64) <= 7000000),
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_templates_org_idx ON public.payroll_templates (organization_id, created_at DESC);

ALTER TABLE public.payroll_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_templates_payroll_admin ON public.payroll_templates;
CREATE POLICY payroll_templates_payroll_admin ON public.payroll_templates
  FOR ALL TO authenticated
  USING (public.is_org_payroll_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_payroll_admin() AND organization_id = public.current_org_id());
REVOKE ALL ON public.payroll_templates FROM anon;
