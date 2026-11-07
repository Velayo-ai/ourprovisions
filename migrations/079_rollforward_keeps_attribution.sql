-- 079_rollforward_keeps_attribution.sql
-- SPEC_rollforward_keeps_attribution.md (found 2026-11-07, Dan, after a Wrap up on the live list):
-- a rolled item is the same need carried forward, not a new add, so its "Added by" comes with it.
--
-- THE BUG: close_cycle looked up the household's list_items row for each rolled item's catalog item,
--   deleted every list_item_contributors row for it ("clear contributor badges"), then upserted the
--   row back to pending on the new cycle. list_items is unique on (household_id, catalog_item_id), so
--   the row it found was always the row being rolled: the roll wiped that item's own ledger. The
--   client builds "Added by …" only from the ledger (added_by is a stale scalar), so rolled items
--   lost the line, and quantity_added fell out of step with the quantity the roll kept.
--
-- STEP 0 (read-only, 2026-11-07):
--   dev  (zxwtxjjmssykhqrghouf, 7642734024280108049): close_cycle(uuid, uuid[]) prosrc md5
--        af59f15d027e8e5a767c97140141d603 = migration 052's body byte for byte (3614 chars, LF);
--        SECURITY DEFINER, owner postgres, search_path=public, extensions, EXECUTE authenticated only.
--        No migration after 052 redefines it. Ledger top: 20261107025434 078_create_ask.
--   prod (parpauldmbetptkmdwbd, 7606130613603586966): the same body with CRLF line endings (md5 with
--        CRs stripped = af59f15d…); same definer, search_path and grants.
--
-- WHAT — close_cycle recreated from the live (052) body with exactly two removals:
--   * the v_existing_id declare and its "select id into v_existing_id …" lookup;
--   * the "if v_existing_id is not null then delete from list_item_contributors … end if;" block,
--     replaced by the marker comment "-- 079: roll-forward keeps the contributor ledger".
--   Everything else is byte-identical: signature, SECURITY DEFINER, search_path (034), the 051
--   membership check, the 052 ready_at stamp, the upsert. The revoke/grant block is re-stated so the
--   read-back proves it. New body md5 e58456b69bc0d92152fd6622663a198a.
--
-- NOT IN 079: backfill B (restore one contributor from added_by on rolled rows that lost theirs) is
--   Dan's decision, run separately after a count. No client change. list_item_meals, picked_by_labels,
--   quantity, price and added_by already survived a roll and still do.
--
-- FIXTURE: runs as the owner inside `savepoint fixture` … `rollback to savepoint fixture`. Three
--   throw-away users (A and B members, C an outsider), one household, three custom items: Mustard
--   added by B, Ranch by A (qty 2), Salsa by both. A closes the cycle rolling all three; every
--   contributor row must survive unchanged. Impersonates through request.jwt.claims (is_local = true).
--   Nothing survives.
-- APPLY: dev first. PARSE CHECK = this file with `commit;` → `rollback;`, nothing else changed. Both
--   copies log (warnings): "079 VERIFY: 9 checked, 0 mismatches", "079 fixture: 7 checks passed", then
--   "079 COMMITTED — …" or "079 ROLLED BACK — parse check …". Then the closing VERIFY on the same
--   database and the ledger row (dev only; prod has no ledger, applied = object read-back).
--   Prod after Dan confirms the dev walk: this file, the closing VERIFY, then the live walk.
-- ROLLBACK: 079_rollback.sql restores 052's body verbatim.
--
-- DRAFTED 2026-11-07 by Claude Code.

begin;

