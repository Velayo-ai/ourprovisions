-- 086_rollback.sql — NEVER APPLIED unless 086 must be undone.
-- SPEC_qty_followup_086.md §3: restores 085's adjust_list_item_quantity body EXACTLY (not a drop —
--   the client calls the function either way). After it, md5(replace(prosrc, E'\r', '')) reads
--   e1efdee7808c6765d76eb5b16af6cc74 (085's file, LF), and the old behaviour returns: a fresh need keeps
--   old pick labels (F1).
-- Run as postgres, dev 7642734024280108049 or prod 7606130613603586966, through the CLI.
-- Then remove the dev ledger row by hand: delete from supabase_migrations.schema_migrations
-- where name = '086_new_need_clears_labels';

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '086_rollback: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '086_rollback: run as postgres — current_user is %', current_user;
  end if;
  if to_regprocedure('public.adjust_list_item_quantity(uuid, uuid, integer, numeric)') is null then
    raise exception '086_rollback: adjust_list_item_quantity is missing — nothing to restore onto (085_rollback drops it)';
  end if;
end
$preflight$;

create or replace function public.adjust_list_item_quantity(
  p_household_id    uuid,
  p_catalog_item_id uuid,
  p_delta           integer,
  p_price_per_unit  numeric default null
)
returns json
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller uuid;
  v_id     uuid;
  v_status text;
  v_tomb   boolean;
  v_qty    integer;
  v_new    integer;
  v_cycle  uuid;
begin
  -- INVARIANT: one writer per household at a time (the lock insert_list_item, add_meal_to_list and
  --   land_ask_picks take). This function applies a change to the current value and never writes a
  --   total it didn't compute under the lock. Two concurrent changes both count, in either order.

  -- Membership FIRST (051).
  if p_household_id is null or not public.is_member_of(p_household_id) then
    raise exception 'adjust_list_item_quantity: not a member of household %', p_household_id using errcode = '42501';
  end if;
  v_caller := public.get_current_user_id();
  if v_caller is null then
    raise exception 'adjust_list_item_quantity: no user for the JWT subject' using errcode = '42501';
  end if;

  -- Q2: a non-zero change a person could make. A bigger jump is a bug, not a person.
  if p_delta is null or p_delta = 0 or abs(p_delta) > 99 then
    raise exception 'adjust_list_item_quantity: delta % out of range (non-zero, |delta| <= 99)', p_delta using errcode = '22023';
  end if;
  if p_catalog_item_id is null or not exists (
       select 1 from public.catalog_items ci
        where ci.id = p_catalog_item_id and ci.deleted_at is null
          and (ci.is_global or ci.household_id = p_household_id)) then
    raise exception 'adjust_list_item_quantity: no live catalog item % for this household', p_catalog_item_id using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_household_id::text));

  select li.id, coalesce(li.status, 'pending'), (li.deleted_at is not null), coalesce(li.quantity, 0)
    into v_id, v_status, v_tomb, v_qty
    from public.list_items li
   where li.household_id = p_household_id and li.catalog_item_id = p_catalog_item_id
     for update;

  -- ── p_delta < 0: fewer. Never creates or revives; never un-buys (Q5). ──────────────────────
  if p_delta < 0 then
    if v_id is null or v_tomb then
      return json_build_object('list_item_id', null, 'quantity', null, 'status', null, 'outcome', 'absent');
    end if;
    v_new := v_qty + p_delta;
    if v_new <= 0 then
      -- Q3: the server decides. remove_list_item's own work, in this transaction, under the lock:
      -- contributors cleared, soft-deleted, labels null.
      perform public.remove_list_item(p_household_id, p_catalog_item_id);
      return json_build_object('list_item_id', v_id, 'quantity', 0, 'status', v_status, 'outcome', 'removed');
    end if;
    update public.list_items set quantity = v_new, updated_at = now() where id = v_id;
    return json_build_object('list_item_id', v_id, 'quantity', v_new, 'status', v_status, 'outcome', 'lowered');
  end if;

  -- ── p_delta > 0: more. land_ask_picks' four row states (Q4). ──────────────────────────────
  -- The open cycle, opened as insert_list_item does, only when a row is (re)created or renewed.
  if v_id is null or v_tomb or v_status <> 'pending' then
    select c.id into v_cycle from public.provision_cycles c
     where c.household_id = p_household_id and c.closed_at is null and c.deleted_at is null
     order by c.started_at desc limit 1;
    if v_cycle is null then
      insert into public.provision_cycles (household_id, cycle_type, created_by)
      values (p_household_id, 'planned', v_caller)
      returning id into v_cycle;
    end if;
  end if;

  if v_id is null then
    -- None: a new row, as insert_list_item writes it (added_by = the caller, 051).
    insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id, price_per_unit)
    values (p_household_id, p_catalog_item_id, p_delta, 'pending', v_caller, v_cycle,
            case when p_price_per_unit > 0 then p_price_per_unit end)
    returning id into v_id;
    insert into public.list_item_contributors (list_item_id, user_id, quantity_added)
    values (v_id, v_caller, p_delta)
    on conflict (list_item_id, user_id) do update set quantity_added = excluded.quantity_added;
    return json_build_object('list_item_id', v_id, 'quantity', p_delta, 'status', 'pending', 'outcome', 'inserted');
  end if;

  if v_tomb then
    -- Removed: revive at delta. trg_list_items_resurrect fires on this UPDATE — links deleted,
    -- cycle re-homed onto the open cycle (opened above), labels nulled. added_by is kept, as the
    -- client's revive kept it.
    update public.list_items
       set quantity = p_delta, status = 'pending', checked_by = null,
           deleted_at = null, updated_at = now()
     where id = v_id;
    -- A revived row is a new need: no stale badge survives it (the 009 lesson; land_ask_picks).
    delete from public.list_item_contributors where list_item_id = v_id;
    insert into public.list_item_contributors (list_item_id, user_id, quantity_added)
    values (v_id, v_caller, p_delta);
    return json_build_object('list_item_id', v_id, 'quantity', p_delta, 'status', 'pending', 'outcome', 'revived');
  end if;

  if v_status = 'pending' then
    -- Live, pending: delta more. The meal ledger is untouched (R2); labels kept.
    update public.list_items set quantity = v_qty + p_delta, updated_at = now() where id = v_id;
    insert into public.list_item_contributors (list_item_id, user_id, quantity_added)
    values (v_id, v_caller, p_delta)
    on conflict (list_item_id, user_id) do update
      set quantity_added = coalesce(public.list_item_contributors.quantity_added, 0) + excluded.quantity_added;
    return json_build_object('list_item_id', v_id, 'quantity', v_qty + p_delta, 'status', 'pending', 'outcome', 'bumped');
  end if;

  -- Live, not pending (bought; skipped / deferred alike): the NEW NEED (R1, 048/049), never
  -- old + new. land_ask_picks' branch without the label: labels are left as they are.
  update public.list_items
     set quantity = p_delta, status = 'pending', checked_by = null, cycle_id = v_cycle, updated_at = now()
   where id = v_id;
  update public.list_item_meals set quantity_contributed = 0 where list_item_id = v_id;
  insert into public.list_item_contributors (list_item_id, user_id, quantity_added)
  values (v_id, v_caller, p_delta)
  on conflict (list_item_id, user_id) do update set quantity_added = excluded.quantity_added;
  return json_build_object('list_item_id', v_id, 'quantity', p_delta, 'status', 'pending', 'outcome', 'renewed');
end;
$function$;

revoke all on function public.adjust_list_item_quantity(uuid, uuid, integer, numeric) from public, anon, service_role;
grant execute on function public.adjust_list_item_quantity(uuid, uuid, integer, numeric) to authenticated;

notify pgrst, 'reload schema';

do $verify$
declare
  v_md5 text;
  v_acl text;
begin
  select md5(replace(p.prosrc, E'\r', '')),
         (select coalesce(string_agg(case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end || '=' || a.privilege_type, ',' order by 1), '')
            from aclexplode(p.proacl) a where a.grantee <> p.proowner)
    into v_md5, v_acl
    from pg_proc p where p.oid = to_regprocedure('public.adjust_list_item_quantity(uuid, uuid, integer, numeric)');
  if v_md5 <> 'e1efdee7808c6765d76eb5b16af6cc74' then raise exception '086_rollback VERIFY: body % is not 085''s', v_md5; end if;
  if v_acl <> 'authenticated=EXECUTE' then raise exception '086_rollback VERIFY: ACL %', v_acl; end if;
  raise warning '086_rollback VERIFY: 085''s body restored (%), ACL %', v_md5, v_acl;
end
$verify$;

commit;
