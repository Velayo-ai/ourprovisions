-- ============================================================================
-- 007_dev_restore_role_grants.sql
-- ============================================================================
-- ENVIRONMENT: DEV SANDBOX ONLY (zxwtxjjmssykhqrghouf)
-- DO NOT RUN ON PRODUCTION (parpauldmbetptkmdwbd) — prod grants are intact.
--
-- PROBLEM:
--   A prior run of the "Reset Public Schema Permissions" query on the dev
--   sandbox revoked all table/sequence/function privileges from the app roles
--   (`authenticated`, `anon`). Only `postgres` retained grants.
--
--   Because Supabase/Clerk requests connect as the `authenticated` role, every
--   query failed at the GRANT layer — before RLS was even evaluated — with:
--       "permission denied for table households"
--
-- VERIFICATION (the basis for this migration):
--   PROD `households` grants: authenticated + anon each hold the full set
--     (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) — 28 rows.
--   DEV `households` grants: postgres only — 7 rows. authenticated/anon absent.
--
-- FIX:
--   Restore Supabase's default public-schema grants to the app roles, matching
--   prod. RLS policies remain the actual row-level gate; these grants only get
--   the role *to* the table so RLS can then decide which rows are visible.
--   This does NOT weaken security — it undoes an over-aggressive reset.
--
-- ROLLBACK NOTE:
--   These grants mirror the Supabase defaults already present on prod. There is
--   no meaningful rollback target other than re-revoking, which would re-break
--   the environment. Idempotent: safe to run more than once.
-- ============================================================================

-- Schema usage (required before any table/function access) ------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Existing tables -----------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public
  TO anon;

-- service_role keeps full access (used by server-side / admin paths) ---------
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Existing sequences (needed for INSERTs that use serial/identity columns) ---
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Existing functions (SECURITY DEFINER RPCs + helpers like
-- get_current_household_id() must be executable by the app roles) ------------
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Default privileges so future objects inherit the same grants --------------
-- (owner = postgres, matching how the original objects were created)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- ============================================================================
-- POST-RUN VERIFICATION (run separately; expect authenticated + anon present):
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_name = 'households'
--   order by grantee, privilege_type;
-- Then hard-reload dev.ourprovisions.velayo.ai — household should load.
-- ============================================================================
