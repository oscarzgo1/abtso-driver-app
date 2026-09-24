-- ============================================================
-- Migration 057: Employee Holidays
-- ============================================================
-- Deliberately minimal, per explicit scope decision: a read-only
-- calendar of logged holiday dates, admin-entered, no request/
-- approval workflow and no entitlement/balance tracking. Just a
-- driver + a date range + an optional note. Entitlement tracking or
-- a driver-facing request flow can be layered on top of this same
-- table later without a breaking change, if ever needed.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.employee_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_holidays_date_order CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_employee_holidays_org ON public.employee_holidays(organization_id);
CREATE INDEX IF NOT EXISTS idx_employee_holidays_driver ON public.employee_holidays(driver_id);
CREATE INDEX IF NOT EXISTS idx_employee_holidays_dates ON public.employee_holidays(start_date, end_date);

DROP TRIGGER IF EXISTS trg_sync_org_id_employee_holidays ON public.employee_holidays;
CREATE TRIGGER trg_sync_org_id_employee_holidays
  BEFORE INSERT ON public.employee_holidays
  FOR EACH ROW EXECUTE FUNCTION public.sync_organization_id_from_driver();

ALTER TABLE public.employee_holidays ENABLE ROW LEVEL SECURITY;

-- Admin-only, both read and write — this is an admin-logged record,
-- not a driver-submitted one (no driver-facing policy at all, same
-- absence documented for shift_revenue).
DROP POLICY IF EXISTS "employee_holidays_org_admin_all" ON public.employee_holidays;
CREATE POLICY "employee_holidays_org_admin_all"
  ON public.employee_holidays FOR ALL
  TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

NOTIFY pgrst, 'reload schema';

COMMIT;
