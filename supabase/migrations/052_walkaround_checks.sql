-- ============================================================
-- Migration 052: Walk-Around Vehicle Checks
-- ============================================================
-- New org-scoped table for driver-submitted daily walk-around
-- checks (start-of-shift and end-of-shift), separate from the
-- existing free-form incident_reports table: a walk-around is a
-- structured per-item checklist with a pass/fail per component,
-- not an ad-hoc report.
--
-- shift_id is nullable because a start-of-shift check is completed
-- BEFORE the shift row exists (the driver app runs the walk-around
-- first, then clocks in) — the app links it to the real shift_id
-- immediately after that shift is created. An end-of-shift check
-- always has a real shift_id at creation time, since the shift is
-- already active.
--
-- vehicle_id (the tractor) is NOT NULL — you can't walk around a
-- vehicle nobody picked. trailer_id stays nullable/independent,
-- same relationship already established for shifts/fuel_receipts/
-- incident_reports (migration 049): whether trailer-specific items
-- appear on a given check is driven by whether trailer_id is set,
-- not a DB constraint.
--
-- duration_seconds is stored directly (completed_at - started_at)
-- rather than computed at query time, so admin-panel history/
-- reporting doesn't need to recompute it per row.
--
-- walkaround_check_target_minutes on organizations is a configurable
-- admin-set benchmark for "did this check look rushed", not a
-- hard DVSA-mandated minimum — flagging that distinction explicitly
-- so the admin panel doesn't misrepresent it as regulation.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.walkaround_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id),
  trailer_id UUID REFERENCES public.vehicles(id),
  check_type TEXT NOT NULL CHECK (check_type IN ('start_of_shift', 'end_of_shift')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  overall_result TEXT CHECK (overall_result IN ('pass', 'defects_found')),
  defect_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_walkaround_checks_org ON public.walkaround_checks(organization_id);
CREATE INDEX IF NOT EXISTS idx_walkaround_checks_driver ON public.walkaround_checks(driver_id);
CREATE INDEX IF NOT EXISTS idx_walkaround_checks_shift ON public.walkaround_checks(shift_id);
CREATE INDEX IF NOT EXISTS idx_walkaround_checks_started_at ON public.walkaround_checks(started_at DESC);

-- Auto-inherit organization_id from the submitting driver, same trigger
-- already used by shifts/gps_locations/idle_alerts/sos_alerts/incident_reports.
DROP TRIGGER IF EXISTS trg_sync_org_id_walkaround_checks ON public.walkaround_checks;
CREATE TRIGGER trg_sync_org_id_walkaround_checks
  BEFORE INSERT ON public.walkaround_checks
  FOR EACH ROW EXECUTE FUNCTION public.sync_organization_id_from_driver();

ALTER TABLE public.walkaround_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "walkaround_checks_driver_insert" ON public.walkaround_checks;
CREATE POLICY "walkaround_checks_driver_insert"
  ON public.walkaround_checks FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "walkaround_checks_driver_select" ON public.walkaround_checks;
CREATE POLICY "walkaround_checks_driver_select"
  ON public.walkaround_checks FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

-- A driver only ever completes their own check in one sitting inside the
-- app (no cross-driver edits), but the driver app itself needs to UPDATE
-- the row it just inserted twice: once to attach the real shift_id after
-- clock-in creates the shift, and once more isn't needed since items/
-- completed_at/duration are set on the same insert. This UPDATE policy
-- covers the shift_id backfill.
DROP POLICY IF EXISTS "walkaround_checks_driver_update_own" ON public.walkaround_checks;
CREATE POLICY "walkaround_checks_driver_update_own"
  ON public.walkaround_checks FOR UPDATE
  TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "walkaround_checks_org_admin_all" ON public.walkaround_checks;
CREATE POLICY "walkaround_checks_org_admin_all"
  ON public.walkaround_checks FOR ALL
  TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

-- Configurable "does this look rushed" benchmark shown in the admin
-- panel — an internal target the admin sets, not a hard DVSA minimum.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS walkaround_check_target_minutes INTEGER NOT NULL DEFAULT 15 CHECK (walkaround_check_target_minutes > 0);

NOTIFY pgrst, 'reload schema';

COMMIT;
