-- Closes a gap between the marketing site's pricing table
-- (marketing_site/components/PricingTable.tsx) and the plan/entitlement
-- system built in 067_plans_and_entitlements.sql: the website lists
-- "Defect Registry, VOR & Driver Hours (WTD)" as a Growth-tier feature,
-- but the admin dashboard's Defect Registry and Driver Hours & WTD pages
-- were left open on every plan. This adds a matching feature and puts it
-- in the Growth+ plans only, so the product now matches what's sold.
--
-- Note: this deliberately does NOT touch defect *creation* — drivers must
-- still be able to log a walkaround defect and get a vehicle grounded
-- (VOR) on any plan, since that's core road-safety functionality, not a
-- paid extra. It only gates the admin dashboard's Defect Registry and
-- Driver Hours & WTD management pages, the same lighter, UI-only pattern
-- already used for fuel_audit and payroll_rates (no DB write trigger,
-- unlike loads_pod/analytics/report_exports which each have one clear
-- insert point to enforce against).

insert into public.feature_catalog (feature_key, label, description, sort_order)
values ('defect_compliance', 'Defect registry & driver hours (WTD)',
        'The Defect Registry and Driver Hours & WTD compliance pages in Compliance & Safety.', 6)
on conflict (feature_key) do nothing;

insert into public.plan_features (plan_id, feature_key)
select p.id, 'defect_compliance'
from public.plans p
where p.id in ('growth', 'enterprise')
on conflict (plan_id, feature_key) do nothing;