create or replace function public.close_cycle(p_cycle_id uuid, p_roll_item_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_household_id  uuid;
  v_new_cycle_id  uuid;
  v_item          record;
  v_created_by    uuid;
begin
  select household_id, created_by into v_household_id, v_created_by
  from provision_cycles
  where id = p_cycle_id;

  if not found then
    raise exception 'Cycle % not found', p_cycle_id;
  end if;

  if not is_member_of(v_household_id) then
    raise exception 'close_cycle: not a member of household %', v_household_id using errcode = '42501';
  end if;

  update provision_cycles
  set
    closed_at      = now(),
    item_count     = (select count(*) from list_items
                      where household_id = v_household_id and deleted_at is null),
    sessions_count = (select count(*) from shopping_sessions
                      where cycle_id = p_cycle_id and deleted_at is null),
    updated_at     = now()
  where id = p_cycle_id;

  -- 052: readiness is earned at Wrap up, and only by a card that was locked
  -- in. An OPEN placement is stamped ready_at once when the meal has at least
  -- one link into THIS cycle's rows and none of those rows is still pending.
  -- A never-locked (Planned) card has no row on this cycle and is left alone.
  update meal_placements mp
     set ready_at   = now(),
         updated_at = now()
   where mp.household_id = v_household_id
     and mp.cooked_at  is null
     and mp.skipped_at is null
     and mp.ready_at   is null
     and exists (
       select 1
         from list_item_meals lim
         join list_items li on li.id = lim.list_item_id
        where lim.meal_id = mp.meal_id
          and li.household_id = v_household_id
          and li.cycle_id = p_cycle_id
     )
     and not exists (
       select 1
         from list_item_meals lim
         join list_items li on li.id = lim.list_item_id
        where lim.meal_id = mp.meal_id
          and li.household_id = v_household_id
          and li.cycle_id = p_cycle_id
          and li.status = 'pending'
     );

  if array_length(p_roll_item_ids, 1) is null
     or array_length(p_roll_item_ids, 1) = 0 then
    return null;
  end if;

  insert into provision_cycles (household_id, cycle_type, seeded_from, created_by)
  values (v_household_id, 'planned', p_cycle_id, v_created_by)
  returning id into v_new_cycle_id;

  for v_item in
    select * from list_items
    where id = any(p_roll_item_ids)
  loop
    -- 079: roll-forward keeps the contributor ledger

    -- Now upsert the item fresh
    insert into list_items (
      household_id, catalog_item_id, quantity, price_per_unit,
      status, added_by, cycle_id, rolled_from_item_id, deleted_at
    ) values (
      v_household_id, v_item.catalog_item_id, v_item.quantity,
      v_item.price_per_unit, 'pending', v_item.added_by,
      v_new_cycle_id, v_item.id, null
    )
    on conflict (household_id, catalog_item_id)
    do update set
      status              = 'pending',
      quantity            = excluded.quantity,
      cycle_id            = excluded.cycle_id,
      rolled_from_item_id = excluded.rolled_from_item_id,
      added_by            = excluded.added_by,
      checked_by          = null,
      deleted_at          = null,
      updated_at          = now();

  end loop;

  return v_new_cycle_id;
end;
$function$;

revoke all on function public.close_cycle(uuid, uuid[]) from public;
revoke all on function public.close_cycle(uuid, uuid[]) from anon;
revoke all on function public.close_cycle(uuid, uuid[]) from service_role;
grant execute on function public.close_cycle(uuid, uuid[]) to authenticated;

-- VERIFY — inside the transaction; any mismatch raises and rolls everything back.
do $verify$
declare
  v_bad     text[] := array[]::text[];
  v_checked integer := 0;
  v_oid     oid;
  v_src     text;
begin
  select p.oid, p.prosrc into v_oid, v_src from pg_proc p
   where p.proname = 'close_cycle' and p.pronamespace = 'public'::regnamespace;
  v_checked := v_checked + 1;
  if (select count(*) from pg_proc where proname = 'close_cycle') <> 1 then v_bad := v_bad || 'not exactly one close_cycle'; end if;
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
  if v_src not like '%close_cycle: not a member of household%' then v_bad := v_bad || 'marker 051 missing'; end if;
  v_checked := v_checked + 1;
  if v_src not like '%052: readiness is earned at Wrap up, and only by a card that was locked%' then v_bad := v_bad || 'marker 052 missing'; end if;
  v_checked := v_checked + 1;
  if v_src not like '%079: roll-forward keeps the contributor ledger%' or v_src like '%delete from list_item_contributors%'
     or v_src like '%v_existing_id%' then v_bad := v_bad || 'the contributor wipe is still there (or the 079 marker is missing)'; end if;
  v_checked := v_checked + 1;
  if md5(v_src) <> 'e58456b69bc0d92152fd6622663a198a' then v_bad := v_bad || ('body md5 ' || md5(v_src) || ' is not the file''s'); end if;
  raise warning '079 VERIFY: % checked, % mismatches%', v_checked, cardinality(v_bad),
    case when cardinality(v_bad) > 0 then ' — ' || array_to_string(v_bad, '; ') else '' end;
  if cardinality(v_bad) > 0 then
    raise exception '079 VERIFY failed: %', array_to_string(v_bad, '; ');
  end if;
end
$verify$;

-- FIXTURE — definer-run, inside a savepoint, rolled back. Nothing here survives.
savepoint fixture;

do $fixture$
declare
  v_tag    text := '079-fixture-' || gen_random_uuid()::text;
  v_a      uuid; v_b uuid; v_c uuid;       -- A and B members, C an outsider
  v_hh     uuid; v_hh2 uuid;
  v_cycle  uuid; v_new uuid;
  v_cm     uuid; v_cr uuid; v_cs uuid;     -- catalog items Mustard, Ranch, Salsa
  v_lm     uuid; v_lr uuid; v_ls uuid;     -- their list rows
  v_before text; v_after text;
  v_ok     integer := 0;
begin
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-a', v_tag || '-a@fixture.invalid', '079 Alpha') returning id into v_a;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-b', v_tag || '-b@fixture.invalid', '079 Bravo') returning id into v_b;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-c', v_tag || '-c@fixture.invalid', '079 Charlie') returning id into v_c;
  insert into public.households (name, created_by) values (v_tag, v_a) returning id into v_hh;
  insert into public.households (name, created_by) values (v_tag || '-other', v_c) returning id into v_hh2;
  insert into public.household_members (household_id, user_id) values (v_hh, v_a), (v_hh, v_b), (v_hh2, v_c);
  insert into public.catalog_items (name, category, is_global, household_id, created_by) values (v_tag || '-mustard', 'Pantry', false, v_hh, v_b) returning id into v_cm;
  insert into public.catalog_items (name, category, is_global, household_id, created_by) values (v_tag || '-ranch', 'Pantry', false, v_hh, v_a) returning id into v_cr;
  insert into public.catalog_items (name, category, is_global, household_id, created_by) values (v_tag || '-salsa', 'Pantry', false, v_hh, v_a) returning id into v_cs;
  insert into public.provision_cycles (household_id, created_by) values (v_hh, v_a) returning id into v_cycle;
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id) values (v_hh, v_cm, 1, 'pending', v_b, v_cycle) returning id into v_lm;
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id) values (v_hh, v_cr, 2, 'pending', v_a, v_cycle) returning id into v_lr;
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id) values (v_hh, v_cs, 2, 'pending', v_a, v_cycle) returning id into v_ls;
  insert into public.list_item_contributors (list_item_id, user_id, quantity_added) values (v_lm, v_b, 1), (v_lr, v_a, 2), (v_ls, v_a, 1), (v_ls, v_b, 1);
  select string_agg(list_item_id || ':' || user_id || ':' || quantity_added || ':' || coalesce(deleted_at::text, '-'), ',' order by list_item_id, user_id)
    into v_before from public.list_item_contributors where list_item_id in (v_lm, v_lr, v_ls);

  perform set_config('request.jwt.claims', json_build_object('sub', v_tag || '-a', 'role', 'authenticated')::text, true);
  if public.get_current_user_id() is distinct from v_a then raise exception '079 fixture: impersonation failed'; end if;

  -- (1) A wraps up, rolling all three. Its own statement; the checks are separate statements (a
  -- statement's subqueries don't see what a function called in the same statement wrote).
  v_new := public.close_cycle(v_cycle, array[v_lm, v_lr, v_ls]);
  if v_new is null or v_new = v_cycle then raise exception '079 fixture (1): no new cycle returned'; end if;
  v_ok := v_ok + 1;
  -- (2) The old cycle is closed.
  if (select closed_at from public.provision_cycles where id = v_cycle) is null then raise exception '079 fixture (2): the cycle is not closed'; end if;
  v_ok := v_ok + 1;
  -- (3) The same three rows (the upsert lands on themselves), pending on the new cycle, rolled from themselves.
  if (select count(*) from public.list_items
       where id in (v_lm, v_lr, v_ls) and status = 'pending' and cycle_id = v_new and rolled_from_item_id = id and deleted_at is null) <> 3 then
    raise exception '079 fixture (3): the rolled rows are not pending on the new cycle';
  end if;
  v_ok := v_ok + 1;
  -- (4) THE FIX: every contributor row survives, unchanged (Mustard B 1; Ranch A 2; Salsa A 1 + B 1).
  select string_agg(list_item_id || ':' || user_id || ':' || quantity_added || ':' || coalesce(deleted_at::text, '-'), ',' order by list_item_id, user_id)
    into v_after from public.list_item_contributors where list_item_id in (v_lm, v_lr, v_ls);
  if v_after is distinct from v_before then raise exception '079 fixture (4): contributors changed: % → %', v_before, coalesce(v_after, '(none)'); end if;
  v_ok := v_ok + 1;
  -- (5) Quantities and added_by carried as before.
  if (select array_agg(quantity::text || '/' || added_by::text order by id) from public.list_items where id in (v_lm, v_lr, v_ls))
     is distinct from (select array_agg(q order by i) from (values (v_lm, '1/' || v_b), (v_lr, '2/' || v_a), (v_ls, '2/' || v_a)) t(i, q)) then
    raise exception '079 fixture (5): quantity or added_by changed';
  end if;
  v_ok := v_ok + 1;
  -- (6) An empty roll still closes and returns null (unchanged behaviour): close the cycle the roll
  -- opened (one open cycle per household, uq_open_cycle_per_household), then read it back.
  if public.close_cycle(v_new, array[]::uuid[]) is not null then raise exception '079 fixture (6): an empty roll returned a cycle'; end if;
  if (select closed_at from public.provision_cycles where id = v_new) is null then raise exception '079 fixture (6): the empty roll did not close the cycle'; end if;
  v_ok := v_ok + 1;
  -- (7) An outsider is still refused (051).
  perform set_config('request.jwt.claims', json_build_object('sub', v_tag || '-c', 'role', 'authenticated')::text, true);
  begin
    perform public.close_cycle(v_new, array[v_lm]);
    raise exception '079 fixture (7): an outsider closed the cycle';
  exception when sqlstate '42501' then null;
  end;
  v_ok := v_ok + 1;

  raise warning '079 fixture: % checks passed', v_ok;
