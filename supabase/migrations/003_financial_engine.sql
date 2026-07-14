-- ============================================================
-- ABTSO Logistics — Migration 003: Financial Engine
-- ============================================================
-- This implements the core pay calculation logic:
--   • Base rate: £16/hr (Mon-Fri), £17/hr (Sat), £18/hr (Sun)
--   • Override: If driver works Fri+Sat+Sun in the same ISO week,
--     ALL three days retroactively become £18/hr
-- ============================================================

-- ------------------------------------------------------------
-- Function: Get base hourly rate for a given date
-- Uses ISODOW: 1=Monday ... 5=Friday, 6=Saturday, 7=Sunday
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_base_rate(shift_date DATE)
RETURNS NUMERIC(10,2) AS $$
DECLARE
  v_day_of_week INTEGER;
  v_config RECORD;
BEGIN
  SELECT * INTO v_config
  FROM public.rate_configurations
  WHERE is_active = true
  ORDER BY effective_from DESC
  LIMIT 1;

  IF v_config IS NULL THEN
    RAISE EXCEPTION 'No active rate configuration found';
  END IF;

  v_day_of_week := EXTRACT(ISODOW FROM shift_date);

  CASE v_day_of_week
    WHEN 7 THEN RETURN v_config.sunday_rate;       -- Sunday  → £18
    WHEN 6 THEN RETURN v_config.saturday_rate;      -- Saturday → £17
    ELSE        RETURN v_config.weekday_rate;       -- Mon-Fri → £16
  END CASE;
END;
$$ LANGUAGE plpgsql STABLE;

-- ------------------------------------------------------------
-- Function: Get day type string for a given date
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_day_type(shift_date DATE)
RETURNS TEXT AS $$
DECLARE
  v_dow INTEGER;
BEGIN
  v_dow := EXTRACT(ISODOW FROM shift_date);
  CASE v_dow
    WHEN 7 THEN RETURN 'sunday';
    WHEN 6 THEN RETURN 'saturday';
    ELSE        RETURN 'weekday';
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ------------------------------------------------------------
-- Trigger Function: Calculate rates + apply Fri-Sat-Sun override
-- 
-- Fires BEFORE INSERT OR UPDATE on shifts.
-- When a shift is completed (status → 'completed' with end_time):
--   1. Sets day_type, week_number, week_year
--   2. Calculates total_hours from time difference
--   3. Looks up base_hourly_rate from rate_configurations
--   4. Checks if Fri+Sat+Sun all exist for this driver+week
--   5. If override → sets ALL three to £18/hr retroactively
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_shift_financials()
RETURNS TRIGGER AS $$
DECLARE
  v_week_number INTEGER;
  v_week_year INTEGER;
  v_has_friday BOOLEAN := false;
  v_has_saturday BOOLEAN := false;
  v_has_sunday BOOLEAN := false;
  v_override_rate NUMERIC(10,2);
  v_current_dow INTEGER;
