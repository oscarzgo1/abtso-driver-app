-- ============================================================
-- ABTSO Logistics — Migration 031: Re-attach Shift Financials Trigger
-- ============================================================
-- Live testing found that clocking out via the driver app (end_shift RPC)
-- was returning total_hours/total_pay/effective_rate as null, and even the
-- trigger's unconditional fields (week_number, updated_at) were left
-- untouched — meaning trg_shift_financials was not firing on UPDATE at all,
-- despite public.calculate_shift_financials() (the function it should call)
-- being correct and up to date. Re-creating the trigger from scratch
-- guarantees it is actually attached to public.shifts.
-- ============================================================

DROP TRIGGER IF EXISTS trg_shift_financials ON public.shifts;

CREATE TRIGGER trg_shift_financials
  BEFORE INSERT OR UPDATE ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_shift_financials();

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