end
$fixture$;

rollback to savepoint fixture;

commit;

do $log$
begin
  if (select prosrc like '%079: roll-forward keeps the contributor ledger%' from pg_proc where proname = 'close_cycle') then
    raise warning '079 COMMITTED — close_cycle keeps the contributor ledger on %', (select system_identifier from pg_control_system());
  else
    raise warning '079 ROLLED BACK — parse check, nothing persisted on %', (select system_identifier from pg_control_system());
  end if;
end
$log$;

-- ═══ CLOSING VERIFY (read-only; run on the same database right after the commit) ══════════
-- Want: which_db as expected, copy committed, functions 1, secdef true, anon false,
-- authenticated true, service_role false, marker_051 / marker_052 / marker_079 true,
-- no_contributor_delete true, body_md5_ok true, fixture_rows 0.
select
  (select system_identifier from pg_control_system())::text                                   as which_db,
  case when p.prosrc like '%079: roll-forward keeps the contributor ledger%'
       then 'committed' else 'rolled back' end                                                 as copy,
  count(*) over ()                                                                             as functions_named_close_cycle,
  p.prosecdef                                                                                  as secdef,
  p.proconfig::text                                                                            as search_path,
  has_function_privilege('anon', p.oid, 'execute')                                             as anon,
  has_function_privilege('authenticated', p.oid, 'execute')                                    as authenticated,
  has_function_privilege('service_role', p.oid, 'execute')                                     as service_role,
  p.prosrc like '%close_cycle: not a member of household%'                                     as marker_051,
  p.prosrc like '%052: readiness is earned at Wrap up, and only by a card that was locked%'    as marker_052,
  p.prosrc like '%079: roll-forward keeps the contributor ledger%'                             as marker_079,
  p.prosrc not like '%delete from list_item_contributors%'                                     as no_contributor_delete,
  md5(p.prosrc) = 'e58456b69bc0d92152fd6622663a198a'                                         as body_md5_ok,
  (select count(*) from public.users where clerk_id like '079-fixture-%')
  + (select count(*) from public.households where name like '079-fixture-%')                  as fixture_rows
from pg_proc p
where p.proname = 'close_cycle' and p.pronamespace = 'public'::regnamespace;

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '079_rollforward_keeps_attribution'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '079_rollforward_keeps_attribution');
