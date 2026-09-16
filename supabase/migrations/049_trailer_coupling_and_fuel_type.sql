-- ============================================================
-- Migration 049: Trailer coupling + Fuel/AdBlue type
-- ============================================================
-- Three additive changes for the driver app's Tractor/Trailer decoupled
-- pairing workflow and dual Fuel/AdBlue logging:
--
--   1. trailer_id — added to shifts, fuel_receipts, and incident_reports,
--      alongside each table's existing vehicle_id. vehicle_id keeps
--      meaning "the tractor unit" (its column comments are updated to
--      say so explicitly); trailer_id is a second, independent, nullable
--      FK to the same public.vehicles register, so a driver can couple
--      (or leave uncoupled) a tractor and a trailer separately instead
--      of a shift/receipt/report only ever pointing at one asset. Not
--      constrained to vehicle_type = 'trailer' at the DB level — the
--      app's own pickers already filter by vehicle_type, and a hard
--      CHECK here would only serve to reject a legitimate one-off (e.g.
--      a workshop temporarily reclassifying an asset) with no real
--      safety benefit.
--
--   2. fuel_receipts.fuel_type — 'diesel' (default, matches all existing
--      rows which were always diesel fill-ups before this column
--      existed) or 'adblue', so the mobile app's Fuel/AdBlue toggle has
--      somewhere real to persist instead of being a UI-only control.
--
--   3. fuel_receipts.total_cost relaxed from NOT NULL to nullable (the
--      CHECK (total_cost > 0) is rewritten to allow NULL through) — the
--      driver app now requires litres, not cost, on every fuel log; a
--      total_cost that's merely unentered is different from a fabricated
--      0, so this stays a true NULL rather than a forced placeholder
--      value.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

COMMENT ON COLUMN public.shifts.vehicle_id IS 'The coupled tractor unit for this shift (nullable — a shift can start uncoupled). See also trailer_id.';

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS trailer_id UUID REFERENCES public.vehicles(id);

COMMENT ON COLUMN public.fuel_receipts.vehicle_id IS 'The tractor unit this fuel/AdBlue log is for (nullable). See also trailer_id.';

ALTER TABLE public.fuel_receipts
  ADD COLUMN IF NOT EXISTS trailer_id UUID REFERENCES public.vehicles(id);

COMMENT ON COLUMN public.incident_reports.vehicle_id IS 'The tractor unit this report concerns (nullable). See also trailer_id.';

ALTER TABLE public.incident_reports
  ADD COLUMN IF NOT EXISTS trailer_id UUID REFERENCES public.vehicles(id);

ALTER TABLE public.fuel_receipts
  ADD COLUMN IF NOT EXISTS fuel_type TEXT NOT NULL DEFAULT 'diesel' CHECK (fuel_type IN ('diesel', 'adblue'));

ALTER TABLE public.fuel_receipts
  DROP CONSTRAINT IF EXISTS fuel_receipts_total_cost_check;

ALTER TABLE public.fuel_receipts
  ALTER COLUMN total_cost DROP NOT NULL;

ALTER TABLE public.fuel_receipts
  ADD CONSTRAINT fuel_receipts_total_cost_check CHECK (total_cost IS NULL OR total_cost > 0);

CREATE INDEX IF NOT EXISTS idx_shifts_trailer ON public.shifts(trailer_id);
CREATE INDEX IF NOT EXISTS idx_fuel_receipts_trailer ON public.fuel_receipts(trailer_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_trailer ON public.incident_reports(trailer_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
