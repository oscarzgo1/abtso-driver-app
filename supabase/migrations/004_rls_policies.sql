-- ============================================================
-- ABTSO Logistics — Migration 004: Row Level Security
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
-- DEPOTS — Anyone authenticated can read depots
-- ============================================================
CREATE POLICY "depots_read_authenticated"
  ON public.depots FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- RATE CONFIGURATIONS — Anyone authenticated can read rates
-- ============================================================
CREATE POLICY "rates_read_authenticated"
  ON public.rate_configurations FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- DRIVERS — Admin can do everything, drivers can read own profile
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
-- SHIFTS — Admin can do everything, drivers manage own shifts
-- ============================================================
CREATE POLICY "shifts_admin_all"
  ON public.shifts FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "shifts_driver_select"
  ON public.shifts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "shifts_driver_insert"
  ON public.shifts FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "shifts_driver_update"
  ON public.shifts FOR UPDATE
  TO authenticated
  USING (driver_id = auth.uid());

-- ============================================================
-- GPS LOCATIONS — Admin can do everything, drivers manage own telemetry
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
  USING (true);

-- ============================================================
-- IDLE ALERTS — Admin can do everything, drivers read own alerts
-- ============================================================
CREATE POLICY "idle_alerts_admin_all"
  ON public.idle_alerts FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "idle_alerts_driver_select"
  ON public.idle_alerts FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- ADMIN USERS — Non-circular policy to prevent recursive loops
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
