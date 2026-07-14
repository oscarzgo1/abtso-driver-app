-- ============================================================
-- Migration 007: Dynamic Employee Hourly Rates
-- ============================================================

-- 1. Add hourly_rate column to public.drivers (employees)
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2);

-- 2. Redefine trigger function to check for custom hourly_rate on weekdays
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
  v_custom_rate NUMERIC(10,2);
BEGIN
  -- Extract week properties based on Sunday-start cycle (adding 1 day)
  v_week_number := EXTRACT(WEEK FROM NEW.start_time + INTERVAL '1 day');
  v_week_year := EXTRACT(ISOYEAR FROM NEW.start_time + INTERVAL '1 day')::INTEGER;
  v_current_dow := EXTRACT(ISODOW FROM NEW.start_time);

  -- Fetch the custom hourly rate of the employee/driver if set
  SELECT hourly_rate INTO v_custom_rate FROM public.drivers WHERE id = NEW.driver_id;

  NEW.week_number := v_week_number;
  NEW.week_year := v_week_year;
  NEW.day_type := public.get_day_type(NEW.start_time::DATE);
  
  -- Set base hourly rate: custom rate applies ONLY to weekdays (Mon-Fri).
  -- Saturdays (£17.00) and Sundays (£18.00) use default rate configurations.
  IF v_custom_rate IS NOT NULL AND v_current_dow IN (1, 2, 3, 4, 5) THEN
    NEW.base_hourly_rate := v_custom_rate;
  ELSE
    NEW.base_hourly_rate := public.get_base_rate(NEW.start_time::DATE);
  END IF;
  
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

    -- 2. Determine final pay
    IF v_custom_rate IS NOT NULL THEN
      -- Custom rate employee: Mon-Fri gets custom rate; Saturday gets £17.00, Sunday gets £18.00. No weekend overrides apply.
      NEW.effective_rate := NEW.base_hourly_rate;
      NEW.total_pay := ROUND(NEW.total_hours * NEW.base_hourly_rate, 2);
    ELSE
      -- Check if standard driver worked Fri+Sat+Sun in same Sunday-start week
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

      -- Account for current shift's day type
      IF v_current_dow = 5 THEN v_has_friday := true; END IF;
      IF v_current_dow = 6 THEN v_has_saturday := true; END IF;
      IF v_current_dow = 7 THEN v_has_sunday := true; END IF;

      -- Apply retroactive override if Fri+Sat+Sun weekend days are all completed
      IF v_has_friday AND v_has_saturday AND v_has_sunday THEN
        SELECT fri_sat_sun_override_rate INTO v_override_rate
        FROM public.rate_configurations
        WHERE is_active = true
        ORDER BY effective_from DESC
        LIMIT 1;

        IF v_current_dow IN (5, 6, 7) THEN
          NEW.override_rate := v_override_rate;
          NEW.effective_rate := v_override_rate;
          NEW.total_pay := ROUND(NEW.total_hours * v_override_rate, 2);
        ELSE
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
        NEW.override_rate := NULL;
        NEW.effective_rate := NEW.base_hourly_rate;
        NEW.total_pay := ROUND(NEW.total_hours * NEW.base_hourly_rate, 2);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
