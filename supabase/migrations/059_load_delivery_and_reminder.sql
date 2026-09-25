-- ============================================================
-- Migration 059: Load Delivery Confirmation + Load Reminder Setting
-- ============================================================
-- shift_revenue.delivered_at: set when the driver confirms in the app
-- that the attached load has been delivered. Written only through the
-- attach-load Edge Function (drivers still have no RLS access to
-- shift_revenue — see migration 035 — so revenue_amount stays hidden).
-- Attaching a new load to the same shift clears it again.
--
-- organizations.load_reminder_minutes: how long a driver's vehicle must
-- sit stationary before the app reminds them to attach a load (none
-- attached yet) or confirm delivery (attached, not yet confirmed).
-- Same per-organization settings pattern as idle_alert_minutes (038).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.shift_revenue
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

COMMENT ON COLUMN public.shift_revenue.delivered_at IS
  'When the driver confirmed in the app that this load was delivered. NULL = not yet confirmed.';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS load_reminder_minutes INTEGER NOT NULL DEFAULT 30
    CHECK (load_reminder_minutes BETWEEN 5 AND 600);

COMMENT ON COLUMN public.organizations.load_reminder_minutes IS
  'Minutes a driver''s vehicle must be stationary before the app reminds them to attach a load or confirm delivery.';

NOTIFY pgrst, 'reload schema';

COMMIT;
