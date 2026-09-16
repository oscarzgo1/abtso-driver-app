-- ============================================================
-- Migration 041: Compliance & Safety — VOR, inspection types, defect
-- severity
-- ============================================================
-- NOT YET APPLIED — written to match the Compliance.tsx cockpit
-- component but deliberately left unapplied pending review. The page
-- will not load real data until this is run against the linked project.
--
-- Extends migration 040's vehicles/incident_reports for a richer
-- DVSA-flavoured compliance cockpit:
--   - vehicles.mot_expiry_date -> inspection_due_date (generic: MOT,
--     PMI, tacho calibration, roller brake test, or LOLER — not MOT
--     only) + inspection_type + is_vor (grounded).
--   - incident_reports gets a `severity` column; a critical/VOR
--     defect against a tagged vehicle automatically grounds it
--     (sets vehicles.is_vor = true) via trigger — mirrors, not
--     replaces, the driver app's existing category set (tyres/
--     brakes/lighting/air_leaks/bodywork/mirrors are additive, so
--     existing driver-submitted rows using the original categories
--     — vehicle_damage/near_miss/collision/mechanical_fault/other —
--     still validate).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ------------------------------------------------------------
-- 1. VEHICLES — generic inspection due date + type, VOR flag
-- ------------------------------------------------------------
ALTER TABLE public.vehicles
  RENAME COLUMN mot_expiry_date TO inspection_due_date;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS inspection_type TEXT NOT NULL DEFAULT 'mot'
    CHECK (inspection_type IN ('mot', 'pmi', 'tacho_calibration', 'roller_brake_test', 'loler')),
  ADD COLUMN IF NOT EXISTS is_vor BOOLEAN NOT NULL DEFAULT false;

-- ------------------------------------------------------------
-- 2. INCIDENT REPORTS — defect severity + finer defect categories
--    (additive to the existing CHECK, not a replacement)
-- ------------------------------------------------------------
ALTER TABLE public.incident_reports DROP CONSTRAINT IF EXISTS incident_reports_category_check;
ALTER TABLE public.incident_reports ADD CONSTRAINT incident_reports_category_check
  CHECK (category IN (
    'vehicle_damage', 'near_miss', 'collision', 'mechanical_fault', 'other',
    'tyres', 'brakes', 'lighting', 'air_leaks', 'bodywork', 'mirrors'
  ));

ALTER TABLE public.incident_reports
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'advisory_minor'
    CHECK (severity IN ('critical_vor', 'advisory_minor'));

-- A critical/VOR defect reported against a tagged vehicle grounds it
-- immediately — matches the spec's "automatically flags asset as
-- Grounded". Un-grounding is a deliberate, separate admin action
-- (clearing VOR on the vehicle itself once repaired), not automatic
-- on defect close-out, so a rectified defect doesn't silently put an
-- unroadworthy vehicle back on the road without someone checking it.
CREATE OR REPLACE FUNCTION public.ground_vehicle_on_critical_defect()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.severity = 'critical_vor' AND NEW.vehicle_id IS NOT NULL THEN
    UPDATE public.vehicles SET is_vor = true, updated_at = now() WHERE id = NEW.vehicle_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_ground_vehicle_on_critical_defect ON public.incident_reports;
CREATE TRIGGER trg_ground_vehicle_on_critical_defect
  AFTER INSERT ON public.incident_reports
  FOR EACH ROW EXECUTE FUNCTION public.ground_vehicle_on_critical_defect();

NOTIFY pgrst, 'reload schema';

COMMIT;
