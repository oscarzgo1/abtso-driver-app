-- ============================================================
-- Migration 043: defect photo evidence column + threshold default fix
-- ============================================================
-- 1. compliance_alert_lead_days default corrected to 30 (matches the
--    finalised spec — migration 042 briefly set it to 7). Existing
--    organizations keep whatever value they already have; this only
--    changes what a brand-new org starts with.
-- 2. incident_reports.photo_urls — real column for driver-submitted
--    defect evidence photos. NOT populated by anything yet: the driver
--    app has no camera/upload flow built, so every existing row (and
--    every new one until that's built) has an empty array here. The
--    admin gallery/lightbox reads this honestly — "No photos attached"
--    rather than a fabricated count — until that capture flow exists.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.organizations
  ALTER COLUMN compliance_alert_lead_days SET DEFAULT 30;

ALTER TABLE public.incident_reports
  ADD COLUMN IF NOT EXISTS photo_urls TEXT[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';

COMMIT;
