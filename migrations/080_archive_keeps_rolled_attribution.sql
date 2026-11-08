-- 080_archive_keeps_rolled_attribution.sql
-- SPEC_rollforward_keeps_attribution.md, second half (2026-11-07, Dan's dev walk after 079 FAILED:
-- no "Added by" on Mustard, Ranch or Salsa after Wrap up rolled them).
--
-- THE BUG (the other half): wrapUpTrip (useProvisions.js) calls archive_trip_items(household, rolled
--   ids) and THEN close_cycle(cycle, rolled ids). archive_trip_items (live body = 051's) ends with
--   "delete from list_item_contributors where list_item_id in (every list_items row of the
--   household)", so the rolled items' ledger was already gone before 079's close_cycle ran. 079 is
--   correct and stays; 079 + 080 together are the fix. (059's header measured the same wipe:
--   0 surviving contributor rows across 12 wrapped sessions.)
--
-- STEP 0 (read-only, 2026-11-07):
--   dev  (zxwtxjjmssykhqrghouf, 7642734024280108049): archive_trip_items(uuid, uuid[]) prosrc md5
--        a76ae07cdce99787009e0a8641c0e815 = migration 051's body byte for byte (916 chars, LF);
--        SECURITY DEFINER, search_path=public, extensions, EXECUTE authenticated only. No migration
--        after 051 redefines it. Ledger top: 20261107195120 079_rollforward_keeps_attribution.
--   prod (parpauldmbetptkmdwbd, 7606130613603586966): the same body with CRLF line endings (951
--        chars; md5 with CRs stripped = a76ae07c…); same definer, search_path and grants.
--   Nothing else reads the ledger at Wrap up: no view reads list_item_contributors; the functions
--   that touch it are archive_trip_items, delete_custom_catalog_item, delete_household,
--   land_ask_picks and remove_list_item.
--
-- WHAT — archive_trip_items recreated from the live (051) body with ONE change: the contributor
--   delete skips the kept (rolled) ids, using the same keep test as the archive update above it:
--     and (array_length(p_keep_item_ids, 1) is null or list_item_id != all(p_keep_item_ids))
--   and its comment now says what happens: archived rows lose attribution (a re-add starts fresh);
--   rolled rows keep it. Everything else is byte-identical, including the unused v_item_id declare:
--   signature, SECURITY DEFINER, search_path (034), the 051 membership check, both archive updates.
--   The revoke/grant block is re-stated so the read-back proves it. New body md5
--   09e2a183f4e8b128d59d478e9a54bbdf.
--   An empty or null keep list still clears every contributor row of the household (nothing rolled).
--
-- REQUIRES 079: VERIFY refuses to commit unless close_cycle's body is 079's (md5 e58456b6…). On prod,
--   apply 079 first.
--
-- NOT IN 080: backfill B (Dan's decision, after a re-count). No client change.
--
-- FIXTURE: runs as the owner inside `savepoint fixture` … `rollback to savepoint fixture`, and
--   calls the client's REAL wrap-up sequence: archive_trip_items(keep = rolled ids), THEN
--   close_cycle(rolled ids). Three throw-away users (A and B members, C an outsider). Rolled:
--   Mustard added by B, Ranch by A (qty 2), Salsa by both. Not rolled: Bread (bought, by A) and
--   Chips (pending, by B), whose contributors MUST be cleared. Impersonates through
--   request.jwt.claims (is_local = true). Nothing survives.
-- APPLY: dev first. PARSE CHECK = this file with `commit;` → `rollback;`, nothing else changed. Both
--   copies log (warnings): "080 VERIFY: 10 checked, 0 mismatches", "080 fixture: 8 checks passed",
--   then "080 COMMITTED — …" or "080 ROLLED BACK — parse check …". Then the closing VERIFY on the
--   same database and the ledger row (dev only; prod has no ledger, applied = object read-back).
--   Prod after Dan confirms the dev walk: 079, then this file, the closing VERIFY, then the live walk.
-- ROLLBACK: 080_rollback.sql restores 051's body verbatim.
--
-- DRAFTED 2026-11-07 by Claude Code.

begin;

create or replace function public.archive_trip_items(p_household_id uuid, p_keep_item_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_item_id uuid;
begin
  if not is_member_of(p_household_id) then
    raise exception 'archive_trip_items: not a member of household %', p_household_id using errcode = '42501';
  end if;

  -- Archive all bought items
  update list_items
  set deleted_at = now()
  where household_id = p_household_id
    and status = 'bought'
    and deleted_at is null;

  -- Archive pending items NOT in the keep list
  update list_items
  set deleted_at = now()
  where household_id = p_household_id
    and status = 'pending'
    and deleted_at is null
    and (
      array_length(p_keep_item_ids, 1) is null
      or id != all(p_keep_item_ids)
    );

  -- 080: clear contributor badges, except on rolled items
  -- Archived rows lose attribution (a re-add starts fresh); rolled rows
  -- (p_keep_item_ids) keep it, and close_cycle carries it forward (079)
  delete from list_item_contributors
  where list_item_id in (
    select id from list_items
    where household_id = p_household_id
  )
    and (
      array_length(p_keep_item_ids, 1) is null
      or list_item_id != all(p_keep_item_ids)
    );

end;
$function$;

revoke all on function public.archive_trip_items(uuid, uuid[]) from public;
revoke all on function public.archive_trip_items(uuid, uuid[]) from anon;
revoke all on function public.archive_trip_items(uuid, uuid[]) from service_role;
grant execute on function public.archive_trip_items(uuid, uuid[]) to authenticated;

-- VERIFY — inside the transaction; any mismatch raises and rolls everything back.
do $verify$
declare
  v_bad     text[] := array[]::text[];
  v_checked integer := 0;
  v_oid     oid;
  v_src     text;
begin
  select p.oid, p.prosrc into v_oid, v_src from pg_proc p
   where p.proname = 'archive_trip_items' and p.pronamespace = 'public'::regnamespace;
  v_checked := v_checked + 1;
  if (select count(*) from pg_proc where proname = 'archive_trip_items') <> 1 then v_bad := v_bad || 'not exactly one archive_trip_items'; end if;
  v_checked := v_checked + 1;
  if not (select prosecdef from pg_proc where oid = v_oid) then v_bad := v_bad || 'not security definer'; end if;
  v_checked := v_checked + 1;
  if (select proconfig from pg_proc where oid = v_oid) is distinct from array['search_path=public, extensions'] then v_bad := v_bad || 'search_path changed'; end if;
  v_checked := v_checked + 1;
  if has_function_privilege('anon', v_oid, 'execute') or has_function_privilege('service_role', v_oid, 'execute')
     or not has_function_privilege('authenticated', v_oid, 'execute') then v_bad := v_bad || 'grants: want authenticated only'; end if;
  v_checked := v_checked + 1;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) x where p.oid = v_oid and x.grantee = 0) then v_bad := v_bad || 'PUBLIC holds EXECUTE'; end if;
  v_checked := v_checked + 1;
  if v_src not like '%archive_trip_items: not a member of household%' then v_bad := v_bad || 'marker 051 missing'; end if;
  v_checked := v_checked + 1;
  if v_src not like '%080: clear contributor badges, except on rolled items%' then v_bad := v_bad || 'marker 080 missing'; end if;
  v_checked := v_checked + 1;
  if v_src not like '%or list_item_id != all(p_keep_item_ids)%' or v_src like '%Clear ALL contributor badges%'
     then v_bad := v_bad || 'the contributor delete still clears rolled items'; end if;
  v_checked := v_checked + 1;
  if md5(replace(v_src, chr(13), '')) <> '09e2a183f4e8b128d59d478e9a54bbdf' then v_bad := v_bad || ('body md5 ' || md5(replace(v_src, chr(13), '')) || ' is not the file''s'); end if;
  v_checked := v_checked + 1;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where proname = 'close_cycle' and pronamespace = 'public'::regnamespace)
     is distinct from 'e58456b69bc0d92152fd6622663a198a' then v_bad := v_bad || 'close_cycle is not 079''s (apply 079 first)'; end if;
  raise warning '080 VERIFY: % checked, % mismatches%', v_checked, cardinality(v_bad),
    case when cardinality(v_bad) > 0 then ' — ' || array_to_string(v_bad, '; ') else '' end;
  if cardinality(v_bad) > 0 then
    raise exception '080 VERIFY failed: %', array_to_string(v_bad, '; ');
  end if;
