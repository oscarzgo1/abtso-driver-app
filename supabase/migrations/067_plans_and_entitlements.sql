-- ============================================================
-- Migration 067: Plans & entitlements
-- ============================================================
-- Until now organizations.plan was only a label — nothing checked it.
-- This makes it real: a company's plan decides which features and how
-- many employees/depots it gets, enforced in the database so the admin
-- panel and driver app can't be used to get around it.
--
--   plans / plan_features      what each plan includes (Starter, Growth,
--                              Enterprise — same names as the website)
--   feature_catalog            the gateable features and their labels
--   org_feature_overrides      per-company exceptions (a trial, a deal)
--   organizations.max_*_override  per-company limit exceptions
--
-- Everything is controlled by the platform owner from the admin panel's
-- Accounts page; changes take effect immediately, no redeploy.
--
-- Existing companies are moved to Enterprise (full access) so nobody
-- loses anything; the platform owner can change any of them.
-- Employee limits are NULL (unlimited) on every plan for now — the
-- mechanism exists and can be switched on per plan or per company.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── Reference tables ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plans (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INT NOT NULL,
  tagline TEXT,
  max_employees INT CHECK (max_employees IS NULL OR max_employees > 0),
  max_depots INT CHECK (max_depots IS NULL OR max_depots > 0)
);

CREATE TABLE IF NOT EXISTS public.feature_catalog (
  feature_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.plan_features (
  plan_id TEXT NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES public.feature_catalog(feature_key) ON DELETE CASCADE,
  PRIMARY KEY (plan_id, feature_key)
);

CREATE TABLE IF NOT EXISTS public.org_feature_overrides (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES public.feature_catalog(feature_key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, feature_key)
);

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS max_employees_override INT CHECK (max_employees_override IS NULL OR max_employees_override > 0),
  ADD COLUMN IF NOT EXISTS max_depots_override INT CHECK (max_depots_override IS NULL OR max_depots_override > 0);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_feature_overrides ENABLE ROW LEVEL SECURITY;

-- Plan definitions are not secret — any signed-in user may read them.
-- Overrides have no policy: only the SECURITY DEFINER functions below
-- read or write them.
DROP POLICY IF EXISTS "plans_read" ON public.plans;
CREATE POLICY "plans_read" ON public.plans FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "feature_catalog_read" ON public.feature_catalog;
CREATE POLICY "feature_catalog_read" ON public.feature_catalog FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "plan_features_read" ON public.plan_features;
CREATE POLICY "plan_features_read" ON public.plan_features FOR SELECT TO authenticated USING (true);

-- ── Seed: the plans and features from the approved split ─────
INSERT INTO public.feature_catalog (feature_key, label, description, sort_order) VALUES
  ('loads_pod',      'Loads & proof of delivery',       'Attach loads, delivery photos, the Shipments page and carrier settlement import.', 1),
  ('fuel_audit',     'Fuel audit & theft detection',    'Fuel receipt review, MPG checks and fuel anomaly alerts.', 2),
  ('payroll_rates',  'Rates, payroll & expense claims', 'Compensation summary, pay rates and overnight parking claims.', 3),
  ('analytics',      'Analytics & true profit',         'True profit, cost ledger, driver / vehicle / customer performance.', 4),
  ('report_exports', 'Reports & exports',               'Excel and PDF reports, partner share links and the weekly email summary.', 5)
ON CONFLICT (feature_key) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;

INSERT INTO public.plans (id, label, sort_order, tagline, max_employees, max_depots) VALUES
  ('starter',    'Starter',    1, 'Dispatch, driver app, walk-around checks, alerts and compliance.', NULL, 1),
  ('growth',     'Growth',     2, 'Adds loads and proof of delivery, fuel audit, payroll and analytics.', NULL, 1),
  ('enterprise', 'Enterprise', 3, 'Everything, with multiple depots and dedicated support.', NULL, NULL)
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, tagline = EXCLUDED.tagline;

INSERT INTO public.plan_features (plan_id, feature_key)
SELECT p.id, f.feature_key
  FROM public.plans p
  JOIN public.feature_catalog f ON p.id IN ('growth', 'enterprise')
ON CONFLICT DO NOTHING;

-- ── Move existing companies onto the new plan names ──────────
-- Everyone existing gets full access (Enterprise) so no one loses a
-- feature they use today; the platform owner adjusts from Accounts.
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_plan_check;
UPDATE public.organizations SET plan = 'enterprise' WHERE plan NOT IN ('starter', 'growth', 'enterprise');
ALTER TABLE public.organizations ALTER COLUMN plan SET DEFAULT 'starter';
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_check CHECK (plan IN ('starter', 'growth', 'enterprise'));

-- ── Resolution helpers ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.org_has_feature(p_org UUID, p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT o.enabled FROM public.org_feature_overrides o WHERE o.organization_id = p_org AND o.feature_key = p_key),
    EXISTS (
      SELECT 1
        FROM public.organizations org
        JOIN public.plan_features pf ON pf.plan_id = org.plan
       WHERE org.id = p_org AND pf.feature_key = p_key
    )
  );
