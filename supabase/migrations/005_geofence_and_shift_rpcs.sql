-- ============================================================
-- ABTSO Logistics — Migration 005: Geofence Validation
-- ============================================================
-- Server-side validation that a driver's GPS coordinates are
-- within the geofence radius of at least one depot.
-- ============================================================

-- ------------------------------------------------------------
-- Function: Validate that coordinates are within depot geofence
-- Returns the depot ID if within range, NULL if not.
-- Uses PostGIS ST_DWithin for accurate distance calculation.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_geofence(
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION
)
RETURNS UUID AS $$
DECLARE
  v_depot_id UUID;
BEGIN
  SELECT id INTO v_depot_id
  FROM public.depots
  WHERE ST_DWithin(
    location,
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
    geofence_radius_m  -- 10 meters
  )
  ORDER BY ST_Distance(
    location,
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
  )
  LIMIT 1;

  RETURN v_depot_id;  -- NULL if not within any depot geofence
END;
$$ LANGUAGE plpgsql STABLE;

-- ------------------------------------------------------------
-- Function: Start a shift (with geofence validation)
-- Called from the mobile app via supabase.rpc('start_shift', ...)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_shift(
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION
)
RETURNS JSON AS $$
DECLARE
  v_driver_id UUID;
  v_depot_id UUID;
  v_active_shift RECORD;
  v_new_shift RECORD;
BEGIN
  v_driver_id := (SELECT auth.uid());

  IF v_driver_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Unauthorized: Driver authentication required.'
    );
  END IF;

  -- Check for existing active shift
  SELECT * INTO v_active_shift
  FROM public.shifts
  WHERE driver_id = v_driver_id AND status = 'active'
  LIMIT 1;

  IF v_active_shift IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You already have an active shift. End it before starting a new one.'
    );
  END IF;

  -- Validate geofence
  v_depot_id := public.validate_geofence(p_latitude, p_longitude);

  IF v_depot_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You must be within 10m of a depot to start your shift.'
    );
  END IF;

  -- Create the shift
  INSERT INTO public.shifts (driver_id, depot_id, start_time, start_lat, start_lng, status)
  VALUES (v_driver_id, v_depot_id, now(), p_latitude, p_longitude, 'active')
  RETURNING * INTO v_new_shift;

  RETURN json_build_object(
    'success', true,
    'shift_id', v_new_shift.id,
    'depot_id', v_depot_id,
    'start_time', v_new_shift.start_time,
    'base_rate', v_new_shift.base_hourly_rate
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Function: End a shift (with geofence validation)
-- Called from the mobile app via supabase.rpc('end_shift', ...)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.end_shift(
  p_shift_id UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION
)
RETURNS JSON AS $$
DECLARE
  v_driver_id UUID;
  v_depot_id UUID;
  v_shift RECORD;
  v_updated_shift RECORD;
BEGIN
  v_driver_id := (SELECT auth.uid());

  IF v_driver_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Unauthorized: Driver authentication required.'
    );
  END IF;

  -- Verify the shift belongs to this driver and is active
  SELECT * INTO v_shift
  FROM public.shifts
  WHERE id = p_shift_id
    AND driver_id = v_driver_id
    AND status = 'active';

  IF v_shift IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No active shift found with this ID.'
    );
  END IF;

  -- Validate geofence for clock-out
  v_depot_id := public.validate_geofence(p_latitude, p_longitude);

  IF v_depot_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You must be within 10m of a depot to end your shift.'
    );
  END IF;

  -- End the shift — the trigger will calculate hours, rate, and override
  UPDATE public.shifts
  SET end_time = now(),
      end_lat = p_latitude,
      end_lng = p_longitude,
      status = 'completed'
  WHERE id = p_shift_id
  RETURNING * INTO v_updated_shift;

  RETURN json_build_object(
    'success', true,
    'shift_id', v_updated_shift.id,
    'total_hours', v_updated_shift.total_hours,
    'effective_rate', v_updated_shift.effective_rate,
    'total_pay', v_updated_shift.total_pay,
    'override_applied', (v_updated_shift.override_rate IS NOT NULL)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
