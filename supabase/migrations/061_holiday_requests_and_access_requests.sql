-- ============================================================
-- Migration 061: Holiday Requests + Interest Buyers / Account Control
-- ============================================================
-- 1. HOLIDAY REQUESTS
--    employee_holidays (057) was an admin-only logged calendar. Every
--    employee can now request holiday from the app; requests wait as
--    'pending' until an admin approves or declines them (Alert Panel /
--    Employee Holidays page). Existing and admin-entered rows default to
--    'approved', so the live admin panel keeps working unchanged.
--    Drivers never write the table directly — request_holiday() and
--    cancel_holiday_request() validate dates/overlaps server-side — and
--    can only read their own rows.
--
-- 2. INTEREST BUYERS + ACCOUNT CONTROL
--    Self-service company signup gave any visitor a working admin panel
--    for free. New visitors are now "interest buyers": a request-access
--    form (website + admin login page) stores an access_requests row and
--    creates NO account. The platform owner (platform_admins) reviews
--    them on the admin panel's Accounts page and creates the company +
--    first admin account on approval (platform-accounts Edge Function).
--    Existing accounts can be suspended/reactivated there.
--
--    is_org_admin()/is_org_payroll_admin() now also require the caller's
--    organization to be active (the gate migration 037 intended but was
--    never applied live), so a suspended company is blocked by RLS, not
--    just by the login screen. Every existing organization is active and
--    every user_roles row has an organization, so nothing changes for
--    current users.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ------------------------------------------------------------
-- 1. Holiday requests
-- ------------------------------------------------------------
ALTER TABLE public.employee_holidays
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS leave_type TEXT NOT NULL DEFAULT 'annual',
  ADD COLUMN IF NOT EXISTS requested_by_driver BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

ALTER TABLE public.employee_holidays DROP CONSTRAINT IF EXISTS employee_holidays_status_check;
ALTER TABLE public.employee_holidays ADD CONSTRAINT employee_holidays_status_check
  CHECK (status IN ('pending', 'approved', 'declined', 'cancelled'));
ALTER TABLE public.employee_holidays DROP CONSTRAINT IF EXISTS employee_holidays_leave_type_check;
ALTER TABLE public.employee_holidays ADD CONSTRAINT employee_holidays_leave_type_check
  CHECK (leave_type IN ('annual', 'unpaid', 'other'));

CREATE INDEX IF NOT EXISTS idx_employee_holidays_status ON public.employee_holidays(status);

COMMENT ON COLUMN public.employee_holidays.status IS
  'pending = requested from the app, awaiting admin review; approved rows are the calendar; declined/cancelled are kept for the record.';

-- Employees read only their own holidays; all writes go through the
-- functions below.
DROP POLICY IF EXISTS "employee_holidays_driver_read_own" ON public.employee_holidays;
CREATE POLICY "employee_holidays_driver_read_own"
  ON public.employee_holidays FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

