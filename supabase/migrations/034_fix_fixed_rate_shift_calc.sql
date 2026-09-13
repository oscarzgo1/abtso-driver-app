-- ============================================================
-- ABTSO Logistics / Tachyo — Migration 034: Fix Fixed-Rate Shift
-- Financials (server-side trigger was hours × rate for EVERY driver)
-- ============================================================
-- Bug report: a driver on a Fixed Shift Rate (Day Rate) of ~£200/shift
-- worked 3.03 hours with a £100 approved night-out allowance, and the
-- system paid £709.03 instead of £300.00 (£200 flat + £100 night-out).
--
-- Root cause: public.calculate_shift_financials() — the BEFORE
-- INSERT/UPDATE trigger on public.shifts — was written before the
-- "Fixed Shift Rate" feature existed and has no concept of
-- drivers.rate_type / drivers.fixed_rate at all. It always computed
--   total_pay = total_hours * base_hourly_rate + night_out
-- sourcing "base_hourly_rate" from the legacy public.employee_rates
-- table, falling back to drivers.hourly_rate. The admin dashboard
-- (handleSaveRate in App.tsx) mirrors a Fixed driver's flat rate into
-- drivers.hourly_rate too, purely so the column is never null for
-- other schema-cache-safety reasons — but this trigger then picked
-- that value up and used it as a literal per-hour rate, multiplying
-- the driver's flat £-per-shift amount by hours worked.
--
-- This is a server-side, unconditional BEFORE trigger: it overwrites
-- whatever total_pay the client (admin dashboard's manual clock-out,
-- or the driver app's end_shift RPC) computed, so the bug reproduced
-- regardless of which client closed the shift.
--
-- Fix: read the driver's rate profile straight from public.drivers
-- (the real, current source of truth — see drivers.rate_type /
-- fixed_rate / mon_fri_rate / saturday_rate / sunday_rate, ADDed in
-- migration 030) instead of the unused public.employee_rates table,
-- and branch on rate_type: a Fixed/Day/Flat rate is paid once per
-- shift, never multiplied by hours.
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_shift_financials()
RETURNS TRIGGER AS $$
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
BEGIN
  v_week_number := EXTRACT(WEEK FROM NEW.start_time)::INTEGER;
  v_week_year := EXTRACT(ISOYEAR FROM NEW.start_time)::INTEGER;
  v_current_dow := EXTRACT(ISODOW FROM NEW.start_time);

  -- Default fallback rates, used only if the driver record can't be read.
  v_mon_fri_rate := 16.00;
  v_sat_rate := 17.00;
  v_sun_rate := 18.00;

  -- The driver's own row is the real, current source of truth for rate
  -- data (this is what Rates & Agencies actually writes to) — not the
  -- legacy employee_rates table, which the app no longer maintains.
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

  NEW.week_number := v_week_number;
  NEW.week_year := v_week_year;

  -- base_hourly_rate is informational for a Fixed driver (there is no
  -- per-hour rate), but keeping it populated with the flat amount avoids
  -- surfacing a null where existing UI/exports expect a number.
  IF v_is_fixed THEN
    NEW.base_hourly_rate := v_fixed_rate;
  ELSE
    CASE v_current_dow
      WHEN 7 THEN NEW.base_hourly_rate := v_sun_rate;
      WHEN 6 THEN NEW.base_hourly_rate := v_sat_rate;
      ELSE        NEW.base_hourly_rate := v_mon_fri_rate;
    END CASE;
  END IF;

  NEW.updated_at := now();

  -- Calculate total hours and total pay when shift is completed
  IF NEW.status = 'completed' AND NEW.end_time IS NOT NULL THEN
    NEW.total_hours := ROUND(
      EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0,
      2
    );

    IF NEW.total_hours < 0 THEN
      RAISE EXCEPTION 'Shift end_time (%) is before start_time (%)', NEW.end_time, NEW.start_time;
    END IF;

    -- Safely add Night Out allowance if approved
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

    IF v_is_fixed THEN
      -- FLAT rate per shift — never multiplied by hours worked.
      NEW.effective_rate := v_fixed_rate;
      NEW.total_pay := ROUND(COALESCE(v_fixed_rate, 0) + v_night_out_pay, 2);
    ELSE
      NEW.effective_rate := NEW.base_hourly_rate;
      NEW.total_pay := ROUND((NEW.total_hours * NEW.base_hourly_rate) + v_night_out_pay, 2);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Second, unrelated bug found while tracing this one: public.shifts has
-- had a "shifts_driver_select" policy (USING (true)) since migration
-- 004 — from before multi-tenancy existed — that was never tightened
-- when migration 032 introduced organizations. Postgres RLS policies
-- for the same command are OR'd together, so this permissive SELECT
-- policy alone let ANY authenticated user (any admin, any driver, in
-- any organization) read every organization's shifts — driver
-- locations, pay, night-out amounts, everything. shifts_driver_insert
-- and shifts_driver_update were already correctly scoped to
-- driver_id = auth.uid(); this brings SELECT in line with them.
-- ============================================================

DROP POLICY IF EXISTS "shifts_driver_select" ON public.shifts;

CREATE POLICY "shifts_driver_select"
  ON public.shifts FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
