-- ============================================================
-- ABTSO Logistics — Migration 023: Cascade Delete Driver Foreign Keys
-- ============================================================
-- Updates foreign key constraints on sos_alerts, idle_alerts, and shifts
-- to ON DELETE CASCADE so removing a driver profile automatically cleans
-- up associated alert and shift history.
-- ============================================================

-- Update constraints for sos_alerts
ALTER TABLE public.sos_alerts DROP CONSTRAINT IF EXISTS sos_alerts_driver_id_fkey;
ALTER TABLE public.sos_alerts ADD CONSTRAINT sos_alerts_driver_id_fkey 
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;

-- Update constraints for idle_alerts
ALTER TABLE public.idle_alerts DROP CONSTRAINT IF EXISTS idle_alerts_driver_id_fkey;
ALTER TABLE public.idle_alerts ADD CONSTRAINT idle_alerts_driver_id_fkey 
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;

-- Update constraints for shifts
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_driver_id_fkey;
ALTER TABLE public.shifts ADD CONSTRAINT shifts_driver_id_fkey 
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;

-- Force Cache Reload
NOTIFY pgrst, 'reload schema';
