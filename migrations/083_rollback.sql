-- 083_rollback.sql — NEVER APPLIED unless 083 must be undone.
-- SPEC_ask_slice4.md, 083 (S4-3, S4-4, S4-5, D1).
--
-- Undoes 083_ask_edit_and_short_shelves.sql in reverse section order, landing on 078's shape:
--   §4 the D1 grants back to authenticated (077's: UPDATE (label, shelf_noun, screen_style,
--   pick_target) on asks; INSERT, DELETE and UPDATE (position) on ask_shelf_items); §3
--   land_ask_picks back to 077's body (md5 778efba6…, the strict target); §2 update_ask dropped;
--   §1 create_ask back to 078's body (md5 4bed0754…, no server cap). Both bodies are copied from
--   the 077 / 078 files, which equal dev's live bodies (read 2026-11-10).
--
-- KEEPS every ask and shelf row: update_ask writes ordinary 077 rows. After the rollback a short
--   shelf can't land again (077 wants exactly pick_target), and a simple ask over 4 is possible.
--
-- CLIENT: roll the client back FIRST. The Slice 4 client edits through update_ask and runs short
--   shelves at the effective target; with 083 gone, both fail.
--
-- Run as postgres, dev 7642734024280108049 or prod 7606130613603586966.
-- Then remove the dev ledger row by hand: delete from supabase_migrations.schema_migrations
-- where name = '083_ask_edit_and_short_shelves';

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '083_rollback: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '083_rollback: run as postgres — current_user is %', current_user;
  end if;
  if to_regprocedure('public.create_ask(uuid, uuid, text, text, text, smallint, uuid[])') is null then
    raise exception '083_rollback: no create_ask — 078 is not here, so neither is 083';
  end if;
end
$preflight$;

-- §4
grant update (label, shelf_noun, screen_style, pick_target) on table public.asks to authenticated;
grant insert, delete on table public.ask_shelf_items to authenticated;
grant update (position) on table public.ask_shelf_items to authenticated;

