-- ============================================================
-- ABTSO Logistics — Migration 002: Create Tables
-- ============================================================

-- ------------------------------------------------------------
-- 1. DEPOTS — The two UK depot locations
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
-- 2. RATE CONFIGURATIONS — Configurable pay rates
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
-- 3. DRIVERS — Driver accounts (simple ID + PIN auth)
-- ------------------------------------------------------------
CREATE TABLE public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id VARCHAR(20) UNIQUE NOT NULL,          -- Human-readable, e.g. "DRV-001"
  pin_hash TEXT NOT NULL,                          -- bcrypt hash of PIN
  full_name TEXT NOT NULL,
  phone TEXT,
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
-- 4. SHIFTS — Core shift records
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

-- Performance indexes
CREATE INDEX idx_shifts_driver_id ON public.shifts(driver_id);
CREATE INDEX idx_shifts_week ON public.shifts(driver_id, week_year, week_number);
CREATE INDEX idx_shifts_status ON public.shifts(status);
CREATE INDEX idx_shifts_start_time ON public.shifts(start_time);

-- ------------------------------------------------------------
-- 5. GPS LOCATIONS — Background GPS telemetry during shifts
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
-- 6. IDLE ALERTS — Generated when speed=0 for 30+ consecutive min
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
-- 7. ADMIN USERS — Admin login for the web dashboard
-- ------------------------------------------------------------
CREATE TABLE public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,                   -- bcrypt hash
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed a default admin (password: admin123 — CHANGE IN PRODUCTION!)
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

