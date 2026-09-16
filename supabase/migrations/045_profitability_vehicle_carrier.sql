-- ============================================================
-- Migration 045: Profitability & Payroll — vehicle assignment,
-- carrier settlement tagging, and a real GPS-mileage RPC.
-- ============================================================
-- Three additions, all needed to build the carrier settlement importer
-- and reconciliation ledger honestly (no fabricated columns):
--   1. shifts.vehicle_id — a shift has no vehicle link anywhere in this
--      schema today. Nullable FK to public.vehicles (the same fleet
--      register the Compliance module uses), settable by an org admin
--      from the Profitability ledger so "Assigned Vehicle" is a real,
--      admin-confirmed fact, not a guess.
--   2. shift_revenue.carrier_name — free-text tag ("Amazon Relay",
--      "DHL", "Eddie Stobart", ...) set by the settlement importer or
--      manually, alongside the existing revenue_amount/load_reference.
--   3. shift_mileages() RPC — real GPS distance per shift, computed
--      server-side from gps_locations via PostGIS (ST_MakeLine +
--      ST_Length on the geography column that already exists), rather
--      than shipping thousands of raw ping rows to the client. Returns
--      nothing for a shift with under 2 pings — that's an honestly
--      unknown distance, not a fabricated zero.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.vehicles(id);

ALTER TABLE public.shift_revenue
  ADD COLUMN IF NOT EXISTS carrier_name TEXT;

CREATE OR REPLACE FUNCTION public.shift_mileages(p_shift_ids UUID[])
RETURNS TABLE(shift_id UUID, miles NUMERIC) AS $$
  SELECT g.shift_id,
    ROUND((ST_Length(ST_MakeLine(g.location::geometry ORDER BY g.recorded_at)::geography) / 1609.344)::numeric, 1) AS miles
  FROM public.gps_locations g
  JOIN public.shifts sh ON sh.id = g.shift_id
  WHERE g.shift_id = ANY(p_shift_ids)
    AND public.is_org_admin()
    AND sh.organization_id = public.current_org_id()
  GROUP BY g.shift_id
  HAVING count(*) >= 2;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.shift_mileages(UUID[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
