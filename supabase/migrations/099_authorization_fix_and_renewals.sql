-- ============================================================
-- Migration 099: authorising a unit records the fix and renews dates
-- ============================================================
-- change_unit_status() (097) now also takes:
--   * p_fixed_at  - when the fix was made. NULL = automatic (the server's
--                   time now); otherwise the department's own date/time
--                   (not in the future, not older than a year).
--   * p_renewals  - new expiry dates for inspections that had lapsed, e.g.
--                   a Roller Brake Test: [{"vehicle_id":"…","start":"2026-10-05","due":"2027-10-05"}].
--                   They are applied first, in the same transaction, so a
--                   unit with a lapsed inspection can be authorised in one
--                   signed step. Anything still lapsed afterwards still
--                   blocks the authorisation.
-- Both are written to the (append-only) ledger entry.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.unit_status_ledger
  ADD COLUMN IF NOT EXISTS fixed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS renewals JSONB NOT NULL DEFAULT '[]'::jsonb;

DROP FUNCTION IF EXISTS public.change_unit_status(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.change_unit_status(
  p_vehicle_id UUID,
  p_action TEXT,
  p_reason TEXT,
  p_first_name TEXT,
  p_last_name TEXT,
  p_signature_svg TEXT,
  p_fixed_at TIMESTAMPTZ DEFAULT NULL,
  p_renewals JSONB DEFAULT '[]'::jsonb
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
  v_renewed JSONB := '[]'::jsonb;
  v_fixed TIMESTAMPTZ := coalesce(p_fixed_at, now());
  v_id UUID;
  r public.vehicles%ROWTYPE;
  item JSONB;
  v_due DATE;
  v_start DATE;
BEGIN
  IF NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'Only an administrator can change a unit''s status.' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('return_to_service', 'ground') THEN
    RAISE EXCEPTION 'Unknown action.';
  END IF;
  IF v_fixed > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'The time of the fix can''t be in the future.';
  END IF;
  IF v_fixed < now() - interval '366 days' THEN
    RAISE EXCEPTION 'The time of the fix is too far in the past.';
  END IF;
  IF jsonb_typeof(coalesce(p_renewals, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Renewals must be a list.';
  END IF;

  SELECT * INTO v FROM public.vehicles WHERE id = p_vehicle_id AND organization_id = public.current_org_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit not found.' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(id) INTO v_ids
  FROM public.vehicles
  WHERE organization_id = v.organization_id
    AND upper(btrim(vehicle_number)) = upper(btrim(v.vehicle_number))
    AND vehicle_type IS NOT DISTINCT FROM v.vehicle_type;

  -- What is wrong right now (the snapshot kept with the entry).
  FOR r IN SELECT * FROM public.vehicles WHERE id = ANY(v_ids) AND is_active LOOP
    IF r.inspection_due_date IS NOT NULL AND r.inspection_due_date < v_today THEN
      v_issues := v_issues || to_jsonb(format('%s overdue (due %s)', coalesce(r.inspection_type, 'Inspection'), r.inspection_due_date));
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
    -- New expiry dates for lapsed inspections, applied first.
    FOR item IN SELECT * FROM jsonb_array_elements(coalesce(p_renewals, '[]'::jsonb)) LOOP
      SELECT * INTO r FROM public.vehicles WHERE id = (item->>'vehicle_id')::uuid AND id = ANY(v_ids);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'A renewal is for an inspection that does not belong to this unit.';
      END IF;
      v_due := (item->>'due')::date;
      v_start := coalesce((item->>'start')::date, (v_fixed AT TIME ZONE 'Europe/London')::date);
      IF v_due IS NULL OR v_due <= v_today THEN
        RAISE EXCEPTION 'The new expiry for % must be a future date.', coalesce(r.inspection_type, 'the inspection');
      END IF;
      IF v_start > v_due THEN
        RAISE EXCEPTION 'The start date for % is after its expiry.', coalesce(r.inspection_type, 'the inspection');
      END IF;
      UPDATE public.vehicles SET inspection_start_date = v_start, inspection_due_date = v_due WHERE id = r.id;
      v_renewed := v_renewed || jsonb_build_object(
        'vehicle_id', r.id, 'type', r.inspection_type, 'old_due', r.inspection_due_date, 'start', v_start, 'new_due', v_due);
    END LOOP;

    SELECT coalesce(array_agg(DISTINCT coalesce(inspection_type, 'inspection')), '{}') INTO v_expired
    FROM public.vehicles
    WHERE id = ANY(v_ids) AND is_active AND inspection_due_date IS NOT NULL AND inspection_due_date < v_today;
    IF array_length(v_expired, 1) > 0 THEN
      RAISE EXCEPTION 'Set a new expiry date first for: % — a unit with a lapsed date cannot be authorised.', array_to_string(v_expired, ', ');
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
    reason, approver_first_name, approver_last_name, signature_svg, approved_by_user, approved_by_email,
    fixed_at, renewals
  ) VALUES (
    v.organization_id, v.id, upper(btrim(v.vehicle_number)), v.vehicle_type, p_action, v_issues, v_closed,
    p_reason, btrim(p_first_name), btrim(p_last_name), p_signature_svg, auth.uid(), lower(auth.jwt() ->> 'email'),
    v_fixed, v_renewed
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.change_unit_status(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_unit_status(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