end
$verify$;

-- FIXTURE — definer-run, inside a savepoint, rolled back. Nothing here survives.
savepoint fixture;

do $fixture$
declare
  v_tag    text := '080-fixture-' || gen_random_uuid()::text;
  v_a      uuid; v_b uuid; v_c uuid;                   -- A and B members, C an outsider
  v_hh     uuid; v_hh2 uuid;
  v_cycle  uuid; v_new uuid;
  v_cm     uuid; v_cr uuid; v_cs uuid; v_cb uuid; v_cc uuid;   -- Mustard, Ranch, Salsa, Bread, Chips
  v_lm     uuid; v_lr uuid; v_ls uuid; v_lb uuid; v_lc uuid;   -- their list rows
  v_roll   uuid[];
  v_before text; v_after text;
  v_ok     integer := 0;
begin
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-a', v_tag || '-a@fixture.invalid', '080 Alpha') returning id into v_a;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-b', v_tag || '-b@fixture.invalid', '080 Bravo') returning id into v_b;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-c', v_tag || '-c@fixture.invalid', '080 Charlie') returning id into v_c;
  insert into public.households (name, created_by) values (v_tag, v_a) returning id into v_hh;
  insert into public.households (name, created_by) values (v_tag || '-other', v_c) returning id into v_hh2;
  insert into public.household_members (household_id, user_id) values (v_hh, v_a), (v_hh, v_b), (v_hh2, v_c);
  insert into public.catalog_items (name, category, is_global, household_id, created_by) values (v_tag || '-mustard', 'Pantry', false, v_hh, v_b) returning id into v_cm;
  insert into public.catalog_items (name, category, is_global, household_id, created_by) values (v_tag || '-ranch', 'Pantry', false, v_hh, v_a) returning id into v_cr;
  insert into public.catalog_items (name, category, is_global, household_id, created_by) values (v_tag || '-salsa', 'Pantry', false, v_hh, v_a) returning id into v_cs;
  insert into public.catalog_items (name, category, is_global, household_id, created_by) values (v_tag || '-bread', 'Bakery', false, v_hh, v_a) returning id into v_cb;
  insert into public.catalog_items (name, category, is_global, household_id, created_by) values (v_tag || '-chips', 'Snacks', false, v_hh, v_b) returning id into v_cc;
  insert into public.provision_cycles (household_id, created_by) values (v_hh, v_a) returning id into v_cycle;
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id) values (v_hh, v_cm, 1, 'pending', v_b, v_cycle) returning id into v_lm;
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id) values (v_hh, v_cr, 2, 'pending', v_a, v_cycle) returning id into v_lr;
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id) values (v_hh, v_cs, 2, 'pending', v_a, v_cycle) returning id into v_ls;
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id, checked_by) values (v_hh, v_cb, 1, 'bought', v_a, v_cycle, v_a) returning id into v_lb;
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id) values (v_hh, v_cc, 1, 'pending', v_b, v_cycle) returning id into v_lc;
  insert into public.list_item_contributors (list_item_id, user_id, quantity_added) values
    (v_lm, v_b, 1), (v_lr, v_a, 2), (v_ls, v_a, 1), (v_ls, v_b, 1), (v_lb, v_a, 1), (v_lc, v_b, 1);
  v_roll := array[v_lm, v_lr, v_ls];
  select string_agg(list_item_id || ':' || user_id || ':' || quantity_added || ':' || coalesce(deleted_at::text, '-'), ',' order by list_item_id, user_id)
    into v_before from public.list_item_contributors where list_item_id = any(v_roll);

  perform set_config('request.jwt.claims', json_build_object('sub', v_tag || '-a', 'role', 'authenticated')::text, true);
  if public.get_current_user_id() is distinct from v_a then raise exception '080 fixture: impersonation failed'; end if;

  -- The client's wrap-up order (useProvisions.js wrapUpTrip): archive, THEN close. Each call is its
  -- own statement; the checks are separate statements (a statement's subqueries don't see what a
  -- function called in the same statement wrote).
  perform public.archive_trip_items(v_hh, v_roll);
  -- (1) Bread (bought) and Chips (pending, not rolled) are archived; the three rolled rows are not.
  if (select count(*) from public.list_items where id in (v_lb, v_lc) and deleted_at is not null) <> 2
     or (select count(*) from public.list_items where id = any(v_roll) and deleted_at is null and status = 'pending') <> 3 then
    raise exception '080 fixture (1): the archive step archived the wrong rows';
  end if;
  v_ok := v_ok + 1;
  -- (2) Bread's and Chips' contributors are cleared (archived rows lose attribution).
  if exists (select 1 from public.list_item_contributors where list_item_id in (v_lb, v_lc)) then
    raise exception '080 fixture (2): archived rows kept their contributors';
  end if;
  v_ok := v_ok + 1;
  -- (3) THE FIX, first half: the rolled rows' contributors survive the archive step, unchanged.
  select string_agg(list_item_id || ':' || user_id || ':' || quantity_added || ':' || coalesce(deleted_at::text, '-'), ',' order by list_item_id, user_id)
    into v_after from public.list_item_contributors where list_item_id = any(v_roll);
  if v_after is distinct from v_before then raise exception '080 fixture (3): archive changed rolled contributors: % → %', v_before, coalesce(v_after, '(none)'); end if;
  v_ok := v_ok + 1;

  v_new := public.close_cycle(v_cycle, v_roll);
  -- (4) close_cycle opened a new cycle and closed the old one.
  if v_new is null or v_new = v_cycle or (select closed_at from public.provision_cycles where id = v_cycle) is null then
    raise exception '080 fixture (4): no new cycle, or the old one is still open';
  end if;
  v_ok := v_ok + 1;
  -- (5) The rolled rows are pending on the new cycle, rolled from themselves, quantity and added_by kept.
  if (select count(*) from public.list_items
       where id = any(v_roll) and status = 'pending' and cycle_id = v_new and rolled_from_item_id = id and deleted_at is null) <> 3
     or (select array_agg(quantity::text || '/' || added_by::text order by id) from public.list_items where id = any(v_roll))
        is distinct from (select array_agg(q order by i) from (values (v_lm, '1/' || v_b), (v_lr, '2/' || v_a), (v_ls, '2/' || v_a)) t(i, q)) then
    raise exception '080 fixture (5): the rolled rows did not land as expected';
  end if;
  v_ok := v_ok + 1;
  -- (6) THE FIX, end to end: after archive + close, Mustard B 1; Ranch A 2; Salsa A 1 + B 1, unchanged.
  select string_agg(list_item_id || ':' || user_id || ':' || quantity_added || ':' || coalesce(deleted_at::text, '-'), ',' order by list_item_id, user_id)
    into v_after from public.list_item_contributors where list_item_id = any(v_roll);
  if v_after is distinct from v_before then raise exception '080 fixture (6): contributors changed across wrap-up: % → %', v_before, coalesce(v_after, '(none)'); end if;
  v_ok := v_ok + 1;
  -- (7) Rolling nothing still clears every contributor of the household (unchanged behaviour).
  perform public.archive_trip_items(v_hh, array[]::uuid[]);
  if exists (select 1 from public.list_item_contributors lic join public.list_items li on li.id = lic.list_item_id where li.household_id = v_hh)
     or (select count(*) from public.list_items where id = any(v_roll) and deleted_at is not null) <> 3 then
    raise exception '080 fixture (7): an empty keep list left contributors or live rows';
  end if;
  v_ok := v_ok + 1;
  -- (8) An outsider is still refused (051).
  perform set_config('request.jwt.claims', json_build_object('sub', v_tag || '-c', 'role', 'authenticated')::text, true);
  begin
    perform public.archive_trip_items(v_hh, v_roll);
    raise exception '080 fixture (8): an outsider archived the list';
  exception when sqlstate '42501' then null;
  end;
  v_ok := v_ok + 1;

  raise warning '080 fixture: % checks passed', v_ok;
