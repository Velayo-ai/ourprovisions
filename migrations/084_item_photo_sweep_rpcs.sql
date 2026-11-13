-- 084_item_photo_sweep_rpcs.sql
-- SPEC_ask_slice4.md (approved 2026-11-09), ruling S4-8; Step 0 #3. 070's shape for the
-- item-photos bucket (A23), its own migration as S37 is.
--
-- WHY
--   Replacing or removing a household item photo is a soft delete (077): set_household_item_photo
--   marks the old row and remove_household_item_photo marks the row; both objects stay. A
--   catalog-item or household hard delete CASCADEs the row away and leaves its objects with no
--   row at all. The item-photos bucket must not grow forever. The meal-photo-sweep function gets a
--   second pass over this bucket; these three RPCs are what it needs, exactly as 070's are for
--   meal-photos: the cutoff computed in the database, a read of storage.objects, and a row delete
--   that repeats the cutoff.
--
-- WHAT
--   item_photo_sweep_expired(p_limit)   → id, thumb_path, view_path of rows soft-deleted more than
--                                          30 days ago (070's D1 window), oldest first, ≤ 500.
--                                          NEVER a row whose paths a LIVE row also names: 077 lets
--                                          set_household_item_photo be called again with the same
--                                          paths (its fixture (27) does), so a replaced row and the
--                                          live row can share objects. Those rows wait.
--   item_photo_sweep_orphans(p_limit)   → object names in item-photos, older than 7 days, that no
--                                          row names (live OR soft-deleted), ≤ 1000
--   item_photo_sweep_delete_rows(p_ids) → deletes those ids still past the cutoff; row count
--   All security invoker (service_role holds DELETE on household_item_photos (077) and SELECT on
--   storage.objects, and BYPASSRLS), search_path '', EXECUTE to service_role only (068's model).
--
-- THE FUNCTION'S PASS (not in this file; supabase/functions/meal-photo-sweep, Slice 4 build): one
--   run does both buckets, so the secret, the schedule (.github/workflows/meal-photo-sweep.yml) and
--   SWEEP_LIVE are shared. Pass 2 is pass 1 with bucket 'item-photos' and these RPCs: expired →
--   remove() both objects → delete the rows only if remove() returned no error; then orphans →
--   remove(). The same path guard (^<uuid>/<uuid>/<uuid>-(thumb|view)\.(webp|jpg)$ —
--   item-photos are {household}/{catalog_item}/{stem}-thumb|view.{webp|jpg}, the same shape) and
--   the same counts-only output, under item_* keys.
--
-- NEVER: a live row's objects (above); any object outside item-photos; a delete of
--   storage.objects in SQL. Deleting an ask removes no photo (A23: the photo is the household's
--   item's, not the ask's) — nothing here reads asks.
--
-- APPLY: dev (zxwtxjjmssykhqrghouf, 7642734024280108049) after 083, with fresh eyes, never after
--   midnight. PARSE CHECK = this file with `commit;` → `rollback;`, nothing else changed. Log
--   (warnings): "084 VERIFY: 23 checked, 0 mismatches", "084 fixture: 11 checks passed", then
--   "084 COMMITTED — …" or "084 ROLLED BACK — parse check, nothing persisted". Then the closing
--   VERIFY on the same identifier and the ledger row by hand. Prod (parpauldmbetptkmdwbd,
--   7606130613603586966) at Ask's promotion, after 083, before the function's item pass ships.
--   Idempotent. Run as postgres.
-- ROLLBACK: 084_rollback.sql — deploy the function without its item pass first (with the RPCs
--   gone, that pass errors and deletes nothing, but the run goes red).
-- DRAFTED 2026-11-09 (ET) by Claude Code. Parse check on dev 2026-11-10 04:34:49 UTC
--   (`supabase db query --linked -f`, the file with `commit;` → `rollback;`). Log: "084 VERIFY: 23
--   checked, 0 mismatches", "084 fixture: 11 checks passed", "084 ROLLED BACK — parse check".
--   Closing SELECT: no rows, as expected. Read-back after: no item_photo_sweep_*, ledger still
--   20261109030809, 0 fixture rows, item-photos objects 14 (unchanged). 084_rollback.sql
--   parse-checked the same way (04:36:22). NOT APPLIED.

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '084: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '084: run as postgres — current_user is %', current_user;
  end if;
  if to_regclass('public.household_item_photos') is null
     or not exists (select 1 from storage.buckets where id = 'item-photos' and not public) then
    raise exception '084: 077 is not on this database — no household_item_photos or private item-photos bucket';
  end if;
  if to_regprocedure('public.meal_photo_sweep_orphans(integer)') is null then
    raise exception '084: 070 is not on this database — the item pass rides the meal-photo sweep';
  end if;
end
$preflight$;

create or replace function public.item_photo_sweep_expired(p_limit integer default 500)
  returns table (id uuid, thumb_path text, view_path text)
  language sql
  stable
  security invoker
  set search_path = ''
as $function$
  select p.id, p.thumb_path, p.view_path
    from public.household_item_photos p
   where p.deleted_at < now() - interval '30 days'
     and not exists (select 1 from public.household_item_photos l
                      where l.deleted_at is null
                        and (l.thumb_path in (p.thumb_path, p.view_path)
                             or l.view_path in (p.thumb_path, p.view_path)))
   order by p.deleted_at
   limit least(greatest(coalesce(p_limit, 500), 0), 500)
$function$;

create or replace function public.item_photo_sweep_orphans(p_limit integer default 1000)
  returns table (name text)
  language sql
  stable
  security invoker
  set search_path = ''
as $function$
  select o.name
    from storage.objects o
   where o.bucket_id = 'item-photos'
     and o.created_at < now() - interval '7 days'
     and not exists (select 1 from public.household_item_photos p
                      where p.thumb_path = o.name or p.view_path = o.name)
   order by o.created_at
   limit least(greatest(coalesce(p_limit, 1000), 0), 1000)
$function$;

create or replace function public.item_photo_sweep_delete_rows(p_ids uuid[])
  returns integer
  language plpgsql
  volatile
  security invoker
  set search_path = ''
as $function$
declare
  v_n integer;
begin
  delete from public.household_item_photos
   where id = any(p_ids)
     and deleted_at < now() - interval '30 days';
  get diagnostics v_n = row_count;
  return v_n;
end
$function$;

comment on function public.item_photo_sweep_expired(integer) is
  '084 (S4-8) — meal-photo-sweep, item pass: household item photos soft-deleted more than 30 days ago, oldest first, at most 500, never a row whose paths a live row also names. Cutoff computed here, not on the function clock. EXECUTE to service_role only.';
comment on function public.item_photo_sweep_orphans(integer) is
  '084 (S4-8) — meal-photo-sweep, item pass: item-photos objects older than 7 days matching no household_item_photos row, live or soft-deleted, at most 1000. Read only — objects leave through the Storage API. EXECUTE to service_role only.';
comment on function public.item_photo_sweep_delete_rows(uuid[]) is
  '084 (S4-8) — meal-photo-sweep, item pass: hard-deletes the given rows, repeating the 30-day condition so a row restored mid-run survives. Called only after remove() succeeded for their objects. EXECUTE to service_role only.';

revoke all on function public.item_photo_sweep_expired(integer) from public, anon, authenticated, service_role;
revoke all on function public.item_photo_sweep_orphans(integer) from public, anon, authenticated, service_role;
revoke all on function public.item_photo_sweep_delete_rows(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.item_photo_sweep_expired(integer) to service_role;
grant execute on function public.item_photo_sweep_orphans(integer) to service_role;
grant execute on function public.item_photo_sweep_delete_rows(uuid[]) to service_role;

notify pgrst, 'reload schema';

do $verify$
declare
  v_checked integer := 0;
  v_bad     text[] := array[]::text[];
  v_fn      oid;
  v_got     text;
  g         record;
  f         record;
begin
  -- (1–21) the three functions: present, invoker, search_path '', and their grants per grantee.
  for f in select * from (values
      ('public.item_photo_sweep_expired(integer)'),
      ('public.item_photo_sweep_orphans(integer)'),
      ('public.item_photo_sweep_delete_rows(uuid[])')) t (sig) loop
    v_fn := to_regprocedure(f.sig);
    v_checked := v_checked + 1;
    if v_fn is null then v_bad := v_bad || (f.sig || ' MISSING'); end if;
    v_checked := v_checked + 1;
    if coalesce((select prosecdef from pg_proc where oid = v_fn), true) then v_bad := v_bad || (f.sig || ' not invoker'); end if;
    v_checked := v_checked + 1;
    if (select proconfig from pg_proc where oid = v_fn) is distinct from array['search_path=""'] then
      v_bad := v_bad || (f.sig || ' search_path');
    end if;
    for g in select * from (values ('PUBLIC', ''), ('anon', ''), ('authenticated', ''), ('service_role', 'EXECUTE')) t (grantee, want) loop
      v_checked := v_checked + 1;
      v_got := coalesce((select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                           from pg_proc p, aclexplode(p.proacl) a
                          where p.oid = v_fn
                            and a.grantee = case g.grantee when 'PUBLIC' then 0 else g.grantee::regrole::oid end), '');
      if v_got <> g.want then v_bad := v_bad || (f.sig || '/' || g.grantee || ' want [' || g.want || '] got [' || v_got || ']'); end if;
    end loop;
  end loop;
  -- (22) service_role can read and delete the rows (077's grant).
  v_checked := v_checked + 1;
  if not (has_table_privilege('service_role', 'public.household_item_photos', 'SELECT')
          and has_table_privilege('service_role', 'public.household_item_photos', 'DELETE')) then
    v_bad := v_bad || 'service_role lacks SELECT/DELETE on household_item_photos';
  end if;
  -- (23) service_role can read storage.objects.
  v_checked := v_checked + 1;
  if not has_table_privilege('service_role', 'storage.objects', 'SELECT') then
    v_bad := v_bad || 'service_role lacks SELECT on storage.objects';
  end if;

  raise warning '084 VERIFY: % checked, % mismatches%', v_checked, cardinality(v_bad),
    case when cardinality(v_bad) > 0 then ' — ' || array_to_string(v_bad, '; ') else '' end;
  if cardinality(v_bad) > 0 or v_checked <> 23 then
    raise exception '084 VERIFY failed: %', array_to_string(v_bad, '; ');
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- FIXTURE — definer-run, inside a savepoint, rolled back. One throw-away household and three
-- custom items, with every row and object state the item pass meets; the RPCs are called as
-- service_role, then probed as authenticated and anon. Results are read only for the fixture's
-- own household prefix and row ids, so real dev rows and objects never decide a check. Nothing
-- here survives.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
savepoint fixture;

do $fixture$
declare
  v_tag    text := '084-fixture-' || gen_random_uuid()::text;
  v_a      uuid;
  v_hh     uuid;
  v_i      uuid[] := array[]::uuid[];
  v_old    uuid;    -- replaced 31 days ago: expired
  v_recent uuid;    -- replaced 5 days ago: inside the window
  v_live   uuid;    -- live, its objects 40 days old
  v_shared uuid;    -- soft-deleted 40 days ago, its paths also named by a live row
  v_live2  uuid;
  v_n      integer;
  v_ok     integer := 0;
  v_p      text;    -- the fixture's path prefix, <household>/
  s        text[] := array[]::text[];   -- stems s[1]..s[6]
  k        integer;
begin
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-a', v_tag || '-a@fixture.invalid', '084 Alpha') returning id into v_a;
  insert into public.households (name, created_by) values (v_tag, v_a) returning id into v_hh;
  insert into public.household_members (household_id, user_id) values (v_hh, v_a);
  for k in 1..3 loop
    insert into public.catalog_items (name, category, is_global, household_id, created_by)
    values (v_tag || '-item-' || k, 'Snacks', false, v_hh, v_a) returning id into v_old;
    v_i := v_i || v_old;
  end loop;
  for k in 1..6 loop s := s || gen_random_uuid()::text; end loop;
  v_p := v_hh::text || '/';

  -- Objects: s1 old replaced, s2 recent replaced, s3 live, s4 shared (live + old deleted row),
  -- s5 an orphan 8 days old, s6 an orphan 1 day old; plus an 8-day meal-photos orphan.
  for k in 1..6 loop
    insert into storage.objects (bucket_id, name, created_at) values
      ('item-photos', v_p || v_i[1 + (k % 3)] || '/' || s[k] || '-thumb.webp',
       now() - case k when 5 then interval '8 days' when 6 then interval '1 day' else interval '40 days' end),
      ('item-photos', v_p || v_i[1 + (k % 3)] || '/' || s[k] || '-view.webp',
       now() - case k when 5 then interval '8 days' when 6 then interval '1 day' else interval '40 days' end);
  end loop;
  insert into storage.objects (bucket_id, name, created_at)
  values ('meal-photos', v_p || gen_random_uuid() || '/' || gen_random_uuid() || '-thumb.webp', now() - interval '8 days');

  -- Rows (as the owner; 077's RPCs would stamp deleted_at = now()).
  insert into public.household_item_photos (household_id, catalog_item_id, thumb_path, view_path, created_by, created_at, deleted_at)
  values (v_hh, v_i[2], v_p || v_i[2] || '/' || s[1] || '-thumb.webp', v_p || v_i[2] || '/' || s[1] || '-view.webp', v_a, now() - interval '40 days', now() - interval '31 days')
  returning id into v_old;
  insert into public.household_item_photos (household_id, catalog_item_id, thumb_path, view_path, created_by, created_at, deleted_at)
  values (v_hh, v_i[3], v_p || v_i[3] || '/' || s[2] || '-thumb.webp', v_p || v_i[3] || '/' || s[2] || '-view.webp', v_a, now() - interval '40 days', now() - interval '5 days')
  returning id into v_recent;
  insert into public.household_item_photos (household_id, catalog_item_id, thumb_path, view_path, created_by, created_at)
  values (v_hh, v_i[1], v_p || v_i[1] || '/' || s[3] || '-thumb.webp', v_p || v_i[1] || '/' || s[3] || '-view.webp', v_a, now() - interval '40 days')
  returning id into v_live;
  insert into public.household_item_photos (household_id, catalog_item_id, thumb_path, view_path, created_by, created_at, deleted_at)
  values (v_hh, v_i[2], v_p || v_i[2] || '/' || s[4] || '-thumb.webp', v_p || v_i[2] || '/' || s[4] || '-view.webp', v_a, now() - interval '40 days', now() - interval '40 days')
  returning id into v_shared;
  insert into public.household_item_photos (household_id, catalog_item_id, thumb_path, view_path, created_by, created_at)
  values (v_hh, v_i[2], v_p || v_i[2] || '/' || s[4] || '-thumb.webp', v_p || v_i[2] || '/' || s[4] || '-view.webp', v_a, now() - interval '40 days')
  returning id into v_live2;

  execute 'set local role service_role';
  if current_user <> 'service_role' then raise exception '084 fixture: not running as service_role'; end if;

  -- (1–4) Expired: the old replaced row only; not the recent one, the live one, or the shared one.
  if not exists (select 1 from public.item_photo_sweep_expired(500) e where e.id = v_old) then
    raise exception '084 fixture (1): the 31-day replaced photo was not listed';
  end if;
  v_ok := v_ok + 1;
  if exists (select 1 from public.item_photo_sweep_expired(500) e where e.id = v_recent) then
    raise exception '084 fixture (2): a photo inside the 30-day window was listed';
  end if;
  v_ok := v_ok + 1;
  if exists (select 1 from public.item_photo_sweep_expired(500) e where e.id in (v_live, v_live2)) then
    raise exception '084 fixture (3): a live photo was listed';
  end if;
  v_ok := v_ok + 1;
  if exists (select 1 from public.item_photo_sweep_expired(500) e where e.id = v_shared) then
    raise exception '084 fixture (4): a deleted row sharing a live row''s objects was listed';
  end if;
  v_ok := v_ok + 1;

  -- (5–8) Orphans: exactly s5's two objects in the fixture's prefix; never the meal-photos one.
  if (select array_agg(o.name order by o.name) from public.item_photo_sweep_orphans(1000) o where o.name like v_p || '%')
       is distinct from (select array_agg(n order by n) from unnest(array[
         v_p || v_i[1 + (5 % 3)] || '/' || s[5] || '-thumb.webp',
         v_p || v_i[1 + (5 % 3)] || '/' || s[5] || '-view.webp']) as n) then
    raise exception '084 fixture (5): the orphans in the fixture prefix are not exactly s5''s two';
  end if;
  v_ok := v_ok + 1;
  if exists (select 1 from public.item_photo_sweep_orphans(1000) o where o.name like '%' || s[6] || '%') then
    raise exception '084 fixture (6): a 1-day-old orphan was listed';
  end if;
  v_ok := v_ok + 1;
  if exists (select 1 from public.item_photo_sweep_orphans(1000) o
              where o.name like '%' || s[1] || '%' or o.name like '%' || s[2] || '%'
                 or o.name like '%' || s[3] || '%' or o.name like '%' || s[4] || '%') then
    raise exception '084 fixture (7): an object a row still names was listed as an orphan';
  end if;
  v_ok := v_ok + 1;
  if (select count(*) from public.item_photo_sweep_orphans(1000)) <> (select count(*) from storage.objects o
        where o.bucket_id = 'item-photos' and o.created_at < now() - interval '7 days'
          and not exists (select 1 from public.household_item_photos p where p.thumb_path = o.name or p.view_path = o.name)) then
    raise exception '084 fixture (8): the orphan list reached outside item-photos';
  end if;
  v_ok := v_ok + 1;

  -- (9) Row delete repeats the window: of old, recent and live, only old goes.
  v_n := public.item_photo_sweep_delete_rows(array[v_old, v_recent, v_live]);
  if v_n <> 1 or exists (select 1 from public.household_item_photos where id = v_old)
     or (select count(*) from public.household_item_photos where id in (v_recent, v_live)) <> 2 then
    raise exception '084 fixture (9): delete_rows removed % rows, or the wrong ones', v_n;
  end if;
  v_ok := v_ok + 1;
  execute 'reset role';

  -- (10–11) No one else can call them.
  execute 'set local role authenticated';
  begin perform public.item_photo_sweep_expired(500);
        raise exception '084 fixture (10): authenticated called the sweep';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  execute 'reset role';
  execute 'set local role anon';
  begin perform public.item_photo_sweep_delete_rows(array[v_recent]);
        raise exception '084 fixture (11): anon called the sweep';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  execute 'reset role';

  raise warning '084 fixture: % checks passed', v_ok;
  if v_ok <> 11 then raise exception '084 fixture: % checks passed, want 11', v_ok; end if;
end
$fixture$;

rollback to savepoint fixture;

commit;

-- Which copy ran, in the Postgres log (log_min_messages = warning). Read-only.
do $which$
begin
  if to_regprocedure('public.item_photo_sweep_expired(integer)') is not null then
    raise warning '084 COMMITTED — item_photo_sweep_* present on %', (select system_identifier from pg_control_system());
  else
    raise warning '084 ROLLED BACK — parse check, nothing persisted on %', (select system_identifier from pg_control_system());
  end if;
end
$which$;

-- ═══ CLOSING VERIFY — three rows (read-only; right after the commit) ══════════════════════
-- Expected (dev): which_db 7642734024280108049 on each · secdef false · search_path_empty true ·
--   exec_grantees service_role · public_exec false · fixture_rows 0. Prod: identical except
--   which_db 7606130613603586966.
-- After the parse-check copy: no rows (the functions are gone again).
select
  (select system_identifier from pg_control_system())                       as which_db,
  p.oid::regprocedure                                                       as fn,
  p.prosecdef                                                               as secdef,
  p.proconfig = array['search_path=""']                                     as search_path_empty,
  (select coalesce(string_agg(r.rolname, ',' order by r.rolname), '')
     from aclexplode(p.proacl) a join pg_roles r on r.oid = a.grantee
    where a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner)         as exec_grantees,
  exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)         as public_exec,
  (select count(*) from public.users where clerk_id like '084-fixture-%')
  + (select count(*) from public.households where name like '084-fixture-%') as fixture_rows
from pg_proc p
where p.oid in (to_regprocedure('public.item_photo_sweep_expired(integer)'),
                to_regprocedure('public.item_photo_sweep_orphans(integer)'),
                to_regprocedure('public.item_photo_sweep_delete_rows(uuid[])'))
order by 2;

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '084_item_photo_sweep_rpcs'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '084_item_photo_sweep_rpcs');
