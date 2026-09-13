-- ============================================================
-- Migration 039: Per-Organization Support Contact Numbers
-- ============================================================
-- The driver app's Settings screen showed two hardcoded phone numbers
-- under "Support" — literal, personal mobile numbers baked into the
-- shared app binary. Every driver, from every company using Tachyo, saw
-- and could call the same two numbers, regardless of which company they
-- actually work for. This migration lets each organization set its own
-- support contact number(s), shown only to that org's own drivers.
--
-- Both nullable and optional: the driver app only renders a row for a
-- number that's actually set, rather than showing an empty placeholder.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS support_phone_1 TEXT,
  ADD COLUMN IF NOT EXISTS support_phone_2 TEXT;

NOTIFY pgrst, 'reload schema';

COMMIT;
