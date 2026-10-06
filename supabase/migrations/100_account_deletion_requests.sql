-- ============================================================
-- Migration 100: employee account-deletion requests
-- ============================================================
-- An employee can ask for their account and everything attached to it to be
-- deleted, from the driver app's login screen (signed out: company code +
-- Driver ID) or its settings (signed in). The request lands in the admin
-- panel's Alert Panel ("Account Deletion Requests"). Nothing is deleted until
-- an administrator confirms there — complete_account_deletion() then removes
-- the employee's rows everywhere and their sign-in, and scrubs the request.
--
-- The signed-out entry point never reveals whether a Driver ID exists: it
-- always answers the same, and only stores a request when the company code
-- and Driver ID match exactly one employee.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  driver_ref TEXT,
  driver_name TEXT,
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 500),
  source TEXT NOT NULL CHECK (source IN ('login', 'app')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'dismissed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_at TIMESTAMPTZ,
  handled_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_one_pending
  ON public.account_deletion_requests (driver_id) WHERE status = 'pending' AND driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_account_deletion_org ON public.account_deletion_requests (organization_id, status, requested_at DESC);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_deletion_admin_all" ON public.account_deletion_requests;
CREATE POLICY "account_deletion_admin_all"
  ON public.account_deletion_requests FOR ALL
  TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'account_deletion_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.account_deletion_requests;
  END IF;
END $$;

-- Signed out (login screen): company code + Driver ID.
CREATE OR REPLACE FUNCTION public.request_account_deletion_public(p_company_code TEXT, p_driver_id TEXT, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
  d public.drivers%ROWTYPE;
BEGIN
  IF coalesce(btrim(p_driver_id), '') = '' THEN
    RAISE EXCEPTION 'Enter your Driver ID.';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.drivers x JOIN public.organizations o ON o.id = x.organization_id
  WHERE x.driver_id = upper(btrim(p_driver_id))
    AND (coalesce(btrim(p_company_code), '') = '' OR o.slug = lower(btrim(p_company_code)));

  -- Same answer whether or not it matched.
  IF v_count <> 1 THEN
    RETURN;
  END IF;

  SELECT x.* INTO d
  FROM public.drivers x JOIN public.organizations o ON o.id = x.organization_id
  WHERE x.driver_id = upper(btrim(p_driver_id))
    AND (coalesce(btrim(p_company_code), '') = '' OR o.slug = lower(btrim(p_company_code)));

  INSERT INTO public.account_deletion_requests (organization_id, driver_id, driver_ref, driver_name, reason, source)
  VALUES (d.organization_id, d.id, d.driver_id, d.full_name, NULLIF(left(btrim(coalesce(p_reason, '')), 500), ''), 'login')
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion_public(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_account_deletion_public(TEXT, TEXT, TEXT) TO anon, authenticated;

-- Signed in (app settings).
CREATE OR REPLACE FUNCTION public.request_account_deletion(p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE d public.drivers%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.drivers WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only employees signed in to the Tachyo app can request this.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.account_deletion_requests (organization_id, driver_id, driver_ref, driver_name, reason, source)
  VALUES (d.organization_id, d.id, d.driver_id, d.full_name, NULLIF(left(btrim(coalesce(p_reason, '')), 500), ''), 'app')
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(TEXT) TO authenticated;

-- Admin confirms: delete everything attached to the employee, then the
-- sign-in, and scrub the request so no personal details remain.
CREATE OR REPLACE FUNCTION public.complete_account_deletion(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.account_deletion_requests%ROWTYPE;
  v_driver UUID;
BEGIN
  IF NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'Only an administrator can delete an account.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.account_deletion_requests WHERE id = p_request_id AND organization_id = public.current_org_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found.' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been handled.';
  END IF;
  v_driver := r.driver_id;
  IF v_driver IS NULL OR NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = v_driver AND organization_id = r.organization_id) THEN
    RAISE EXCEPTION 'This employee no longer exists.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE id = v_driver) THEN
    RAISE EXCEPTION 'This person also has an office login — remove that first.';
  END IF;

  -- Tables that RESTRICT on driver_id go first.
  DELETE FROM public.gps_locations WHERE driver_id = v_driver;
  DELETE FROM public.walkaround_checks WHERE driver_id = v_driver;
  DELETE FROM public.incident_reports WHERE driver_id = v_driver;
  DELETE FROM public.fuel_receipts WHERE driver_id = v_driver;
  DELETE FROM public.parking_expenses WHERE driver_id = v_driver;
  -- Their shifts (loads, revenue, alerts, proofs, signatures cascade).
  DELETE FROM public.shifts WHERE driver_id = v_driver;
  -- Holidays, rota, rates, loads, sign-offs, codes, alerts cascade with the employee.
  DELETE FROM public.drivers WHERE id = v_driver;
  -- The sign-in itself.
  DELETE FROM auth.users WHERE id = v_driver;

  UPDATE public.account_deletion_requests
     SET status = 'completed', handled_at = now(), handled_by = lower(auth.jwt() ->> 'email'),
         driver_id = NULL, driver_name = NULL, driver_ref = NULL, reason = NULL
   WHERE id = r.id;

  PERFORM public.record_audit(r.organization_id, 'account_data_deleted', lower(auth.jwt() ->> 'email'), NULL, NULL,
    jsonb_build_object('request_id', r.id, 'source', r.source));
END;
$$;

REVOKE ALL ON FUNCTION public.complete_account_deletion(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_account_deletion(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
