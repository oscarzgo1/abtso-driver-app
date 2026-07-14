-- ============================================================
-- ABTSO Logistics â€” Migration 001: Enable Extensions
-- ============================================================
-- PostGIS: For geography/geometry types and spatial queries
-- pgcrypto: For gen_random_uuid() and crypt/gen_salt (PIN hashing)
-- pg_cron: For scheduled idle detection jobs
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Note: pg_cron must be enabled via the Supabase Dashboard
-- (Database â†’ Extensions â†’ pg_cron â†’ Enable)
-- ============================================================
-- ABTSO Logistics â€” Migration 002: Create Tables
-- ============================================================

-- ------------------------------------------------------------
-- 1. DEPOTS â€” The two UK depot locations
-- ------------------------------------------------------------
CREATE TABLE public.depots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  location GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED,
  geofence_radius_m INTEGER NOT NULL DEFAULT 10,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the two depots with placeholder UK coordinates
-- >>> UPDATE THESE with your actual Base A and Base B coordinates <<<
INSERT INTO public.depots (name, latitude, longitude, geofence_radius_m, address) VALUES
  ('Rossington Depot', 53.481798, -1.086552, 10, 'Rossington Base'),
  ('Wheatley Depot', 53.550248, -1.091061, 10, 'Wheatley Base');

-- ------------------------------------------------------------
-- 2. RATE CONFIGURATIONS â€” Configurable pay rates
-- ------------------------------------------------------------
CREATE TABLE public.rate_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  weekday_rate NUMERIC(10,2) NOT NULL DEFAULT 16.00,
  saturday_rate NUMERIC(10,2) NOT NULL DEFAULT 17.00,
  sunday_rate NUMERIC(10,2) NOT NULL DEFAULT 18.00,
  fri_sat_sun_override_rate NUMERIC(10,2) NOT NULL DEFAULT 18.00,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default rate configuration
INSERT INTO public.rate_configurations (name, weekday_rate, saturday_rate, sunday_rate, fri_sat_sun_override_rate)
VALUES ('Standard 2026', 16.00, 17.00, 18.00, 18.00);

-- ------------------------------------------------------------
-- 3. DRIVERS â€” Driver accounts (simple ID + PIN auth)
-- ------------------------------------------------------------
CREATE TABLE public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id VARCHAR(20) UNIQUE NOT NULL,          -- Human-readable, e.g. "DRV-001"
  pin_hash TEXT NOT NULL,                          -- bcrypt hash of PIN
  full_name TEXT NOT NULL,
  phone TEXT,
  hourly_rate NUMERIC(10,2),                      -- Custom hourly rate for dynamic rate management
  rate_profile VARCHAR(10) NOT NULL DEFAULT 'LWR', -- LWR or HIR profile
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed a test driver (PIN: 1234)
INSERT INTO public.drivers (driver_id, pin_hash, full_name, phone)
VALUES (
  'DRV-001',
  crypt('1234', gen_salt('bf')),
  'John Smith (Test Driver)',
  '+44 7700 900000'
);

-- ------------------------------------------------------------
-- 4. SHIFTS â€” Core shift records
-- ------------------------------------------------------------
CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  depot_id UUID REFERENCES public.depots(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  day_type TEXT
    CHECK (day_type IN ('weekday', 'saturday', 'sunday')),
  base_hourly_rate NUMERIC(10,2),
  override_rate NUMERIC(10,2),
  effective_rate NUMERIC(10,2),
  total_hours NUMERIC(10,2),
  total_pay NUMERIC(10,2),
  week_number INTEGER,
  week_year INTEGER,
  start_lat DOUBLE PRECISION,
  start_lng DOUBLE PRECISION,
  end_lat DOUBLE PRECISION,
  end_lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.weekly_rate_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL, -- Sunday start date
  locked_rate NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(driver_id, week_start_date)
);

-- Performance indexes
CREATE INDEX idx_shifts_driver_id ON public.shifts(driver_id);
CREATE INDEX idx_shifts_week ON public.shifts(driver_id, week_year, week_number);
CREATE INDEX idx_shifts_status ON public.shifts(status);
CREATE INDEX idx_shifts_start_time ON public.shifts(start_time);

