-- 102: let a company admin set what happens when a driver is idle (see 101).
CREATE OR REPLACE FUNCTION public.set_idle_policy(p_action TEXT, p_notify_driver BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'Only a company admin can change the idle policy.';
  END IF;
  IF p_action NOT IN ('none', 'freeze_time') THEN
    RAISE EXCEPTION 'Unknown action.';
  END IF;
  UPDATE public.organizations
     SET idle_action = p_action,
         idle_notify_driver = COALESCE(p_notify_driver, true)
   WHERE id = public.current_org_id();
END;
$$;

REVOKE ALL ON FUNCTION public.set_idle_policy(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_idle_policy(TEXT, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
