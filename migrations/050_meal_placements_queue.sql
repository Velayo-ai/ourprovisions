-- 050_meal_placements_queue.sql
-- SPEC_meal_planning_v1_board_queue.md — the board is a queue of open placements.
--
-- WHAT
--   1. Three nullable timestamps on meal_placements:
--        ready_at    set at Wrap up for an open placement whose meal has no
--                    pending list row left — readiness is EARNED at Wrap up,
--                    never at an in-cart tap (cart is a store action, not a
--                    kitchen fact).
--        cooked_at   "Cooked it" on a Ready card. Closes the placement.
--        skipped_at  X on any card. Closes the placement.
--      A placement is OPEN iff cooked_at IS NULL AND skipped_at IS NULL, and
--      the board is exactly the household's open placements in sort_order.
--      Position 0 is up next. Cooked vs skipped is recorded because it is the
--      outcome half of the consumption signal (intention → receipt → outcome).
--      No policy change: SELECT/INSERT/UPDATE to authenticated as 047; still no
--      DELETE — rows close, they don't die. planned_for and slot remain
--      RESERVED AND ABSENT.
--   2. ready_at stamping lives in the cycle-close RPC (close_cycle, the 038
--      family) rather than the client, so a wrap-up from either device stamps
--      it once, in the same transaction that closes the cycle. The client
--      sequence is archive_trip_items → close_cycle; by the time close_cycle
--      runs, this cycle's bought rows are archived (status bought,
--      deleted_at set), cleared rows are archived still 'pending', and rows
--      about to roll are live 'pending'. So "the meal has no pending row" —
--      status = 'pending' on ANY row it links to, deleted or not — is exactly
--      "everything it asked for was bought, or it asked for nothing". A meal
--      whose item was cleared at wrap-up is NOT ready (its link still points
--      at a pending tombstone); a meal whose item is rolling is NOT ready.
--      Known edge: a link to a pending tombstone for an ingredient the recipe
--      no longer has keeps that meal not-ready until the meal is re-added
--      (026 clears links on resurrect). Accepted; it errs on the honest side.
--
-- close_cycle is CREATE OR REPLACE'd with the SAME signature (037), SECURITY
-- DEFINER and search_path (034) carried over, body verbatim from the live dev
-- definition except for the one 050 block, ACL re-stated EXACTLY as found —
-- which includes PUBLIC and anon EXECUTE. That grant predates this migration
-- and is flagged in the build report, not changed here (the spec says no
-- policy change; widening or narrowing an RPC's audience is its own change).
--
-- APPLY: dev first, by hand. The closing SELECT reports the three columns,
-- the policy set (3, no DELETE), and one close_cycle with the 050 marker.

alter table public.meal_placements
  add column ready_at   timestamptz null,
  add column cooked_at  timestamptz null,
  add column skipped_at timestamptz null;

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

  update provision_cycles
  set
    closed_at      = now(),
    item_count     = (select count(*) from list_items
                      where household_id = v_household_id and deleted_at is null),
    sessions_count = (select count(*) from shopping_sessions
                      where cycle_id = p_cycle_id and deleted_at is null),
    updated_at     = now()
  where id = p_cycle_id;

  -- 050: readiness is earned at Wrap up. Every OPEN placement of this
  -- household whose meal has no pending row left (bought rows are archived
  -- by now with status 'bought'; a cleared row is archived still 'pending'
  -- and blocks; a rolling row is live 'pending' and blocks) is stamped
  -- ready_at once. Already-ready placements are left alone.
  update meal_placements mp
     set ready_at   = now(),
         updated_at = now()
   where mp.household_id = v_household_id
     and mp.cooked_at  is null
     and mp.skipped_at is null
     and mp.ready_at   is null
     and not exists (
       select 1
         from list_item_meals lim
         join list_items li on li.id = lim.list_item_id
        where lim.meal_id = mp.meal_id
          and li.household_id = v_household_id
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

-- ACL re-stated EXACTLY as found on dev before 050 (see header): PUBLIC, anon,
-- authenticated, service_role all hold EXECUTE. Not narrowed here.
grant execute on function public.close_cycle(uuid, uuid[]) to public;
grant execute on function public.close_cycle(uuid, uuid[]) to anon;
grant execute on function public.close_cycle(uuid, uuid[]) to authenticated;
grant execute on function public.close_cycle(uuid, uuid[]) to service_role;

-- =====================================================================
-- VERIFY — row-returning. Expect one row: cols = ready_at:YES,cooked_at:YES,
-- skipped_at:YES; policies = insert:a,select:r,update:w (no d); reserved
-- absent; close_cycle_count = 1, close_cycle_marker = true.
-- =====================================================================
select
  (select string_agg(column_name || ':' || is_nullable, ',' order by column_name)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_placements'
      and column_name in ('ready_at', 'cooked_at', 'skipped_at'))                        as cols,
  (select string_agg(polname || ':' || polcmd::text, ',' order by polname)
     from pg_policy where polrelid = 'public.meal_placements'::regclass)                  as policies,
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'meal_placements'
                 and column_name in ('planned_for', 'slot'))                              as reserved_cols_absent,
  (select count(*) from pg_proc
    where proname = 'close_cycle' and pronamespace = 'public'::regnamespace)              as close_cycle_count,
  (select pg_get_functiondef(oid) like '%050: readiness is earned at Wrap up%'
     from pg_proc where proname = 'close_cycle' and pronamespace = 'public'::regnamespace) as close_cycle_marker,
  (select proacl::text from pg_proc
    where proname = 'close_cycle' and pronamespace = 'public'::regnamespace)              as close_cycle_acl;
