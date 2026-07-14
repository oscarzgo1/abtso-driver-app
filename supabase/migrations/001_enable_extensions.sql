-- ============================================================
-- ABTSO Logistics — Migration 001: Enable Extensions
-- ============================================================
-- PostGIS: For geography/geometry types and spatial queries
-- pgcrypto: For gen_random_uuid() and crypt/gen_salt (PIN hashing)
-- pg_cron: For scheduled idle detection jobs
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Note: pg_cron must be enabled via the Supabase Dashboard
-- (Database → Extensions → pg_cron → Enable)
