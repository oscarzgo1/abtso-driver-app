-- ============================================================
-- Migration 094: Weekly Rota
-- ============================================================
-- Employees enter the days and hours they will work next week from
-- the app (Time Off & Shift -> Weekly Rota). The admin panel shows
-- every employee's rota under Employees Schedule -> Weekly Rota.
--
-- One row per employee per date: either a working day (start/end
-- time) or a day off. Drivers never write the table directly —
-- save_my_rota() replaces one week at a time after validating it —
-- and can only read their own rows. Admins read their own company.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.employee_rota (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  day_off BOOLEAN NOT NULL DEFAULT false,
  start_time TIME,
  end_time TIME,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_rota_unique_day UNIQUE (driver_id, work_date),
  CONSTRAINT employee_rota_shape CHECK (
    (day_off AND start_time IS NULL AND end_time IS NULL)
    OR (NOT day_off AND start_time IS NOT NULL AND end_time IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_employee_rota_org_date ON public.employee_rota(organization_id, work_date);

DROP TRIGGER IF EXISTS trg_sync_org_id_employee_rota ON public.employee_rota;
CREATE TRIGGER trg_sync_org_id_employee_rota
  BEFORE INSERT ON public.employee_rota
  FOR EACH ROW EXECUTE FUNCTION public.sync_organization_id_from_driver();

ALTER TABLE public.employee_rota ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_rota_driver_read_own" ON public.employee_rota;
CREATE POLICY "employee_rota_driver_read_own"
  ON public.employee_rota FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "employee_rota_org_admin_all" ON public.employee_rota;
CREATE POLICY "employee_rota_org_admin_all"
  ON public.employee_rota FOR ALL
  TO authenticated
  USING (public.is_org_admin() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin() AND organization_id = public.current_org_id());

-- p_days: [{"date":"2026-10-12","off":false,"start":"06:00","end":"16:00","note":"..."}, ...]
-- Replaces the employee's rota for the seven days from p_week_start.
CREATE OR REPLACE FUNCTION public.save_my_rota(p_week_start DATE, p_days JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Europe/London')::date;
  v_item JSONB;
  v_date DATE;
  v_off BOOLEAN;
  v_start TIME;
  v_end TIME;
  v_count INTEGER := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Only employees signed in to the Tachyo app can submit a rota.' USING ERRCODE = '42501';
  END IF;
  IF p_week_start IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
    RAISE EXCEPTION 'Choose a week and add your days.';
  END IF;
  IF p_week_start + 6 < v_today THEN
    RAISE EXCEPTION 'That week has already finished.';
  END IF;
  IF p_week_start > v_today + 120 THEN
    RAISE EXCEPTION 'That week is too far ahead.';
  END IF;
  IF jsonb_array_length(p_days) > 7 THEN
    RAISE EXCEPTION 'A rota covers one week.';
  END IF;

  DELETE FROM public.employee_rota
  WHERE driver_id = auth.uid()
    AND work_date BETWEEN p_week_start AND p_week_start + 6;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_days) LOOP
    v_date := (v_item->>'date')::date;
    IF v_date < p_week_start OR v_date > p_week_start + 6 THEN
      RAISE EXCEPTION 'A day falls outside the chosen week.';
    END IF;
    v_off := coalesce((v_item->>'off')::boolean, false);
    IF v_off THEN
      v_start := NULL;
      v_end := NULL;
    ELSE
      v_start := (v_item->>'start')::time;
      v_end := (v_item->>'end')::time;
      IF v_start IS NULL OR v_end IS NULL THEN
        RAISE EXCEPTION 'Enter a start and finish time for every working day.';
      END IF;
    END IF;
    IF length(coalesce(v_item->>'note', '')) > 200 THEN
      RAISE EXCEPTION 'Keep each note under 200 characters.';
    END IF;

    INSERT INTO public.employee_rota (driver_id, work_date, day_off, start_time, end_time, note)
    VALUES (auth.uid(), v_date, v_off, v_start, v_end, NULLIF(btrim(v_item->>'note'), ''));
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_rota(DATE, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_rota(DATE, JSONB) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'employee_rota') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_rota;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
