-- 081: Re-enable row-level security on public.user_roles.
--
-- Production had RLS switched off on user_roles while the default Supabase
-- grants (SELECT/INSERT/UPDATE/DELETE) were still in place for anon and
-- authenticated. With the public anon key from the web bundle, anyone could
-- read every company's admin emails or grant themselves payroll_admin on any
-- organization. The policies user_roles_read_own / user_roles_org_admin_all
-- already existed; they simply weren't being enforced.
--
-- Callers are unaffected: the dashboard only reads its own row (covered by
-- user_roles_read_own), the helper functions (current_org_id,
-- is_org_payroll_admin, is_org_admin) are SECURITY DEFINER, and the edge
-- functions use the service role, which bypasses RLS.

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Signed-out visitors never need this table.
REVOKE ALL ON public.user_roles FROM anon;
