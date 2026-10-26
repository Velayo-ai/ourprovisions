-- 071_meal_photo_sweep_schedule.sql
-- SPEC_photo_sweep.md §2 (renumbered 070 → 071 by Amendment 2026-10-25, C1 + C2).
--
-- WHY
--   070 + meal-photo-sweep v1 are on dev and the live run passed (2026-10-26 04:01 UTC,
--   C3 / Verification 11 confirmed). Nothing calls the function yet. This schedules
--   it daily (D7) from the database: pg_cron fires, pg_net POSTs to the function with
--   the shared secret in x-sweep-secret, and the secret is read from Vault at run
--   time so it is never in this file, in cron.job.command, or in a transcript.
--
-- WHAT
--   1. pg_cron (pg_catalog) and pg_net (extensions) — first scheduled work on either
--      database (Step 0: neither installed, no cron.job). C1.
--   2. Grants: the platform's issue_pg_net_access event trigger grants USAGE on
--      schema net to anon, authenticated and service_role the moment pg_net is
--      created, and net.http_post is SECURITY DEFINER — any role that can reach it
--      can make the database send arbitrary outbound requests. Nobody but postgres
--      (the cron job's owner) needs net or cron. Revoke from all four grantees
--      (PUBLIC, anon, authenticated, service_role), grant postgres explicitly — the
--      068 model, written down rather than left to platform defaults (Supabase ends
--      automatic grants for new public objects on 2026-10-30; ARCHITECTURE "Migration
--      hygiene"). No public object is created here.
--   3. cron job 'meal-photo-sweep', daily 08:17 UTC (03:17/04:17 Eastern — off-peak
--      for every household; an odd minute to stay off the top-of-hour pile-up).
--      Body is always {"dry_run": false}: whether a run is live is decided by the
--      function secret SWEEP_LIVE alone (C4). With SWEEP_LIVE unset, every scheduled
--      run is a dry run.
--   The function URL is chosen by system_identifier, so the same file applies to dev
--   and prod and refuses any other database.
--
-- BEFORE APPLYING — the Vault secret (Dan, by hand, not in this file)
--   Dashboard → Integrations → Vault → Add new secret:
--     name  meal_photo_sweep_secret
--     value the function's current SWEEP_SECRET (dev: the 2026-10-26 04:08 UTC
--           rotation, the copy in Bitwarden). No trailing newline or space.
--   Use the Vault UI, not vault.create_secret() in the SQL editor — editor text can be
--   kept in query history; the UI form isn't. The DO block below refuses to schedule
--   if the secret is missing. VERIFY reads back its SHA-256 so it can be matched
--   against the SWEEP_SECRET digest from `supabase secrets list` without anyone
--   seeing the value.
--
-- NOT CHANGED
--   * The function, its secrets, 070's RPCs, meal_photos, storage.
--   * Vault grants (service_role already holds SELECT/DELETE on vault.secrets and
--     vault.decrypted_secrets — platform-owned, out of scope; read back below).
--   * supabase_functions_admin's net grants (Database Webhooks use them).
--
-- WATCH
--   * The secret sits in net.http_request_queue.headers for the seconds between the
--     cron run and the worker sending it (then the row is deleted). The response
--     (counts only) stays in net._http_response for 6 h (pg_net ttl).
--   * pg_net's default timeout is 2 s; the sweep is called with 60 s. A timeout there
--     only loses the response row — the function still runs to completion.
--   * If the revokes in step 2 print "no privileges could be revoked", postgres is not
--     the grantor of those privileges (extension objects are owned by supabase_admin).
--     The DO block checks every API role's access on net and cron BEFORE scheduling and
--     raises if any remains, so the whole file rolls back and nothing is scheduled
--     (Dan, 2026-10-26: an API role still holding access = stop before scheduling).
--     VERIFY 2 reads the same back after commit.
--
-- APPLY
--   Dev first (zxwtxjjmssykhqrghouf, 7642734024280108049) by Dan in the SQL editor,
--   after the Vault secret; VERIFY on the same identifier; ledger row by hand.
--   Prod (parpauldmbetptkmdwbd, 7606130613603586966) at Rollout 3, its own Vault
--   secret = prod's SWEEP_SECRET; no ledger on prod, by decision. Idempotent:
--   cron.unschedule-if-present then cron.schedule; extensions `if not exists`.
-- ROLLBACK: select cron.unschedule('meal-photo-sweep'); — the function is then never
--   called. Extensions and grants can stay. Delete the Vault secret in the UI.

begin;

-- 1. Extensions
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- 2. Grants — net and cron belong to postgres alone
revoke all on schema net from public, anon, authenticated, service_role;
revoke all on all functions in schema net from public, anon, authenticated, service_role;
revoke all on all tables in schema net from public, anon, authenticated, service_role;
revoke all on schema cron from public, anon, authenticated, service_role;
revoke all on all functions in schema cron from public, anon, authenticated, service_role;
revoke all on all tables in schema cron from public, anon, authenticated, service_role;
grant usage on schema net to postgres;
grant execute on function net.http_post(text, jsonb, jsonb, jsonb, integer) to postgres;

-- 3. Schedule
do $do$
declare
  v_db  text := (select system_identifier::text from pg_control_system());
  v_url text;
begin
  v_url := case v_db
    when '7642734024280108049' then 'https://zxwtxjjmssykhqrghouf.supabase.co/functions/v1/meal-photo-sweep'
    when '7606130613603586966' then 'https://parpauldmbetptkmdwbd.supabase.co/functions/v1/meal-photo-sweep'
  end;
  if v_url is null then
    raise exception '071: unknown database % — refusing to schedule', v_db;
  end if;

  if to_regprocedure('public.meal_photo_sweep_expired(integer)') is null then
    raise exception '071: 070 is not applied on % — apply 070 first', v_db;
  end if;

  if exists (select 1 from pg_roles r
              where r.rolname in ('anon', 'authenticated', 'service_role')
                and (has_schema_privilege(r.rolname, 'net', 'USAGE')
                  or has_function_privilege(r.rolname, 'net.http_post(text, jsonb, jsonb, jsonb, integer)', 'EXECUTE')
                  or has_function_privilege(r.rolname, 'net.http_get(text, jsonb, jsonb, integer)', 'EXECUTE')
                  or has_schema_privilege(r.rolname, 'cron', 'USAGE'))) then
    raise exception '071: an API role still holds access on net or cron on % — the revokes did not take; not scheduling', v_db;
  end if;

  if not exists (select 1 from vault.secrets where name = 'meal_photo_sweep_secret') then
    raise exception '071: Vault secret meal_photo_sweep_secret is missing on % — add it in the Vault UI first', v_db;
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname = 'meal-photo-sweep';

  perform cron.schedule(
    'meal-photo-sweep',
    '17 8 * * *',
    format($cmd$
select net.http_post(
  url := %L,
  headers := jsonb_build_object(
    'content-type', 'application/json',
    'x-sweep-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'meal_photo_sweep_secret')
  ),
  body := '{"dry_run": false}'::jsonb,
  timeout_milliseconds := 60000
) as request_id;
$cmd$, v_url)
  );
end
$do$;

commit;

-- VERIFY 1 — the job. One row. Expect: which_db as applied · jobname meal-photo-sweep ·
--   schedule '17 8 * * *' · active true · username postgres · url_ok true ·
--   reads_vault true · secret_in_command false · vault_secret_sha256 = the SWEEP_SECRET
--   digest from `npx supabase secrets list --project-ref <ref>` (the CLI shows a plain
--   SHA-256 hex of the value — confirmed 2026-10-26; a mismatch means the value differs,
--   most often a trailing newline or space).
select
  (select system_identifier from pg_control_system())                          as which_db,
  j.jobname, j.schedule, j.active, j.username,
  j.command like '%/functions/v1/meal-photo-sweep''%'                          as url_ok,
  j.command like '%vault.decrypted_secrets%'                                   as reads_vault,
  position(s.decrypted_secret in j.command) > 0                                as secret_in_command,
  encode(sha256(convert_to(s.decrypted_secret, 'UTF8')), 'hex')                as vault_secret_sha256,
  (select count(*) from cron.job where jobname = 'meal-photo-sweep')           as job_count
from cron.job j
cross join (select decrypted_secret from vault.decrypted_secrets where name = 'meal_photo_sweep_secret') s
where j.jobname = 'meal-photo-sweep';

-- VERIFY 2 — grants. One row per role. Expect: anon, authenticated, service_role all
--   false in every column; postgres true for net_usage and http_post_exec (the cron
--   job needs both). Any true for the three API roles = a revoke didn't take (see WATCH):
--   unschedule and stop.
select r.rolname,
  has_schema_privilege(r.rolname, 'net', 'USAGE')                                       as net_usage,
  has_function_privilege(r.rolname, 'net.http_post(text, jsonb, jsonb, jsonb, integer)', 'EXECUTE') as http_post_exec,
  has_function_privilege(r.rolname, 'net.http_get(text, jsonb, jsonb, integer)', 'EXECUTE')          as http_get_exec,
  has_schema_privilege(r.rolname, 'cron', 'USAGE')                                      as cron_usage,
  has_table_privilege(r.rolname, 'cron.job', 'SELECT')                                  as cron_job_select
from pg_roles r
where r.rolname in ('anon', 'authenticated', 'service_role', 'postgres')
order by r.rolname;

-- VERIFY 3 — extensions + Vault grants (read back, not changed). Expect pg_cron 1.6.4,
--   pg_net 0.20.x (dev offers 0.20.4, prod 0.20.0), supabase_vault 0.3.1;
--   vault grants unchanged from before (service_role SELECT, DELETE).
select (select json_agg(json_build_object('name', extname, 'version', extversion, 'schema', extnamespace::regnamespace) order by extname)
          from pg_extension where extname in ('pg_cron', 'pg_net', 'supabase_vault')) as exts,
       (select string_agg(distinct grantee || ':' || privilege_type, ', ')
          from information_schema.role_table_grants
         where table_schema = 'vault' and table_name = 'decrypted_secrets'
           and grantee in ('anon', 'authenticated', 'service_role'))                 as vault_api_grants;

-- AFTER THE FIRST SCHEDULED RUN (next day 08:17 UTC):
--   select status, return_message, start_time from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'meal-photo-sweep')
--    order by start_time desc limit 1;                       -- succeeded, 1 row
--   select status_code, content, timed_out, error_msg from net._http_response
--    order by created desc limit 1;                          -- 200, the counts JSON (within 6 h)

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '071_meal_photo_sweep_schedule'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '071_meal_photo_sweep_schedule');
