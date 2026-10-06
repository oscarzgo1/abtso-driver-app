-- 093: A record of every payroll file generated from the Payroll tab, so it
-- can be downloaded again later: the period, the template used, the totals
-- and who made it. The period is not locked.
CREATE TABLE IF NOT EXISTS public.payroll_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  template_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_b64 TEXT NOT NULL CHECK (length(file_b64) <= 9000000),
  employee_count INTEGER NOT NULL DEFAULT 0,
  total_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_gross NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_records_org_idx ON public.payroll_records (organization_id, created_at DESC);

ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_records_payroll_admin ON public.payroll_records;
CREATE POLICY payroll_records_payroll_admin ON public.payroll_records
  FOR ALL TO authenticated
  USING (public.is_org_payroll_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_payroll_admin() AND organization_id = public.current_org_id());
REVOKE ALL ON public.payroll_records FROM anon;
