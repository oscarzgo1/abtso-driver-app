-- ============================================================
-- ABTSO Logistics / Tachyo — Migration 035: Load Revenue & Margins
-- ============================================================
-- Adds the company-revenue side of a shift (the amount billed to the
-- client for that load) so Analytics can show real net margin —
-- revenue vs. driver cost — alongside the payroll figures it already
-- tracks.
--
-- Note: this was requested as two new columns on public.shifts
-- (revenue_amount, load_reference). That isn't what's implemented
-- below, and the reason is a hard one, not a style preference:
-- Postgres RLS is row-level, not column-level. The existing
-- "shifts_driver_select" policy (migration 034) lets a driver read
-- every column of their own shift row, and the driver app already
-- does `.from('shifts').select()` — select-star — in several places
-- (supabase_service.dart, shift_provider.dart). Adding the columns
-- to public.shifts would mean the very next driver app build quietly
-- starts returning the company's billed rate to the driver on their
-- own device — exactly what "drivers must never see this" rules out.
-- A separate table, with its own RLS and no driver-facing policy at
-- all, is the only way that requirement actually holds rather than
-- just looking like it does. Nothing on the driver app side needs to
-- change: it never queries this table.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shift_revenue (
  shift_id UUID PRIMARY KEY REFERENCES public.shifts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  revenue_amount NUMERIC(10, 2),
  load_reference TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_shift_revenue_org ON public.shift_revenue(organization_id);

-- organization_id is derived server-side from the shift itself — same
-- pattern as sync_organization_id_from_driver() in migration 032 —
-- so the client never supplies it and it can't be spoofed or drift
-- out of sync with the shift it belongs to.
CREATE OR REPLACE FUNCTION public.sync_shift_revenue_fields()
RETURNS TRIGGER AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id
  FROM public.shifts WHERE id = NEW.shift_id;

  NEW.updated_at := now();
  NEW.updated_by := auth.email();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_shift_revenue_fields ON public.shift_revenue;
CREATE TRIGGER trg_sync_shift_revenue_fields
  BEFORE INSERT OR UPDATE ON public.shift_revenue
  FOR EACH ROW EXECUTE FUNCTION public.sync_shift_revenue_fields();

ALTER TABLE public.shift_revenue ENABLE ROW LEVEL SECURITY;

-- Dispatchers and payroll admins only. is_org_admin() (migration 032)
-- means "has a row in this org's user_roles" — every dashboard staff
-- role, and specifically NOT drivers, who authenticate as separate
-- driver auth users and are never rows in user_roles. No policy at
-- all exists for that role, so RLS denies it by default: this is an
-- actual database-level wall, not a UI convention.
CREATE POLICY "shift_revenue_org_admin_rw"
  ON public.shift_revenue FOR ALL
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

-- This project's `authenticated` role already carries default table
-- privileges (Supabase's standard setup for every public-schema
-- table), so RLS above — not this GRANT — is the actual boundary.
-- Listed explicitly anyway so this table's intended access is
-- readable from the migration alone, without checking the project's
-- default-privilege config.
GRANT SELECT, INSERT, UPDATE ON public.shift_revenue TO authenticated;
