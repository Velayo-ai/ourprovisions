-- 089_rollback.sql — undoes 089_ask_landings.sql. NEVER APPLIED unless 089 must be undone.
-- REVERT THE CLIENT FIRST: the 089 client sends p_run_id / p_tapped_at, which 087's 3-arg land_ask_picks
--   doesn't take (PostgREST would answer "function not found" to every Ask send).
-- Drops the 5-arg land_ask_picks and public.ask_landings (the run ids are lost: a replay queued on a phone
--   after this lands as a fresh land), and puts back, copied verbatim from 087_ask_shelf_deltas.sql:
--   * land_ask_picks(uuid, uuid, uuid[]) — 087's body (md5 1376af1f060719ed42003b6faf08c662, CR stripped,
--     the same on dev and prod 2026-11-24) and its grants (EXECUTE to authenticated only);
--   * asks_stamp_deleted_by() — 087's body (md5 50b66842d10482367343b322dd960d2c): deleted_by only, the
--     client's deleted_at kept. The trigger itself is 087's and was never changed.
-- APPLY through the CLI (`npx --no-install supabase db query --linked -f`). PARSE CHECK = this file with
--   `commit;` → `rollback;`. Run as postgres, dev 7642734024280108049 or prod 7606130613603586966.
-- Dev: delete the 089 ledger row after (below).

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '089 rollback: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '089 rollback: run as postgres — current_user is %', current_user;
  end if;
end
$preflight$;

drop function if exists public.land_ask_picks(uuid, uuid, uuid[], uuid, timestamp with time zone);
drop table if exists public.ask_landings;

