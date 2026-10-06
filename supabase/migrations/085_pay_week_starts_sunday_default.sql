-- 085: The company pay week runs Sunday to Saturday (Sunday opens a new week),
-- so Sunday is the default start for the week-top-rate rule. Orgs not using
-- that rule are moved to the new default; nobody's pay is affected.
ALTER TABLE public.organizations ALTER COLUMN pay_week_starts_on SET DEFAULT 'sunday';
UPDATE public.organizations SET pay_week_starts_on = 'sunday' WHERE pay_day_mode <> 'week_top_rate' AND pay_week_starts_on = 'monday';
