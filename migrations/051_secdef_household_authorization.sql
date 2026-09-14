-- 051_secdef_household_authorization.sql
-- SPEC_close_cycle_authorization.md (scope widened 2026-09-14 to the audit table).
--
-- THE FINDING
--   Fifteen SECURITY DEFINER functions in public take a household id (or a
--   cycle id that resolves to one) and were executable by PUBLIC and anon.
--   Eleven of them never identified the caller at all: an unauthenticated
--   request could write any household's list (insert_list_item), mint or
--   hard-delete its catalog rows (insert_/delete_custom_catalog_item), read
--   its members' names and emails (get_household_member_profiles), read its
--   list, cycle and store locations, close its cycle and archive its trip
--   (close_cycle / archive_trip_items), or create a household owned by any
--   Clerk id (create_household). The other four (remove_list_item,
--   remove_member, leave_household, delete_household) check the caller in
--   the body but still carried the anon grant. SECURITY DEFINER bypasses RLS,
--   so the only guard that counts is the one in the body. Prod matched dev
--   on every row (probed read-only, system_identifier 7606130613603586966).
--
-- THE FIX — one rule, applied fifteen times
--   * CREATE OR REPLACE with the SAME signature (037), SECURITY DEFINER and
--     pinned search_path (034) carried over, body otherwise verbatim.
--   * The FIRST statement is the membership check:
--       IF NOT is_member_of(p_household_id) THEN
--         RAISE EXCEPTION ... USING ERRCODE = '42501';
--     close_cycle resolves the household from provision_cycles first; a
--     missing cycle raises before the check. create_household has no
--     household yet, so its first statement resolves the caller instead.
--   * The 036 pattern for caller-typed arguments: create_household ignores
--     p_clerk_id and insert_list_item ignores p_added_by — both derive the
--     caller from get_current_user_id(). insert_custom_catalog_item's
--     p_created_by is the same class of argument and gets the same treatment.
--     The arguments stay in the signatures (037); they are simply not trusted.
--   * The five SQL-language readers become plpgsql so they can RAISE. Same
--     return types (a return-type change would need DROP; none is needed —
--     get_household_member_profiles keeps clerk_id and email because the
--     client uses both: the creator check compares clerk ids and the display
--     name falls back to the email local part).
--   * ACL: REVOKE ALL FROM PUBLIC, anon AND service_role, then GRANT EXECUTE
--     TO authenticated only. No server path calls any of these (the one edge
--     function calls no RPC); granting service_role back is one line when
--     one arrives.
--
-- BEHAVIOUR CHANGES A MEMBER CAN SEE (all deliberate)
--   * leave_household by a non-member used to return {"left": false}; it now
--     raises 42501. The client only calls it for the caller's own household.
--   * Nothing else: a member's calls take exactly the path they took before.
--
-- THE BASELINE
--   000_canonical_baseline.sql declared eleven of these bodies unguarded
--   (the four JWT-checking ones arrived in later migrations). The 004/005/007
--   "authorize" sweep was about RLS policies, not function bodies, so the
--   baseline did not undo it — these bodies were never guarded anywhere. The
--   baseline is patched in the same commit with these exact definitions so a
--   clean rebuild cannot recreate the exposure. is_member_of arrives at 003;
--   the guarded bodies are plpgsql (late-bound), so the baseline still
--   creates them cleanly before 003 runs.
--
-- APPLY: dev first, by hand. The closing SELECT is the proof: fifteen rows,
-- one per function, anon_can_execute false, authenticated true,
-- service_role false, and first_statement showing the check.

-- ─────────────────────────────────────────────────────────────────────
-- 1. archive_trip_items
-- ─────────────────────────────────────────────────────────────────────
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

  -- Clear ALL contributor badges for this household's items
  -- Rolled-forward items get fresh attribution next cycle
  delete from list_item_contributors
  where list_item_id in (
    select id from list_items
    where household_id = p_household_id
  );

