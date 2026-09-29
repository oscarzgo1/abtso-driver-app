-- The company a load is delivered for, entered by the department when the
-- load is assigned. Delivery History builds its Company filter from the
-- distinct values, so a new company appears there automatically.
ALTER TABLE public.dispatch_loads ADD COLUMN IF NOT EXISTS carrier_name TEXT;

-- Existing assignments inherit the company from their pool load.
UPDATE public.dispatch_loads d
   SET carrier_name = c.carrier_name
  FROM public.carrier_loads c
 WHERE d.carrier_load_id = c.id
   AND d.carrier_name IS NULL
   AND c.carrier_name IS NOT NULL;