-- ═══ land_ask_picks: 087's body, verbatim (087_ask_shelf_deltas.sql §2) ══════════════════════
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
  select a.label into v_label
    from public.asks a
   where a.id = p_ask_id and a.household_id = p_household_id and a.deleted_at is null;
  if v_label is null then
    raise exception 'land_ask_picks: no live ask % in this household', p_ask_id using errcode = 'P0002';
  end if;

  -- 087 (B7): 1 to 48 picks, no nulls, no duplicates. No match with the target or the shelf any more:
  -- the run decides how many (canConfirm), and the shelf is the menu, not a permission.
  v_n := coalesce(cardinality(p_catalog_item_ids), 0);
  if v_n < 1 or v_n > 48 or array_ndims(p_catalog_item_ids) <> 1 then
    raise exception 'land_ask_picks: % picks; a land is 1 to 48', v_n using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_catalog_item_ids) as x (id) where x.id is null) then
    raise exception 'land_ask_picks: a null pick' using errcode = '22023';
  end if;
  if (select count(distinct x.id) from unnest(p_catalog_item_ids) as x (id)) <> v_n then
    raise exception 'land_ask_picks: a duplicate pick' using errcode = '22023';
  end if;

  -- One writer per household at a time (insert_list_item / add_meal_to_list share this lock).
  perform pg_advisory_xact_lock(hashtext(p_household_id::text));

  for v_cid in
    select x.id from unnest(p_catalog_item_ids) with ordinality as x (id, ord) order by x.ord
  loop
    -- 087 (B7, B9.2): lands if the catalog item is live and a seed or this household's own, on the
    -- shelf or not. FOR SHARE: delete_custom_catalog_item hard-deletes without a lock, so the row
    -- lock makes it wait for this land. A pick that can't land is skipped; the rest still land.
    perform 1 from public.catalog_items ci
      where ci.id = v_cid and ci.deleted_at is null
        and (ci.is_global or ci.household_id = p_household_id)
      for share;
    if not found then
      continue;
    end if;

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

  -- No list_item_contributors row (A22), no list_item_events row (A21). The client compares this
  -- with the number of picks: fewer means some were skipped (B7's line).
  return v_count;
end;
$function$;
comment on function public.land_ask_picks(uuid, uuid, uuid[]) is
  '077 (A16, A18–A22; R1, R2 of 2026-11-03) + 083 + 087 (B7) — lands one confirmed Ask in one transaction. 1 to 48 picks, no nulls or duplicates. A pick lands if its catalog item is live and global or this household''s own, on the shelf or not (FOR SHARE on the catalog row first); one that can''t is skipped and the rest land. The label is read from asks, never sent. none → new row at 1; tombstone → revived at 1; live pending → +1, label appended once; live bought → the new need at 1, the meals'' contributions zeroed (048/049). No contributor row, no event. Returns the number landed.';
revoke all on function public.land_ask_picks(uuid, uuid, uuid[]) from public;
revoke all on function public.land_ask_picks(uuid, uuid, uuid[]) from anon;
revoke all on function public.land_ask_picks(uuid, uuid, uuid[]) from service_role;
grant execute on function public.land_ask_picks(uuid, uuid, uuid[]) to authenticated;

-- ═══ asks_stamp_deleted_by: 087's body, verbatim (087_ask_shelf_deltas.sql §1) ══════════════
create or replace function public.asks_stamp_deleted_by()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Fires only on the live → deleted edge (the trigger's WHEN). Null when there is no JWT user.
  new.deleted_by := public.get_current_user_id();
  return new;
end;
$function$;
revoke all on function public.asks_stamp_deleted_by() from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

do $verify$
begin
  if to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[], uuid, timestamp with time zone)') is not null then
    raise exception '089 rollback VERIFY: the 5-arg land_ask_picks survived';
  end if;
  if to_regclass('public.ask_landings') is not null then
    raise exception '089 rollback VERIFY: ask_landings survived';
  end if;
  if (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[])'))
       is distinct from '1376af1f060719ed42003b6faf08c662' then
    raise exception '089 rollback VERIFY: land_ask_picks is not 087''s body';
  end if;
  if (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.asks_stamp_deleted_by()'))
       is distinct from '50b66842d10482367343b322dd960d2c' then
    raise exception '089 rollback VERIFY: asks_stamp_deleted_by is not 087''s body';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_asks_stamp_deleted_by' and tgenabled = 'O'
                  and tgfoid = to_regprocedure('public.asks_stamp_deleted_by()')) then
    raise exception '089 rollback VERIFY: trg_asks_stamp_deleted_by missing or disabled';
  end if;
  raise warning '089 rollback VERIFY: 5-arg gone, ask_landings gone, land_ask_picks = 087 (1376af1f…), asks_stamp_deleted_by = 087 (50b66842…)';
end
$verify$;

commit;

-- CLOSING SELECT. Expected: land_3arg 1 · land_5arg 0 · landings_table 0 ·
--   land_md5 1376af1f060719ed42003b6faf08c662 · land_acl 'authenticated=EXECUTE' ·
--   trigger_md5 50b66842d10482367343b322dd960d2c · trigger_fn_acl ''.
select
  (select system_identifier from pg_control_system())::text as which_db,
  (to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[])') is not null)::int as land_3arg,
  (to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[], uuid, timestamp with time zone)') is not null)::int as land_5arg,
  (to_regclass('public.ask_landings') is not null)::int as landings_table,
  (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[])')) as land_md5,
  (select coalesce(string_agg(case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end || '=' || a.privilege_type, ',' order by 1), '')
     from pg_proc p, aclexplode(p.proacl) a
    where p.oid = to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[])') and a.grantee <> p.proowner) as land_acl,
  (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.asks_stamp_deleted_by()')) as trigger_md5,
  (select coalesce(string_agg(case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end || '=' || a.privilege_type, ',' order by 1), '')
     from pg_proc p, aclexplode(p.proacl) a
    where p.oid = to_regprocedure('public.asks_stamp_deleted_by()') and a.grantee <> p.proowner) as trigger_fn_acl;

-- LEDGER (dev only):
-- delete from supabase_migrations.schema_migrations where name = '089_ask_landings';