end;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. close_cycle (body is 050's; the household is resolved and checked first)
-- ─────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────
-- 3. delete_custom_catalog_item
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.delete_custom_catalog_item(p_household_id uuid, p_catalog_item_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_is_global boolean;
  v_household uuid;
BEGIN
  IF NOT is_member_of(p_household_id) THEN
    RAISE EXCEPTION 'delete_custom_catalog_item: not a member of household %', p_household_id USING ERRCODE = '42501';
  END IF;

  SELECT is_global, household_id
    INTO v_is_global, v_household
    FROM catalog_items
    WHERE id = p_catalog_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catalog item % not found', p_catalog_item_id;
  END IF;

  IF v_is_global THEN
    RAISE EXCEPTION 'Cannot delete a global catalog item';
  END IF;

  IF v_household IS DISTINCT FROM p_household_id THEN
    RAISE EXCEPTION 'Catalog item % does not belong to household %', p_catalog_item_id, p_household_id;
  END IF;

  DELETE FROM list_item_contributors
    WHERE list_item_id IN (
      SELECT id FROM list_items
      WHERE catalog_item_id = p_catalog_item_id
        AND household_id = p_household_id
    );

  DELETE FROM list_items
    WHERE catalog_item_id = p_catalog_item_id
      AND household_id = p_household_id;

  DELETE FROM user_hidden_items
    WHERE catalog_item_id = p_catalog_item_id;

  DELETE FROM waste_events
    WHERE catalog_item_id = p_catalog_item_id
      AND household_id = p_household_id;

  DELETE FROM catalog_items
    WHERE id = p_catalog_item_id
      AND is_global = false
      AND household_id = p_household_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. get_active_cycle (SQL → plpgsql so it can RAISE; same return type)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.get_active_cycle(p_household_id uuid)
returns provision_cycles
language plpgsql
stable security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_row provision_cycles%rowtype;
begin
  if not is_member_of(p_household_id) then
    raise exception 'get_active_cycle: not a member of household %', p_household_id using errcode = '42501';
  end if;

  select * into v_row from provision_cycles
  where household_id = p_household_id
    and closed_at is null
  order by started_at desc
  limit 1;
  return v_row;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. get_household_member_profiles (SQL → plpgsql; clerk_id and email KEPT —
--    the client's creator check compares clerk ids and the display name
--    falls back to the email local part)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.get_household_member_profiles(p_household_id uuid)
returns table(user_id uuid, clerk_id text, full_name text, email text)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
#variable_conflict use_column
begin
  if not is_member_of(p_household_id) then
    raise exception 'get_household_member_profiles: not a member of household %', p_household_id using errcode = '42501';
  end if;

  return query
  select
    u.id as user_id,
    u.clerk_id,
    u.full_name,
    u.email
  from household_members hm
  join users u on u.id = hm.user_id
  where hm.household_id = p_household_id
  and hm.deleted_at is null;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. get_household_user_ids (SQL → plpgsql)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.get_household_user_ids(p_household_id uuid)
returns setof uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if not is_member_of(p_household_id) then
    raise exception 'get_household_user_ids: not a member of household %', p_household_id using errcode = '42501';
  end if;

  return query
  select hm.user_id from household_members hm
  where hm.household_id = p_household_id
  and hm.deleted_at is null;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 7. get_list_items_for_household (SQL → plpgsql) — THE MAIN LIST READ
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.get_list_items_for_household(p_household_id uuid)
returns table(id uuid, catalog_item_id uuid, quantity integer, price_per_unit numeric, status text, added_by uuid, name text, category text, is_staple boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
begin
  if not is_member_of(p_household_id) then
    raise exception 'get_list_items_for_household: not a member of household %', p_household_id using errcode = '42501';
  end if;

  return query
  select
    li.id, li.catalog_item_id, li.quantity, li.price_per_unit,
    li.status, li.added_by,
    ci.name, ci.category,
    exists (
      select 1 from household_staples hs
      where hs.household_id = p_household_id
        and hs.catalog_item_id = ci.id
    ) as is_staple
  from list_items li
  join catalog_items ci on ci.id = li.catalog_item_id
  where li.household_id = p_household_id
    and li.deleted_at is null
    and li.status in ('pending','bought')
    and ci.deleted_at is null;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 8. insert_custom_catalog_item — p_created_by no longer trusted (036 pattern)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.insert_custom_catalog_item(p_name text, p_category text, p_household_id uuid, p_created_by uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
DECLARE
  existing_id uuid;
  norm        text;
  v_caller    uuid;
BEGIN
  IF NOT is_member_of(p_household_id) THEN
    RAISE EXCEPTION 'insert_custom_catalog_item: not a member of household %', p_household_id USING ERRCODE = '42501';
  END IF;
  -- 051: the creator is the caller. p_created_by stays in the signature (037)
  -- and is ignored.
  v_caller := get_current_user_id();

  norm := lower(trim(regexp_replace(p_name, '\s+', ' ', 'g')));

  -- Reuse a live row whose NORMALIZED name matches, in scope
  -- (a global item, OR a custom item owned by THIS household).
  -- Prefer the global row; otherwise the oldest custom row.
  SELECT id INTO existing_id
  FROM catalog_items
  WHERE lower(trim(regexp_replace(name, '\s+', ' ', 'g'))) = norm
    AND deleted_at IS NULL
    AND (is_global = true OR household_id = p_household_id)
  ORDER BY is_global DESC, created_at ASC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  -- No match: mint a new custom row, storing the ORIGINAL casing.
  INSERT INTO catalog_items (name, category, is_global, household_id, created_by)
  VALUES (p_name, p_category, false, p_household_id, v_caller)
  RETURNING id INTO existing_id;

  RETURN existing_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 9. insert_list_item — p_added_by no longer trusted (036 pattern)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.insert_list_item(p_household_id uuid, p_catalog_item_id uuid, p_quantity integer, p_status text, p_added_by uuid, p_cycle_id uuid default null::uuid, p_price_per_unit numeric default null::numeric)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
DECLARE
  v_cycle_id uuid;
  v_id       uuid;
  v_caller   uuid;
BEGIN
  IF NOT is_member_of(p_household_id) THEN
    RAISE EXCEPTION 'insert_list_item: not a member of household %', p_household_id USING ERRCODE = '42501';
  END IF;
  -- 051: added_by is the caller. p_added_by stays in the signature (037) and
  -- is ignored.
  v_caller := get_current_user_id();

  -- Serialize per-household so two concurrent adds can't open two cycles.
  PERFORM pg_advisory_xact_lock(hashtext(p_household_id::text));

  -- Resolve the open cycle server-side (p_cycle_id = hint only).
  IF p_cycle_id IS NOT NULL THEN
    SELECT id INTO v_cycle_id FROM provision_cycles
      WHERE id = p_cycle_id AND household_id = p_household_id
        AND closed_at IS NULL AND deleted_at IS NULL;
  END IF;
  IF v_cycle_id IS NULL THEN
    SELECT id INTO v_cycle_id FROM provision_cycles
      WHERE household_id = p_household_id
        AND closed_at IS NULL AND deleted_at IS NULL
      ORDER BY started_at DESC LIMIT 1;
  END IF;
  IF v_cycle_id IS NULL THEN
    INSERT INTO provision_cycles (household_id, cycle_type, created_by)
      VALUES (p_household_id, 'planned', v_caller)
      RETURNING id INTO v_cycle_id;
  END IF;

  INSERT INTO list_items (
    household_id, catalog_item_id, quantity, status,
    added_by, cycle_id, price_per_unit
  )
  VALUES (
    p_household_id, p_catalog_item_id, p_quantity, p_status,
    v_caller, v_cycle_id, p_price_per_unit
  )
  ON CONFLICT (household_id, catalog_item_id)
  DO UPDATE SET
    quantity       = EXCLUDED.quantity,
    status         = 'pending',
    deleted_at     = NULL,
    cycle_id       = v_cycle_id,
    price_per_unit = COALESCE(EXCLUDED.price_per_unit, list_items.price_per_unit),
    updated_at     = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 10. match_known_store (SQL → plpgsql)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.match_known_store(p_household_id uuid, p_lat double precision, p_lng double precision)
returns uuid
language plpgsql
stable security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_id uuid;
begin
  if not is_member_of(p_household_id) then
    raise exception 'match_known_store: not a member of household %', p_household_id using errcode = '42501';
  end if;

  select id into v_id
  from known_stores
  where household_id = p_household_id
    and deleted_at is null
    and lat between p_lat - 0.05 and p_lat + 0.05
    and lng between p_lng - 0.05 and p_lng + 0.05
  order by
    sqrt(
      power((lat - p_lat) * 111320, 2) +
      power((lng - p_lng) * 111320 * cos(radians(p_lat)), 2)
    ) asc
  limit 1;
  return v_id;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 11. create_household — p_clerk_id no longer trusted (036 pattern)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.create_household(p_name text, p_clerk_id text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid;
  v_household_id uuid;
  v_name text;
begin
  -- 051: the creator is the caller, from the JWT. p_clerk_id stays in the
  -- signature (037) and is ignored. No household exists yet, so this is the
  -- authorization statement for this function.
  v_user_id := get_current_user_id();
  if v_user_id is null then
    raise exception 'create_household: caller not resolved' using errcode = '42501';
  end if;

  -- Default + sanitize name
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then
    v_name := 'My Household';
  end if;

  -- Create the household, creator recorded
  insert into households (name, created_by)
  values (v_name, v_user_id)
  returning id into v_household_id;

  -- Add creator as owner
  insert into household_members (household_id, user_id, role)
  values (v_household_id, v_user_id, 'owner');

  return json_build_object(
    'household_id', v_household_id,
    'household_name', v_name
  );
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 12. remove_list_item (already JWT-checked; the membership check moves first)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.remove_list_item(p_household_id uuid, p_catalog_item_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_clerk_id text;
  v_user_id uuid;
  v_list_item_id uuid;
  v_cleared int := 0;
begin
  if not is_member_of(p_household_id) then
    raise exception 'remove_list_item: not a member of household %', p_household_id using errcode = '42501';
  end if;

  -- Identify the caller from the Clerk subject claim (NOT auth.uid()).
  v_clerk_id := auth.jwt()->>'sub';
  if v_clerk_id is null then
    raise exception 'remove_list_item: no clerk subject on JWT';
  end if;

  select id into v_user_id from users where clerk_id = v_clerk_id;
  if v_user_id is null then
    raise exception 'remove_list_item: no user for clerk_id %', v_clerk_id;
  end if;

  -- Resolve the single ACTIVE list_items row for this household+catalog item.
  -- UNIQUE(household_id, catalog_item_id) => at most one match.
  select id into v_list_item_id
  from list_items
  where household_id = p_household_id
    and catalog_item_id = p_catalog_item_id
    and deleted_at is null;

  -- Already removed / never present: no-op, report nothing changed.
  if v_list_item_id is null then
    return json_build_object(
      'removed', false,
      'list_item_id', null,
      'contributors_cleared', 0
    );
  end if;

  -- Clear contributor attribution for this list item.
  delete from list_item_contributors
  where list_item_id = v_list_item_id;
  get diagnostics v_cleared = row_count;

  -- Soft-delete the list_items row.
  update list_items
  set deleted_at = now()
  where id = v_list_item_id;

  return json_build_object(
    'removed', true,
    'list_item_id', v_list_item_id,
    'contributors_cleared', v_cleared
  );
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 13. remove_member
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.remove_member(p_household_id uuid, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_clerk_id text;
  v_caller_id uuid;
  v_target_role text;
begin
  if not is_member_of(p_household_id) then
    raise exception 'remove_member: not a member of household %', p_household_id using errcode = '42501';
  end if;

  v_clerk_id := auth.jwt()->>'sub';
  if v_clerk_id is null then
    raise exception 'remove_member: no clerk subject on JWT';
  end if;

  select id into v_caller_id from users where clerk_id = v_clerk_id;
  if v_caller_id is null then
    raise exception 'remove_member: no user for clerk_id %', v_clerk_id;
  end if;

  -- Resolve the target's active membership row + its role.
  select role into v_target_role
  from household_members
  where household_id = p_household_id
    and user_id = p_user_id
    and deleted_at is null;

  -- Target not present (already removed / never a member): no-op.
  if v_target_role is null then
    return json_build_object('removed', false, 'user_id', null);
  end if;

  -- THE RULE: cannot remove the owner (the un-removable anchor).
  if v_target_role = 'owner' then
    raise exception 'remove_member: the household creator cannot be removed';
  end if;

  -- Soft-delete the target's membership.
  update household_members
  set deleted_at = now()
  where household_id = p_household_id
    and user_id = p_user_id
    and deleted_at is null;

  return json_build_object('removed', true, 'user_id', p_user_id);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 14. leave_household (a non-member now gets 42501 instead of {"left": false})
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.leave_household(p_household_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_clerk_id text;
  v_caller_id uuid;
  v_role text;
begin
  if not is_member_of(p_household_id) then
    raise exception 'leave_household: not a member of household %', p_household_id using errcode = '42501';
  end if;

  v_clerk_id := auth.jwt()->>'sub';
  if v_clerk_id is null then
    raise exception 'leave_household: no clerk subject on JWT';
  end if;

  select id into v_caller_id from users where clerk_id = v_clerk_id;
  if v_caller_id is null then
    raise exception 'leave_household: no user for clerk_id %', v_clerk_id;
  end if;

  -- Resolve the caller's own active membership row.
  select role into v_role
  from household_members
  where household_id = p_household_id
    and user_id = v_caller_id
    and deleted_at is null;

  -- Not a member (already left): no-op.
  if v_role is null then
    return json_build_object('left', false);
  end if;

  -- THE RULE: the owner (creator) cannot leave — must delete instead.
  if v_role = 'owner' then
    raise exception 'leave_household: the creator cannot leave; delete the household instead';
  end if;

  update household_members
  set deleted_at = now()
  where household_id = p_household_id
    and user_id = v_caller_id
    and deleted_at is null;

  return json_build_object('left', true);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 15. delete_household (owner check stays; membership check moves first)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.delete_household(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller       uuid;
  v_member_count int;
begin
  if not is_member_of(p_household_id) then
    raise exception 'delete_household: not a member of household %', p_household_id using errcode = '42501';
  end if;

  -- Resolve caller from Clerk JWT (auth.uid() is not populated with Clerk auth)
  select id into v_caller from users where clerk_id = auth.jwt()->>'sub';
  if v_caller is null then
    raise exception 'delete_household: caller not resolved';
  end if;

  -- Guard: owner only + household exists + not already deleted
  if not exists (
    select 1 from households
    where id = p_household_id
      and created_by = v_caller
      and deleted_at is null
  ) then
    raise exception 'delete_household: not authorized, not found, or already deleted';
  end if;

  -- Capture member count BEFORE soft-deleting household_members
  select count(*) into v_member_count
  from household_members
  where household_id = p_household_id and deleted_at is null;

  -- Soft-delete cascade: deepest dependents first
  update list_item_contributors
    set deleted_at = now()
    where list_item_id in (
      select id from list_items where household_id = p_household_id
    )
    and deleted_at is null;

  update waste_events
    set deleted_at = now()
    where household_id = p_household_id and deleted_at is null;

  update shopping_sessions
    set deleted_at = now()
    where household_id = p_household_id and deleted_at is null;

  update list_items
    set deleted_at = now()
    where household_id = p_household_id and deleted_at is null;

  update provision_cycles
    set deleted_at = now()
    where household_id = p_household_id and deleted_at is null;

  update catalog_items
    set deleted_at = now()
    where household_id = p_household_id and deleted_at is null;

  update known_stores
    set deleted_at = now()
    where household_id = p_household_id and deleted_at is null;

  update household_invites
    set deleted_at = now()
    where household_id = p_household_id and deleted_at is null;

  update household_members
    set deleted_at = now()
    where household_id = p_household_id and deleted_at is null;

  -- Hard-delete user_hidden_items: per-user view state, disposable
  -- Subquery still finds rows because catalog_items are only soft-deleted above
  delete from user_hidden_items
  where catalog_item_id in (
    select id from catalog_items where household_id = p_household_id
  );

  -- Soft-delete the household itself (last)
  update households
    set deleted_at = now()
    where id = p_household_id and deleted_at is null;

  return jsonb_build_object(
    'deleted',       true,
    'member_count',  v_member_count,
    'household_id',  p_household_id
  );
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- ACL — revoke from PUBLIC, anon and service_role by name (revoking from
-- PUBLIC alone leaves explicit role grants in place: the 028/045 lesson),
-- then grant EXECUTE to authenticated only. No server path calls any of
-- these today; grant service_role back per function when one does.
-- ─────────────────────────────────────────────────────────────────────
do $acl$
declare
  f text;
begin
  foreach f in array array[
    'public.archive_trip_items(uuid, uuid[])',
    'public.close_cycle(uuid, uuid[])',
    'public.delete_custom_catalog_item(uuid, uuid)',
    'public.get_active_cycle(uuid)',
    'public.get_household_member_profiles(uuid)',
    'public.get_household_user_ids(uuid)',
    'public.get_list_items_for_household(uuid)',
    'public.insert_custom_catalog_item(text, text, uuid, uuid)',
    'public.insert_list_item(uuid, uuid, integer, text, uuid, uuid, numeric)',
    'public.match_known_store(uuid, double precision, double precision)',
    'public.create_household(text, text)',
    'public.remove_list_item(uuid, uuid)',
    'public.remove_member(uuid, uuid)',
    'public.leave_household(uuid)',
    'public.delete_household(uuid)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('revoke all on function %s from service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$acl$;

-- =====================================================================
-- VERIFY — row-returning. Expect FIFTEEN rows: count_with_this_name = 1,
-- secdef true, search_path pinned, anon_can_execute false,
-- authenticated_can_execute true, service_role_can_execute false, and
-- first_statement showing the is_member_of check (create_household shows
-- the caller resolution instead).
-- =====================================================================
select
  p.proname,
  count(*) over (partition by p.proname)                           as count_with_this_name,
  p.prosecdef                                                      as secdef,
  p.proconfig::text                                                as search_path,
  p.proacl::text                                                   as acl,
  has_function_privilege('anon', p.oid, 'execute')                 as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute')        as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'execute')         as service_role_can_execute,
  regexp_replace(
    substring(pg_get_functiondef(p.oid) from '(?i)begin\s+(.*?;)'),
    '\s+', ' ', 'g')                                               as first_statement
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('archive_trip_items','close_cycle','delete_custom_catalog_item','get_active_cycle',
                    'get_household_member_profiles','get_household_user_ids','get_list_items_for_household',
                    'insert_custom_catalog_item','insert_list_item','match_known_store','create_household',
                    'remove_list_item','remove_member','leave_household','delete_household')
order by p.proname;
