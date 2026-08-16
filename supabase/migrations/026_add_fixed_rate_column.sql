-- Migration 026: Add fixed_rate column to public.drivers and public.shifts if needed

ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS fixed_rate NUMERIC(10, 2) DEFAULT NULL;

ALTER TABLE public.employee_rates 
ADD COLUMN IF NOT EXISTS fixed_rate NUMERIC(10, 2) DEFAULT NULL;
