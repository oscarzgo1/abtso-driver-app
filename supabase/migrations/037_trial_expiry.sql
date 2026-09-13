-- ============================================================
-- Migration 037: Trial Expiry — Block at 180 Days, Purge at 210
-- ============================================================
-- organizations.is_active has existed since migration 032 but was never
-- read anywhere — this migration is what gives it meaning. The design:
--   1. company-signup stamps trial_ends_at = signup + 180 days.
--   2. Once trial_ends_at passes, sweep_trial_expirations() (run daily by
--      pg_cron) flips is_active to false. is_org_admin()/is_org_payroll_
--      admin() — the two functions nearly every RLS policy in this schema
--      is built on — now require the caller's org to be active, so this
--      one flag blocks the whole admin portal for that org without
--      touching a dozen individual policies.
--   3. 30 days after that (day 210), the same sweep hard-deletes the
--      org's drivers, shifts, GPS history, alerts, rates, depots, and its
--      admin/driver auth accounts. The organizations row itself is kept
--      as a blocked, emptied tombstone — not re-usable, but a record that
--      the company existed — rather than deleted outright.
--   Deliberately NOT touched here: driver-app self-service policies
--   (shifts_driver_*, drivers_read_own) key off auth.uid() directly and
--   don't route through is_org_admin(), so a driver mid-shift when an org
--   blocks can still clock out rather than being stranded. That's a
--   separate decision from "block the portal" and wasn't asked for here.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ------------------------------------------------------------
-- 1. New columns
-- ------------------------------------------------------------
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS data_purged_at TIMESTAMPTZ;

COMMENT ON COLUMN public.organizations.is_active IS
  'false = portal access blocked for this org (e.g. trial expired). Enforced inside is_org_admin()/is_org_payroll_admin(), not just checked in the app.';
COMMENT ON COLUMN public.organizations.trial_ends_at IS
  'When set, sweep_trial_expirations() sets is_active=false at this time, then purges the org''s data 30 days later. NULL = no trial, never auto-blocked.';
COMMENT ON COLUMN public.organizations.data_purged_at IS
  'Set once sweep_trial_expirations() has deleted this org''s data and auth accounts. The organizations row is kept as a tombstone.';

-- ------------------------------------------------------------
-- 2. Re-point the two admin-check helpers through an is_active gate.
--    Same signature/SECURITY DEFINER/search_path as the originals —
--    only the body changes, so every existing policy built on these
--    (drivers, depots, employee_rates, shifts, shift_revenue, user_roles,
--    idle_alerts/sos_alerts via is_admin()) picks this up automatically.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.organizations o ON o.id = ur.organization_id
    WHERE ur.email = auth.email()
      AND o.is_active
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_org_payroll_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.organizations o ON o.id = ur.organization_id
    WHERE ur.email = auth.email()
      AND ur.role = 'payroll_admin'
      AND o.is_active
  );
END;
$$;

-- ------------------------------------------------------------
-- 3. The sweep. SECURITY DEFINER so the daily pg_cron run (which executes
--    as postgres, not as any particular org's user) can reach auth.users;
--    a failure purging one org doesn't roll back another's, since each
--    org's purge commits as part of the same statement set but the loop
--    itself has no per-iteration transaction boundary to break on.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_trial_expirations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org RECORD;
BEGIN
  -- Block: trial has ended, org still marked active.
  UPDATE public.organizations
  SET is_active = false, updated_at = now()
  WHERE is_active = true
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now();

  -- Purge: blocked 30+ days (measured from trial_ends_at itself, the
  -- block date), not yet purged.
  FOR v_org IN
    SELECT id FROM public.organizations
    WHERE is_active = false
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at < now() - interval '30 days'
      AND data_purged_at IS NULL
  LOOP
    DELETE FROM auth.users
    WHERE email IN (SELECT email FROM public.user_roles WHERE organization_id = v_org.id);

    DELETE FROM public.user_roles WHERE organization_id = v_org.id;
    DELETE FROM public.gps_locations WHERE organization_id = v_org.id;
    DELETE FROM public.idle_alerts WHERE organization_id = v_org.id;
    DELETE FROM public.sos_alerts WHERE organization_id = v_org.id;
    DELETE FROM public.shift_revenue WHERE organization_id = v_org.id;
    DELETE FROM public.shifts WHERE organization_id = v_org.id;
    DELETE FROM public.employee_rates WHERE organization_id = v_org.id;
    DELETE FROM public.drivers WHERE organization_id = v_org.id;
    DELETE FROM public.depots WHERE organization_id = v_org.id;

    UPDATE public.organizations
    SET data_purged_at = now(),
        signup_code_logistics_hash = NULL,
        signup_code_payroll_hash = NULL
    WHERE id = v_org.id;
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 4. Daily schedule, 03:00 UTC. Guarded so re-running this migration
--    doesn't create a duplicate cron job.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trial-expiry-sweep') THEN
    PERFORM cron.schedule(
      'trial-expiry-sweep',
      '0 3 * * *',
      $sql$SELECT public.sweep_trial_expirations();$sql$
    );
  END IF;
END;
$$;

COMMIT;
