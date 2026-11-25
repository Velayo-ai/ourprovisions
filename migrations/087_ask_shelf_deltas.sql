-- 087_ask_shelf_deltas.sql
-- SPEC_ask_shelf_sync.md Part B (approved 2026-11-21; B7/B8 21:20; B9 Step 0 rulings 21:55).
--
-- WHY
--   update_ask (083) is replace-all: it deletes every shelf row the form didn't send and upserts the
--   form's array, so an Edit sheet opened before another member's save writes its stale snapshot back
--   (dev, 2026-11-21 20:09: a removed Bananas came back). And land_ask_picks (083) rejects the whole
--   land when one pick has left the shelf, or when the shelf shrank below the target, on every retry
--   (dev, 21:05: a frozen run's ✓ was a dead end). Prod has both today (bodies byte-identical).
--
-- WHAT
--   §1 asks.deleted_by (B8): who deleted the ask, stamped from the JWT by a BEFORE UPDATE OF
--      deleted_at trigger when a live ask is deleted. The client's delete stays the plain column
--      update it is (077's column grant: deleted_at, updated_at), so phones on older JS stamp it too.
--      No grant on deleted_by: a client can't write it. Members already read it (asks_select).
--   §2 land_ask_picks (B7), same signature, still returns the number landed:
--      * a pick lands if its catalog item is live and a seed or this household's own, on the shelf or
--        not (the shelf is the menu; landing is "add to the list", which any member can already do);
--      * 1 to 48 picks, no nulls, no duplicates (no exact match with the target any more);
--      * a pick that can't land is skipped inside the loop and the rest land — one pick never fails
--        the call. FOR SHARE on each pick's catalog row first (B9.2): delete_custom_catalog_item
--        hard-deletes and takes no lock, so the row lock is what makes a concurrent delete wait.
--      The label still comes from the ask; a deleted ask is still P0002 (WATCH).
--   §3 edit_ask (B1, B2, B9.1), a delta save. Not an overload of update_ask (PGRST203); update_ask
--      stays for older clients (revoked later — WATCH). Under the ask lock ('create_ask:' || hh, as
--      create_ask / update_ask) with the ask row locked:
--        inputs (22023): no nulls / duplicates in either list, add ∩ remove = ∅, each list ≤ 48, an
--          add that is another household's item; changed scalars pass update_ask's own checks; K2 → 23505.
--        removes: p_remove_ids and dead tiles (deleted catalog items); already gone = no-op.
--        adds: appended after the last tile in the order sent; already present = no-op. An add whose
--          catalog item is missing or deleted → P0409 (another member deleted it mid-edit, B9.1).
--        positions compacted to 0..n-1; only the scalars sent change (null = unchanged; a noun of ''
--          clears it); updated_at = now().
--        the RESULTING shelf is validated: 1–48 tiles, pick_target ≤ n, Explorer ≤ 4. Any failure →
--          P0409 "the shelf changed under you" (B9.1: the form disables Save on an invalid shelf, so a
--          resulting-shelf failure is someone else's change). The whole call rolls back.
--      Returns json { ask_id, tiles }.
--
-- SQLSTATES: 42501 not a member / no JWT user · P0002 no live ask · 22023 a bad input · 23505 K2 ·
--   P0409 (new, edit_ask only) the shelf changed under you. P0409 is in PL/pgSQL's P0 class, unused by
--   Postgres (P0001–P0004); PostgREST passes it through as error.code.
-- STEP 0 (2026-11-21, dev 7642734024280108049 + prod 7606130613603586966, read-only): update_ask
--   bda189ca…, land_ask_picks 0defbd6e…, create_ask 0d820ae1…, delete_custom_catalog_item 2dd30903…,
--   byte-identical on both (prosrc, CR stripped). asks: no deleted_by, no triggers; authenticated has
--   table SELECT and column UPDATE (deleted_at, updated_at). No 087 objects anywhere; dev ledger ends
--   at 086 (20261116035743); prod has no ledger (applied = object read-back).
-- GRANTS: edit_ask: revoke from public, anon, authenticated, service_role; EXECUTE to authenticated.
--   land_ask_picks: create or replace keeps its ACL (authenticated=EXECUTE), restated and read back.
--   asks_stamp_deleted_by: no EXECUTE for anyone (a trigger fires without it).
-- FIXTURE: as the owner inside `savepoint fixture` … `rollback to savepoint fixture`, 085's pattern:
--   throw-away users and households, impersonation through request.jwt.claims (is_local = true),
--   grant probes under `set local role`. Nothing survives.
-- APPLY: dev first through the CLI (`npx --no-install supabase db query --linked -f`), never the SQL
--   editor (CRLF). PARSE CHECK = this file with `commit;` → `rollback;`. Then the closing SELECT and the
--   ledger row (dev only). Prod BEFORE its client (Ask is live there): the same file, read back by object.
--   Idempotent (add column if not exists, create or replace, drop trigger if exists). Run as postgres.
-- ROLLBACK: 087_rollback.sql — revert the client FIRST (the new client calls edit_ask and reads
--   deleted_by).
-- DRAFTED 2026-11-21 (ET) by Claude Code. PARSE CHECK on dev 2026-11-22 UTC (`supabase db query
--   --linked -f`, `commit;` → `rollback;`): ran to the end, closing row 'rolled back', edit_ask 0,
--   deleted_by_col 0, fixture_rows 0. A canary copy wanting 36 failed "087 fixture: 35 checks passed,
--   want 36" (every probe ran). 087_rollback.sql parse-checked against the applied state: its VERIFY
--   passed (land_ask_picks back to 0defbd6e…), rolled back.
-- APPLIED on dev 2026-11-22 03:05:59 UTC by Claude Code through the CLI: committed; edit_ask 1, ACL
--   authenticated=EXECUTE; land_ask_picks ACL authenticated=EXECUTE; asks_stamp_deleted_by ACL '';
--   all secdef + search_path ""; trigger on; deleted_by FK to users; client UPDATE on deleted_by false;
--   update_ask still bda189ca…; fixture_rows 0. Bodies (CR stripped = this file): edit_ask
--   394667711aef89e05675cc681623e0d2, land_ask_picks 1376af1f060719ed42003b6faf08c662,
--   asks_stamp_deleted_by 50b66842d10482367343b322dd960d2c. Ledger 20261122030559 087_ask_shelf_deltas.
--   NOT ON PROD.
-- ADDENDUM (2026-11-25): APPLIED on prod 2026-11-22 04:09:12 UTC by Claude Code through the CLI (relinked
--   to prod by ref parpauldmbetptkmdwbd and back to dev): the fixture-free copy (this file minus the FIXTURE
--   block, a prod-only preflight), read back by object. Prod has no ledger: applied = the object read-back.
--   Read again 2026-11-25 before 089: land_ask_picks 1376af1f…, asks_stamp_deleted_by 50b66842…, edit_ask
--   39466771…, update_ask bda189ca… (= dev).

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '087: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '087: run as postgres — current_user is %', current_user;
  end if;
  if to_regprocedure('public.update_ask(uuid, uuid, text, text, text, smallint, uuid[])') is null
     or to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[])') is null
     or to_regprocedure('public.create_ask(uuid, uuid, text, text, text, smallint, uuid[])') is null then
    raise exception '087: update_ask / land_ask_picks / create_ask missing — 083 is not on this database';
  end if;
  if to_regprocedure('public.adjust_list_item_quantity(uuid, uuid, integer, numeric)') is null then
    raise exception '087: adjust_list_item_quantity missing — 085 is not on this database';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'asks_household_label_live_uq') then
    raise exception '087: asks_household_label_live_uq (K2) is missing';
  end if;
end
$preflight$;

-- ═══ §1 asks.deleted_by + its trigger (B8) ═════════════════════════════════════════════════
alter table public.asks add column if not exists deleted_by uuid null references public.users(id);
comment on column public.asks.deleted_by is
  '087 (B8): the member who deleted the ask, from the JWT, stamped by trg_asks_stamp_deleted_by when a live ask is deleted. Null on a live ask, and on asks deleted before 087. Never written by a client (no grant).';

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

drop trigger if exists trg_asks_stamp_deleted_by on public.asks;
create trigger trg_asks_stamp_deleted_by
  before update of deleted_at on public.asks
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.asks_stamp_deleted_by();

-- ═══ §2 land_ask_picks: a pick always lands if it can (B7, B9.2) ═══════════════════════════
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

-- ═══ §3 edit_ask: the delta shelf save (B1, B2, B9.1) ══════════════════════════════════════
create or replace function public.edit_ask(
  p_household_id uuid,
  p_ask_id       uuid,
  p_add_ids      uuid[]   default '{}',
  p_remove_ids   uuid[]   default '{}',
  p_label        text     default null,
  p_shelf_noun   text     default null,
  p_screen_style text     default null,
  p_pick_target  smallint default null
)
returns json
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_add    uuid[]  := coalesce(p_add_ids, '{}');
  v_remove uuid[]  := coalesce(p_remove_ids, '{}');
  v_label  text    := btrim(p_label);                 -- null = unchanged
  v_noun   text    := nullif(btrim(p_shelf_noun), ''); -- '' clears; null param = unchanged
  v_base   integer;
  v_n      integer;
  v_style  text;
  v_target smallint;
begin
  -- Membership FIRST (051).
  if p_household_id is null or not public.is_member_of(p_household_id) then
    raise exception 'edit_ask: not a member of household %', p_household_id using errcode = '42501';
  end if;
  if public.get_current_user_id() is null then
    raise exception 'edit_ask: no user for the JWT subject' using errcode = '42501';
  end if;

  -- The ask lock (create_ask / update_ask): an edit and a create in one household decide K2 one at a
  -- time. Then the row: a second editor queues here and merges onto the first one's result.
  perform pg_advisory_xact_lock(hashtext('create_ask:' || p_household_id::text));
  perform 1 from public.asks a
   where a.id = p_ask_id and a.household_id = p_household_id and a.deleted_at is null
     for update;
  if not found then
    raise exception 'edit_ask: no live ask % in this household', p_ask_id using errcode = 'P0002';
  end if;

  -- ── Inputs (22023; K2 23505) ─────────────────────────────────────────────────────────────
  if cardinality(v_add) > 48 or cardinality(v_remove) > 48
     or (cardinality(v_add) > 0 and array_ndims(v_add) <> 1)
     or (cardinality(v_remove) > 0 and array_ndims(v_remove) <> 1) then
    raise exception 'edit_ask: an add or remove list is not 0 to 48 items' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_add) as x (id) where x.id is null)
     or exists (select 1 from unnest(v_remove) as x (id) where x.id is null) then
    raise exception 'edit_ask: a null item' using errcode = '22023';
  end if;
  if (select count(distinct x.id) from unnest(v_add) as x (id)) <> cardinality(v_add)
     or (select count(distinct x.id) from unnest(v_remove) as x (id)) <> cardinality(v_remove) then
    raise exception 'edit_ask: a duplicate item' using errcode = '22023';
  end if;
  if v_add && v_remove then
    raise exception 'edit_ask: an item is both added and removed' using errcode = '22023';
  end if;
  if p_label is not null then
    if char_length(v_label) not between 1 and 16 then
      raise exception 'edit_ask: a label is 1 to 16 characters' using errcode = '22023';
    end if;
    -- K2 against the OTHER live asks: keeping your own label (or changing its case) is not a clash.
    if exists (select 1 from public.asks a
                where a.household_id = p_household_id and a.deleted_at is null and a.id <> p_ask_id
                  and lower(a.label) = lower(v_label)) then
      raise exception 'edit_ask: a live ask in this household is already labelled %', v_label using errcode = '23505';
    end if;
  end if;
  if p_shelf_noun is not null and v_noun is not null and char_length(v_noun) > 16 then
    raise exception 'edit_ask: a shelf noun is at most 16 characters' using errcode = '22023';
  end if;
  if p_screen_style is not null and p_screen_style not in ('standard', 'simple') then
    raise exception 'edit_ask: screen style % is not standard or simple', p_screen_style using errcode = '22023';
  end if;
  if p_pick_target is not null and p_pick_target not between 1 and 6 then
    raise exception 'edit_ask: a pick target is 1 to 6' using errcode = '22023';
  end if;

  -- The adds: FOR SHARE first, so a concurrent hard delete waits (B9.2). Another household's item is
  -- a bad input (22023); a missing or deleted one was deleted mid-edit by another member → P0409.
  perform 1 from public.catalog_items ci where ci.id = any (v_add) for share;
  if exists (select 1 from unnest(v_add) as x (id)
               join public.catalog_items ci on ci.id = x.id
              where not ci.is_global and ci.household_id is distinct from p_household_id) then
    raise exception 'edit_ask: an item is another household''s' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_add) as x (id)
              where not exists (select 1 from public.catalog_items ci
                                 where ci.id = x.id and ci.deleted_at is null)) then
    raise exception 'edit_ask: the shelf changed under you (an added item was deleted)' using errcode = 'P0409';
  end if;

  -- ── 1. Removes, and dead tiles (deleted catalog items), as update_ask does. Gone = no-op. ──
  delete from public.ask_shelf_items s
   where s.ask_id = p_ask_id
     and (s.catalog_item_id = any (v_remove)
          or exists (select 1 from public.catalog_items ci
                      where ci.id = s.catalog_item_id and ci.deleted_at is not null));

  -- ── 2. Adds, after the last tile, in the order sent. Already there = no-op. ──────────────
  select coalesce(max(s.position) + 1, 0) into v_base from public.ask_shelf_items s where s.ask_id = p_ask_id;
  insert into public.ask_shelf_items (ask_id, catalog_item_id, position)
  select p_ask_id, x.id, least(v_base + x.ord - 1, 47)::smallint
    from unnest(v_add) with ordinality as x (id, ord)
  on conflict (ask_id, catalog_item_id) do nothing;

  -- The resulting size first: compacting more than 48 rows would trip ask_shelf_items_position_range.
  select count(*) into v_n from public.ask_shelf_items s where s.ask_id = p_ask_id;
  if v_n < 1 or v_n > 48 then
    raise exception 'edit_ask: the shelf changed under you (% tiles; a shelf holds 1 to 48)', v_n using errcode = 'P0409';
  end if;

  -- ── 3. Compact positions to 0..n-1 (position is not unique, so one statement is safe). ───
  update public.ask_shelf_items s
     set position = (r.rn - 1)::smallint
    from (select s2.catalog_item_id, row_number() over (order by s2.position, s2.catalog_item_id) as rn
            from public.ask_shelf_items s2 where s2.ask_id = p_ask_id) r
   where s.ask_id = p_ask_id and s.catalog_item_id = r.catalog_item_id and s.position <> r.rn - 1;

  -- ── 4. Only the scalars this editor sent. ────────────────────────────────────────────────
  update public.asks a
     set label        = coalesce(v_label, a.label),
         shelf_noun   = case when p_shelf_noun is null then a.shelf_noun else v_noun end,
         screen_style = coalesce(p_screen_style, a.screen_style),
         pick_target  = coalesce(p_pick_target, a.pick_target),
         updated_at   = now()
   where a.id = p_ask_id
  returning a.screen_style, a.pick_target into v_style, v_target;

  -- ── 5. The RESULTING shelf (B9.1): any failure is someone else's change → P0409. ──────────
  if v_target > v_n then
    raise exception 'edit_ask: the shelf changed under you (a target of % needs % tiles, % left)', v_target, v_target, v_n using errcode = 'P0409';
  end if;
  if v_style = 'simple' and v_n > 4 then
    raise exception 'edit_ask: the shelf changed under you (Explorer shows at most 4, % on the shelf)', v_n using errcode = 'P0409';
  end if;

  return json_build_object('ask_id', p_ask_id, 'tiles', v_n);
