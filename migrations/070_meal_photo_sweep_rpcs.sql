-- 070_meal_photo_sweep_rpcs.sql
-- SPEC_photo_sweep.md (design chat 2026-10-25) + Amendment 2026-10-25, C2.
--
-- WHY
--   Removing a meal photo is a soft delete (065): the row and both objects stay
--   forever. The meal-photo-sweep Edge Function deletes them after a 30-day grace
--   (D1), and objects with no row at all after 7 days (D4). The function needs
--   three things PostgREST can't give it directly: the 30-day cutoff computed in
--   the database (not on the function's clock), a read of storage.objects (not
--   exposed through PostgREST), and a row delete that repeats the cutoff so a row
--   restored mid-run is never deleted. These three RPCs are those three things.
--
-- WHAT
--   meal_photo_sweep_expired(p_limit)   → id, thumb_path, view_path; capped at 500 (D7)
--   meal_photo_sweep_orphans(p_limit)   → object names in meal-photos, > 7 days old,
--                                          matching no row (live OR soft-deleted); capped 1000
--   meal_photo_sweep_delete_rows(p_ids) → deletes those ids still past the cutoff; row count
--   All security invoker (service_role already holds DELETE on meal_photos (065)
--   and SELECT on storage.objects, and BYPASSRLS), search_path '', EXECUTE to
--   service_role only (068's model: revoke from public, anon, authenticated AND
--   service_role, then grant the one role).
--
-- NOT CHANGED
--   * meal_photos, its grants, RLS, 065's RPCs.
--   * storage.objects — read here, never deleted here. Objects leave only through
--     the Storage API, in the function (D6).
--   * No schedule — that's 071, after the dev live run (Rollout 2).
--
-- NUMBER
--   070 — next free on disk on 2026-10-25. The spec's §2 "070 schedule" moves to
--   071 (Amendment C2).
--
-- APPLY
--   Dev first (zxwtxjjmssykhqrghouf, 7642734024280108049) by Dan in the SQL
--   editor, then VERIFY on the same identifier and the ledger row below by hand.
--   Prod (parpauldmbetptkmdwbd, 7606130613603586966) at Rollout 3; no ledger on
--   prod, by decision. Idempotent.
-- ROLLBACK: drop the three functions — nothing else depends on them but the
--   meal-photo-sweep function, which then answers 500 and deletes nothing.

begin;

create or replace function public.meal_photo_sweep_expired(p_limit integer default 500)
  returns table (id uuid, thumb_path text, view_path text)
  language sql
  stable
  security invoker
  set search_path = ''
as $function$
  select p.id, p.thumb_path, p.view_path
    from public.meal_photos p
   where p.deleted_at < now() - interval '30 days'
   order by p.deleted_at
   limit least(greatest(coalesce(p_limit, 500), 0), 500)
$function$;

create or replace function public.meal_photo_sweep_orphans(p_limit integer default 1000)
  returns table (name text)
  language sql
  stable
  security invoker
  set search_path = ''
as $function$
  select o.name
    from storage.objects o
   where o.bucket_id = 'meal-photos'
     and o.created_at < now() - interval '7 days'
     and not exists (select 1 from public.meal_photos p
                      where p.thumb_path = o.name or p.view_path = o.name)
   order by o.created_at
   limit least(greatest(coalesce(p_limit, 1000), 0), 1000)
$function$;

create or replace function public.meal_photo_sweep_delete_rows(p_ids uuid[])
  returns integer
  language plpgsql
  volatile
  security invoker
  set search_path = ''
as $function$
declare
  v_n integer;
begin
  delete from public.meal_photos
   where id = any(p_ids)
     and deleted_at < now() - interval '30 days';
  get diagnostics v_n = row_count;
  return v_n;
end
$function$;

comment on function public.meal_photo_sweep_expired(integer) is
  '070 — meal-photo-sweep: soft-deleted photos past the 30-day grace (SPEC_photo_sweep D1), oldest first, at most 500. Cutoff computed here, not on the function clock. EXECUTE to service_role only.';
comment on function public.meal_photo_sweep_orphans(integer) is
  '070 — meal-photo-sweep: meal-photos objects older than 7 days matching no meal_photos row, live or soft-deleted (D4), at most 1000. Read only — objects leave through the Storage API (D6). EXECUTE to service_role only.';
comment on function public.meal_photo_sweep_delete_rows(uuid[]) is
  '070 — meal-photo-sweep: hard-deletes the given rows, repeating the 30-day condition so a row restored mid-run survives (D5). Called only after remove() succeeded for their objects. EXECUTE to service_role only.';

revoke all on function public.meal_photo_sweep_expired(integer) from public, anon, authenticated, service_role;
revoke all on function public.meal_photo_sweep_orphans(integer) from public, anon, authenticated, service_role;
revoke all on function public.meal_photo_sweep_delete_rows(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.meal_photo_sweep_expired(integer) to service_role;
grant execute on function public.meal_photo_sweep_orphans(integer) to service_role;
grant execute on function public.meal_photo_sweep_delete_rows(uuid[]) to service_role;

notify pgrst, 'reload schema';

commit;

-- VERIFY — three rows. Expect (dev): which_db 7642734024280108049 on each ·
--   secdef false · search_path_empty true · exec_grantees service_role · public_exec false.
-- Prod: identical except which_db 7606130613603586966.
select
  (select system_identifier from pg_control_system())                       as which_db,
  p.oid::regprocedure                                                       as fn,
  p.prosecdef                                                               as secdef,
  p.proconfig = array['search_path=""']                                     as search_path_empty,
  (select coalesce(string_agg(r.rolname, ',' order by r.rolname), '')
     from aclexplode(p.proacl) a join pg_roles r on r.oid = a.grantee
    where a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner)         as exec_grantees,
  exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)         as public_exec
from pg_proc p
where p.oid in ('public.meal_photo_sweep_expired(integer)'::regprocedure,
                'public.meal_photo_sweep_orphans(integer)'::regprocedure,
                'public.meal_photo_sweep_delete_rows(uuid[])'::regprocedure)
order by 2;

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '070_meal_photo_sweep_rpcs'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '070_meal_photo_sweep_rpcs');
