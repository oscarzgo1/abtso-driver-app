-- ============================================================
-- Migration 070: Simplified, Fixed Fuel Theft Detection Engine
-- ============================================================
-- Replaces the configurable-floor + rolling-average heuristic from
-- migration 055/056 (org_alert_settings.fuel_anomaly_min_mpg /
-- fuel_anomaly_rolling_drop_percent, computed live in the admin
-- dashboard) with a single, fixed, fleet-wide rule the business asked
-- for directly: every truck in this fleet is always refuelled to the
-- brim, so two full-tank fills bracket exactly the fuel burned over
-- the miles between them. Anything worse than 7.0 UK MPG on that
-- stretch means fuel left the truck outside the engine.
--
-- Still extends the ONE existing fuel-logging pipeline (fuel_receipts,
-- migration 047) rather than introducing a parallel fuel_logs table —
-- see 055's header comment for why a second table would fragment the
-- same data. is_full_tank / calculated_mpg / theft_flag / theft_reason
-- are the only new columns needed.
--
-- calculated_mpg/theft_flag/theft_reason ARE stored here, unlike 055's
-- explicit choice not to store a derived anomaly value — the business
-- wants a bulletproof, single source of truth the admin table can sort
-- and filter on directly, not a client-recomputed heuristic. A trigger
-- keeps them correct on insert and on any later correction to the
-- inputs (liters/odometer_miles/is_full_tank/vehicle_id/created_at);
-- it reads the previous full-tank row's own stored odometer/liters
-- columns (never another row's derived calculated_mpg), so it doesn't
-- matter what order rows are recalculated in.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.fuel_receipts
  ADD COLUMN IF NOT EXISTS is_full_tank BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS calculated_mpg NUMERIC,
  ADD COLUMN IF NOT EXISTS theft_flag BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS theft_reason TEXT;

COMMENT ON COLUMN public.fuel_receipts.is_full_tank IS 'Driver confirms this was a brim-to-brim fill. Defaults true (this fleet always brims). Only full-tank rows are used as MPG comparison anchors — a partial fill would understate the litres needed to reach full, making the next full-tank MPG look artificially bad.';
COMMENT ON COLUMN public.fuel_receipts.calculated_mpg IS 'UK MPG since the previous full-tank fill for this vehicle: delta_miles / (liters * 0.219969). NULL when this is the first full-tank row for the vehicle, the previous odometer reading is missing, or delta_miles <= 0. Maintained by trg_calc_fuel_theft_flag, not computed live client-side.';
COMMENT ON COLUMN public.fuel_receipts.theft_flag IS 'True when calculated_mpg < 7.0 (worse than the fleet-wide 40 L/100km safety ceiling) — litres were paid for but did not go into this tank. Maintained by trg_calc_fuel_theft_flag.';
COMMENT ON COLUMN public.fuel_receipts.theft_reason IS 'Human-readable reason shown in the admin audit view when theft_flag is true.';

CREATE INDEX IF NOT EXISTS idx_fuel_receipts_vehicle_full_tank_created
  ON public.fuel_receipts(vehicle_id, created_at)
  WHERE is_full_tank = true;

CREATE OR REPLACE FUNCTION public.calc_fuel_theft_flag()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_odometer INTEGER;
  v_delta_miles NUMERIC;
  v_mpg NUMERIC;
BEGIN
  NEW.calculated_mpg := NULL;
  NEW.theft_flag := false;
  NEW.theft_reason := NULL;

  IF NEW.is_full_tank AND NEW.vehicle_id IS NOT NULL AND NEW.odometer_miles IS NOT NULL AND NEW.liters IS NOT NULL AND NEW.liters > 0 THEN
    SELECT odometer_miles INTO v_prev_odometer
    FROM public.fuel_receipts
    WHERE vehicle_id = NEW.vehicle_id
      AND is_full_tank = true
      AND odometer_miles IS NOT NULL
      AND id <> NEW.id
      AND created_at < NEW.created_at
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_prev_odometer IS NOT NULL AND NEW.odometer_miles > v_prev_odometer THEN
      v_delta_miles := NEW.odometer_miles - v_prev_odometer;
      v_mpg := v_delta_miles / (NEW.liters * 0.219969);
      NEW.calculated_mpg := round(v_mpg, 2);

      IF v_mpg < 7.0 THEN
        NEW.theft_flag := true;
        NEW.theft_reason := 'Consumption anomaly: ' || to_char(v_mpg, 'FM999990.0') || ' MPG (>40 L/100km limit) - potential skim or siphoning';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calc_fuel_theft_flag ON public.fuel_receipts;
CREATE TRIGGER trg_calc_fuel_theft_flag
  BEFORE INSERT OR UPDATE OF liters, odometer_miles, is_full_tank, vehicle_id, created_at
  ON public.fuel_receipts
  FOR EACH ROW EXECUTE FUNCTION public.calc_fuel_theft_flag();

-- Backfill existing rows through the same trigger logic. Order doesn't
-- matter for correctness (see header comment), so a single blanket
-- UPDATE is enough.
UPDATE public.fuel_receipts SET odometer_miles = odometer_miles WHERE odometer_miles IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