$$;

-- NULL = unlimited.
CREATE OR REPLACE FUNCTION public.org_limit(p_org UUID, p_kind TEXT)
RETURNS INT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE p_kind
    WHEN 'employees' THEN COALESCE(org.max_employees_override, p.max_employees)
    WHEN 'depots'    THEN COALESCE(org.max_depots_override, p.max_depots)
  END
  FROM public.organizations org
  JOIN public.plans p ON p.id = org.plan
  WHERE org.id = p_org;
$$;

REVOKE ALL ON FUNCTION public.org_has_feature(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_limit(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_has_feature(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_limit(UUID, TEXT) TO authenticated;

-- What the caller's own company gets. Works for admins (matched by
-- email) and for drivers signed in to the app (current_org_id() covers
-- both), so the admin panel and the driver app read the same answer.
CREATE OR REPLACE FUNCTION public.my_entitlements()
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org UUID := public.current_org_id();
  v_plan RECORD;
BEGIN
  IF v_org IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT o.plan AS id, p.label, p.tagline INTO v_plan
    FROM public.organizations o JOIN public.plans p ON p.id = o.plan WHERE o.id = v_org;

  RETURN jsonb_build_object(
    'plan', v_plan.id,
    'plan_label', v_plan.label,
    'tagline', v_plan.tagline,
    'features', COALESCE((
      SELECT jsonb_agg(f.feature_key ORDER BY f.sort_order)
        FROM public.feature_catalog f WHERE public.org_has_feature(v_org, f.feature_key)
    ), '[]'::jsonb),
    'catalog', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', f.feature_key, 'label', f.label, 'description', f.description, 'included', public.org_has_feature(v_org, f.feature_key)) ORDER BY f.sort_order)
        FROM public.feature_catalog f
    ), '[]'::jsonb),
    'limits', jsonb_build_object('employees', public.org_limit(v_org, 'employees'), 'depots', public.org_limit(v_org, 'depots')),
    'usage', jsonb_build_object(
      'employees', (SELECT count(*) FROM public.drivers WHERE organization_id = v_org AND is_active),
      'depots', (SELECT count(*) FROM public.depots WHERE organization_id = v_org)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_entitlements() TO authenticated;

-- ── Enforcement in the database ──────────────────────────────
-- Employee limit: new employees and reactivated ones.
CREATE OR REPLACE FUNCTION public.enforce_employee_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  IF NEW.organization_id IS NULL OR NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active IS TRUE THEN
    RETURN NEW;
  END IF;
  v_limit := public.org_limit(NEW.organization_id, 'employees');
  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_count FROM public.drivers
   WHERE organization_id = NEW.organization_id AND is_active AND id <> NEW.id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Your plan allows up to % active employees. Contact Tachyo to add more.', v_limit USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_employee_limit ON public.drivers;
CREATE TRIGGER trg_enforce_employee_limit
  BEFORE INSERT OR UPDATE OF is_active ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_employee_limit();

-- Depot limit.
CREATE OR REPLACE FUNCTION public.enforce_depot_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org UUID := COALESCE(NEW.organization_id, public.current_org_id());
  v_limit INT;
BEGIN
  IF v_org IS NULL THEN
    RETURN NEW;
  END IF;
  v_limit := public.org_limit(v_org, 'depots');
  IF v_limit IS NOT NULL AND (SELECT count(*) FROM public.depots WHERE organization_id = v_org) >= v_limit THEN
    RAISE EXCEPTION 'Your plan includes % depot%. Contact Tachyo to add more depots.', v_limit, CASE WHEN v_limit = 1 THEN '' ELSE 's' END USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_depot_limit ON public.depots;
CREATE TRIGGER trg_enforce_depot_limit
  BEFORE INSERT ON public.depots
  FOR EACH ROW EXECUTE FUNCTION public.enforce_depot_limit();

-- Feature gates on the tables that hold gated data. (The org is
-- looked up here rather than read from NEW so trigger order between
-- these and the org-filling triggers doesn't matter.)
CREATE OR REPLACE FUNCTION public.gate_loads_feature()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_org UUID;
BEGIN
  SELECT organization_id INTO v_org FROM public.shifts WHERE id = NEW.shift_id;
  IF v_org IS NOT NULL AND NOT public.org_has_feature(v_org, 'loads_pod') THEN
    RAISE EXCEPTION 'Loads and proof of delivery are not included in your plan.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gate_loads_feature ON public.shift_loads;
CREATE TRIGGER trg_gate_loads_feature
  BEFORE INSERT ON public.shift_loads
  FOR EACH ROW EXECUTE FUNCTION public.gate_loads_feature();

-- These two check the company written on the row itself (never the
-- caller's session), so the gate holds no matter who or what is writing.
CREATE OR REPLACE FUNCTION public.gate_analytics_feature()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.organization_id IS NOT NULL AND NOT public.org_has_feature(NEW.organization_id, 'analytics') THEN
    RAISE EXCEPTION 'Analytics is not included in your plan.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.gate_exports_feature()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.organization_id IS NOT NULL AND NOT public.org_has_feature(NEW.organization_id, 'report_exports') THEN
    RAISE EXCEPTION 'Reports and exports are not included in your plan.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gate_org_costs ON public.org_costs;
CREATE TRIGGER trg_gate_org_costs BEFORE INSERT ON public.org_costs
  FOR EACH ROW EXECUTE FUNCTION public.gate_analytics_feature();
DROP TRIGGER IF EXISTS trg_gate_share_links ON public.analytics_share_links;
CREATE TRIGGER trg_gate_share_links BEFORE INSERT ON public.analytics_share_links
  FOR EACH ROW EXECUTE FUNCTION public.gate_exports_feature();

-- ── Platform-owner controls ──────────────────────────────────
-- Replaces the old free/standard/premium version. The legacy names are
-- still accepted (and mapped) so an admin panel that hasn't been
-- updated yet keeps working.
CREATE OR REPLACE FUNCTION public.platform_set_account_plan(p_organization_id UUID, p_plan TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_plan TEXT := CASE p_plan WHEN 'free' THEN 'starter' WHEN 'standard' THEN 'growth' WHEN 'premium' THEN 'enterprise' ELSE p_plan END;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = v_plan) THEN
    RAISE EXCEPTION 'Unknown plan.';
  END IF;
  UPDATE public.organizations SET plan = v_plan, updated_at = now() WHERE id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found.';
  END IF;
END;
$$;

-- Everything the Accounts page needs to show and edit one company's access.
CREATE OR REPLACE FUNCTION public.platform_org_entitlements(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_plan RECORD;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden.' USING ERRCODE = '42501';
  END IF;
  SELECT o.plan AS id, p.label, p.max_employees, p.max_depots, o.max_employees_override, o.max_depots_override
    INTO v_plan FROM public.organizations o JOIN public.plans p ON p.id = o.plan WHERE o.id = p_organization_id;
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'Company not found.';
  END IF;
  RETURN jsonb_build_object(
    'plan', v_plan.id,
    'plan_label', v_plan.label,
    'plans', (SELECT jsonb_agg(jsonb_build_object('id', id, 'label', label) ORDER BY sort_order) FROM public.plans),
    'features', (
      SELECT jsonb_agg(jsonb_build_object(
        'key', f.feature_key, 'label', f.label,
        'in_plan', EXISTS (SELECT 1 FROM public.plan_features pf WHERE pf.plan_id = v_plan.id AND pf.feature_key = f.feature_key),
        'override', (SELECT o.enabled FROM public.org_feature_overrides o WHERE o.organization_id = p_organization_id AND o.feature_key = f.feature_key),
        'effective', public.org_has_feature(p_organization_id, f.feature_key)
      ) ORDER BY f.sort_order)
      FROM public.feature_catalog f
    ),
    'limits', jsonb_build_object(
      'plan_employees', v_plan.max_employees, 'plan_depots', v_plan.max_depots,
      'override_employees', v_plan.max_employees_override, 'override_depots', v_plan.max_depots_override
    ),
    'usage', jsonb_build_object(
      'employees', (SELECT count(*) FROM public.drivers WHERE organization_id = p_organization_id AND is_active),
      'depots', (SELECT count(*) FROM public.depots WHERE organization_id = p_organization_id)
    )
  );
END;
$$;

-- p_enabled NULL removes the override (the plan decides again).
CREATE OR REPLACE FUNCTION public.platform_set_feature_override(p_organization_id UUID, p_feature_key TEXT, p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.feature_catalog WHERE feature_key = p_feature_key) THEN
    RAISE EXCEPTION 'Unknown feature.';
  END IF;
  IF p_enabled IS NULL THEN
    DELETE FROM public.org_feature_overrides WHERE organization_id = p_organization_id AND feature_key = p_feature_key;
  ELSE
    INSERT INTO public.org_feature_overrides (organization_id, feature_key, enabled)
    VALUES (p_organization_id, p_feature_key, p_enabled)
    ON CONFLICT (organization_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();
  END IF;
END;
$$;

-- NULL for a limit = follow the plan.
CREATE OR REPLACE FUNCTION public.platform_set_limit_overrides(p_organization_id UUID, p_max_employees INT, p_max_depots INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.organizations
     SET max_employees_override = p_max_employees, max_depots_override = p_max_depots, updated_at = now()
   WHERE id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_set_account_plan(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_org_entitlements(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_feature_override(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_limit_overrides(UUID, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_account_plan(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_org_entitlements(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_feature_override(UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_limit_overrides(UUID, INT, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
