-- ============================================================
-- ABTSO Logistics — Migration 010: Dynamic Rate Trigger Fix
-- ============================================================
-- Replaces calculate_shift_financials trigger function to lookup
-- mon_fri_rate, sat_rate, sun_rate from public.employee_rates
-- dynamically by driver_id and day of week.
-- Removes all hardcoded generic rate profiles (16, 17, 18, 19).
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
  v_rate_rec RECORD;
  v_driver_hourly_rate NUMERIC(10,2);
  v_night_out_pay NUMERIC(10,2) := 0.00;
BEGIN
  v_week_number := public.get_iso_week_number(NEW.start_time::DATE);
  v_week_year := public.get_iso_week_year(NEW.start_time::DATE);
  v_current_dow := EXTRACT(ISODOW FROM NEW.start_time);

  -- 1. Fetch custom rates from employee_rates table
  SELECT mon_fri_rate, sat_rate, sun_rate INTO v_rate_rec
  FROM public.employee_rates
  WHERE driver_id = NEW.driver_id;

  IF v_rate_rec IS NOT NULL AND v_rate_rec.mon_fri_rate IS NOT NULL THEN
    v_mon_fri_rate := v_rate_rec.mon_fri_rate;
    v_sat_rate := COALESCE(v_rate_rec.sat_rate, v_mon_fri_rate + 1.00);
    v_sun_rate := COALESCE(v_rate_rec.sun_rate, v_mon_fri_rate + 2.00);
  ELSE
    -- Fallback: check hourly_rate on public.drivers table
    SELECT hourly_rate INTO v_driver_hourly_rate
    FROM public.drivers
    WHERE id = NEW.driver_id;

    IF v_driver_hourly_rate IS NOT NULL THEN
      v_mon_fri_rate := v_driver_hourly_rate;
      v_sat_rate := v_driver_hourly_rate + 1.00;
      v_sun_rate := v_driver_hourly_rate + 2.00;
    END IF;
  END IF;

  NEW.week_number := v_week_number;
  NEW.week_year := v_week_year;

  -- 2. Dynamically set base_hourly_rate based on day of week (DOW)
  CASE v_current_dow
    WHEN 7 THEN NEW.base_hourly_rate := v_sun_rate;
    WHEN 6 THEN NEW.base_hourly_rate := v_sat_rate;
    ELSE        NEW.base_hourly_rate := v_mon_fri_rate;
  END CASE;

  NEW.updated_at := now();

  -- 3. Calculate total hours and total pay when shift is completed
  IF NEW.status = 'completed' AND NEW.end_time IS NOT NULL THEN
    NEW.total_hours := ROUND(
      EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0,
      2
    );

    IF NEW.total_hours < 0 THEN
      RAISE EXCEPTION 'Shift end_time (%) is before start_time (%)', NEW.end_time, NEW.start_time;
    END IF;

    NEW.effective_rate := NEW.base_hourly_rate;

    -- Add Night Out allowance if approved
    IF NEW.night_out_status = 'approved' THEN
      v_night_out_pay := COALESCE(NEW.night_out_amount, 25.00);
      IF v_night_out_pay = 0.00 THEN
        v_night_out_pay := 25.00;
        NEW.night_out_amount := 25.00;
      END IF;
    ELSE
      v_night_out_pay := 0.00;
    END IF;

    NEW.total_pay := ROUND((NEW.total_hours * NEW.base_hourly_rate) + v_night_out_pay, 2);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
