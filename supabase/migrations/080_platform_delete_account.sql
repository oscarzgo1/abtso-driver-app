-- ============================================================
-- Migration 080: Permanently delete a customer account (platform owner)
-- ============================================================
-- Suspend/reactivate (platform_set_account_active, migration 061) keeps
-- everything and just blocks sign-in. This is the opposite: a hard,
-- irreversible delete of a company and every row that belongs to it —
-- drivers, shifts, telemetry, walk-arounds, proofs, loads, the lot.
--
-- Safety:
--   - is_platform_admin() only (same gate as every other platform_*
--     function).
--   - Can't target the caller's own organization (the platform owner's
--     own company can't be deleted from its own Accounts page).
--   - p_confirm_name must match the organization's name exactly
--     (case-sensitive) — mirrors the admin dashboard's own "type the
--     name to confirm" pattern used elsewhere for irreversible actions.
--
-- Returns the auth user ids that existed for this org (every driver id
-- plus every user_roles id) so the platform-accounts Edge Function can
-- delete the matching Supabase Auth users afterward — this SQL function
-- only touches public.* tables; auth.users deletion needs the service
-- role's admin API, which only runs in the Edge Function.
--
-- Deletion order respects every FK into drivers/shifts/vehicles that
-- isn't already ON DELETE CASCADE (checked directly against the live
-- schema): gps_locations, walkaround_checks, incident_reports and
-- fuel_receipts all RESTRICT on driver_id, so they're removed before
-- drivers; shifts is removed before drivers/vehicles/depots for the
-- same reason. Everything CASCADE-linked from drivers/shifts/vehicles/
-- the organization itself is left for Postgres to clean up when those
-- rows go.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.platform_delete_account(p_organization_id UUID, p_confirm_name TEXT)
RETURNS TABLE (deleted_auth_ids UUID[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name TEXT;
  v_auth_ids UUID[];
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only the platform owner can delete an account.' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id = public.current_org_id() THEN
    RAISE EXCEPTION 'Cannot delete your own company from here.';
  END IF;

  SELECT name INTO v_name FROM public.organizations WHERE id = p_organization_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Account not found.';
  END IF;
  IF p_confirm_name IS NULL OR p_confirm_name <> v_name THEN
    RAISE EXCEPTION 'Company name did not match — nothing was deleted.';
  END IF;

  -- Collect every Supabase Auth user this org has (drivers + office
  -- logins) before any rows disappear.
  SELECT array_agg(id) INTO v_auth_ids FROM (
    SELECT id FROM public.drivers WHERE organization_id = p_organization_id
    UNION
    SELECT id FROM public.user_roles WHERE organization_id = p_organization_id
  ) ids;

  -- Tables that RESTRICT/NO ACTION on driver_id, shift_id or vehicle_id —
  -- must go before drivers/shifts/vehicles themselves.
  DELETE FROM public.gps_locations WHERE organization_id = p_organization_id;
  DELETE FROM public.walkaround_checks WHERE organization_id = p_organization_id;
  DELETE FROM public.incident_reports WHERE organization_id = p_organization_id;
  DELETE FROM public.fuel_receipts WHERE organization_id = p_organization_id;
  DELETE FROM public.parking_expenses WHERE organization_id = p_organization_id;

  -- CASCADE from drivers/shifts already, but organization_id itself is
  -- NO ACTION — delete explicitly so the final organizations delete
  -- below isn't blocked by a stray row.
  DELETE FROM public.sos_alerts WHERE organization_id = p_organization_id;
  DELETE FROM public.idle_alerts WHERE organization_id = p_organization_id;
  DELETE FROM public.employee_holidays WHERE organization_id = p_organization_id;
  DELETE FROM public.employee_rates WHERE organization_id = p_organization_id;
  DELETE FROM public.driver_activation_codes WHERE organization_id = p_organization_id;
  DELETE FROM public.driver_pin_reset_requests WHERE organization_id = p_organization_id;
  DELETE FROM public.vehicle_risk_acknowledgements WHERE organization_id = p_organization_id;
  DELETE FROM public.shift_loads WHERE organization_id = p_organization_id;
  DELETE FROM public.shift_revenue WHERE organization_id = p_organization_id;

  -- Now safe: every RESTRICT/NO ACTION referrer above is gone.
  DELETE FROM public.shifts WHERE organization_id = p_organization_id;
  DELETE FROM public.drivers WHERE organization_id = p_organization_id;
  DELETE FROM public.vehicles WHERE organization_id = p_organization_id;
  DELETE FROM public.depots WHERE organization_id = p_organization_id;
  DELETE FROM public.user_roles WHERE organization_id = p_organization_id;

  -- Any interest-buyer request that led to this account keeps existing
  -- (organization_id SET NULL) rather than vanishing from history.
  -- Everything else CASCADEs off this row: carrier_loads, dispatch_loads,
  -- shipment_proofs, security_audit_log, analytics_share_links,
  -- org_costs, org_analytics_settings, org_feature_overrides,
  -- org_fuel_bonus_settings.
  DELETE FROM public.organizations WHERE id = p_organization_id;

  PERFORM public.record_audit(NULL, 'account_deleted', auth.email(), NULL, NULL, jsonb_build_object('organization_id', p_organization_id, 'name', v_name));

  RETURN QUERY SELECT COALESCE(v_auth_ids, ARRAY[]::UUID[]);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_delete_account(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_delete_account(UUID, TEXT) TO authenticated;

COMMIT;
