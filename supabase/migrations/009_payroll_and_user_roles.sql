-- ============================================================
-- Migration 009: User Roles, Employee Rates, Night Out & Payroll Sync
-- ============================================================

-- 1. USER ROLES TABLE & HELPER FUNCTIONS
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('logistics', 'payroll_admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Helper function: get user role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE email = auth.email() OR user_id = auth.uid()
  LIMIT 1;

  RETURN COALESCE(v_role, 'logistics');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: check if user is payroll_admin
CREATE OR REPLACE FUNCTION public.is_payroll_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (public.get_user_role() = 'payroll_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS policies for user_roles
CREATE POLICY "user_roles_read_own"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (email = auth.email() OR user_id = auth.uid() OR public.is_payroll_admin());

CREATE POLICY "user_roles_admin_all"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.is_payroll_admin())
  WITH CHECK (public.is_payroll_admin());


-- 2. EMPLOYEE RATES TABLE
CREATE TABLE IF NOT EXISTS public.employee_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE UNIQUE,
  rate_type TEXT NOT NULL DEFAULT 'Hourly Sat/Sun separate'
    CHECK (rate_type IN ('Hourly Sat/Sun separate', 'Fixed weekly')),
  mon_fri_rate NUMERIC(10,2) NOT NULL DEFAULT 16.00,
  sat_rate NUMERIC(10,2) NOT NULL DEFAULT 17.00,
  sun_rate NUMERIC(10,2) NOT NULL DEFAULT 18.00,
  agency_name TEXT DEFAULT 'Direct',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_rates ENABLE ROW LEVEL SECURITY;

-- RLS policies for employee_rates: ONLY payroll_admin can access/modify
CREATE POLICY "employee_rates_payroll_admin_all"
  ON public.employee_rates FOR ALL
  TO authenticated
  USING (public.is_payroll_admin())
  WITH CHECK (public.is_payroll_admin());


-- 3. SHIFTS TABLE MODIFICATIONS
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS night_out_status TEXT NOT NULL DEFAULT 'none'
    CHECK (night_out_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS night_out_amount NUMERIC(10,2) DEFAULT 0.00;


-- 4. RPC FUNCTION: REQUEST NIGHT OUT (Driver)
CREATE OR REPLACE FUNCTION public.request_night_out(p_shift_id UUID)
RETURNS JSON AS $$
DECLARE
  v_driver_id UUID;
  v_shift RECORD;
BEGIN
  v_driver_id := (SELECT auth.uid());

  IF v_driver_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Unauthorized: Driver authentication required.'
    );
  END IF;

  -- Verify active shift belonging to this driver
  SELECT * INTO v_shift
  FROM public.shifts
  WHERE id = p_shift_id
    AND driver_id = v_driver_id
    AND status = 'active';

  IF v_shift IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Night Out can only be requested during an active shift.'
    );
  END IF;

  UPDATE public.shifts
  SET night_out_status = 'pending',
      updated_at = now()
  WHERE id = p_shift_id;

  RETURN json_build_object(
    'success', true,
    'shift_id', p_shift_id,
    'night_out_status', 'pending'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. RPC FUNCTION: UPDATE NIGHT OUT STATUS (Payroll Admin)
CREATE OR REPLACE FUNCTION public.update_night_out_status(
  p_shift_id UUID,
  p_status TEXT,
  p_amount NUMERIC DEFAULT 25.00
)
RETURNS JSON AS $$
BEGIN
  IF NOT public.is_payroll_admin() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Unauthorized: Payroll Admin privileges required.'
    );
  END IF;

  IF p_status NOT IN ('none', 'pending', 'approved', 'rejected') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid night_out_status value.'
    );
  END IF;

  UPDATE public.shifts
  SET night_out_status = p_status,
      night_out_amount = CASE WHEN p_status = 'approved' THEN p_amount ELSE 0.00 END,
      updated_at = now()
  WHERE id = p_shift_id;

  -- Re-trigger financials recalculation if completed
  UPDATE public.shifts
  SET updated_at = now()
  WHERE id = p_shift_id;

  RETURN json_build_object(
    'success', true,
    'shift_id', p_shift_id,
    'night_out_status', p_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. UPDATED TRIGGER FUNCTION: CALCULATE SHIFT FINANCIALS
CREATE OR REPLACE FUNCTION public.calculate_shift_financials()
RETURNS TRIGGER AS $$
DECLARE
  v_week_number INTEGER;
  v_week_year INTEGER;
  v_current_dow INTEGER;
  v_rate_rec RECORD;
  v_mon_fri_rate NUMERIC(10,2) := 16.00;
  v_sat_rate NUMERIC(10,2) := 17.00;
  v_sun_rate NUMERIC(10,2) := 18.00;
  v_night_out_pay NUMERIC(10,2) := 0.00;
BEGIN
  v_week_number := EXTRACT(WEEK FROM NEW.start_time + INTERVAL '1 day');
  v_week_year := EXTRACT(ISOYEAR FROM NEW.start_time + INTERVAL '1 day')::INTEGER;
  v_current_dow := EXTRACT(ISODOW FROM NEW.start_time);

  -- Fetch driver custom rate profile from employee_rates if exists
  SELECT * INTO v_rate_rec
  FROM public.employee_rates
  WHERE driver_id = NEW.driver_id;

  IF v_rate_rec IS NOT NULL THEN
    v_mon_fri_rate := v_rate_rec.mon_fri_rate;
    v_sat_rate := v_rate_rec.sat_rate;
    v_sun_rate := v_rate_rec.sun_rate;
  END IF;

  NEW.week_number := v_week_number;
  NEW.week_year := v_week_year;
  NEW.day_type := public.get_day_type(NEW.start_time::DATE);

  -- Determine base hourly rate by day of week
  CASE v_current_dow
    WHEN 7 THEN NEW.base_hourly_rate := v_sun_rate;
    WHEN 6 THEN NEW.base_hourly_rate := v_sat_rate;
    ELSE        NEW.base_hourly_rate := v_mon_fri_rate;
  END CASE;

  NEW.updated_at := now();

  -- Only run financial calculations when shift is completed
  IF NEW.status = 'completed' AND NEW.end_time IS NOT NULL THEN

    -- Calculate total hours worked
    NEW.total_hours := ROUND(
      EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0,
      2
    );

    IF NEW.total_hours < 0 THEN
      RAISE EXCEPTION 'Shift end_time (%) is before start_time (%)', NEW.end_time, NEW.start_time;
    END IF;

    NEW.effective_rate := NEW.base_hourly_rate;

    -- Add Night Out bonus if approved
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


-- 7. UPDATED END SHIFT RPC FUNCTION
CREATE OR REPLACE FUNCTION public.end_shift(
  p_shift_id UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION
)
RETURNS JSON AS $$
DECLARE
  v_driver_id UUID;
  v_depot_id UUID;
  v_shift RECORD;
  v_updated_shift RECORD;
BEGIN
  v_driver_id := (SELECT auth.uid());

  IF v_driver_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Unauthorized: Driver authentication required.'
    );
  END IF;

  SELECT * INTO v_shift
  FROM public.shifts
  WHERE id = p_shift_id
    AND driver_id = v_driver_id
    AND status = 'active';

  IF v_shift IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No active shift found with this ID.'
    );
  END IF;

  v_depot_id := public.validate_geofence(p_latitude, p_longitude);

  IF v_depot_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You must be within 10m of a depot to end your shift.'
    );
  END IF;

  UPDATE public.shifts
  SET end_time = now(),
      end_lat = p_latitude,
      end_lng = p_longitude,
      status = 'completed'
  WHERE id = p_shift_id
  RETURNING * INTO v_updated_shift;

  RETURN json_build_object(
    'success', true,
    'shift_id', v_updated_shift.id,
    'total_hours', v_updated_shift.total_hours,
    'effective_rate', v_updated_shift.effective_rate,
    'total_pay', v_updated_shift.total_pay,
    'night_out_status', v_updated_shift.night_out_status,
    'night_out_amount', v_updated_shift.night_out_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