CREATE OR REPLACE FUNCTION public.request_holiday(
  p_start DATE,
  p_end DATE,
  p_leave_type TEXT DEFAULT 'annual',
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id UUID;
  v_today DATE := (now() AT TIME ZONE 'Europe/London')::date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Only employees signed in to the Tachyo app can request holiday.' USING ERRCODE = '42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'Choose the first and last day of your holiday.';
  END IF;
  IF p_end < p_start THEN
    RAISE EXCEPTION 'The last day must be on or after the first day.';
  END IF;
  IF p_start < v_today THEN
    RAISE EXCEPTION 'Holiday dates can''t be in the past.';
  END IF;
  IF p_end - p_start > 60 THEN
    RAISE EXCEPTION 'A single request can cover at most 61 days — split longer leave into separate requests.';
  END IF;
  IF coalesce(p_leave_type, '') NOT IN ('annual', 'unpaid', 'other') THEN
    RAISE EXCEPTION 'Unknown leave type.';
  END IF;
  IF length(coalesce(p_note, '')) > 500 THEN
    RAISE EXCEPTION 'Keep the note under 500 characters.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.employee_holidays h
    WHERE h.driver_id = auth.uid()
      AND h.status IN ('pending', 'approved')
      AND h.start_date <= p_end
      AND h.end_date >= p_start
  ) THEN
    RAISE EXCEPTION 'You already have holiday booked or requested on some of these dates.';
  END IF;

  -- organization_id is filled by trg_sync_org_id_employee_holidays.
  INSERT INTO public.employee_holidays (driver_id, start_date, end_date, note, status, leave_type, requested_by_driver)
  VALUES (auth.uid(), p_start, p_end, NULLIF(btrim(p_note), ''), 'pending', p_leave_type, true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_holiday_request(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.employee_holidays
  SET status = 'cancelled'
  WHERE id = p_id
    AND driver_id = auth.uid()
    AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only a request that is still waiting for approval can be cancelled.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.request_holiday(DATE, DATE, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_holiday(DATE, DATE, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_holiday_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_holiday_request(UUID) TO authenticated;

-- Realtime: admins see new requests arrive, employees see decisions
-- land. walkaround_checks is added too — the Walk-Around Checks page
-- already subscribes to it but the table was never published.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'employee_holidays') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_holidays;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'walkaround_checks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.walkaround_checks;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Organization active gate on the admin helpers
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
    LEFT JOIN public.organizations o ON o.id = ur.organization_id
    WHERE ur.email = auth.email()
      AND (ur.organization_id IS NULL OR o.is_active IS NOT FALSE)
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
    LEFT JOIN public.organizations o ON o.id = ur.organization_id
    WHERE ur.email = auth.email()
      AND ur.role = 'payroll_admin'
      AND (ur.organization_id IS NULL OR o.is_active IS NOT FALSE)
  );
END;
$$;

-- ------------------------------------------------------------
-- 3. Platform owner
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_admins (
  email TEXT PRIMARY KEY CHECK (email = lower(email)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- No policies: only SECURITY DEFINER functions and the service role
-- ever read it.
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE email = lower(coalesce(auth.email(), ''))
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- The platform owner is the payroll admin of the original Tachyo
-- organization (oskar-ltd). More can be added with a plain INSERT.
INSERT INTO public.platform_admins (email)
SELECT lower(ur.email)
FROM public.user_roles ur
JOIN public.organizations o ON o.id = ur.organization_id
WHERE o.slug = 'oskar-ltd' AND ur.role = 'payroll_admin'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 4. Interest buyers
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  fleet_size TEXT,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'website' CHECK (source IN ('website', 'admin_login')),
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'contacted', 'demo_booked', 'approved', 'declined')),
  notes TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_access_requests_created ON public.access_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_requests_email ON public.access_requests(lower(email));

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- Inserts come only from the request-access Edge Function (service
-- role); the platform owner can read them directly for counts.
DROP POLICY IF EXISTS "access_requests_platform_admin_read" ON public.access_requests;
CREATE POLICY "access_requests_platform_admin_read"
  ON public.access_requests FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

-- ------------------------------------------------------------
-- 5. Platform-owner functions (everything except creating auth
--    accounts, which needs the platform-accounts Edge Function)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_account_overview()
RETURNS TABLE (
  organization_id UUID,
  name TEXT,
  slug TEXT,
  plan TEXT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  admin_emails TEXT[],
  employees BIGINT,
  active_employees BIGINT,
  shifts_total BIGINT,
  shifts_30d BIGINT,
  last_shift_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.slug,
    o.plan,
    o.is_active,
    o.created_at,
    COALESCE((SELECT array_agg(ur.email ORDER BY ur.role DESC, ur.email) FROM public.user_roles ur WHERE ur.organization_id = o.id), '{}'::TEXT[]),
    (SELECT count(*) FROM public.drivers d WHERE d.organization_id = o.id),
    (SELECT count(*) FROM public.drivers d WHERE d.organization_id = o.id AND d.is_active),
    (SELECT count(*) FROM public.shifts s WHERE s.organization_id = o.id),
    (SELECT count(*) FROM public.shifts s WHERE s.organization_id = o.id AND s.start_time >= now() - interval '30 days'),
    (SELECT max(s.start_time) FROM public.shifts s WHERE s.organization_id = o.id)
  FROM public.organizations o
  ORDER BY o.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_set_account_active(p_organization_id UUID, p_active BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden.' USING ERRCODE = '42501';
  END IF;
  IF NOT p_active AND p_organization_id = public.current_org_id() THEN
    RAISE EXCEPTION 'You can''t suspend your own company.';
  END IF;
  UPDATE public.organizations SET is_active = p_active, updated_at = now() WHERE id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_set_account_plan(p_organization_id UUID, p_plan TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden.' USING ERRCODE = '42501';
  END IF;
  IF p_plan NOT IN ('free', 'standard', 'premium') THEN
    RAISE EXCEPTION 'Plan must be free, standard or premium.';
  END IF;
  UPDATE public.organizations SET plan = p_plan, updated_at = now() WHERE id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_update_access_request(p_id UUID, p_stage TEXT, p_notes TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden.' USING ERRCODE = '42501';
  END IF;
  -- 'approved' is only set by the platform-accounts function, once the
  -- account actually exists.
  IF p_stage IS NOT NULL AND p_stage NOT IN ('new', 'contacted', 'demo_booked', 'declined') THEN
    RAISE EXCEPTION 'Unknown stage.';
  END IF;
  UPDATE public.access_requests
  SET stage = COALESCE(p_stage, stage),
      notes = CASE WHEN p_notes IS NULL THEN notes ELSE NULLIF(btrim(p_notes), '') END,
      updated_at = now(),
      reviewed_at = CASE WHEN p_stage IS NOT NULL AND p_stage <> stage THEN now() ELSE reviewed_at END,
      reviewed_by = CASE WHEN p_stage IS NOT NULL AND p_stage <> stage THEN lower(auth.email()) ELSE reviewed_by END
  WHERE id = p_id
    AND stage <> 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, or its account has already been created.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_account_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_account_overview() TO authenticated;
REVOKE ALL ON FUNCTION public.platform_set_account_active(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_account_active(UUID, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.platform_set_account_plan(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_account_plan(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.platform_update_access_request(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_update_access_request(UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