end;
$function$;
comment on function public.edit_ask(uuid, uuid, uuid[], uuid[], text, text, text, smallint) is
  '087 (SPEC_ask_shelf_sync B1, B2, B9.1) — the delta shelf save. Under the ask lock with the ask row locked: removes (and dead tiles), then adds after the last tile in the order sent (already done = no-op), positions compacted, only the scalars sent changed (null = unchanged; a noun of '''' clears it). Inputs → 22023, K2 → 23505, no live ask → P0002. The resulting shelf (1–48 tiles, target ≤ n, Explorer ≤ 4) or an add deleted mid-edit → P0409, the shelf changed under you; the call rolls back whole. Returns { ask_id, tiles }.';
revoke all on function public.edit_ask(uuid, uuid, uuid[], uuid[], text, text, text, smallint) from public, anon, authenticated, service_role;
grant execute on function public.edit_ask(uuid, uuid, uuid[], uuid[], text, text, text, smallint) to authenticated;

notify pgrst, 'reload schema';

-- ═══ VERIFY (inside the transaction; raises on any mismatch) ═══════════════════════════════
do $verify$
declare
  v_bad     text[] := array[]::text[];
  v_checked integer := 0;
  v_p       pg_proc%rowtype;
  v_got     text;
  v_name    text;
  v_sig     text;
  v_want    text;
begin
  for v_name, v_sig, v_want in
    select * from (values
      ('edit_ask',              'public.edit_ask(uuid, uuid, uuid[], uuid[], text, text, text, smallint)', 'authenticated=EXECUTE'),
      ('land_ask_picks',        'public.land_ask_picks(uuid, uuid, uuid[])',                             'authenticated=EXECUTE'),
      ('asks_stamp_deleted_by', 'public.asks_stamp_deleted_by()',                                        '')
    ) t (n, s, w)
  loop
    select * into v_p from pg_proc where oid = to_regprocedure(v_sig);
    if v_p.oid is null then raise exception '087 VERIFY: % is missing', v_name; end if;
    v_checked := v_checked + 1;
    if (select count(*) from pg_proc where proname = v_name and pronamespace = 'public'::regnamespace) <> 1 then
      v_bad := v_bad || (v_name || ': more than one');
    end if;
    v_checked := v_checked + 1;
    if not v_p.prosecdef then v_bad := v_bad || (v_name || ': not security definer'); end if;
    v_checked := v_checked + 1;
    if v_p.proconfig is distinct from array['search_path=""'] then v_bad := v_bad || (v_name || ': search_path ' || coalesce(v_p.proconfig::text, 'null')); end if;
    v_checked := v_checked + 1;
    select coalesce(string_agg(case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end || '=' || a.privilege_type, ',' order by 1), '')
      into v_got from aclexplode(v_p.proacl) a where a.grantee <> v_p.proowner;
    if v_got <> v_want then v_bad := v_bad || (v_name || ': ACL ' || v_got); end if;
    v_checked := v_checked + 1;
    raise warning '087 body: % %', v_name, md5(v_p.prosrc);
  end loop;

  if (select prorettype from pg_proc where oid = to_regprocedure('public.edit_ask(uuid, uuid, uuid[], uuid[], text, text, text, smallint)')) <> 'json'::regtype then
    v_bad := v_bad || 'edit_ask: returns not json'::text;
  end if;
  v_checked := v_checked + 1;
  if (select prorettype from pg_proc where oid = to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[])')) <> 'integer'::regtype then
    v_bad := v_bad || 'land_ask_picks: returns not integer'::text;
  end if;
  v_checked := v_checked + 1;

  -- update_ask and create_ask untouched.
  if (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.update_ask(uuid, uuid, text, text, text, smallint, uuid[])')) <> 'bda189ca6f7c1b0af6a5dd26855ad4c8' then
    v_bad := v_bad || 'update_ask body changed'::text;
  end if;
  v_checked := v_checked + 1;
  if (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.create_ask(uuid, uuid, text, text, text, smallint, uuid[])')) <> '0d820ae14339a6135f4951ca68eec9af' then
    v_bad := v_bad || 'create_ask body changed'::text;
  end if;
  v_checked := v_checked + 1;

  -- deleted_by: uuid, nullable, FK to users; no client UPDATE on it; deleted_at's grant intact.
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'asks'
                  and column_name = 'deleted_by' and data_type = 'uuid' and is_nullable = 'YES') then
    v_bad := v_bad || 'asks.deleted_by missing or not a nullable uuid'::text;
  end if;
  v_checked := v_checked + 1;
  if not exists (select 1 from pg_constraint where conrelid = 'public.asks'::regclass and contype = 'f'
                  and pg_get_constraintdef(oid) = 'FOREIGN KEY (deleted_by) REFERENCES users(id)') then
    v_bad := v_bad || 'asks.deleted_by has no FK to users'::text;
  end if;
  v_checked := v_checked + 1;
  if has_column_privilege('authenticated', 'public.asks', 'deleted_by', 'UPDATE')
     or has_column_privilege('anon', 'public.asks', 'deleted_by', 'UPDATE') then
    v_bad := v_bad || 'a client can UPDATE asks.deleted_by'::text;
  end if;
  v_checked := v_checked + 1;
  if not has_column_privilege('authenticated', 'public.asks', 'deleted_at', 'UPDATE') then
    v_bad := v_bad || 'authenticated lost UPDATE on asks.deleted_at'::text;
  end if;
  v_checked := v_checked + 1;
  if not exists (select 1 from pg_trigger where tgname = 'trg_asks_stamp_deleted_by' and tgrelid = 'public.asks'::regclass
                  and not tgisinternal and tgenabled = 'O'
                  and tgfoid = to_regprocedure('public.asks_stamp_deleted_by()')) then
    v_bad := v_bad || 'trg_asks_stamp_deleted_by missing or disabled'::text;
  end if;
  v_checked := v_checked + 1;

  raise warning '087 VERIFY: % checked, % mismatches%', v_checked, cardinality(v_bad),
    case when cardinality(v_bad) > 0 then ' — ' || array_to_string(v_bad, '; ') else '' end;
  if cardinality(v_bad) > 0 then raise exception '087 VERIFY failed: %', array_to_string(v_bad, '; '); end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- FIXTURE — definer-run, inside a savepoint, rolled back. edit_ask's merges and refusals (V3, V5,
-- V6, V8), land_ask_picks' new rules (V9), deleted_by (V10), and the grants. Nothing here survives.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
savepoint fixture;

do $fixture$
declare
  v_tag   text := '087-fixture-' || gen_random_uuid()::text;
  v_a     uuid; v_b uuid; v_c uuid;        -- A and B members; C an outsider
  v_hh    uuid; v_hh2 uuid;
  v_i     uuid[] := array[]::uuid[];       -- i1..i12 live custom items of hh
  v_gone  uuid;                            -- a soft-deleted custom item of hh
  v_x     uuid;                            -- a custom item of hh2
  v_seed  uuid := (select id from public.catalog_items where is_global and deleted_at is null order by id limit 1);
  v_id    uuid;
  v_ask   uuid := gen_random_uuid();       -- Easton
  v_ask2  uuid := gen_random_uuid();       -- Everett (K2)
  v_ask3  uuid := gen_random_uuid();       -- Explorer, for V5
  v_ask4  uuid := gen_random_uuid();       -- for land_ask_picks
  v_r     json;
  v_n     integer;
  v_ok    integer := 0;
  v_shelf text;
  v_a1    public.asks%rowtype;
  v_ca    text; v_cb text; v_cc text;
  v_49    uuid[] := array[]::uuid[];
begin
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-a', v_tag || '-a@fixture.invalid', '087 Alpha') returning id into v_a;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-b', v_tag || '-b@fixture.invalid', '087 Bravo') returning id into v_b;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-c', v_tag || '-c@fixture.invalid', '087 Charlie') returning id into v_c;
  insert into public.households (name, created_by) values (v_tag, v_a) returning id into v_hh;
  insert into public.households (name, created_by) values (v_tag || '-other', v_c) returning id into v_hh2;
  insert into public.household_members (household_id, user_id) values (v_hh, v_a), (v_hh, v_b), (v_hh2, v_c);
  for v_n in 1..12 loop
    insert into public.catalog_items (name, category, is_global, household_id, created_by)
    values (v_tag || '-item-' || v_n, 'Produce', false, v_hh, v_a) returning id into v_id;
    v_i := v_i || v_id;
  end loop;
  insert into public.catalog_items (name, category, is_global, household_id, created_by, deleted_at)
  values (v_tag || '-gone', 'Produce', false, v_hh, v_a, now()) returning id into v_gone;
  insert into public.catalog_items (name, category, is_global, household_id, created_by)
  values (v_tag || '-foreign', 'Produce', false, v_hh2, v_c) returning id into v_x;

  insert into public.asks (id, household_id, label, pick_target, created_by) values (v_ask, v_hh, 'Easton', 2, v_a);
  insert into public.ask_shelf_items (ask_id, catalog_item_id, position)
  values (v_ask, v_i[1], 0), (v_ask, v_i[2], 1), (v_ask, v_i[3], 2), (v_ask, v_i[4], 3);
  insert into public.asks (id, household_id, label, pick_target, created_by) values (v_ask2, v_hh, 'Everett', 1, v_a);
  insert into public.ask_shelf_items (ask_id, catalog_item_id, position) values (v_ask2, v_i[1], 0);

  v_ca := json_build_object('sub', v_tag || '-a', 'role', 'authenticated')::text;
  v_cb := json_build_object('sub', v_tag || '-b', 'role', 'authenticated')::text;
  v_cc := json_build_object('sub', v_tag || '-c', 'role', 'authenticated')::text;
  perform set_config('request.jwt.claims', v_ca, true);
  if public.get_current_user_id() is distinct from v_a then raise exception '087 fixture: impersonation failed'; end if;

  -- (1) V3, tonight's repro. A removes X (i1). B, from a stale sheet that still shows X, removes Y (i2)
  --     and adds Z (i5). X stays gone, Y is gone, Z is present; positions 0..n-1; the call returns n.
  v_r := public.edit_ask(v_hh, v_ask, '{}', array[v_i[1]]);
  perform set_config('request.jwt.claims', v_cb, true);
  v_r := public.edit_ask(v_hh, v_ask, array[v_i[5]], array[v_i[2]]);
  select string_agg(catalog_item_id::text || '@' || position, ',' order by position) into v_shelf from public.ask_shelf_items where ask_id = v_ask;
  if v_shelf <> v_i[3]::text || '@0,' || v_i[4]::text || '@1,' || v_i[5]::text || '@2' or (v_r->>'tiles')::int <> 3 or (v_r->>'ask_id')::uuid <> v_ask then
    raise exception '087 fixture (1): V3 merge % / %', v_shelf, v_r;
  end if;
  v_ok := v_ok + 1;

  -- (2) V8: the same delta again gives the same shelf (removes and adds are idempotent).
  v_r := public.edit_ask(v_hh, v_ask, array[v_i[5]], array[v_i[2]]);
  if (select string_agg(catalog_item_id::text || '@' || position, ',' order by position) from public.ask_shelf_items where ask_id = v_ask) <> v_shelf then
    raise exception '087 fixture (2): a repeated delta changed the shelf';
  end if;
  v_ok := v_ok + 1;

  -- (3) Adds append in the order sent (i7 before i6), after the last tile.
  v_r := public.edit_ask(v_hh, v_ask, array[v_i[7], v_i[6]]);
  if (select array_agg(catalog_item_id order by position) from public.ask_shelf_items where ask_id = v_ask)
     <> array[v_i[3], v_i[4], v_i[5], v_i[7], v_i[6]] then
    raise exception '087 fixture (3): adds out of order';
  end if;
  v_ok := v_ok + 1;

  -- (4) Scalars not sent stay; updated_at moves.
  update public.asks set shelf_noun = 'snacks', updated_at = now() - interval '1 hour' where id = v_ask;
  select * into v_a1 from public.asks where id = v_ask;
  v_r := public.edit_ask(v_hh, v_ask, '{}', array[v_i[6]]);
  if (select label from public.asks where id = v_ask) <> 'Easton' or (select shelf_noun from public.asks where id = v_ask) <> 'snacks'
     or (select screen_style from public.asks where id = v_ask) <> v_a1.screen_style or (select pick_target from public.asks where id = v_ask) <> 2
     or (select updated_at from public.asks where id = v_ask) <= v_a1.updated_at then
    raise exception '087 fixture (4): an unsent scalar changed, or updated_at did not move';
  end if;
  v_ok := v_ok + 1;

  -- (5) V6: A changes the label, B the count: both stick. A noun of '' clears it.
  perform set_config('request.jwt.claims', v_ca, true);
  v_r := public.edit_ask(v_hh, v_ask, p_label => '  Eastie ');
  perform set_config('request.jwt.claims', v_cb, true);
  v_r := public.edit_ask(v_hh, v_ask, p_pick_target => 3::smallint, p_shelf_noun => '');
  select * into v_a1 from public.asks where id = v_ask;
  if v_a1.label <> 'Eastie' or v_a1.pick_target <> 3 or v_a1.shelf_noun is not null then
    raise exception '087 fixture (5): scalars % / % / %', v_a1.label, v_a1.pick_target, v_a1.shelf_noun;
  end if;
  v_ok := v_ok + 1;

  -- (6) K2: another live ask's label, any case → 23505. Its own label in a new case is fine.
  begin perform public.edit_ask(v_hh, v_ask, p_label => 'everett');
        raise exception '087 fixture (6): K2 clash accepted';
  exception when sqlstate '23505' then v_ok := v_ok + 1; end;
  v_r := public.edit_ask(v_hh, v_ask, p_label => 'EASTIE');
  if (select label from public.asks where id = v_ask) <> 'EASTIE' then raise exception '087 fixture (7): own label in a new case refused'; end if;
  v_ok := v_ok + 1;

  -- (8–14) Inputs → 22023: overlap, a null, a duplicate, a 17-character label, a bad style, a target of
  --        7, another household's item.
  begin perform public.edit_ask(v_hh, v_ask, array[v_i[8]], array[v_i[8]]); raise exception '087 fixture (8): overlap accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.edit_ask(v_hh, v_ask, array[v_i[8], null]); raise exception '087 fixture (9): a null accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.edit_ask(v_hh, v_ask, array[v_i[8], v_i[8]]); raise exception '087 fixture (10): a duplicate accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.edit_ask(v_hh, v_ask, p_label => repeat('x', 17)); raise exception '087 fixture (11): a 17-character label accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.edit_ask(v_hh, v_ask, p_screen_style => 'fancy'); raise exception '087 fixture (12): a bad style accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.edit_ask(v_hh, v_ask, p_pick_target => 7::smallint); raise exception '087 fixture (13): a target of 7 accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.edit_ask(v_hh, v_ask, array[v_x]); raise exception '087 fixture (14): another household''s item accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;

  -- (15) An add deleted mid-edit (soft-deleted) → P0409; (16) hard-deleted (no row) → P0409.
  begin perform public.edit_ask(v_hh, v_ask, array[v_gone]); raise exception '087 fixture (15): a deleted add accepted';
  exception when sqlstate 'P0409' then v_ok := v_ok + 1; end;
  begin perform public.edit_ask(v_hh, v_ask, array[gen_random_uuid()]); raise exception '087 fixture (16): a missing add accepted';
  exception when sqlstate 'P0409' then v_ok := v_ok + 1; end;

  -- (17) V5: Explorer, target 2, 4 tiles. A removes two (2 left, still valid). B, from a stale sheet
  --      of 4, removes one more (3 in B's view, valid there) → 1 tile < target 2 → P0409, nothing changed.
  insert into public.asks (id, household_id, label, pick_target, screen_style, created_by) values (v_ask3, v_hh, 'Ezra', 2, 'simple', v_a);
  insert into public.ask_shelf_items (ask_id, catalog_item_id, position)
  values (v_ask3, v_i[8], 0), (v_ask3, v_i[9], 1), (v_ask3, v_i[10], 2), (v_ask3, v_i[11], 3);
  perform set_config('request.jwt.claims', v_ca, true);
  v_r := public.edit_ask(v_hh, v_ask3, '{}', array[v_i[8], v_i[9]]);
  perform set_config('request.jwt.claims', v_cb, true);
  begin perform public.edit_ask(v_hh, v_ask3, '{}', array[v_i[10]]); raise exception '087 fixture (17): V5 accepted';
  exception when sqlstate 'P0409' then null; end;
  if (select array_agg(catalog_item_id order by position) from public.ask_shelf_items where ask_id = v_ask3) <> array[v_i[10], v_i[11]] then
    raise exception '087 fixture (17): a P0409 left the shelf changed';
  end if;
  v_ok := v_ok + 1;

  -- (18) Explorer over 4 in the result → P0409; (19) every tile removed → P0409.
  begin perform public.edit_ask(v_hh, v_ask3, array[v_i[1], v_i[2], v_i[3]]); raise exception '087 fixture (18): Explorer over 4 accepted';
  exception when sqlstate 'P0409' then v_ok := v_ok + 1; end;
  begin perform public.edit_ask(v_hh, v_ask3, '{}', array[v_i[10], v_i[11]]); raise exception '087 fixture (19): an empty shelf accepted';
  exception when sqlstate 'P0409' then v_ok := v_ok + 1; end;

  -- (20) A dead tile (its catalog item soft-deleted) goes on any save.
  update public.catalog_items set deleted_at = now() where id = v_i[11];
  v_r := public.edit_ask(v_hh, v_ask3, array[v_i[12]]);
  if (select array_agg(catalog_item_id order by position) from public.ask_shelf_items where ask_id = v_ask3) <> array[v_i[10], v_i[12]] then
    raise exception '087 fixture (20): a dead tile survived a save';
  end if;
  v_ok := v_ok + 1;

  -- (21) An outsider → 42501; (22) a missing ask → P0002.
  perform set_config('request.jwt.claims', v_cc, true);
  begin perform public.edit_ask(v_hh, v_ask, array[v_i[8]]); raise exception '087 fixture (21): an outsider edited';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  perform set_config('request.jwt.claims', v_ca, true);
  begin perform public.edit_ask(v_hh, gen_random_uuid(), array[v_i[8]]); raise exception '087 fixture (22): a missing ask edited';
  exception when sqlstate 'P0002' then v_ok := v_ok + 1; end;

  -- ── land_ask_picks (B7) ──────────────────────────────────────────────────────────────────
  insert into public.asks (id, household_id, label, pick_target, created_by) values (v_ask4, v_hh, 'Esme', 1, v_a);
  insert into public.ask_shelf_items (ask_id, catalog_item_id, position) values (v_ask4, v_i[1], 0), (v_ask4, v_i[2], 1);

  -- (23) V9a: a pick off the shelf lands, labelled; more picks than the target are fine (3 vs 1).
  v_n := public.land_ask_picks(v_hh, v_ask4, array[v_i[1], v_i[7], v_i[8]]);
  if v_n <> 3 or (select picked_by_labels from public.list_items where household_id = v_hh and catalog_item_id = v_i[7]) is distinct from array['Esme'] then
    raise exception '087 fixture (23): off-shelf pick % ', v_n;
  end if;
  v_ok := v_ok + 1;

  -- (24) V9b: a hard-deleted pick (no row), a soft-deleted one and another household's are skipped;
  --      the live one lands. Returns 1.
  v_n := public.land_ask_picks(v_hh, v_ask4, array[gen_random_uuid(), v_gone, v_x, v_i[9]]);
  if v_n <> 1 or not exists (select 1 from public.list_items where household_id = v_hh and catalog_item_id = v_i[9] and deleted_at is null)
     or exists (select 1 from public.list_items where catalog_item_id in (v_gone, v_x) and household_id = v_hh) then
    raise exception '087 fixture (24): skip % ', v_n;
  end if;
  v_ok := v_ok + 1;

  -- (25) Every pick skipped → 0, nothing written.
  v_n := public.land_ask_picks(v_hh, v_ask4, array[v_gone, v_x]);
  if v_n <> 0 then raise exception '087 fixture (25): all skipped returned %', v_n; end if;
  v_ok := v_ok + 1;

  -- (26) A seed lands (where the database has one).
  if v_seed is not null then
    v_n := public.land_ask_picks(v_hh, v_ask4, array[v_seed]);
    if v_n <> 1 then raise exception '087 fixture (26): a seed pick returned %', v_n; end if;
  end if;
  v_ok := v_ok + 1;

  -- (27–30) 0 picks, 49 picks, a duplicate, a null → 22023.
  for v_n in 1..49 loop v_49 := v_49 || gen_random_uuid(); end loop;
  begin perform public.land_ask_picks(v_hh, v_ask4, '{}'::uuid[]); raise exception '087 fixture (27): 0 picks accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.land_ask_picks(v_hh, v_ask4, v_49); raise exception '087 fixture (28): 49 picks accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.land_ask_picks(v_hh, v_ask4, array[v_i[3], v_i[3]]); raise exception '087 fixture (29): a duplicate accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.land_ask_picks(v_hh, v_ask4, array[v_i[3], null]); raise exception '087 fixture (30): a null accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;

  -- ── As authenticated: EXECUTE, deleted_by (V10), and no write to deleted_by ────────────────
  -- (31) edit_ask and land_ask_picks run as authenticated.
  execute 'set local role authenticated';
  if current_user <> 'authenticated' then raise exception '087 fixture: not running as authenticated'; end if;
  perform set_config('request.jwt.claims', v_cb, true);
  v_r := public.edit_ask(v_hh, v_ask, array[v_i[8]]);
  v_n := public.land_ask_picks(v_hh, v_ask4, array[v_i[10]]);
  execute 'reset role';
  if v_n <> 1 or not exists (select 1 from public.ask_shelf_items where ask_id = v_ask and catalog_item_id = v_i[8]) then
    raise exception '087 fixture (31): authenticated calls % %', v_r, v_n;
  end if;
  v_ok := v_ok + 1;

  -- (32) V10: B deletes Everett the client's way (a plain column update) → deleted_by = B.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', v_cb, true);
  update public.asks set deleted_at = now(), updated_at = now() where id = v_ask2 and household_id = v_hh and deleted_at is null;
  execute 'reset role';
  if (select deleted_by from public.asks where id = v_ask2) is distinct from v_b then
    raise exception '087 fixture (32): deleted_by is %, want B', (select deleted_by from public.asks where id = v_ask2);
  end if;
  v_ok := v_ok + 1;

  -- (33) A later update of deleted_at on a deleted ask does not restamp (the WHEN is live → deleted).
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', v_ca, true);
  update public.asks set deleted_at = now(), updated_at = now() where id = v_ask2;
  execute 'reset role';
  if (select deleted_by from public.asks where id = v_ask2) is distinct from v_b then
    raise exception '087 fixture (33): a second delete restamped deleted_by';
  end if;
  v_ok := v_ok + 1;

  -- (34) A client can't write deleted_by.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', v_ca, true);
  begin update public.asks set deleted_by = v_a where id = v_ask2;
        execute 'reset role';
        raise exception '087 fixture (34): authenticated wrote deleted_by';
  exception when insufficient_privilege then v_ok := v_ok + 1; end;
  execute 'reset role';

  -- (35) anon can't call edit_ask.
  execute 'set local role anon';
  begin perform public.edit_ask(v_hh, v_ask, array[v_i[9]]);
        execute 'reset role';
        raise exception '087 fixture (35): anon called edit_ask';
  exception when insufficient_privilege then v_ok := v_ok + 1; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', '', true);
  raise warning '087 fixture: % checks passed (seed probe %)', v_ok, case when v_seed is null then 'skipped — no seed item' else 'run' end;
  if v_ok <> 35 then
    raise exception '087 fixture: % checks passed, want 35', v_ok;
  end if;
end
$fixture$;

rollback to savepoint fixture;

commit;

-- Which copy ran, in the Postgres log (log_min_messages = warning). Read-only.
do $which$
begin
  if to_regprocedure('public.edit_ask(uuid, uuid, uuid[], uuid[], text, text, text, smallint)') is not null then
    raise warning '087 COMMITTED — edit_ask present on %', (select system_identifier from pg_control_system());
  else
    raise warning '087 ROLLED BACK — parse check, nothing persisted on %', (select system_identifier from pg_control_system());
  end if;
end
$which$;

-- ═══ CLOSING VERIFY — one row (read-only; right after the commit) ═════════════════════════
-- Expected: copy 'committed' · edit_ask 1 · edit_ask_acl 'authenticated=EXECUTE' · land_acl
--   'authenticated=EXECUTE' · trigger_fn_acl '' · all secdef / search_path_empty true · deleted_by_col 1
--   · trigger_on true · client_can_write_deleted_by false · update_ask_md5 bda189ca… · bodies = the
--   "087 body" log lines · fixture_rows 0. Dev which_db 7642734024280108049; prod 7606130613603586966.
-- After the parse-check copy: copy 'rolled back' · edit_ask 0 · deleted_by_col 0 · fixture_rows 0.
with f as (
  select p.proname, p.prosecdef, p.proconfig = array['search_path=""'] as sp_empty, md5(replace(p.prosrc, E'\r', '')) as body,
         (select coalesce(string_agg(case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end || '=' || a.privilege_type, ',' order by 1), '')
            from aclexplode(p.proacl) a where a.grantee <> p.proowner) as acl
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('edit_ask', 'land_ask_picks', 'asks_stamp_deleted_by', 'update_ask')
)
select
  (select system_identifier from pg_control_system())::text                                   as which_db,
  case when exists (select 1 from f where proname = 'edit_ask') then 'committed' else 'rolled back' end as copy,
  (select count(*) from f where proname = 'edit_ask')                                         as edit_ask,
  (select acl from f where proname = 'edit_ask')                                              as edit_ask_acl,
  (select acl from f where proname = 'land_ask_picks')                                        as land_acl,
  (select acl from f where proname = 'asks_stamp_deleted_by')                                 as trigger_fn_acl,
  (select bool_and(prosecdef and sp_empty) from f where proname <> 'update_ask')              as secdef_and_sp_empty,
  (select body from f where proname = 'edit_ask')                                             as edit_ask_md5,
  (select body from f where proname = 'land_ask_picks')                                       as land_md5,
  (select body from f where proname = 'update_ask')                                           as update_ask_md5,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'asks' and column_name = 'deleted_by')     as deleted_by_col,
  exists (select 1 from pg_trigger where tgname = 'trg_asks_stamp_deleted_by' and tgenabled = 'O') as trigger_on,
  case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'asks' and column_name = 'deleted_by') = 1
       then has_column_privilege('authenticated', 'public.asks', 'deleted_by', 'UPDATE') end  as client_can_write_deleted_by,
  (select count(*) from public.users where clerk_id like '087-fixture-%')
  + (select count(*) from public.households where name like '087-fixture-%')                 as fixture_rows;

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '087_ask_shelf_deltas'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '087_ask_shelf_deltas');
