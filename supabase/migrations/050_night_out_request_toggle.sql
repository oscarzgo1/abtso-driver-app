-- ============================================================
-- Migration 050: Per-organization "Allow Drivers to Request
-- Night Out" toggle.
-- ============================================================
-- Night Out requests (shifts.night_out_status/night_out_requested) have
-- always been possible for any driver on any org. Some operators don't
-- run a Night Out allowance scheme at all and don't want the option
-- shown in the driver app; this adds an explicit per-org switch,
-- defaulting to false so nothing changes for an existing company until
-- an admin opts in from Settings -> Alerts.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS allow_driver_night_out_requests BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';

COMMIT;
