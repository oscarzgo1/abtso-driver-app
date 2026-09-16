-- ============================================================
-- Migration 046: Allow custom Asset Type / Inspection Type text.
-- ============================================================
-- The "Add Asset" form's Asset Type and Inspection Type fields become
-- creatable comboboxes (standard choices + free text, e.g. "Company
-- Van", "Support Vehicle", or a custom inspection name) — the existing
-- fixed-enum CHECK constraints on vehicles.vehicle_type/inspection_type
-- would reject anything outside their original short list, silently
-- failing the insert. Widened to "non-empty text" instead of a fixed
-- enum. Every UI spot that branches on vehicle_type === 'truck' still
-- works unchanged (a custom type just falls through to their existing
-- "not a truck" fallback) — see FleetRoadworthiness.tsx/Compliance.tsx.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_vehicle_type_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_vehicle_type_check CHECK (btrim(vehicle_type) <> '');

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_inspection_type_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_inspection_type_check CHECK (btrim(inspection_type) <> '');

NOTIFY pgrst, 'reload schema';

COMMIT;
