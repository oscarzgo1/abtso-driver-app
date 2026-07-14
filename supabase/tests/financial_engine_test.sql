-- ============================================================
-- ABTSO Logistics — SQL Verification Script
-- Run this in your Supabase SQL Editor to test the financial engine
-- and verify the retroactive Friday-Saturday-Sunday override rule.
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1: Create a clean test driver profile
-- ------------------------------------------------------------
DELETE FROM public.shifts;
DELETE FROM public.drivers WHERE driver_id = 'DRV-TEST';

INSERT INTO public.drivers (driver_id, pin_hash, full_name, phone)
VALUES (
  'DRV-TEST',
  crypt('1234', gen_salt('bf')),
  'Test Driver (Financial Evaluation)',
  '+44 7700 900000'
);

-- Retrieve the driver UUID
DO $$
DECLARE
  v_driver_id UUID;
  v_depot_id UUID;
  v_shift_1 UUID;
  v_shift_2 UUID;
  v_shift_3 UUID;
  v_paycheck RECORD;
BEGIN
  SELECT id INTO v_driver_id FROM public.drivers WHERE driver_id = 'DRV-TEST';
  SELECT id INTO v_depot_id FROM public.depots WHERE name = 'Base A' LIMIT 1;

  RAISE NOTICE '--- STARTING FINANCIAL ENGINE EVALUATION ---';
  RAISE NOTICE 'Driver UUID: %', v_driver_id;
  RAISE NOTICE 'Depot UUID: %', v_depot_id;

  -- ------------------------------------------------------------
  -- TEST CASE 1: Insert Friday Shift (Mon-Fri base rate is £16/hr)
  -- ------------------------------------------------------------
  RAISE NOTICE '1. Clocking in Friday Shift (Expected rate: £16.00/hr)...';
  
  INSERT INTO public.shifts (driver_id, depot_id, start_time, end_time, status)
  VALUES (
    v_driver_id, 
    v_depot_id, 
    '2026-07-03 08:00:00+01', -- Friday
    '2026-07-03 16:00:00+01', -- 8 hours
    'completed'
  ) RETURNING id INTO v_shift_1;

  SELECT effective_rate, total_hours, total_pay, override_rate INTO v_paycheck
  FROM public.shifts WHERE id = v_shift_1;
  
  RAISE NOTICE '   Result: Hours = %, Rate = £%/hr, Total Pay = £% (Override: %)',
    v_paycheck.total_hours, v_paycheck.effective_rate, v_paycheck.total_pay, COALESCE(v_paycheck.override_rate::text, 'None');

  -- ------------------------------------------------------------
  -- TEST CASE 2: Insert Saturday Shift (Saturday base rate is £17/hr)
  -- ------------------------------------------------------------
  RAISE NOTICE '2. Clocking in Saturday Shift (Expected rate: £17.00/hr)...';
  
  INSERT INTO public.shifts (driver_id, depot_id, start_time, end_time, status)
  VALUES (
    v_driver_id, 
    v_depot_id, 
    '2026-07-04 08:00:00+01', -- Saturday
    '2026-07-04 16:00:00+01', -- 8 hours
    'completed'
  ) RETURNING id INTO v_shift_2;

  SELECT effective_rate, total_hours, total_pay, override_rate INTO v_paycheck
  FROM public.shifts WHERE id = v_shift_2;
  
  RAISE NOTICE '   Result: Hours = %, Rate = £%/hr, Total Pay = £% (Override: %)',
    v_paycheck.total_hours, v_paycheck.effective_rate, v_paycheck.total_pay, COALESCE(v_paycheck.override_rate::text, 'None');

  -- ------------------------------------------------------------
  -- TEST CASE 3: Insert Sunday Shift (Sunday base rate is £18/hr)
  -- This should trigger the retroactive override rule for Fri+Sat!
  -- ------------------------------------------------------------
  RAISE NOTICE '3. Clocking in Sunday Shift (Expected rate: £18.00/hr, triggering retroactive override)...';
  
  INSERT INTO public.shifts (driver_id, depot_id, start_time, end_time, status)
  VALUES (
    v_driver_id, 
    v_depot_id, 
    '2026-07-05 08:00:00+01', -- Sunday
    '2026-07-05 16:00:00+01', -- 8 hours
    'completed'
  ) RETURNING id INTO v_shift_3;

  -- Verify Sunday shift pay
  SELECT effective_rate, total_hours, total_pay, override_rate INTO v_paycheck
  FROM public.shifts WHERE id = v_shift_3;
  RAISE NOTICE '   Sunday Result: Hours = %, Rate = £%/hr, Total Pay = £% (Override: %)',
    v_paycheck.total_hours, v_paycheck.effective_rate, v_paycheck.total_pay, COALESCE(v_paycheck.override_rate::text, 'None');

  -- ------------------------------------------------------------
  -- STEP 2: Verify if Friday and Saturday shifts were updated!
  -- ------------------------------------------------------------
  RAISE NOTICE '4. Verifying if Friday & Saturday shifts retroactively upgraded to £18.00/hr...';
  
  SELECT effective_rate, total_pay, override_rate INTO v_paycheck
  FROM public.shifts WHERE id = v_shift_1;
  RAISE NOTICE '   Friday Shift After Override: Rate = £%/hr, Total Pay = £% (Override: %)',
    v_paycheck.effective_rate, v_paycheck.total_pay, COALESCE(v_paycheck.override_rate::text, 'None');

  SELECT effective_rate, total_pay, override_rate INTO v_paycheck
  FROM public.shifts WHERE id = v_shift_2;
  RAISE NOTICE '   Saturday Shift After Override: Rate = £%/hr, Total Pay = £% (Override: %)',
    v_paycheck.effective_rate, v_paycheck.total_pay, COALESCE(v_paycheck.override_rate::text, 'None');

  -- Clean up test records
  DELETE FROM public.shifts WHERE driver_id = v_driver_id;
  DELETE FROM public.drivers WHERE id = v_driver_id;
  
  RAISE NOTICE '--- EVALUATION COMPLETE (CLEANED UP TEST DATA) ---';
END $$;
