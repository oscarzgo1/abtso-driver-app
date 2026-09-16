-- ============================================================
-- Migration 048: Rate Snapshotting & Payroll Adjustment Columns
-- ============================================================
-- BUG FOUND WHILE BUILDING THIS: public.calculate_shift_financials()
-- (the BEFORE INSERT OR UPDATE trigger on public.shifts, last rewritten
-- in migration 034) re-reads the driver's CURRENT rate from
-- public.drivers on every single write to a shift row, including an
-- UPDATE to a shift that already completed weeks ago. Both existing
-- payroll-edit code paths (handleSaveModalAction's "Edit Payroll" save,
-- and handleEditShiftTime's clock-time correction) already tried to
-- guard against this client-side — one carefully re-derives an adjusted
-- total, the other computes a fresh figure and comments "bypass DB
-- triggers AND STAMP HISTORY" — but neither actually can: this is a
-- BEFORE trigger, so it unconditionally overwrites whatever total_pay/
-- effective_rate/base_hourly_rate the client sent, re-pricing the ENTIRE
-- shift at the driver's live profile rate every time. If a driver's rate
-- changes after a shift closes, and that shift row is ever updated again
-- for any reason (adding a night-out allowance, fixing a clock time),
-- its historical pay silently changes. This migration adds an explicit,
-- named rate snapshot and rewrites the trigger so once a shift is
-- locked, its rate can only change via a deliberate manager override
-- (signalled by the client sending a fresh rate_snapshot_timestamp),
-- never as a side effect of an unrelated edit.
-- ============================================================

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS applied_rate_type TEXT
    CHECK (applied_rate_type IN ('hourly', 'fixed_shift')),
  ADD COLUMN IF NOT EXISTS applied_rate_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS rate_snapshot_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deduction_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS deduction_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_micro_shift_override BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payroll_notes TEXT;

-- ── Best-effort backfill for shifts completed before this migration ──
-- There is no way to recover the TRUE moment a pre-existing shift's rate
-- was actually locked in (that information was never recorded), so
-- rate_snapshot_timestamp is backfilled to updated_at as an honest
-- approximation, not a claim of the real historical instant. The rate
-- amount itself (applied_rate_amount) IS real — it's exactly what
-- effective_rate/base_hourly_rate already held. Whether it was fixed or
-- hourly is inferred from the stored numbers themselves (a flat rate
-- shift's pay minus its adjustments equals the rate exactly, regardless
-- of hours worked; an hourly shift's does not) rather than guessed.
-- (night_out_allowance does not exist on the live table despite
-- migration 024's intent — night_out_amount is the real, populated
-- column everywhere in this codebase; confirmed against live schema.)
UPDATE public.shifts
SET
  applied_rate_amount = COALESCE(effective_rate, base_hourly_rate),
  applied_rate_type = CASE
    WHEN total_hours IS NOT NULL AND total_hours > 0.01
      AND ABS(
        COALESCE(total_pay, 0)
        - COALESCE(night_out_amount, 0)
        - COALESCE(extras_amount, 0)
        - COALESCE(effective_rate, base_hourly_rate, 0)
      ) < 0.02
    THEN 'fixed_shift'
    ELSE 'hourly'
  END,
  rate_snapshot_timestamp = COALESCE(updated_at, created_at, now())
WHERE status = 'completed'
  AND total_pay IS NOT NULL
  AND rate_snapshot_timestamp IS NULL
  AND COALESCE(effective_rate, base_hourly_rate) IS NOT NULL;

-- ============================================================
-- Rewritten trigger function. Three cases per write:
--
--   1. Never locked before (a fresh shift, or its first-ever
--      completion): derive the rate from the driver's CURRENT profile,
--      same as migration 034 always did, and lock it.
--   2. Already locked, ordinary edit (night out / bonus / deduction /
--      a clock-time correction / anything else): the locked rate is
--      copied forward completely untouched. Only total_hours (from the
--      real start/end times) and the adjustment fields move total_pay.
--   3. Already locked, MANAGER OVERRIDE: the client explicitly sends a
--      new rate_snapshot_timestamp together with new applied_rate_type/
--      applied_rate_amount (the "Override Base Rate" toggle in the
--      Edit Payroll drawer) — trusted as-is, and this becomes the new
--      locked truth from this point forward.
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
  v_already_locked BOOLEAN;
  v_manager_relock BOOLEAN;
  v_frozen BOOLEAN;
  v_wage_component NUMERIC(10,2);
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
    NEW.total_hours := ROUND(
      EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0,
      2
    );

    IF NEW.total_hours < 0 THEN
      RAISE EXCEPTION 'Shift end_time (%) is before start_time (%)', NEW.end_time, NEW.start_time;
    END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