-- ------------------------------------------------------------
-- 5. GPS LOCATIONS â€” Background GPS telemetry during shifts
-- ------------------------------------------------------------
CREATE TABLE public.gps_locations (
  id BIGSERIAL PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  location GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED,
  speed NUMERIC(6,2),              -- m/s from device GPS
  accuracy NUMERIC(6,2),           -- GPS accuracy in meters
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX idx_gps_driver_shift ON public.gps_locations(driver_id, shift_id);
CREATE INDEX idx_gps_recorded_at ON public.gps_locations USING BRIN(recorded_at);
CREATE INDEX idx_gps_speed_check ON public.gps_locations(shift_id, speed, recorded_at);

-- ------------------------------------------------------------
-- 6. IDLE ALERTS â€” Generated when speed=0 for 30+ consecutive min
-- ------------------------------------------------------------
CREATE TABLE public.idle_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_idle_alerts_unack ON public.idle_alerts(acknowledged) WHERE acknowledged = false;
CREATE INDEX idx_idle_alerts_driver ON public.idle_alerts(driver_id, shift_id);

-- ------------------------------------------------------------
-- 7. ADMIN USERS â€” Admin login for the web dashboard
-- ------------------------------------------------------------
CREATE TABLE public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,                   -- bcrypt hash
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed a default admin (password: admin123 â€” CHANGE IN PRODUCTION!)
INSERT INTO public.admin_users (email, password_hash, full_name)
VALUES (
  'admin@abtso.co.uk',
  crypt('admin123', gen_salt('bf')),
  'System Administrator'
);

-- ------------------------------------------------------------
-- Trigger: Automatically hash plain-text driver PINs before save
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hash_driver_pin()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.pin_hash IS NOT NULL AND NEW.pin_hash NOT LIKE '$2a$%' AND NEW.pin_hash NOT LIKE '$2b$%' THEN
    NEW.pin_hash := crypt(NEW.pin_hash, gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_hash_driver_pin ON public.drivers;
CREATE TRIGGER trigger_hash_driver_pin
  BEFORE INSERT OR UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.hash_driver_pin();

-- ============================================================
-- ABTSO Logistics â€” Migration 003: Financial Engine
-- ============================================================
-- This implements the core pay calculation logic:
--   â€¢ Base rate: Â£16/hr (Mon-Fri), Â£17/hr (Sat), Â£18/hr (Sun)
--   â€¢ Override: If driver works Fri+Sat+Sun in the same ISO week,
--     ALL three days retroactively become Â£18/hr
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
    WHEN 7 THEN RETURN v_config.sunday_rate;       -- Sunday  â†’ Â£18
    WHEN 6 THEN RETURN v_config.saturday_rate;      -- Saturday â†’ Â£17
    ELSE        RETURN v_config.weekday_rate;       -- Mon-Fri â†’ Â£16
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
-- When a shift is completed (status â†’ 'completed' with end_time):
--   1. Sets day_type, week_number, week_year
--   2. Calculates total_hours from time difference
--   3. Looks up base_hourly_rate from rate_configurations
--   4. Checks if Fri+Sat+Sun all exist for this driver+week
--   5. If override
-- ------------------------------------------------------------
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
--    â†’ Should get Â£16/hr (Friday = weekday)
--
-- 2. Insert a Saturday shift:
--    â†’ Should get Â£17/hr
--
-- 3. Insert a Sunday shift:
--    â†’ Should get Â£18/hr AND retroactively update Fri+Sat to Â£18/hr
-- ============================================================
-- ============================================================
-- ABTSO Logistics â€” Migration 004: Row Level Security
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.depots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idle_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Helper Function: Check if the logged-in user is an administrator
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.admin_users 
    WHERE email = auth.jwt() ->> 'email'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- DEPOTS â€” Anyone authenticated can read depots
-- ============================================================
CREATE POLICY "depots_read_authenticated"
  ON public.depots FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- RATE CONFIGURATIONS â€” Anyone authenticated can read rates
-- ============================================================
CREATE POLICY "rates_read_authenticated"
  ON public.rate_configurations FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- DRIVERS â€” Admin can do everything, drivers can read own profile
-- ============================================================
CREATE POLICY "drivers_admin_all"
  ON public.drivers FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "drivers_read_own"
  ON public.drivers FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- ============================================================
-- SHIFTS â€” Admin can do everything, drivers manage own shifts
-- ============================================================
CREATE POLICY "shifts_admin_all"
  ON public.shifts FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "shifts_driver_select"
  ON public.shifts FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

CREATE POLICY "shifts_driver_insert"
  ON public.shifts FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "shifts_driver_update"
  ON public.shifts FOR UPDATE
  TO authenticated
  USING (driver_id = auth.uid());

-- ============================================================
-- GPS LOCATIONS â€” Admin can do everything, drivers manage own telemetry
-- ============================================================
CREATE POLICY "gps_admin_all"
  ON public.gps_locations FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "gps_driver_insert"
  ON public.gps_locations FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "gps_driver_select"
  ON public.gps_locations FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

-- ============================================================
-- IDLE ALERTS â€” Admin can do everything, drivers read own alerts
-- ============================================================
CREATE POLICY "idle_alerts_admin_all"
  ON public.idle_alerts FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "idle_alerts_driver_select"
  ON public.idle_alerts FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

-- ============================================================
-- ADMIN USERS â€” Non-circular policy to prevent recursive loops
-- ============================================================
CREATE POLICY "admin_users_read_own"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (email = auth.email());

CREATE POLICY "admin_users_write_own"
  ON public.admin_users FOR ALL
  TO authenticated
  USING (email = auth.email())
  WITH CHECK (email = auth.email());
-- ============================================================
-- ABTSO Logistics â€” Migration 005: Geofence Validation
-- ============================================================
-- Server-side validation that a driver's GPS coordinates are
-- within the geofence radius of at least one depot.
-- ============================================================

-- ------------------------------------------------------------
-- Function: Validate that coordinates are within depot geofence
-- Returns the depot ID if within range, NULL if not.
-- Uses PostGIS ST_DWithin for accurate distance calculation.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_geofence(
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION
)
RETURNS UUID AS $$
DECLARE
  v_depot_id UUID;
BEGIN
  SELECT id INTO v_depot_id
  FROM public.depots
  WHERE ST_DWithin(
    location,
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
    geofence_radius_m  -- 10 meters
  )
  ORDER BY ST_Distance(
    location,
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
  )
  LIMIT 1;

  RETURN v_depot_id;  -- NULL if not within any depot geofence
END;
$$ LANGUAGE plpgsql STABLE;

-- ------------------------------------------------------------
-- Function: Start a shift (with geofence validation)
-- Called from the mobile app via supabase.rpc('start_shift', ...)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_shift(
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION
)
RETURNS JSON AS $$
DECLARE
  v_driver_id UUID;
  v_depot_id UUID;
  v_active_shift RECORD;
  v_new_shift RECORD;
BEGIN
  v_driver_id := (SELECT auth.uid());

  IF v_driver_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Unauthorized: Driver authentication required.'
    );
  END IF;

  -- Check for existing active shift
  SELECT * INTO v_active_shift
  FROM public.shifts
  WHERE driver_id = v_driver_id AND status = 'active'
  LIMIT 1;

  IF v_active_shift IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You already have an active shift. End it before starting a new one.'
    );
  END IF;

  -- Validate geofence
  v_depot_id := public.validate_geofence(p_latitude, p_longitude);

  IF v_depot_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You must be within 10m of a depot to start your shift.'
    );
  END IF;

  -- Create the shift
  INSERT INTO public.shifts (driver_id, depot_id, start_time, start_lat, start_lng, status)
  VALUES (v_driver_id, v_depot_id, now(), p_latitude, p_longitude, 'active')
  RETURNING * INTO v_new_shift;

  RETURN json_build_object(
    'success', true,
    'shift_id', v_new_shift.id,
    'depot_id', v_depot_id,
    'start_time', v_new_shift.start_time,
    'base_rate', v_new_shift.base_hourly_rate
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Function: End a shift (with geofence validation)
-- Called from the mobile app via supabase.rpc('end_shift', ...)
-- ------------------------------------------------------------
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

  -- Verify the shift belongs to this driver and is active
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

  -- Validate geofence for clock-out
  v_depot_id := public.validate_geofence(p_latitude, p_longitude);

  IF v_depot_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You must be within 10m of a depot to end your shift.'
    );
  END IF;

  -- End the shift â€” the trigger will calculate hours, rate, and override
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
    'override_applied', (v_updated_shift.override_rate IS NOT NULL)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ============================================================
