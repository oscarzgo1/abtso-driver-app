-- ============================================================
-- Migration 095: Rota confirmation
-- ============================================================
-- Rotas employees send from the app (094) are now submissions that
-- wait as 'pending' until the office confirms them — as requested, or
-- moved to other dates by dragging onto the schedule. Confirmed rows
-- are the rota. save_my_rota() now writes 'pending'.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.employee_rota
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

ALTER TABLE public.employee_rota DROP CONSTRAINT IF EXISTS employee_rota_status_check;
ALTER TABLE public.employee_rota ADD CONSTRAINT employee_rota_status_check
  CHECK (status IN ('pending', 'confirmed'));

-- Confirms one submitted week. p_new_start = p_week_start confirms it as
-- requested; any other Sunday moves the whole week there.
CREATE OR REPLACE FUNCTION public.confirm_rota_week(p_driver UUID, p_week_start DATE, p_new_start DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_moved JSONB;
  v_shift INTEGER := p_new_start - p_week_start;
  v_item JSONB;
  v_count INTEGER := 0;
BEGIN
  IF NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'Only an administrator can confirm a rota.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = p_driver AND organization_id = public.current_org_id()) THEN
    RAISE EXCEPTION 'Employee not found.' USING ERRCODE = '42501';
  END IF;

  WITH m AS (
    DELETE FROM public.employee_rota
    WHERE driver_id = p_driver
      AND status = 'pending'
      AND work_date BETWEEN p_week_start AND p_week_start + 6
    RETURNING *
  )
  SELECT jsonb_agg(to_jsonb(m)) INTO v_moved FROM m;

  IF v_moved IS NULL THEN
    RAISE EXCEPTION 'There is no pending rota for that week.';
  END IF;

  -- Whatever the employee already had on the target dates is replaced.
  DELETE FROM public.employee_rota
  WHERE driver_id = p_driver
    AND work_date BETWEEN p_new_start AND p_new_start + 6;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_moved) LOOP
    INSERT INTO public.employee_rota (driver_id, work_date, day_off, start_time, end_time, note, status, confirmed_at)
    VALUES (
      p_driver,
      (v_item->>'work_date')::date + v_shift,
      (v_item->>'day_off')::boolean,
      (v_item->>'start_time')::time,
      (v_item->>'end_time')::time,
      v_item->>'note',
      'confirmed',
      now()
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_rota_week(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_rota_week(UUID, DATE, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
