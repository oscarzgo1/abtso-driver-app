-- Small addendum to 070: stores delta_miles alongside calculated_mpg so
-- the admin audit table can show "412mi / 9.1 MPG" directly from stored
-- columns, instead of reconstructing distance from calculated_mpg *
-- liters (lossy, and needlessly indirect for a value the trigger already
-- computes).

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.fuel_receipts
  ADD COLUMN IF NOT EXISTS delta_miles INTEGER;

COMMENT ON COLUMN public.fuel_receipts.delta_miles IS 'Miles since the previous full-tank fill for this vehicle (current odometer_miles - previous full-tank odometer_miles). Maintained by trg_calc_fuel_theft_flag alongside calculated_mpg.';

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
  NEW.delta_miles := NULL;
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
      NEW.delta_miles := v_delta_miles;
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

-- Re-fires the same trigger to backfill delta_miles on existing rows.
UPDATE public.fuel_receipts SET odometer_miles = odometer_miles WHERE odometer_miles IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