-- ABTSO Logistics â€” Migration 006: Idle Alert Detection
-- ABTSO Logistics — Migration 006: Idle Alert Detection
-- ============================================================
-- Uses pg_cron to check every 2 minutes for drivers whose
-- GPS speed has been 0 for 50+ consecutive minutes.
-- New alerts are written to idle_alerts, which triggers
-- a Supabase Realtime push to the admin dashboard.
-- ============================================================

-- ------------------------------------------------------------
-- Function: Check for idle drivers and create alerts
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_idle_drivers()
RETURNS void AS $$
BEGIN
  INSERT INTO public.idle_alerts (driver_id, shift_id, started_at, latitude, longitude)
  SELECT DISTINCT ON (s.driver_id)
    s.driver_id,
    s.id AS shift_id,
    COALESCE(
      -- Case 1: Find the timestamp of the last known movement (speed >= 0.5)
      (
        SELECT MAX(gl.recorded_at)
        FROM public.gps_locations gl
        WHERE gl.shift_id = s.id
          AND gl.speed >= 0.5
      ),
      -- Case 2: If no movement pings exist, use the shift start time
      s.start_time
    ) AS started_at,
    -- For coordinates, use the latest recorded GPS location, or fallback to the shift start coords
    COALESCE(
      (
        SELECT gl.latitude
        FROM public.gps_locations gl
        WHERE gl.shift_id = s.id
        ORDER BY gl.recorded_at DESC
        LIMIT 1
      ),
      s.start_lat
    ) AS latitude,
    COALESCE(
      (
        SELECT gl.longitude
        FROM public.gps_locations gl
        WHERE gl.shift_id = s.id
        ORDER BY gl.recorded_at DESC
        LIMIT 1
      ),
      s.start_lng
    ) AS longitude
  FROM public.shifts s
  WHERE s.status = 'active'
    -- The threshold: 2 minutes have passed since the last known movement (or start of shift)
    AND COALESCE(
      (
        SELECT MAX(gl.recorded_at)
        FROM public.gps_locations gl
        WHERE gl.shift_id = s.id
          AND gl.speed >= 0.5
      ),
      s.start_time
    ) <= now() - INTERVAL '2 minutes'
    -- Don't create duplicate unacknowledged alerts for the same shift
    AND NOT EXISTS (
      SELECT 1
      FROM public.idle_alerts ia
      WHERE ia.shift_id = s.id
        AND ia.acknowledged = false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Schedule the check every 2 minutes via pg_cron
-- NOTE: pg_cron must be enabled first in Supabase Dashboard
--       (Database â†’ Extensions â†’ pg_cron â†’ Enable)
-- ------------------------------------------------------------
-- SELECT cron.schedule(
--   'detect-idle-drivers',
--   '*/2 * * * *',
--   $$SELECT public.detect_idle_drivers();$$
-- );

-- ------------------------------------------------------------
-- 8. SOS ALERTS — Generated when a driver requests emergency support
-- ------------------------------------------------------------
CREATE TABLE public.sos_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sos_alerts_unack ON public.sos_alerts(acknowledged) WHERE acknowledged = false;

ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sos_alerts_select_authenticated" ON public.sos_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "sos_alerts_write_authenticated" ON public.sos_alerts FOR ALL TO authenticated USING (true);

-- Suppress duplicate publication attempts
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_alerts;
  END IF;
END $$;

ALTER TABLE public.sos_alerts REPLICA IDENTITY FULL;
