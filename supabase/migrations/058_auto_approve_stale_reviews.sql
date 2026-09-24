-- ============================================================
-- Migration 058: Auto-Approve Stale Fuel/Parking Reviews
-- ============================================================
-- Fuel receipts (047) and overnight parking claims (054) both sit
-- 'pending' until an org admin reviews them from the Alert Panel. If
-- nobody acts, this sweep auto-approves anything still pending 10
-- hours after submission — a driver's legitimate claim shouldn't be
-- stuck in limbo indefinitely just because nobody happened to open
-- the panel. auto_approved records WHICH rows went through this path
-- (vs. a real manual decision) purely for admin visibility; it isn't
-- read by any payroll/ledger calculation.
--
-- Fuel receipts: a plain status flip — approval has no other side
-- effect (approvedFuelCostByShift in App.tsx just filters on status).
--
-- Parking claims: approving one also credits its amount onto the
-- linked shift's extras_amount/extras_note — the exact same
-- shift-financial side effect handleReviewParkingExpense() performs
-- client-side (App.tsx), reproduced here so an auto-approval isn't a
-- second, inconsistent code path. A claim with no shift_id has
-- nowhere to credit the money — same rule the manual approve button
-- already enforces — so it's left pending until an admin assigns a
-- shift; the 10-hour clock does not auto-approve those.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ------------------------------------------------------------
-- 1. Audit column — which rows were approved by the sweep, not a
--    person.
-- ------------------------------------------------------------
ALTER TABLE public.fuel_receipts ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.parking_expenses ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.fuel_receipts.auto_approved IS
  'true when sweep_stale_review_approvals() approved this after 10 hours of no manual review, not an admin decision.';
COMMENT ON COLUMN public.parking_expenses.auto_approved IS
  'true when sweep_stale_review_approvals() approved this after 10 hours of no manual review, not an admin decision.';

-- ------------------------------------------------------------
-- 2. The sweep. SECURITY DEFINER so the pg_cron run (executes as
--    postgres, not any particular org's admin) can write across every
--    org's rows in one pass.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_stale_review_approvals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Fuel receipts — no shift-financial side effect to replicate.
  UPDATE public.fuel_receipts
  SET status = 'approved', reviewed_at = now(), auto_approved = true
  WHERE status = 'pending'
    AND created_at < now() - interval '10 hours';

  -- Parking claims — credit the shift BEFORE flipping status, since
  -- this join keys off status = 'pending'.
  UPDATE public.shifts s
  SET extras_amount = COALESCE(s.extras_amount, 0) + pe.amount,
      extras_note = CASE
        WHEN s.extras_note IS NOT NULL AND s.extras_note <> '' THEN
          s.extras_note || '; ' || (
            'Overnight parking' ||
            CASE WHEN pe.location IS NOT NULL AND pe.location <> '' THEN ' (' || pe.location || ')' ELSE '' END ||
            ': £' || to_char(pe.amount, 'FM999999990.00')
          )
        ELSE
          'Overnight parking' ||
          CASE WHEN pe.location IS NOT NULL AND pe.location <> '' THEN ' (' || pe.location || ')' ELSE '' END ||
          ': £' || to_char(pe.amount, 'FM999999990.00')
      END
  FROM public.parking_expenses pe
  WHERE pe.shift_id = s.id
    AND pe.status = 'pending'
    AND pe.shift_id IS NOT NULL
    AND pe.created_at < now() - interval '10 hours';

  UPDATE public.parking_expenses
  SET status = 'approved', reviewed_at = now(), auto_approved = true
  WHERE status = 'pending'
    AND shift_id IS NOT NULL
    AND created_at < now() - interval '10 hours';
END;
$$;

-- ------------------------------------------------------------
-- 3. Every 15 minutes — frequent enough that nothing sits stale for
--    much longer than the 10-hour mark itself. Guarded so re-running
--    this migration doesn't create a duplicate cron job.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep-stale-review-approvals') THEN
    PERFORM cron.schedule(
      'sweep-stale-review-approvals',
      '*/15 * * * *',
      $sql$SELECT public.sweep_stale_review_approvals();$sql$
    );
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
