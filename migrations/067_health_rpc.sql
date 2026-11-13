-- 067_health_rpc.sql
-- SPEC_grants_least_privilege_067.md — Amendment 2026-10-23, R1 (the split). Additive only.
--
-- WHY
--   The Splunk Synthetics prod uptime test reads catalog_items as anon every 5 minutes
--   (GET /rest/v1/catalog_items?select=id&limit=1, the legacy anon JWT) — prod edge logs
--   2026-10-16 → 10-23: the ONLY non-authenticated /rest/v1/ traffic. 068 revokes anon from
--   every table but beta_signups, so the test needs somewhere else to land first: a function
--   that proves PostgREST and the database answer, and reads nothing.
--
-- WHAT
--   public.health() → boolean. language sql, STABLE, SECURITY INVOKER, search_path pinned to ''
--   (the body names no object, so there is nothing to resolve), body `select true`.
--   POST /rest/v1/rpc/health with body {} answers `true`.
--
-- GRANTS — explicit for every role (the standing 2026-10-30 rule). Revoke from public, anon,
--   authenticated AND service_role: revoking PUBLIC alone leaves the explicit role grants that
--   prod's default ACL hands a new function (postgres f: anon, authenticated, service_role =X).
--   Then EXECUTE to anon (the synthetic) and service_role only. authenticated gets nothing: the
--   app never calls it.
--
-- ORDER ON PROD (R1): 067 → Dan repoints the synthetic to POST /rest/v1/rpc/health with prod's
--   sb_publishable_ key → two green runs → 068 → the synthetic still green.
--
-- APPLY: dev (7642734024280108049) first, then prod (7606130613603586966). Idempotent.
--   Dev: write the ledger row by hand. Prod: no ledger, by decision.
-- ROLLBACK: drop function public.health(); — only after the synthetic points elsewhere.

begin;

create or replace function public.health()
  returns boolean
  language sql
  stable
  security invoker
  set search_path = ''
as $function$
  select true
$function$;

comment on function public.health() is
  '067 — liveness probe for the Splunk Synthetics prod Data API test (SPEC_grants_least_privilege_067 R1): POST /rest/v1/rpc/health answers true. Reads nothing. EXECUTE to anon + service_role only.';

revoke all on function public.health() from public;
revoke all on function public.health() from anon;
revoke all on function public.health() from authenticated;
revoke all on function public.health() from service_role;
grant execute on function public.health() to anon;
grant execute on function public.health() to service_role;

-- PostgREST picks the new function up from its schema cache; ask for the reload explicitly.
notify pgrst, 'reload schema';

commit;

-- VERIFY — one row. Expect (dev):
--   which_db 7642734024280108049 · fn_exists true · returns_boolean true · stable true ·
--   secdef false · search_path_empty true · exec_grantees anon,service_role · public_exec false ·
--   answers true
-- Prod: identical except which_db 7606130613603586966.
select
  (select system_identifier from pg_control_system())                                     as which_db,
  to_regprocedure('public.health()') is not null                                          as fn_exists,
  (select prorettype = 'boolean'::regtype from pg_proc where oid = 'public.health()'::regprocedure) as returns_boolean,
  (select provolatile = 's' from pg_proc where oid = 'public.health()'::regprocedure)     as stable,
  (select prosecdef from pg_proc where oid = 'public.health()'::regprocedure)             as secdef,
  (select proconfig = array['search_path=""'] from pg_proc where oid = 'public.health()'::regprocedure) as search_path_empty,
  (select coalesce(string_agg(r.rolname, ',' order by r.rolname), '')
     from pg_proc p, aclexplode(p.proacl) a join pg_roles r on r.oid = a.grantee
    where p.oid = 'public.health()'::regprocedure and a.privilege_type = 'EXECUTE'
      and a.grantee <> p.proowner)                                                         as exec_grantees,
  (select exists (select 1 from pg_proc p, aclexplode(p.proacl) a
    where p.oid = 'public.health()'::regprocedure and a.grantee = 0))                     as public_exec,
  public.health()                                                                         as answers;
