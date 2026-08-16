-- Migration 027: Ensure UNIQUE constraint on driver_id in employee_rates table

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_rates') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'employee_rates_driver_id_key'
    ) THEN
      -- Remove duplicates if any exist before adding unique constraint
      DELETE FROM public.employee_rates a USING public.employee_rates b
      WHERE a.id < b.id AND a.driver_id = b.driver_id;

      ALTER TABLE public.employee_rates 
      ADD CONSTRAINT employee_rates_driver_id_key UNIQUE (driver_id);
    END IF;
  END IF;
END $$;
