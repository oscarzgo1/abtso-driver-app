-- ============================================================
-- Migration 055: Fuel Theft / Skimming Detection
-- ============================================================
-- Extends the EXISTING fuel_receipts (047) and vehicles (040) tables
-- rather than introducing a parallel fuel_logs/tractor_units schema —
-- this fleet only has one fuel-logging pipeline, and a second one
-- would just fragment the same data across two disconnected tables.
--
-- odometer_miles / dashboard_photo_path / gps_lat / gps_lng: captured
-- by the driver app at submission time (dashboard_photo_path uses the
-- same private fuel-receipts bucket and upload function as the
-- existing receipt_photo_path — no new bucket needed, it's the same
-- photo-evidence concept).
--
-- calculated_mpg is deliberately NOT a column here — see the admin
-- dashboard's fuel-receipts anomaly logic. It's a derived comparison
-- against whichever OTHER receipt for the same vehicle turns out to
-- be "previous" once sorted, which can change if an earlier receipt
-- is corrected or a new one is back-dated; a stored value would need
-- a trigger to stay correct and would silently go stale without one.
-- Computed live from real columns instead, same way this app already
-- computes gross pay (getShiftFinancials) rather than storing it.
--
-- fuel_tank_capacity_litres has no default — a NULL here just means
-- "unknown," which the client-side over-capacity check treats as
-- "can't validate yet" rather than silently assuming a made-up
-- number like 450 or 700 for a vehicle nobody's actually measured.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.fuel_receipts
  ADD COLUMN IF NOT EXISTS odometer_miles INTEGER CHECK (odometer_miles IS NULL OR odometer_miles >= 0),
  ADD COLUMN IF NOT EXISTS dashboard_photo_path TEXT,
  ADD COLUMN IF NOT EXISTS gps_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_lng DOUBLE PRECISION;

COMMENT ON COLUMN public.fuel_receipts.odometer_miles IS 'Odometer reading at the pump, driver-entered. Required by the app UI for new submissions; nullable here so existing rows are not invalidated.';
COMMENT ON COLUMN public.fuel_receipts.dashboard_photo_path IS 'Second required photo — dashboard cluster showing odometer + fuel gauge. Same private fuel-receipts bucket as receipt_photo_path.';
COMMENT ON COLUMN public.fuel_receipts.gps_lat IS 'Device GPS latitude captured silently at submit time, for comparing against the claimed fuel station location.';
COMMENT ON COLUMN public.fuel_receipts.gps_lng IS 'Device GPS longitude captured silently at submit time.';

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS fuel_tank_capacity_litres INTEGER CHECK (fuel_tank_capacity_litres IS NULL OR fuel_tank_capacity_litres > 0);

COMMENT ON COLUMN public.vehicles.fuel_tank_capacity_litres IS 'Physical tank capacity — set per vehicle by an admin. NULL means unknown/unset, in which case the over-capacity submission check is skipped rather than validated against a guessed number.';

CREATE INDEX IF NOT EXISTS idx_fuel_receipts_vehicle_odometer ON public.fuel_receipts(vehicle_id, odometer_miles);

NOTIFY pgrst, 'reload schema';

COMMIT;
