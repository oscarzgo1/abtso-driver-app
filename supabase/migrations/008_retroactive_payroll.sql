-- ============================================================
-- Migration 008: Retroactive Payroll Logic & Rate Profiles
-- ============================================================

-- 1. Add rate_profile column to public.drivers (employees)
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS rate_profile VARCHAR(10) NOT NULL DEFAULT 'LWR';

-- 2. Create weekly_rate_overrides table to store manual rate locks
CREATE TABLE IF NOT EXISTS public.weekly_rate_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL, -- Sunday baseline date
  locked_rate NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(driver_id, week_start_date)
);

-- 3. Redefine calculate_shift_financials trigger function
CREATE OR REPLACE FUNCTION public.calculate_shift_financials()
RETURNS TRIGGER AS $$
DECLARE
  v_week_start_date DATE;
  v_has_saturday BOOLEAN := false;
  v_has_sunday BOOLEAN := false;
  v_current_dow INTEGER;
  v_rate_profile VARCHAR(10);
  v_locked_rate NUMERIC(10,2);
  v_shift_rate NUMERIC(10,2);
  v_highest_rate NUMERIC(10,2);
BEGIN
  -- Extract properties: Sunday-start week grouping
  -- EXTRACT(DOW FROM start_time) returns 0 for Sunday, 6 for Saturday
  v_current_dow := EXTRACT(DOW FROM NEW.start_time)::INTEGER;
  v_week_start_date := NEW.start_time::DATE - v_current_dow;

  -- Fetch the employee's rate profile (LWR or HIR)
  SELECT COALESCE(rate_profile, 'LWR') INTO v_rate_profile 
  FROM public.drivers 
  WHERE id = NEW.driver_id;

  -- Fetch manual weekly rate override lock if exists
  SELECT locked_rate INTO v_locked_rate 
  FROM public.weekly_rate_overrides 
  WHERE driver_id = NEW.driver_id 
    AND week_start_date = v_week_start_date;

  -- Calculate the individual shift rate based on day of week and profile
  -- Mon-Fri (DOW 1 to 5): LWR = 16, HIR = 17
  -- Sat (DOW 6): LWR = 17, HIR = 18
  -- Sun (DOW 0): LWR = 18, HIR = 19
  IF v_rate_profile = 'HIR' THEN
    IF v_current_dow = 0 THEN v_shift_rate := 19.00;
    ELSIF v_current_dow = 6 THEN v_shift_rate := 18.00;
    ELSE v_shift_rate := 17.00;
    END IF;
  ELSE -- Default LWR
    IF v_current_dow = 0 THEN v_shift_rate := 18.00;
    ELSIF v_current_dow = 6 THEN v_shift_rate := 17.00;
    ELSE v_shift_rate := 16.00;
    END IF;
  END IF;

  NEW.base_hourly_rate := v_shift_rate;
  NEW.week_number := EXTRACT(WEEK FROM NEW.start_time + INTERVAL '1 day');
  NEW.week_year := EXTRACT(ISOYEAR FROM NEW.start_time + INTERVAL '1 day')::INTEGER;
  NEW.day_type := public.get_day_type(NEW.start_time::DATE);
  NEW.updated_at := now();

  -- Financial engine evaluates only upon shift completion
  IF NEW.status = 'completed' AND NEW.end_time IS NOT NULL THEN
    -- 1. Calculate shift duration
    NEW.total_hours := ROUND(
      EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0,
      2
    );

    IF NEW.total_hours < 0 THEN
      RAISE EXCEPTION 'Shift end_time (%) is before start_time (%)',
        NEW.end_time, NEW.start_time;
    END IF;

    -- 2. Determine effective rate and total pay
    IF v_locked_rate IS NOT NULL THEN
      -- Manual rate lock overrides retroactive calculations
      NEW.effective_rate := v_locked_rate;
      NEW.total_pay := ROUND(NEW.total_hours * v_locked_rate, 2);

      -- Retroactively update all other completed shifts in same week to locked rate
      UPDATE public.shifts
      SET effective_rate = v_locked_rate,
          total_pay = ROUND(total_hours * v_locked_rate, 2),
          updated_at = now()
      WHERE driver_id = NEW.driver_id
        AND (start_time::DATE - EXTRACT(DOW FROM start_time)::INTEGER) = v_week_start_date
        AND id != NEW.id
        AND status = 'completed';
    ELSE
      -- "Highest Day Wins" retroactive calculations
      SELECT COALESCE(bool_or(EXTRACT(DOW FROM start_time) = 0), false) INTO v_has_sunday
      FROM public.shifts
      WHERE driver_id = NEW.driver_id
        AND (start_time::DATE - EXTRACT(DOW FROM start_time)::INTEGER) = v_week_start_date
        AND status = 'completed'
        AND id != NEW.id;

      SELECT COALESCE(bool_or(EXTRACT(DOW FROM start_time) = 6), false) INTO v_has_saturday
      FROM public.shifts
      WHERE driver_id = NEW.driver_id
        AND (start_time::DATE - EXTRACT(DOW FROM start_time)::INTEGER) = v_week_start_date
        AND status = 'completed'
        AND id != NEW.id;

      -- Factor in current shift's day
      IF v_current_dow = 0 THEN v_has_sunday := true; END IF;
      IF v_current_dow = 6 THEN v_has_saturday := true; END IF;

      -- Evaluate highest rate achieved this week
      IF v_rate_profile = 'HIR' THEN
        IF v_has_sunday THEN v_highest_rate := 19.00;
        ELSIF v_has_saturday THEN v_highest_rate := 18.00;
        ELSE v_highest_rate := 17.00;
        END IF;
      ELSE -- LWR
        IF v_has_sunday THEN v_highest_rate := 18.00;
        ELSIF v_has_saturday THEN v_highest_rate := 17.00;
        ELSE v_highest_rate := 16.00;
        END IF;
      END IF;

      NEW.effective_rate := v_highest_rate;
      NEW.total_pay := ROUND(NEW.total_hours * v_highest_rate, 2);

      -- Retroactively update all other completed shifts in same week to new highest rate
      UPDATE public.shifts
      SET effective_rate = v_highest_rate,
          total_pay = ROUND(total_hours * v_highest_rate, 2),
          updated_at = now()
      WHERE driver_id = NEW.driver_id
        AND (start_time::DATE - EXTRACT(DOW FROM start_time)::INTEGER) = v_week_start_date
        AND id != NEW.id
        AND status = 'completed';
    END IF;
  ELSE
    -- Preliminary shift state (clocked in)
    NEW.effective_rate := v_shift_rate;
    NEW.total_hours := NULL;
    NEW.total_pay := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