-- §3 (077's body, verbatim)
create or replace function public.land_ask_picks(
  p_household_id     uuid,
  p_ask_id           uuid,
  p_catalog_item_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller  uuid;
  v_label   text;
  v_target  smallint;
  v_n       integer;
  v_cycle   uuid;
  v_cid     uuid;
  v_id      uuid;
  v_status  text;
  v_tomb    boolean;
  v_count   integer := 0;
begin
  -- INVARIANT (049 as restated 2026-11-03, R2): for any live pending row,
  --   quantity >= SUM(list_item_meals.quantity_contributed); the difference is need no meal owns.
  -- This function never adds to what a meal owns. A pick on a live pending row is a manual +1;
  -- a pick on a live bought row is a NEW NEED (048/049), so the bought units are never owed again.

  -- Membership FIRST (051).
  if p_household_id is null or not public.is_member_of(p_household_id) then
    raise exception 'land_ask_picks: not a member of household %', p_household_id using errcode = '42501';
  end if;
  v_caller := public.get_current_user_id();
  if v_caller is null then
    raise exception 'land_ask_picks: no user for the JWT subject' using errcode = '42501';
  end if;

  -- The label comes from the ask, never from the request (A22).
  select a.label, a.pick_target into v_label, v_target
    from public.asks a
   where a.id = p_ask_id and a.household_id = p_household_id and a.deleted_at is null;
  if v_label is null then
    raise exception 'land_ask_picks: no live ask % in this household', p_ask_id using errcode = 'P0002';
  end if;

  v_n := coalesce(cardinality(p_catalog_item_ids), 0);
  if v_n <> v_target then
    raise exception 'land_ask_picks: % picks for a target of %', v_n, v_target using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_catalog_item_ids) as x (id) where x.id is null) then
    raise exception 'land_ask_picks: a null pick' using errcode = '22023';
  end if;
  if (select count(distinct x.id) from unnest(p_catalog_item_ids) as x (id)) <> v_n then
    raise exception 'land_ask_picks: a duplicate pick' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_catalog_item_ids) as x (id)
              where not exists (select 1 from public.ask_shelf_items s
                                  join public.catalog_items ci on ci.id = s.catalog_item_id
                                 where s.ask_id = p_ask_id and s.catalog_item_id = x.id
                                   and ci.deleted_at is null
                                   and (ci.is_global or ci.household_id = p_household_id))) then
    raise exception 'land_ask_picks: a pick is not on this ask''s shelf' using errcode = '22023';
  end if;

  -- One writer per household at a time (insert_list_item / add_meal_to_list share this lock).
  perform pg_advisory_xact_lock(hashtext(p_household_id::text));

  for v_cid in
    select x.id from unnest(p_catalog_item_ids) with ordinality as x (id, ord) order by x.ord
  loop
    v_id := null; v_status := null; v_tomb := null;
    select li.id, li.status, (li.deleted_at is not null)
      into v_id, v_status, v_tomb
      from public.list_items li
     where li.household_id = p_household_id and li.catalog_item_id = v_cid
       for update;
    v_status := coalesce(v_status, 'pending');   -- status is nullable (default 'pending')

    -- The open cycle, opened as insert_list_item does, only when a row is (re)created.
    if (v_id is null or v_tomb or v_status <> 'pending') and v_cycle is null then
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
      -- None: a new row (A22: added_by = the member running the ask).
      insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id, picked_by_labels)
      values (p_household_id, v_cid, 1, 'pending', v_caller, v_cycle, array[v_label]);

    elsif v_tomb then
      -- Tombstone: revive at 1. trg_list_items_resurrect fires on this UPDATE — links deleted,
      -- cycle re-homed, labels nulled — so the label is written in a second statement after it.
      update public.list_items
         set quantity = 1, status = 'pending', checked_by = null, added_by = v_caller,
             deleted_at = null, updated_at = now()
       where id = v_id;
      -- A revived row is a new need: no stale badge survives it (the 009 lesson).
      delete from public.list_item_contributors where list_item_id = v_id;
      update public.list_items set picked_by_labels = array[v_label] where id = v_id;

    elsif v_status = 'pending' then
      -- Live, pending: one more (A18), the label appended once (A19), kept at 8. The ledger is
      -- untouched — the manual +1's shape (Step 0 #1, R2).
      update public.list_items
         set quantity = coalesce(quantity, 0) + 1,
             picked_by_labels = case
               when picked_by_labels is null then array[v_label]
               when v_label = any (picked_by_labels) then picked_by_labels
               when cardinality(picked_by_labels) >= 8 then picked_by_labels
               else picked_by_labels || v_label
             end,
             updated_at = now()
       where id = v_id;

    else
      -- Live, not pending (bought; skipped / deferred alike): the NEW NEED (R1, 048/049). Never
      -- old + new — the household already has the old units, and the purchase stays on record as
      -- its 'checked' event. The meals' units are bought: they own nothing on the row now.
      update public.list_items
         set quantity = 1, status = 'pending', checked_by = null, cycle_id = v_cycle,
             picked_by_labels = array[v_label], updated_at = now()
       where id = v_id;
      update public.list_item_meals set quantity_contributed = 0 where list_item_id = v_id;
    end if;

    v_count := v_count + 1;
  end loop;

  -- No list_item_contributors row (A22), no list_item_events row (A21).
  return v_count;
end;
$function$;
comment on function public.land_ask_picks(uuid, uuid, uuid[]) is
  '077 (A16, A18–A22; R1, R2 of 2026-11-03) — lands one confirmed Ask in one transaction. The label is read from asks, never sent. none → new row at 1; tombstone → revived at 1; live pending → +1, label appended once; live bought → the new need at 1, the meals'' contributions zeroed (048/049). No contributor row, no event. Returns the count landed.';

-- §2
drop function if exists public.update_ask(uuid, uuid, text, text, text, smallint, uuid[]);