BEGIN
  -- Always set metadata on the shift
  v_week_number := EXTRACT(WEEK FROM NEW.start_time);
  v_week_year := EXTRACT(ISOYEAR FROM NEW.start_time)::INTEGER;
  v_current_dow := EXTRACT(ISODOW FROM NEW.start_time);

  NEW.week_number := v_week_number;
  NEW.week_year := v_week_year;
  NEW.day_type := public.get_day_type(NEW.start_time::DATE);
  NEW.base_hourly_rate := public.get_base_rate(NEW.start_time::DATE);
  NEW.updated_at := now();

  -- Only run financial calculations when the shift is being completed
  IF NEW.status = 'completed' AND NEW.end_time IS NOT NULL THEN

    -- 1. Calculate total hours worked
    NEW.total_hours := ROUND(
      EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0,
      2
    );

    -- Safety: prevent negative hours
    IF NEW.total_hours < 0 THEN
      RAISE EXCEPTION 'Shift end_time (%) is before start_time (%)',
        NEW.end_time, NEW.start_time;
    END IF;

    -- 2. Check if this driver has worked Fri+Sat+Sun in the same ISO week
    --    Include the CURRENT shift being inserted/updated
    SELECT
      COALESCE(bool_or(EXTRACT(ISODOW FROM start_time) = 5), false) INTO v_has_friday
    FROM public.shifts
    WHERE driver_id = NEW.driver_id
      AND week_year = v_week_year
      AND week_number = v_week_number
      AND status = 'completed'
      AND id != NEW.id;

    SELECT
      COALESCE(bool_or(EXTRACT(ISODOW FROM start_time) = 6), false) INTO v_has_saturday
    FROM public.shifts
    WHERE driver_id = NEW.driver_id
      AND week_year = v_week_year
      AND week_number = v_week_number
      AND status = 'completed'
      AND id != NEW.id;

    SELECT
      COALESCE(bool_or(EXTRACT(ISODOW FROM start_time) = 7), false) INTO v_has_sunday
    FROM public.shifts
    WHERE driver_id = NEW.driver_id
      AND week_year = v_week_year
      AND week_number = v_week_number
      AND status = 'completed'
      AND id != NEW.id;

    -- Also account for the current shift's day
    IF v_current_dow = 5 THEN v_has_friday := true; END IF;
    IF v_current_dow = 6 THEN v_has_saturday := true; END IF;
    IF v_current_dow = 7 THEN v_has_sunday := true; END IF;

    -- 3. Apply override if all three weekend days are present
    IF v_has_friday AND v_has_saturday AND v_has_sunday THEN
      -- Get the override rate from configuration
      SELECT fri_sat_sun_override_rate INTO v_override_rate
      FROM public.rate_configurations
      WHERE is_active = true
      ORDER BY effective_from DESC
      LIMIT 1;

      -- Apply to THIS shift (if it's Fri/Sat/Sun)
      IF v_current_dow IN (5, 6, 7) THEN
        NEW.override_rate := v_override_rate;
        NEW.effective_rate := v_override_rate;
        NEW.total_pay := ROUND(NEW.total_hours * v_override_rate, 2);
      ELSE
        -- This shift is Mon-Thu but triggered the check; use base rate
        NEW.effective_rate := NEW.base_hourly_rate;
        NEW.total_pay := ROUND(NEW.total_hours * NEW.base_hourly_rate, 2);
      END IF;

      -- RETROACTIVELY update the OTHER Fri/Sat/Sun shifts in this week
      UPDATE public.shifts
      SET override_rate = v_override_rate,
          effective_rate = v_override_rate,
          total_pay = ROUND(total_hours * v_override_rate, 2),
          updated_at = now()
      WHERE driver_id = NEW.driver_id
        AND week_year = v_week_year
        AND week_number = v_week_number
        AND EXTRACT(ISODOW FROM start_time) IN (5, 6, 7)
        AND id != NEW.id
        AND status = 'completed'
        AND (override_rate IS NULL OR override_rate != v_override_rate);

    ELSE
      -- No override — use base rate
      NEW.override_rate := NULL;
      NEW.effective_rate := NEW.base_hourly_rate;
      NEW.total_pay := ROUND(NEW.total_hours * NEW.base_hourly_rate, 2);
    END IF;

  ELSIF NEW.status = 'active' THEN
    -- Shift just started — set preliminary rate, no pay yet
    NEW.effective_rate := NEW.base_hourly_rate;
    NEW.total_hours := NULL;
    NEW.total_pay := NULL;
    NEW.override_rate := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger
CREATE TRIGGER trg_shift_financials
  BEFORE INSERT OR UPDATE ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_shift_financials();

-- ============================================================
-- Test the financial engine with sample data:
--
-- 1. Insert a Friday shift:
--    INSERT INTO shifts (driver_id, start_time, end_time, status)
--    VALUES ('<driver-uuid>', '2026-07-03 08:00+01', '2026-07-03 16:00+01', 'completed');
--    → Should get £16/hr (Friday = weekday)
--
-- 2. Insert a Saturday shift:
--    → Should get £17/hr
--
-- 3. Insert a Sunday shift:
--    → Should get £18/hr AND retroactively update Fri+Sat to £18/hr
-- ============================================================
