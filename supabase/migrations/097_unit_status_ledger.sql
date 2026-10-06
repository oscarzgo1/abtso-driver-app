-- ============================================================
-- Migration 097: Unit Status Ledger
-- ============================================================
-- A tamper-proof record of every manual change to a unit's or trailer's
-- road status (grounded / returned to service). Each entry carries the
-- approver's first and last name, their drawn signature, the date and time
-- (set by the server, not the browser), the reason, and a snapshot of what
-- was wrong at that moment.
--
-- The ledger is append-only for everyone:
--   * the only way in is change_unit_status(), which validates the request;
--   * there is no INSERT/UPDATE/DELETE policy and the privileges are revoked;
--   * triggers refuse UPDATE, DELETE and TRUNCATE outright, even for the
--     service role, so history cannot be edited or removed from the app,
--     the API or the SQL console without first dropping the triggers.
-- No foreign keys on purpose: deleting a vehicle, driver or organisation
-- must never be able to cascade into the history.
--
-- vehicles.manual_vor marks a unit grounded by hand. The admin panel treats
-- it like an open critical defect; is_vor is set too because the driver app
-- reads that flag.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS manual_vor BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.unit_status_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  vehicle_id UUID,
  registration TEXT NOT NULL,
  vehicle_type TEXT,
  action TEXT NOT NULL CHECK (action IN ('return_to_service', 'ground')),
  previous_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  defect_ids UUID[] NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  approver_first_name TEXT NOT NULL CHECK (length(btrim(approver_first_name)) BETWEEN 1 AND 60),
  approver_last_name TEXT NOT NULL CHECK (length(btrim(approver_last_name)) BETWEEN 1 AND 60),
  signature_svg TEXT NOT NULL CHECK (
    length(signature_svg) BETWEEN 40 AND 200000
    AND left(signature_svg, 4) = '<svg'
    AND signature_svg !~* '<script|onload|onerror|javascript:'
  ),
  approved_by_user UUID,
  approved_by_email TEXT,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unit_status_ledger_org ON public.unit_status_ledger(organization_id, approved_at DESC);
CREATE INDEX IF NOT EXISTS idx_unit_status_ledger_reg ON public.unit_status_ledger(organization_id, registration);

ALTER TABLE public.unit_status_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "unit_status_ledger_admin_read" ON public.unit_status_ledger;
CREATE POLICY "unit_status_ledger_admin_read"
  ON public.unit_status_ledger FOR SELECT
  TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id());

REVOKE ALL ON public.unit_status_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.unit_status_ledger TO authenticated;

CREATE OR REPLACE FUNCTION public.unit_status_ledger_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'The Unit Status Ledger is permanent: entries cannot be changed or removed.' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_unit_status_ledger_no_update ON public.unit_status_ledger;
CREATE TRIGGER trg_unit_status_ledger_no_update
  BEFORE UPDATE OR DELETE ON public.unit_status_ledger
  FOR EACH ROW EXECUTE FUNCTION public.unit_status_ledger_immutable();

DROP TRIGGER IF EXISTS trg_unit_status_ledger_no_truncate ON public.unit_status_ledger;
CREATE TRIGGER trg_unit_status_ledger_no_truncate
  BEFORE TRUNCATE ON public.unit_status_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION public.unit_status_ledger_immutable();