-- §1 (078's body, verbatim)
create or replace function public.create_ask(
  p_id               uuid,
  p_household_id     uuid,
  p_label            text,
  p_shelf_noun       text,
  p_screen_style     text,
  p_pick_target      smallint,
  p_catalog_item_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller uuid;
  v_label  text := btrim(p_label);
  v_noun   text := nullif(btrim(p_shelf_noun), '');
  v_style  text := coalesce(p_screen_style, 'standard');
  v_n      integer := coalesce(cardinality(p_catalog_item_ids), 0);
  v_hh     uuid;
  v_old    text;
  v_dead   boolean;
begin
  -- Membership FIRST (051).
  if p_household_id is null or not public.is_member_of(p_household_id) then
    raise exception 'create_ask: not a member of household %', p_household_id using errcode = '42501';
  end if;
  v_caller := public.get_current_user_id();
  if v_caller is null then
    raise exception 'create_ask: no user for the JWT subject' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'create_ask: no id' using errcode = '22023';
  end if;

  -- One creator per household at a time: two retries of one id meet here, not at the primary key.
  perform pg_advisory_xact_lock(hashtext('create_ask:' || p_household_id::text));

  -- RETRY (K1), before the label check so a retry never hits K2.
  select a.household_id, a.label, (a.deleted_at is not null)
    into v_hh, v_old, v_dead
    from public.asks a
   where a.id = p_id;
  if found then
    if v_hh = p_household_id and v_old = v_label and not v_dead then
      return p_id;
    end if;
    raise exception 'create_ask: id % is already another ask', p_id using errcode = '42710';
  end if;

  if v_label is null or char_length(v_label) not between 1 and 16 then
    raise exception 'create_ask: a label is 1 to 16 characters' using errcode = '22023';
  end if;
  if exists (select 1 from public.asks a
              where a.household_id = p_household_id and a.deleted_at is null
                and lower(a.label) = lower(v_label)) then
    raise exception 'create_ask: a live ask in this household is already labelled %', v_label using errcode = '23505';
  end if;
  if v_noun is not null and char_length(v_noun) > 16 then
    raise exception 'create_ask: a shelf noun is at most 16 characters' using errcode = '22023';
  end if;
  if v_style not in ('standard', 'simple') then
    raise exception 'create_ask: screen style % is not standard or simple', v_style using errcode = '22023';
  end if;

  if v_n = 0 or v_n > 48 or array_ndims(p_catalog_item_ids) <> 1 then
    raise exception 'create_ask: a shelf holds 1 to 48 items, % given', v_n using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_catalog_item_ids) as x (id) where x.id is null) then
    raise exception 'create_ask: a null item' using errcode = '22023';
  end if;
  if (select count(distinct x.id) from unnest(p_catalog_item_ids) as x (id)) <> v_n then
    raise exception 'create_ask: a duplicate item' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_catalog_item_ids) as x (id)
              where not exists (select 1 from public.catalog_items ci
                                 where ci.id = x.id and ci.deleted_at is null
                                   and (ci.is_global or ci.household_id = p_household_id))) then
    raise exception 'create_ask: an item is not live in this household' using errcode = '22023';
  end if;

  if p_pick_target is null or p_pick_target not between 1 and 6 then
    raise exception 'create_ask: a pick target is 1 to 6' using errcode = '22023';
  end if;
  if p_pick_target > v_n then
    raise exception 'create_ask: a target of % needs at least % tiles, % given', p_pick_target, p_pick_target, v_n using errcode = '22023';
  end if;

  insert into public.asks (id, household_id, label, shelf_noun, screen_style, pick_target, created_by)
  values (p_id, p_household_id, v_label, v_noun, v_style, p_pick_target, v_caller);
  insert into public.ask_shelf_items (ask_id, catalog_item_id, position)
  select p_id, x.id, (x.ord - 1)::smallint
    from unnest(p_catalog_item_ids) with ordinality as x (id, ord);

  return p_id;
end;
$function$;
comment on function public.create_ask(uuid, uuid, text, text, text, smallint, uuid[]) is
  '078 (K1, K2, D-a of 2026-11-06) — creates an ask and its shelf in one transaction. The client supplies the id: a retry with the same household and label returns it and writes nothing. 23505 = a live ask already has the label; 22023 = a bad field, item list, or a target above the tile count; 42710 = the id is another ask.';

notify pgrst, 'reload schema';

do $verify$
begin
  if to_regprocedure('public.update_ask(uuid, uuid, text, text, text, smallint, uuid[])') is not null then
    raise exception '083_rollback: update_ask survived';
  end if;
  if (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = 'public.create_ask(uuid, uuid, text, text, text, smallint, uuid[])'::regprocedure)
       is distinct from '4bed0754a50ba9b039f0c99c3e857a21'
     or (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = 'public.land_ask_picks(uuid, uuid, uuid[])'::regprocedure)
       is distinct from '778efba6c9283f6bfd9c7401dd2f4684' then
    raise exception '083_rollback: create_ask / land_ask_picks are not 078''s / 077''s bodies';
  end if;
  if (select count(*) from pg_attribute att, aclexplode(att.attacl) a
       where att.attrelid = 'public.asks'::regclass and a.grantee = 'authenticated'::regrole::oid
         and a.privilege_type = 'UPDATE') <> 6
     or (select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
           from pg_class c, aclexplode(c.relacl) a
          where c.oid = 'public.ask_shelf_items'::regclass and a.grantee = 'authenticated'::regrole::oid
            and a.privilege_type <> 'MAINTAIN') is distinct from 'DELETE,INSERT,SELECT'
     or (select count(*) from pg_attribute att, aclexplode(att.attacl) a
          where att.attrelid = 'public.ask_shelf_items'::regclass and a.grantee = 'authenticated'::regrole::oid
            and a.privilege_type = 'UPDATE') <> 1 then
    raise exception '083_rollback: the grants are not 077''s';
  end if;
  raise warning '083_rollback VERIFY: on 078''s shape';
end
$verify$;

commit;
