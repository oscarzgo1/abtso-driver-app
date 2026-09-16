-- ============================================================
-- Migration 042: rename mot_alert_lead_days -> compliance_alert_lead_days
-- ============================================================
-- The lead-time setting now drives Due Soon/VOR thresholds across every
-- inspection type (MOT/PMI/Tacho/Roller Brake/LOLER), not just MOT, so
-- the column name is generalised to match. Default changed from 30 to 7
-- days per the current spec; existing organizations keep whatever value
-- they already have (a rename does not touch existing row data).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.organizations
  RENAME COLUMN mot_alert_lead_days TO compliance_alert_lead_days;

ALTER TABLE public.organizations
  ALTER COLUMN compliance_alert_lead_days SET DEFAULT 7;

NOTIFY pgrst, 'reload schema';

COMMIT;
