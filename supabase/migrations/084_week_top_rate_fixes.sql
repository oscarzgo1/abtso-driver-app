-- ============================================================
-- 084: Fixes to the week_top_rate pay mode (see 083)
--  * A rate lifted automatically on an earlier shift needs a new
--    snapshot timestamp even inside one transaction (clock_timestamp()).
--  * The pay week the rule looks at is a company setting: Monday-Sunday
--    (default, so Fri + Sat + Sun fall in one week) or Sunday-Saturday.
-- Patches are applied to the live function text and are safe to re-run.
-- ============================================================
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS pay_week_starts_on TEXT NOT NULL DEFAULT 'monday';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_pay_week_starts_on_check') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_pay_week_starts_on_check CHECK (pay_week_starts_on IN ('monday', 'sunday'));
  END IF;
END $$;

DO $$
DECLARE
  def TEXT;
  fixed TEXT;
  clock_old TEXT := E'rate_snapshot_timestamp = now()\n       WHERE';
  clock_new TEXT := E'rate_snapshot_timestamp = clock_timestamp()\n       WHERE';
  week_old TEXT := 'v_week_start := v_local::date - EXTRACT(DOW FROM v_local)::int;';
  week_new TEXT := $w$v_week_start := v_local::date - CASE
              WHEN COALESCE((SELECT o.pay_week_starts_on FROM public.organizations o JOIN public.drivers dd ON dd.organization_id = o.id WHERE dd.id = NEW.driver_id), 'monday') = 'sunday'
                THEN EXTRACT(DOW FROM v_local)::int
              ELSE EXTRACT(ISODOW FROM v_local)::int - 1
            END;$w$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p
   WHERE p.proname = 'calculate_shift_financials' AND p.pronamespace = 'public'::regnamespace;
  fixed := def;
  IF position(clock_old IN fixed) > 0 THEN fixed := replace(fixed, clock_old, clock_new); END IF;
  IF position(week_old IN fixed) > 0 THEN fixed := replace(fixed, week_old, week_new); END IF;
  IF fixed <> def THEN EXECUTE fixed; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_pay_rules(p_mode TEXT, p_week_starts_on TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_payroll_admin() THEN
    RAISE EXCEPTION 'Only a payroll admin can change how pay is calculated.';
  END IF;
  IF p_mode NOT IN ('shift_start_day', 'split_by_day', 'week_top_rate') THEN
    RAISE EXCEPTION 'Unknown pay calculation mode.';
  END IF;
  IF p_week_starts_on NOT IN ('monday', 'sunday') THEN
    RAISE EXCEPTION 'Unknown week start.';
  END IF;
  UPDATE public.organizations
     SET pay_day_mode = p_mode, pay_week_starts_on = p_week_starts_on
   WHERE id = public.current_org_id();
END;
$$;
REVOKE ALL ON FUNCTION public.set_pay_rules(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pay_rules(TEXT, TEXT) TO authenticated;