end
$fixture$;

rollback to savepoint fixture;

commit;

do $log$
begin
  if (select prosrc like '%080: clear contributor badges, except on rolled items%' from pg_proc where proname = 'archive_trip_items') then
    raise warning '080 COMMITTED — archive_trip_items keeps rolled items'' contributors on %', (select system_identifier from pg_control_system());
  else
    raise warning '080 ROLLED BACK — parse check, nothing persisted on %', (select system_identifier from pg_control_system());
  end if;
end
$log$;

-- ═══ CLOSING VERIFY (read-only; run on the same database right after the commit) ══════════
-- Want: which_db as expected, copy committed, functions 1, secdef true, anon false,
-- authenticated true, service_role false, marker_051 / marker_080 true, keeps_rolled true,
-- body_md5_ok true, close_cycle_is_079 true, fixture_rows 0.
select
  (select system_identifier from pg_control_system())::text                                   as which_db,
  case when p.prosrc like '%080: clear contributor badges, except on rolled items%'
       then 'committed' else 'rolled back' end                                                 as copy,
  count(*) over ()                                                                             as functions_named_archive_trip_items,
  p.prosecdef                                                                                  as secdef,
  p.proconfig::text                                                                            as search_path,
  has_function_privilege('anon', p.oid, 'execute')                                             as anon,
  has_function_privilege('authenticated', p.oid, 'execute')                                    as authenticated,
  has_function_privilege('service_role', p.oid, 'execute')                                     as service_role,
  p.prosrc like '%archive_trip_items: not a member of household%'                              as marker_051,
  p.prosrc like '%080: clear contributor badges, except on rolled items%'                      as marker_080,
  p.prosrc like '%or list_item_id != all(p_keep_item_ids)%'                                    as keeps_rolled,
  md5(replace(p.prosrc, chr(13), '')) = '09e2a183f4e8b128d59d478e9a54bbdf'                                         as body_md5_ok,
  (select md5(replace(prosrc, chr(13), '')) from pg_proc where proname = 'close_cycle' and pronamespace = 'public'::regnamespace)
    = 'e58456b69bc0d92152fd6622663a198a'                                                     as close_cycle_is_079,
  (select count(*) from public.users where clerk_id like '080-fixture-%')
  + (select count(*) from public.households where name like '080-fixture-%')                  as fixture_rows
from pg_proc p
where p.proname = 'archive_trip_items' and p.pronamespace = 'public'::regnamespace;

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '080_archive_keeps_rolled_attribution'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '080_archive_keeps_rolled_attribution');
