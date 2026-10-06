-- ============================================================
-- Migration 098: inspections are one list
-- ============================================================
-- MOT, road tax and insurance used to be separate date columns next to
-- the inspection type, so the same thing could be entered twice. They are
-- now ordinary inspection types in one list (MOT, PMI, Tacho calibration,
-- Roller brake test, LOLER, Road tax, Insurance, plus any the company adds
-- in inspection_types). Each register row is one inspection of one unit
-- with a start date and an expiry (inspection_due_date).
--
-- The old columns (mot_due_date / tax_due_date / insurance_expiry_date)
-- stay, kept in step by a trigger, because the driver app still reads them
-- when it asks a driver to sign for an unroadworthy unit.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS inspection_start_date DATE;

CREATE TABLE IF NOT EXISTS public.inspection_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (key ~ '^[a-z0-9_]{1,40}$'),
  label TEXT NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 40),
  icon TEXT NOT NULL DEFAULT 'calendar-check',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

ALTER TABLE public.inspection_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inspection_types_org_read" ON public.inspection_types;
CREATE POLICY "inspection_types_org_read"
  ON public.inspection_types FOR SELECT
  TO authenticated
  USING (organization_id = public.current_org_id());

DROP POLICY IF EXISTS "inspection_types_org_admin_write" ON public.inspection_types;
CREATE POLICY "inspection_types_org_admin_write"
  ON public.inspection_types FOR ALL
  TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

-- Keep the legacy legal-date columns in step with the inspection rows.
CREATE OR REPLACE FUNCTION public.vehicles_sync_legal_dates()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.vehicles%ROWTYPE; v_date DATE;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; v_date := NULL; ELSE r := NEW; v_date := NEW.inspection_due_date; END IF;
  IF r.inspection_type IN ('mot', 'road_tax', 'insurance') THEN
    UPDATE public.vehicles v SET
      mot_due_date = CASE WHEN r.inspection_type = 'mot' THEN v_date ELSE v.mot_due_date END,
      tax_due_date = CASE WHEN r.inspection_type = 'road_tax' THEN v_date ELSE v.tax_due_date END,
      insurance_expiry_date = CASE WHEN r.inspection_type = 'insurance' THEN v_date ELSE v.insurance_expiry_date END
    WHERE v.organization_id = r.organization_id
      AND upper(btrim(v.vehicle_number)) = upper(btrim(r.vehicle_number))
      AND v.vehicle_type = r.vehicle_type
      AND v.id <> r.id;
    IF TG_OP <> 'DELETE' THEN
      UPDATE public.vehicles v SET
        mot_due_date = CASE WHEN r.inspection_type = 'mot' THEN v_date ELSE v.mot_due_date END,
        tax_due_date = CASE WHEN r.inspection_type = 'road_tax' THEN v_date ELSE v.tax_due_date END,
        insurance_expiry_date = CASE WHEN r.inspection_type = 'insurance' THEN v_date ELSE v.insurance_expiry_date END
      WHERE v.id = r.id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicles_sync_legal_dates ON public.vehicles;
CREATE TRIGGER trg_vehicles_sync_legal_dates
  AFTER INSERT OR DELETE OR UPDATE OF inspection_due_date, inspection_type ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.vehicles_sync_legal_dates();

-- Existing units: turn the separate dates into inspection rows so nothing
-- is lost (one row per registration per type, only where none exists yet).
INSERT INTO public.vehicles (organization_id, vehicle_number, vehicle_type, inspection_type, inspection_due_date)
SELECT g.organization_id, g.vehicle_number, g.vehicle_type, 'road_tax', g.d
FROM (
  SELECT organization_id, min(vehicle_number) AS vehicle_number, vehicle_type, min(tax_due_date) AS d
  FROM public.vehicles WHERE is_active AND tax_due_date IS NOT NULL
  GROUP BY organization_id, upper(btrim(vehicle_number)), vehicle_type
) g
WHERE NOT EXISTS (
  SELECT 1 FROM public.vehicles v
  WHERE v.organization_id = g.organization_id AND upper(btrim(v.vehicle_number)) = upper(btrim(g.vehicle_number))
    AND v.vehicle_type = g.vehicle_type AND v.inspection_type = 'road_tax');

INSERT INTO public.vehicles (organization_id, vehicle_number, vehicle_type, inspection_type, inspection_due_date)
SELECT g.organization_id, g.vehicle_number, g.vehicle_type, 'insurance', g.d
FROM (
  SELECT organization_id, min(vehicle_number) AS vehicle_number, vehicle_type, min(insurance_expiry_date) AS d
  FROM public.vehicles WHERE is_active AND insurance_expiry_date IS NOT NULL
  GROUP BY organization_id, upper(btrim(vehicle_number)), vehicle_type
) g
WHERE NOT EXISTS (
  SELECT 1 FROM public.vehicles v
  WHERE v.organization_id = g.organization_id AND upper(btrim(v.vehicle_number)) = upper(btrim(g.vehicle_number))
    AND v.vehicle_type = g.vehicle_type AND v.inspection_type = 'insurance');

INSERT INTO public.vehicles (organization_id, vehicle_number, vehicle_type, inspection_type, inspection_due_date)
SELECT g.organization_id, g.vehicle_number, g.vehicle_type, 'mot', g.d
FROM (
  SELECT organization_id, min(vehicle_number) AS vehicle_number, vehicle_type, min(mot_due_date) AS d
  FROM public.vehicles WHERE is_active AND mot_due_date IS NOT NULL
  GROUP BY organization_id, upper(btrim(vehicle_number)), vehicle_type
) g
WHERE NOT EXISTS (
  SELECT 1 FROM public.vehicles v
  WHERE v.organization_id = g.organization_id AND upper(btrim(v.vehicle_number)) = upper(btrim(g.vehicle_number))
    AND v.vehicle_type = g.vehicle_type AND v.inspection_type = 'mot');

NOTIFY pgrst, 'reload schema';

COMMIT;
