-- 084: Enforce two-step sign-in at the database, not just in the dashboard.
--
-- Until now MFA was only a UI gate: a password-only (AAL1) session for an
-- admin with a verified authenticator could still read and write every
-- table through the REST API, because no policy looked at the session's
-- assurance level. This adds one RESTRICTIVE policy per RLS table so that,
-- for any user who has a verified factor, every row requires an AAL2 JWT.
-- Users without a factor (all drivers, admins who haven't enrolled) are
-- unaffected. Service-role callers (edge functions) bypass RLS as before.

CREATE OR REPLACE FUNCTION public.mfa_satisfied()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      OR NOT EXISTS (
        SELECT 1 FROM auth.mfa_factors f
        WHERE f.user_id = auth.uid() AND f.status = 'verified'
      );
$$;

REVOKE EXECUTE ON FUNCTION public.mfa_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_satisfied() TO authenticated, service_role;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS mfa_required ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY mfa_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT public.mfa_satisfied())) WITH CHECK ((SELECT public.mfa_satisfied()))',
      t.relname);
  END LOOP;
END $$;
