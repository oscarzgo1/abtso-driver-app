-- ============================================================
-- ABTSO Logistics — Migration 010: Dynamic Rate Trigger & Missing Columns Fix
-- ============================================================

-- 1. Ensure night_out_status and night_out_amount columns exist on public.shifts
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS night_out_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS night_out_amount NUMERIC(10,2) DEFAULT 0.00;

-- 2. Helper function for ISO week number
CREATE OR REPLACE FUNCTION public.get_iso_week_number(p_date DATE)
RETURNS INTEGER AS $$
BEGIN
  RETURN EXTRACT(WEEK FROM p_date)::INTEGER;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Helper function for ISO week year
CREATE OR REPLACE FUNCTION public.get_iso_week_year(p_date DATE)
RETURNS INTEGER AS $$
BEGIN
  RETURN EXTRACT(ISOYEAR FROM p_date)::INTEGER;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger Function calculate_shift_financials
CREATE OR REPLACE FUNCTION public.calculate_shift_financials()
RETURNS TRIGGER AS $$
DECLARE
  v_week_number INTEGER;
  v_week_year INTEGER;
  v_current_dow INTEGER;
  v_mon_fri_rate NUMERIC(10,2) := 16.00;
  v_sat_rate NUMERIC(10,2) := 17.00;
  v_sun_rate NUMERIC(10,2) := 18.00;
  v_rate_rec RECORD;
  v_driver_hourly_rate NUMERIC(10,2);
  v_night_out_pay NUMERIC(10,2) := 0.00;
BEGIN
  -- Standard PostgreSQL EXTRACT
  v_week_number := EXTRACT(WEEK FROM NEW.start_time)::INTEGER;
  v_week_year := EXTRACT(ISOYEAR FROM NEW.start_time)::INTEGER;
  v_current_dow := EXTRACT(ISODOW FROM NEW.start_time);

  -- Default fallback rates
  v_mon_fri_rate := 16.00;
  v_sat_rate := 17.00;
  v_sun_rate := 18.00;

  -- Safely attempt to fetch custom rates using IF FOUND
  BEGIN
    SELECT * INTO v_rate_rec
    FROM public.employee_rates
    WHERE driver_id = NEW.driver_id;

    IF FOUND THEN
      v_mon_fri_rate := COALESCE(v_rate_rec.mon_fri_rate, 16.00);
      v_sat_rate := COALESCE(v_rate_rec.sat_rate, v_mon_fri_rate + 1.00);
      v_sun_rate := COALESCE(v_rate_rec.sun_rate, v_mon_fri_rate + 2.00);
    ELSE
      -- Fallback: check hourly_rate on drivers table
      SELECT hourly_rate INTO v_driver_hourly_rate
      FROM public.drivers
      WHERE id = NEW.driver_id;

      IF FOUND AND v_driver_hourly_rate IS NOT NULL THEN
        v_mon_fri_rate := v_driver_hourly_rate;
        v_sat_rate := v_driver_hourly_rate + 1.00;
        v_sun_rate := v_driver_hourly_rate + 2.00;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Table employee_rates may not exist yet, fallback safely
    BEGIN
      SELECT hourly_rate INTO v_driver_hourly_rate
      FROM public.drivers
      WHERE id = NEW.driver_id;

      IF FOUND AND v_driver_hourly_rate IS NOT NULL THEN
        v_mon_fri_rate := v_driver_hourly_rate;
        v_sat_rate := v_driver_hourly_rate + 1.00;
        v_sun_rate := v_driver_hourly_rate + 2.00;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  NEW.week_number := v_week_number;
  NEW.week_year := v_week_year;

  -- Dynamically set base_hourly_rate based on day of week (DOW)
  CASE v_current_dow
    WHEN 7 THEN NEW.base_hourly_rate := v_sun_rate;
    WHEN 6 THEN NEW.base_hourly_rate := v_sat_rate;
    ELSE        NEW.base_hourly_rate := v_mon_fri_rate;
  END CASE;

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

    NEW.effective_rate := NEW.base_hourly_rate;

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

    NEW.total_pay := ROUND((NEW.total_hours * NEW.base_hourly_rate) + v_night_out_pay, 2);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