-- Grounds a unit / returns it to service, with the approver's name and
-- signature, and writes the ledger entry — all in one transaction.
CREATE OR REPLACE FUNCTION public.change_unit_status(
  p_vehicle_id UUID,
  p_action TEXT,
  p_reason TEXT,
  p_first_name TEXT,
  p_last_name TEXT,
  p_signature_svg TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v public.vehicles%ROWTYPE;
  v_ids UUID[];
  v_today DATE := (now() AT TIME ZONE 'Europe/London')::date;
  v_issues JSONB := '[]'::jsonb;
  v_expired TEXT[] := '{}';
  v_defects UUID[] := '{}';
  v_closed UUID[] := '{}';
  v_id UUID;
  r public.vehicles%ROWTYPE;
BEGIN
  IF NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'Only an administrator can change a unit''s status.' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('return_to_service', 'ground') THEN
    RAISE EXCEPTION 'Unknown action.';
  END IF;

  SELECT * INTO v FROM public.vehicles WHERE id = p_vehicle_id AND organization_id = public.current_org_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit not found.' USING ERRCODE = '42501';
  END IF;

  -- One registration is several register rows (one per inspection type).
  SELECT array_agg(id) INTO v_ids
  FROM public.vehicles
  WHERE organization_id = v.organization_id
    AND upper(btrim(vehicle_number)) = upper(btrim(v.vehicle_number))
    AND vehicle_type IS NOT DISTINCT FROM v.vehicle_type;

  -- What is wrong right now (the snapshot kept with the entry).
  FOR r IN SELECT * FROM public.vehicles WHERE id = ANY(v_ids) LOOP
    IF r.inspection_due_date IS NOT NULL AND r.inspection_due_date < v_today THEN
      v_issues := v_issues || to_jsonb(format('%s overdue (due %s)', coalesce(r.inspection_type, 'Inspection'), r.inspection_due_date));
      v_expired := v_expired || coalesce(r.inspection_type, 'inspection');
    END IF;
    IF r.mot_due_date IS NOT NULL AND r.mot_due_date < v_today THEN
      v_issues := v_issues || to_jsonb(format('MOT expired (%s)', r.mot_due_date)); v_expired := v_expired || 'MOT';
    END IF;
    IF r.tax_due_date IS NOT NULL AND r.tax_due_date < v_today THEN
      v_issues := v_issues || to_jsonb(format('Road tax expired (%s)', r.tax_due_date)); v_expired := v_expired || 'road tax';
    END IF;
    IF r.insurance_expiry_date IS NOT NULL AND r.insurance_expiry_date < v_today THEN
      v_issues := v_issues || to_jsonb(format('Insurance expired (%s)', r.insurance_expiry_date)); v_expired := v_expired || 'insurance';
    END IF;
    IF r.manual_vor THEN
      v_issues := v_issues || to_jsonb('Grounded manually'::text);
    END IF;
  END LOOP;

  SELECT coalesce(array_agg(id), '{}') INTO v_defects
  FROM public.incident_reports
  WHERE organization_id = v.organization_id
    AND severity = 'critical_vor' AND status <> 'closed'
    AND (vehicle_id = ANY(v_ids) OR trailer_id = ANY(v_ids));
  IF array_length(v_defects, 1) > 0 THEN
    v_issues := v_issues || to_jsonb(format('%s open critical defect(s)', array_length(v_defects, 1)));
  END IF;

  IF p_action = 'return_to_service' THEN
    IF array_length(v_expired, 1) > 0 THEN
      RAISE EXCEPTION 'Update the expired dates first (%) — a unit with lapsed dates cannot be returned to service.', array_to_string(v_expired, ', ');
    END IF;
    WITH c AS (
      UPDATE public.incident_reports SET status = 'closed'
      WHERE id = ANY(v_defects)
      RETURNING id
    ) SELECT coalesce(array_agg(id), '{}') INTO v_closed FROM c;
    UPDATE public.vehicles SET is_vor = false, manual_vor = false WHERE id = ANY(v_ids);
  ELSE
    UPDATE public.vehicles SET is_vor = true, manual_vor = true WHERE id = ANY(v_ids);
  END IF;

  INSERT INTO public.unit_status_ledger (
    organization_id, vehicle_id, registration, vehicle_type, action, previous_issues, defect_ids,
    reason, approver_first_name, approver_last_name, signature_svg, approved_by_user, approved_by_email
  ) VALUES (
    v.organization_id, v.id, upper(btrim(v.vehicle_number)), v.vehicle_type, p_action, v_issues, v_closed,
    p_reason, btrim(p_first_name), btrim(p_last_name), p_signature_svg, auth.uid(), lower(auth.jwt() ->> 'email')
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.change_unit_status(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_unit_status(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'unit_status_ledger') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.unit_status_ledger;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
