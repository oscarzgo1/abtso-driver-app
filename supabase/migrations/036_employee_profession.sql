-- ============================================================
-- ABTSO Logistics / Tachyo — Migration 036: Employee Profession
-- ============================================================
-- Adds a manually-set profession/department tag to each employee —
-- Driver, Mechanic, or Logistics — so the dashboard can group its
-- employee list by role instead of treating every row as a driver.
-- Deliberately its own column rather than reusing anything named
-- "department" already in this schema: public.user_roles.department
-- means "which dashboard account type" (logistics vs payroll admin),
-- an unrelated concept, and reusing the word there would conflate a
-- staff member's real-world job with a login's permission tier.
-- Existing rows default to 'driver' since every employee in this
-- system to date has in fact been one.
-- ============================================================

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS profession TEXT NOT NULL DEFAULT 'driver'
    CHECK (profession IN ('driver', 'mechanic', 'logistics'));

CREATE INDEX IF NOT EXISTS idx_drivers_profession ON public.drivers(profession);
