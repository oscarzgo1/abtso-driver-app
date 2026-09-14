-- ============================================================
-- Migration 040: Compliance & Safety — MOT Register + Incident Reports
-- ============================================================
-- Two new org-scoped tables:
--   1. vehicles       — trucks + trailers, MOT expiry only for now
--                        (insurance deliberately excluded from this pass).
--   2. incident_reports — driver-submitted from the driver app (damage,
--                        near-miss, collision, mechanical fault, other),
--                        landing in the admin panel's new Compliance &
--                        Safety tab.
--
-- Both roles (payroll_admin and logistics) get full read/write access —
-- this is confirmed as a day-to-day operational tool, not an admin-only
-- setting, so it uses is_org_admin() (matches EITHER role) rather than
-- is_org_payroll_admin() (payroll_admin only).
--
-- NOTE ON is_admin()/sos_alerts/idle_alerts: while building this, a
-- live RLS check showed sos_alerts_admin_all/idle_alerts_admin_all use
-- USING/WITH CHECK (is_admin()) with NO organization_id comparison at
-- all — is_admin() is just an alias for is_org_admin() and does not
-- itself scope by org. That means any admin at any company can
-- currently read/write every company's sos_alerts and idle_alerts rows
-- (both tables do have organization_id, kept in sync by trigger, but
-- the policy never checks it). This migration does NOT touch those two
-- tables — it's flagged separately as its own fix — but incident_reports
-- below deliberately uses the safer, newer depots-style pattern
-- (is_org_admin() AND organization_id = current_org_id()) so it isn't
-- built with the same gap on day one.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ------------------------------------------------------------
-- 1. VEHICLES — trucks + trailers, MOT expiry
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  vehicle_number TEXT NOT NULL,
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('truck', 'trailer')),
  mot_expiry_date DATE,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_org ON public.vehicles(organization_id);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicles_org_read" ON public.vehicles;
CREATE POLICY "vehicles_org_read"
  ON public.vehicles FOR SELECT
  TO authenticated
  USING (organization_id = public.current_org_id());

DROP POLICY IF EXISTS "vehicles_org_admin_write" ON public.vehicles;
CREATE POLICY "vehicles_org_admin_write"
  ON public.vehicles FOR ALL
  TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

-- ------------------------------------------------------------
-- 2. INCIDENT REPORTS — driver-submitted
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incident_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  vehicle_id UUID REFERENCES public.vehicles(id),
  category TEXT NOT NULL CHECK (
    category IN ('vehicle_damage', 'near_miss', 'collision', 'mechanical_fault', 'other')
  ),
  note TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_reports_org ON public.incident_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_driver ON public.incident_reports(driver_id);

-- Auto-inherit organization_id from the reporting driver, same trigger
-- already used by shifts/gps_locations/idle_alerts/sos_alerts.
DROP TRIGGER IF EXISTS trg_sync_org_id_incidents ON public.incident_reports;
CREATE TRIGGER trg_sync_org_id_incidents
  BEFORE INSERT ON public.incident_reports
  FOR EACH ROW EXECUTE FUNCTION public.sync_organization_id_from_driver();

ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "incident_reports_driver_insert" ON public.incident_reports;
CREATE POLICY "incident_reports_driver_insert"
  ON public.incident_reports FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "incident_reports_driver_select" ON public.incident_reports;
CREATE POLICY "incident_reports_driver_select"
  ON public.incident_reports FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "incident_reports_org_admin_all" ON public.incident_reports;
CREATE POLICY "incident_reports_org_admin_all"
  ON public.incident_reports FOR ALL
  TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

-- ------------------------------------------------------------
-- 3. MOT ALERT LEAD TIME — per-organization, same pattern as
--    idle_alert_minutes/long_shift_flag_hours (migration 038).
--    Ships the column + in-app indicator only; email delivery is a
--    separate fast-follow once there's a scheduled-function story.
-- ------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS mot_alert_lead_days INTEGER NOT NULL DEFAULT 30 CHECK (mot_alert_lead_days > 0);

NOTIFY pgrst, 'reload schema';

COMMIT;
