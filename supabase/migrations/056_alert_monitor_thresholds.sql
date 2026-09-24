-- ============================================================
-- Migration 056: Alert Monitor Thresholds — Fuel Anomaly
-- ============================================================
-- Closes a real gap from the fuel-theft-detection pass (055): the
-- MPG floor and rolling-average-drop percentage that decide whether
-- a fuel log gets flagged were hardcoded constants in the admin
-- dashboard with no admin control at all. Same per-organization
-- settings pattern already used for long_shift_flag_hours /
-- idle_alert_minutes / compliance_alert_lead_days (migration 038) —
-- an operator's real fleet (weight, routes, driving style) can
-- reasonably run a different MPG floor than another's.
--
-- walkaround_check_target_minutes already exists (migration 052) —
-- not touched here, just finally surfaced in the same Settings >
-- Alerts panel as everything else instead of being unreachable.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS fuel_anomaly_min_mpg NUMERIC(4,1) NOT NULL DEFAULT 6.5 CHECK (fuel_anomaly_min_mpg > 0),
  ADD COLUMN IF NOT EXISTS fuel_anomaly_rolling_drop_percent INTEGER NOT NULL DEFAULT 30 CHECK (fuel_anomaly_rolling_drop_percent > 0 AND fuel_anomaly_rolling_drop_percent < 100);

COMMENT ON COLUMN public.organizations.fuel_anomaly_min_mpg IS 'Absolute UK MPG floor — a fill-up below this is flagged regardless of that vehicle''s own history.';
COMMENT ON COLUMN public.organizations.fuel_anomaly_rolling_drop_percent IS 'A fill-up whose MPG drops this many percent below that specific vehicle''s recent rolling average is flagged, even if still above the absolute floor.';

NOTIFY pgrst, 'reload schema';

COMMIT;
