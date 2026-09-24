-- 052_ready_at_requires_lock_in.sql
-- SPEC_meal_planning_v1_board_planned.md — readiness requires having been locked in.
--
-- WHAT
--   close_cycle only. The 050 ready_at condition was "open placement whose meal
--   has no pending row on any link — or no links at all". The second clause is
--   now wrong: with the Planned state, a card can sit on the board without ever
--   touching the list (Plan without Lock in — freezer pizza), and a wrap-up it
--   took no part in must not promote it to Ready. New condition:
--     open placement
--     AND ≥ 1 list_item_meals link whose list row belongs to the CLOSING cycle
--     AND none of those rows is pending
--   Rows archived by archive_trip_items keep their cycle_id, so "the closing
--   cycle's rows" is exactly what this trip asked for: bought rows (status
--   bought, archived) satisfy it, a cleared row (archived, still pending)
--   blocks, a rolling row (live pending, still on this cycle at close time)
--   blocks, and a never-locked card has no row here at all and stays Planned.
--
-- UNCHANGED: signature (037), SECURITY DEFINER, search_path (034), the 051
-- membership check as the first statement, and the ACL (authenticated only —
-- re-stated so the read-back proves it). Body verbatim from 051 otherwise.
--
-- APPLY: dev first, by hand; prod with 048–050 as one promotion, after 051.

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
  v_existing_id   uuid;
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
    -- Find existing list_items row for this catalog item if any
    select id into v_existing_id
    from list_items
    where household_id = v_household_id
      and catalog_item_id = v_item.catalog_item_id
    limit 1;

    -- Clear contributor badges BEFORE upsert so realtime doesn't race
    if v_existing_id is not null then
      delete from list_item_contributors
      where list_item_id = v_existing_id;
    end if;

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

-- VERIFY — one row: count 1, secdef true, anon false, authenticated true,
-- service_role false, marker_052 true, marker_051 true.
select
  count(*) over ()                                                   as functions_named_close_cycle,
  prosecdef                                                          as secdef,
  proconfig::text                                                    as search_path,
  proacl::text                                                       as acl,
  has_function_privilege('anon', oid, 'execute')                     as anon_can_execute,
  has_function_privilege('authenticated', oid, 'execute')            as authenticated_can_execute,
  has_function_privilege('service_role', oid, 'execute')             as service_role_can_execute,
  pg_get_functiondef(oid) like '%052: readiness is earned at Wrap up, and only by a card that was locked%' as marker_052,
  pg_get_functiondef(oid) like '%close_cycle: not a member of household%'                                as marker_051
from pg_proc
where proname = 'close_cycle' and pronamespace = 'public'::regnamespace;
