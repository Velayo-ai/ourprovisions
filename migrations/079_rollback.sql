-- 079_rollback.sql — restores close_cycle to 052's body verbatim (the contributor wipe returns).
-- Only if 079 must be undone. Then read back: md5(prosrc) = 'af59f15d027e8e5a767c97140141d603'.

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

commit;

select md5(prosrc) = 'af59f15d027e8e5a767c97140141d603' as body_is_052,
       prosecdef as secdef,
       has_function_privilege('anon', oid, 'execute') as anon,
       has_function_privilege('authenticated', oid, 'execute') as authenticated,
       has_function_privilege('service_role', oid, 'execute') as service_role
from pg_proc where proname = 'close_cycle' and pronamespace = 'public'::regnamespace;
