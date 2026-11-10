-- 083_ask_edit_and_short_shelves.sql
-- SPEC_ask_slice4.md (approved 2026-11-09), rulings S4-3, S4-4, S4-5; Step 0 #1, #4 and #5.
--
-- STEP 0 (read-only, dev 7642734024280108049, 2026-11-10 ~04:20 UTC):
--   * Ledger: 082 is the latest row (20261109030809); no 083 / 084 on disk. 071 is burned.
--   * Live bodies equal the files (prosrc, CR stripped): create_ask 4bed0754… = 078, land_ask_picks
--     778efba6… = 077. This file is built from those two bodies, changed only where marked "083".
--   * Ask Everett is NOT short on the server: 4 live global items (Apples, Bananas, Bread,
--     Broccoli), target 3. One member has HIDDEN Bread and Broccoli (user_hidden_items), and the
--     client's tiles come from catalogMap, which drops the runner's hidden items, so that phone saw
--     2 tiles. server_short = 0 across dev; no simple ask has more than 4 shelf rows.
--   * Client writes to asks / ask_shelf_items: none (useProvisions only reads asks).
--
-- THE LIVE-TILE RULE (Step 0 #1, one rule, both sides): a shelf tile is LIVE when its catalog row
--   has deleted_at is null and is global or the ask's household's own. Per-person Hide never
--   narrows a shelf (a shelf is the household's, like Staples never narrowing one, K4). The
--   effective target is least(pick_target, live tiles). Server sites: create_ask and update_ask
--   (what may go on a shelf), land_ask_picks (what may be picked, and how many). Client sites
--   (Slice 4 build): liveTiles / effectiveTarget in src/lib/askRun.js, read by askBlocks (Browse
--   blocks + runItems), AskRun, the Browse header note, the Manage row and the edit prefill.
--
-- WHAT — one transaction, a VERIFY DO block, a definer-run fixture inside a savepoint that is
--   rolled back, `commit;`, a post-transaction log line, then the closing VERIFY SELECT.
--   §1 create_ask: 078's body plus ONE check (S4-4): screen_style 'simple' ⇒ at most 4 items,
--      else 22023. Signature, grants and every other line unchanged.
--   §2 update_ask(p_household_id, p_ask_id, p_label, p_shelf_noun, p_screen_style, p_pick_target,
--      p_catalog_item_ids) returns uuid (S4-3). create_ask's posture. In order:
--        1 membership (is_member_of), else 42501; no user for the JWT subject, 42501
--        2 create_ask's advisory lock ('create_ask:' || household), so an edit and a create in one
--          household decide K2 one at a time
--        3 the ask live in this household, row-locked, else P0002. Any member edits any ask (A10).
--          Two editors queue on the row lock; the later form wins whole (last write wins)
--        4 create_ask's checks: label 1–16 (trimmed); K2 against the OTHER live asks → 23505;
--          noun ≤ 16 ('' → null); style standard | simple; 1–48 items, one-dimensional, no null,
--          no duplicate, each live in this household; target 1–6 and ≤ items; simple ⇒ ≤ 4 items
--        5 update the ask (label, noun, style, target, updated_at = now()); delete the shelf rows
--          not in the new list (dead tiles included); upsert the rest at position = array order − 1
--   §3 land_ask_picks: 077's body with the EFFECTIVE target (S4-5): least(pick_target, live
--      tiles), by the rule above. 0 live tiles → 22023 (the ask can't run). Nothing else changes.
--   §4 update_ask is the only edit door (DEPARTURE D1 — not in the spec text; Dan's yes needed).
--      Revoke from authenticated: UPDATE (label, shelf_noun, screen_style, pick_target) on asks;
--      INSERT, DELETE and UPDATE (position) on ask_shelf_items. Without this, S4-4's server cap
--      is advisory: a member could add a 5th row to an Explorer shelf, or set screen_style /
--      pick_target, straight through PostgREST. KEPT: UPDATE (deleted_at, updated_at) on asks, so
--      Delete stays a plain update (Step 0 #4), and every SELECT. 077's policies stay (inert for
--      the revoked commands). Cut §4 and VERIFY checks 26–31 to ship 083 without D1.
--
-- DELETE (Step 0 #4): a plain `update asks set deleted_at = now(), updated_at = now()` by a member
--   passes 077's column grant and asks_update policy, and K2's index (partial on live asks) frees
--   the label. Fixture checks 30–33 prove it as authenticated. No delete_ask RPC.
--
-- NOT IN 083: the item-photos sweep (084); any change to the 077 tables' shape or policies; the
--   client (the Slice 4 build).
--
-- ERRORS: 42501 = not a member / no JWT user / a direct write 083 revoked; P0002 = no live ask in
--   this household; 23505 = another live ask has this label; 22023 = a bad label, noun, style,
--   target, item list, the Explorer cap, or (land) a pick count ≠ the effective target / no live
--   tiles. The client maps update_ask's 23505 / 22023 as create's.
-- GRANTS: update_ask revokes from public, anon and service_role and grants EXECUTE to
--   authenticated; create_ask and land_ask_picks keep theirs (restated). VERIFY reads them back
--   through aclexplode.
-- FIXTURE: AS THE OWNER inside `savepoint fixture` … `rollback to savepoint fixture`. Three
--   throw-away users (A creates, B a member who didn't, C an outsider), two households, six custom
--   items, a soft-deleted one, one in the other household, one live global item borrowed
--   read-only. Impersonates through request.jwt.claims (is_local = true); the grant probes run
--   under `set local role authenticated`. Nothing survives.
-- APPLY: dev (zxwtxjjmssykhqrghouf, 7642734024280108049) first, with fresh eyes, never after
--   midnight. PARSE CHECK = this file with `commit;` → `rollback;`, nothing else changed. Log
--   (warnings): "083 VERIFY: 32 checked, 0 mismatches", "083 bodies: …", "083 fixture: 40 checks
--   passed", then "083 COMMITTED — update_ask present" or "083 ROLLED BACK — parse check, nothing
--   persisted". Then the closing VERIFY on the same identifier and the ledger row by hand. Prod
--   (parpauldmbetptkmdwbd, 7606130613603586966) at Ask's promotion: 077 → 078 → 083 → 084 →
--   client. Idempotent (create or replace; revokes repeat). Run as postgres.
-- ROLLBACK: 083_rollback.sql — roll the client back first (the Slice 4 client calls update_ask).
-- DRAFTED 2026-11-09 (ET) by Claude Code. Parse check on dev 2026-11-10 04:32:53 UTC
--   (`supabase db query --linked -f`, the file with `commit;` → `rollback;`). Log: "083 VERIFY: 32
--   checked, 0 mismatches", "083 bodies: create_ask 0d820ae1… · update_ask bda189ca… ·
--   land_ask_picks 0defbd6e…" (= this file's bodies), "083 fixture: 40 checks passed", "083 ROLLED
--   BACK — parse check". Closing row: copy 'rolled back', mismatches 5 as expected. Read-back after:
--   no update_ask, bodies 4bed0754… / 778efba6…, grants as 078, ledger still 20261109030809, 0
--   fixture rows. 083_rollback.sql parse-checked the same way (04:36:18, "on 078's shape").
--   NOT APPLIED.

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '083: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '083: run as postgres — current_user is %', current_user;
  end if;
  if to_regprocedure('public.create_ask(uuid, uuid, text, text, text, smallint, uuid[])') is null
     or to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[])') is null
     or to_regclass('public.asks_household_label_live_uq') is null then
    raise exception '083: 078 is not on this database — apply 077 and 078 first';
  end if;
  -- The cap must hold for the asks already here, or update_ask could never save them.
  if exists (select 1 from public.asks a
              where a.deleted_at is null and a.screen_style = 'simple'
                and (select count(*) from public.ask_shelf_items s where s.ask_id = a.id) > 4) then
    raise exception '083: a live simple ask has more than 4 shelf items — fix it before the cap';
  end if;
end
$preflight$;

-- ═══ §1 create_ask: 078 + the Explorer cap (S4-4) ════════════════════════════════════════
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
  -- 083 (S4-4): the Explorer cap, on the server.
  if v_style = 'simple' and v_n > 4 then
    raise exception 'create_ask: a simple ask shows at most 4 items, % given', v_n using errcode = '22023';
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
  '078 (K1, K2, D-a of 2026-11-06) + 083 (S4-4) — creates an ask and its shelf in one transaction. The client supplies the id: a retry with the same household and label returns it and writes nothing. 23505 = a live ask already has the label; 22023 = a bad field, item list, a target above the tile count, or a simple ask with more than 4 items; 42710 = the id is another ask.';
revoke all on function public.create_ask(uuid, uuid, text, text, text, smallint, uuid[]) from public;
revoke all on function public.create_ask(uuid, uuid, text, text, text, smallint, uuid[]) from anon;
revoke all on function public.create_ask(uuid, uuid, text, text, text, smallint, uuid[]) from service_role;
grant execute on function public.create_ask(uuid, uuid, text, text, text, smallint, uuid[]) to authenticated;

-- ═══ §2 update_ask (S4-3) ════════════════════════════════════════════════════════════════
create or replace function public.update_ask(
  p_household_id     uuid,
  p_ask_id           uuid,
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
  v_label  text := btrim(p_label);
  v_noun   text := nullif(btrim(p_shelf_noun), '');
  v_style  text := coalesce(p_screen_style, 'standard');
  v_n      integer := coalesce(cardinality(p_catalog_item_ids), 0);
begin
  -- Membership FIRST (051).
  if p_household_id is null or not public.is_member_of(p_household_id) then
    raise exception 'update_ask: not a member of household %', p_household_id using errcode = '42501';
  end if;
  if public.get_current_user_id() is null then
    raise exception 'update_ask: no user for the JWT subject' using errcode = '42501';
  end if;

  -- create_ask's lock: an edit and a create in one household decide K2 one at a time.
  perform pg_advisory_xact_lock(hashtext('create_ask:' || p_household_id::text));

  -- The ask, live, in this household. Any member edits any ask (A10, V9). The row lock queues a
  -- second editor; the later form wins whole (last write wins, S4-3).
  perform 1 from public.asks a
   where a.id = p_ask_id and a.household_id = p_household_id and a.deleted_at is null
     for update;
  if not found then
    raise exception 'update_ask: no live ask % in this household', p_ask_id using errcode = 'P0002';
  end if;

  if v_label is null or char_length(v_label) not between 1 and 16 then
    raise exception 'update_ask: a label is 1 to 16 characters' using errcode = '22023';
  end if;
  -- K2 against the OTHER live asks: keeping your own label (or changing its case) is not a clash.
  if exists (select 1 from public.asks a
              where a.household_id = p_household_id and a.deleted_at is null and a.id <> p_ask_id
                and lower(a.label) = lower(v_label)) then
    raise exception 'update_ask: a live ask in this household is already labelled %', v_label using errcode = '23505';
  end if;
  if v_noun is not null and char_length(v_noun) > 16 then
    raise exception 'update_ask: a shelf noun is at most 16 characters' using errcode = '22023';
  end if;
  if v_style not in ('standard', 'simple') then
    raise exception 'update_ask: screen style % is not standard or simple', v_style using errcode = '22023';
  end if;

  if v_n = 0 or v_n > 48 or array_ndims(p_catalog_item_ids) <> 1 then
    raise exception 'update_ask: a shelf holds 1 to 48 items, % given', v_n using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_catalog_item_ids) as x (id) where x.id is null) then
    raise exception 'update_ask: a null item' using errcode = '22023';
  end if;
  if (select count(distinct x.id) from unnest(p_catalog_item_ids) as x (id)) <> v_n then
    raise exception 'update_ask: a duplicate item' using errcode = '22023';
  end if;
  -- The live-tile rule: live, and global or this household's own.
  if exists (select 1 from unnest(p_catalog_item_ids) as x (id)
              where not exists (select 1 from public.catalog_items ci
                                 where ci.id = x.id and ci.deleted_at is null
                                   and (ci.is_global or ci.household_id = p_household_id))) then
    raise exception 'update_ask: an item is not live in this household' using errcode = '22023';
  end if;

  if p_pick_target is null or p_pick_target not between 1 and 6 then
    raise exception 'update_ask: a pick target is 1 to 6' using errcode = '22023';
  end if;
  if p_pick_target > v_n then
    raise exception 'update_ask: a target of % needs at least % tiles, % given', p_pick_target, p_pick_target, v_n using errcode = '22023';
  end if;
  -- The Explorer cap (S4-4).
  if v_style = 'simple' and v_n > 4 then
    raise exception 'update_ask: a simple ask shows at most 4 items, % given', v_n using errcode = '22023';
  end if;

  update public.asks
     set label = v_label, shelf_noun = v_noun, screen_style = v_style, pick_target = p_pick_target,
         updated_at = now()
   where id = p_ask_id;
  -- Replace the shelf: rows not in the new list go (dead tiles included), the rest take their new
  -- positions.
  delete from public.ask_shelf_items s
   where s.ask_id = p_ask_id and s.catalog_item_id <> all (p_catalog_item_ids);
  insert into public.ask_shelf_items (ask_id, catalog_item_id, position)
  select p_ask_id, x.id, (x.ord - 1)::smallint
    from unnest(p_catalog_item_ids) with ordinality as x (id, ord)
  on conflict (ask_id, catalog_item_id) do update set position = excluded.position;

  return p_ask_id;
end;
$function$;
comment on function public.update_ask(uuid, uuid, text, text, text, smallint, uuid[]) is
  '083 (S4-3, S4-4) — edits an ask and replaces its shelf in one transaction, with create_ask''s checks plus the Explorer cap. Any member; last write wins. 23505 = another live ask has the label; 22023 = a bad field or item list, a target above the tile count, or a simple ask with more than 4 items; P0002 = no live ask in this household.';
revoke all on function public.update_ask(uuid, uuid, text, text, text, smallint, uuid[]) from public;
revoke all on function public.update_ask(uuid, uuid, text, text, text, smallint, uuid[]) from anon;
revoke all on function public.update_ask(uuid, uuid, text, text, text, smallint, uuid[]) from service_role;
grant execute on function public.update_ask(uuid, uuid, text, text, text, smallint, uuid[]) to authenticated;

-- ═══ §3 land_ask_picks: 077 + the effective target (S4-5) ════════════════════════════════
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
  v_live    integer;
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

  -- 083 (S4-5): the EFFECTIVE target, least(pick_target, live tiles). A live tile is a shelf item
  -- whose catalog row is live and global or this household's own: the one rule the client's
  -- liveTiles also computes. Per-person Hide never narrows a shelf. 0 live tiles: can't run.
  select count(*) into v_live
    from public.ask_shelf_items s
    join public.catalog_items ci on ci.id = s.catalog_item_id
   where s.ask_id = p_ask_id and ci.deleted_at is null
     and (ci.is_global or ci.household_id = p_household_id);
  if v_live = 0 then
    raise exception 'land_ask_picks: ask % has no live tiles', p_ask_id using errcode = '22023';
  end if;
  v_target := least(v_target, v_live);

  v_n := coalesce(cardinality(p_catalog_item_ids), 0);
  if v_n <> v_target then
    raise exception 'land_ask_picks: % picks for an effective target of %', v_n, v_target using errcode = '22023';
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
  '077 (A16, A18–A22; R1, R2 of 2026-11-03) + 083 (S4-5) — lands one confirmed Ask in one transaction. The pick count must equal the effective target, least(pick_target, live tiles); a live tile is a shelf item whose catalog row is live and global or this household''s own. 0 live tiles → 22023. The label is read from asks, never sent. none → new row at 1; tombstone → revived at 1; live pending → +1, label appended once; live bought → the new need at 1, the meals'' contributions zeroed (048/049). No contributor row, no event. Returns the count landed.';
revoke all on function public.land_ask_picks(uuid, uuid, uuid[]) from public;
revoke all on function public.land_ask_picks(uuid, uuid, uuid[]) from anon;
revoke all on function public.land_ask_picks(uuid, uuid, uuid[]) from service_role;
grant execute on function public.land_ask_picks(uuid, uuid, uuid[]) to authenticated;

-- ═══ §4 update_ask is the only edit door (DEPARTURE D1) ══════════════════════════════════
revoke update (label, shelf_noun, screen_style, pick_target) on table public.asks from authenticated;
revoke insert, delete on table public.ask_shelf_items from authenticated;
revoke update (position) on table public.ask_shelf_items from authenticated;

notify pgrst, 'reload schema';

do $verify$
declare
  v_checked integer := 0;
  v_bad     text[] := array[]::text[];
  v_fn      oid;
  v_got     text;
  g         record;
  f         record;
begin
  -- (1–21) the three functions: present, definer, search_path '', and their grants per grantee.
  for f in select * from (values
      ('public.create_ask(uuid, uuid, text, text, text, smallint, uuid[])'),
      ('public.update_ask(uuid, uuid, text, text, text, smallint, uuid[])'),
      ('public.land_ask_picks(uuid, uuid, uuid[])')) t (sig) loop
    v_fn := to_regprocedure(f.sig);
    v_checked := v_checked + 1;
    if v_fn is null then v_bad := v_bad || (f.sig || ' MISSING'); end if;
    v_checked := v_checked + 1;
    if not coalesce((select prosecdef from pg_proc where oid = v_fn), false) then v_bad := v_bad || (f.sig || ' not definer'); end if;
    v_checked := v_checked + 1;
    if (select proconfig from pg_proc where oid = v_fn) is distinct from array['search_path=""'] then
      v_bad := v_bad || (f.sig || ' search_path');
    end if;
    for g in select * from (values ('PUBLIC', ''), ('anon', ''), ('authenticated', 'EXECUTE'), ('service_role', '')) t (grantee, want) loop
      v_checked := v_checked + 1;
      v_got := coalesce((select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                           from pg_proc p, aclexplode(p.proacl) a
                          where p.oid = v_fn
                            and a.grantee = case g.grantee when 'PUBLIC' then 0 else g.grantee::regrole::oid end), '');
      if v_got <> g.want then v_bad := v_bad || (f.sig || '/' || g.grantee || ' want [' || g.want || '] got [' || v_got || ']'); end if;
    end loop;
  end loop;
  -- (22–25) asks' table grants: unchanged since 078.
  for g in select * from (values ('PUBLIC', ''), ('anon', ''), ('authenticated', 'SELECT'), ('service_role', 'DELETE,INSERT,SELECT,UPDATE')) t (grantee, want) loop
    v_checked := v_checked + 1;
    v_got := coalesce((select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                         from pg_class c, aclexplode(c.relacl) a
                        where c.oid = 'public.asks'::regclass and a.privilege_type <> 'MAINTAIN'
                          and a.grantee = case g.grantee when 'PUBLIC' then 0 else g.grantee::regrole::oid end), '');
    if v_got <> g.want then v_bad := v_bad || ('asks/' || g.grantee || ' want [' || g.want || '] got [' || v_got || ']'); end if;
  end loop;
  -- (26) D1: authenticated keeps column UPDATE on deleted_at and updated_at only.
  v_checked := v_checked + 1;
  v_got := coalesce((select string_agg(att.attname, ',' order by att.attname)
                       from pg_attribute att, aclexplode(att.attacl) a
                      where att.attrelid = 'public.asks'::regclass and a.grantee = 'authenticated'::regrole::oid
                        and a.privilege_type = 'UPDATE'), '');
  if v_got <> 'deleted_at,updated_at' then v_bad := v_bad || ('asks column UPDATE want [deleted_at,updated_at] got [' || v_got || ']'); end if;
  -- (27–30) D1: ask_shelf_items is read-only to authenticated.
  for g in select * from (values ('PUBLIC', ''), ('anon', ''), ('authenticated', 'SELECT'), ('service_role', 'DELETE,INSERT,SELECT,UPDATE')) t (grantee, want) loop
    v_checked := v_checked + 1;
    v_got := coalesce((select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                         from pg_class c, aclexplode(c.relacl) a
                        where c.oid = 'public.ask_shelf_items'::regclass and a.privilege_type <> 'MAINTAIN'
                          and a.grantee = case g.grantee when 'PUBLIC' then 0 else g.grantee::regrole::oid end), '');
    if v_got <> g.want then v_bad := v_bad || ('ask_shelf_items/' || g.grantee || ' want [' || g.want || '] got [' || v_got || ']'); end if;
  end loop;
  -- (31) D1: no column UPDATE left on ask_shelf_items for authenticated.
  v_checked := v_checked + 1;
  if (select count(*) from pg_attribute att, aclexplode(att.attacl) a
       where att.attrelid = 'public.ask_shelf_items'::regclass and a.grantee = 'authenticated'::regrole::oid
         and a.privilege_type = 'UPDATE') <> 0 then
    v_bad := v_bad || 'ask_shelf_items column UPDATE left';
  end if;
  -- (32) the cap holds for the data.
  v_checked := v_checked + 1;
  if exists (select 1 from public.asks a
              where a.deleted_at is null and a.screen_style = 'simple'
                and (select count(*) from public.ask_shelf_items s where s.ask_id = a.id) > 4) then
    v_bad := v_bad || 'a live simple ask over 4';
  end if;

  raise warning '083 VERIFY: % checked, % mismatches%', v_checked, cardinality(v_bad),
    case when cardinality(v_bad) > 0 then ' — ' || array_to_string(v_bad, '; ') else '' end;
  -- The bodies as stored (CR stripped), for the read-back after the real run.
  raise warning '083 bodies: create_ask % · update_ask % · land_ask_picks %',
    (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = 'public.create_ask(uuid, uuid, text, text, text, smallint, uuid[])'::regprocedure),
    (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.update_ask(uuid, uuid, text, text, text, smallint, uuid[])')),
    (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = 'public.land_ask_picks(uuid, uuid, uuid[])'::regprocedure);
  if cardinality(v_bad) > 0 or v_checked <> 32 then
    raise exception '083 VERIFY failed: %', array_to_string(v_bad, '; ');
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- FIXTURE — definer-run, inside a savepoint, rolled back. Probes the Explorer cap on both doors,
-- an edit by a member who didn't create the ask, every update_ask refusal, short and empty shelves
-- on land_ask_picks, an edit that drops dead tiles, the plain-update delete and its freed label,
-- and D1's revokes as authenticated. Nothing here survives.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
savepoint fixture;

do $fixture$
declare
  v_tag   text := '083-fixture-' || gen_random_uuid()::text;
  v_a     uuid; v_b uuid; v_c uuid;        -- A creates, B a member who didn't, C an outsider
  v_hh    uuid; v_hh2 uuid;
  v_i     uuid[] := array[]::uuid[];       -- i1..i6 live custom items of hh
  v_gone  uuid;                            -- a soft-deleted custom item of hh
  v_x     uuid;                            -- a custom item of hh2
  v_g     uuid;                            -- a live global item, borrowed read-only
  v_ev    uuid := gen_random_uuid();       -- Ask Ev (simple)
  v_e     uuid := gen_random_uuid();       -- Ask Easton
  v_nina  uuid := gen_random_uuid();       -- Ask Nina (the short shelf)
  v_id    uuid;
  v_r     public.asks%rowtype;
  v_n     integer;
  v_ok    integer := 0;
  v_ca    text; v_cb text; v_cc text;
begin
  select id into v_g from public.catalog_items where is_global and deleted_at is null order by id limit 1;
  if v_g is null then raise exception '083 fixture: no live global catalog item to borrow'; end if;

  insert into public.users (clerk_id, email, full_name) values (v_tag || '-a', v_tag || '-a@fixture.invalid', '083 Alpha') returning id into v_a;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-b', v_tag || '-b@fixture.invalid', '083 Bravo') returning id into v_b;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-c', v_tag || '-c@fixture.invalid', '083 Charlie') returning id into v_c;
  insert into public.households (name, created_by) values (v_tag, v_a) returning id into v_hh;
  insert into public.households (name, created_by) values (v_tag || '-other', v_c) returning id into v_hh2;
  insert into public.household_members (household_id, user_id) values (v_hh, v_a), (v_hh, v_b), (v_hh2, v_c);
  for v_n in 1..6 loop
    insert into public.catalog_items (name, category, is_global, household_id, created_by)
    values (v_tag || '-item-' || v_n, 'Snacks', false, v_hh, v_a) returning id into v_id;
    v_i := v_i || v_id;
  end loop;
  insert into public.catalog_items (name, category, is_global, household_id, created_by, deleted_at)
  values (v_tag || '-gone', 'Snacks', false, v_hh, v_a, now()) returning id into v_gone;
  insert into public.catalog_items (name, category, is_global, household_id, created_by)
  values (v_tag || '-foreign', 'Snacks', false, v_hh2, v_c) returning id into v_x;

  v_ca := json_build_object('sub', v_tag || '-a', 'role', 'authenticated')::text;
  v_cb := json_build_object('sub', v_tag || '-b', 'role', 'authenticated')::text;
  v_cc := json_build_object('sub', v_tag || '-c', 'role', 'authenticated')::text;
  perform set_config('request.jwt.claims', v_ca, true);
  if public.get_current_user_id() is distinct from v_a then raise exception '083 fixture: impersonation failed'; end if;

  -- (1–3) The cap on create: 5 on simple refused, 4 on simple and 4 on standard made.
  begin perform public.create_ask(gen_random_uuid(), v_hh, 'Five', null, 'simple', 1::smallint, array[v_i[1], v_i[2], v_i[3], v_i[4], v_i[5]]);
        raise exception '083 fixture (1): a simple ask with 5 items was created';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  if public.create_ask(v_ev, v_hh, 'Ev', null, 'simple', 1::smallint, array[v_i[1], v_i[2], v_i[3], v_i[4]]) is distinct from v_ev then
    raise exception '083 fixture (2): a simple ask with 4 items was not created';
  end if;
  v_ok := v_ok + 1;
  if public.create_ask(v_e, v_hh, 'Easton', 'snacks', 'standard', 3::smallint, array[v_i[1], v_i[2], v_i[3], v_g]) is distinct from v_e then
    raise exception '083 fixture (3): Ask Easton was not created';
  end if;
  v_ok := v_ok + 1;

  -- (4–5) B edits A's ask: new noun (blank → null), target, and shelf in a new order.
  perform set_config('request.jwt.claims', v_cb, true);
  if public.update_ask(v_hh, v_e, ' Easton ', '  ', 'standard', 2::smallint, array[v_i[3], v_i[1], v_i[5]]) is distinct from v_e then
    raise exception '083 fixture (4): update_ask did not return the ask';
  end if;
  v_ok := v_ok + 1;
  select * into v_r from public.asks where id = v_e;
  if v_r.label is distinct from 'Easton' or v_r.shelf_noun is not null or v_r.screen_style is distinct from 'standard'
     or v_r.pick_target is distinct from 2 or v_r.created_by is distinct from v_a or v_r.deleted_at is not null
     or (select array_agg(catalog_item_id order by position) from public.ask_shelf_items where ask_id = v_e)
          is distinct from array[v_i[3], v_i[1], v_i[5]]
     or (select array_agg(position order by position) from public.ask_shelf_items where ask_id = v_e)
          is distinct from array[0, 1, 2]::smallint[] then
    raise exception '083 fixture (5): the edit is % % % % %', v_r.label, v_r.shelf_noun, v_r.screen_style, v_r.pick_target, v_r.created_by;
  end if;
  v_ok := v_ok + 1;

  -- (6–7) K2: another live ask's label (any case) refused; its own label in a new case kept.
  begin perform public.update_ask(v_hh, v_e, 'EV', null, 'standard', 2::smallint, array[v_i[3], v_i[1], v_i[5]]);
        raise exception '083 fixture (6): Easton was renamed onto Ev';
  exception when sqlstate '23505' then v_ok := v_ok + 1; end;
  perform public.update_ask(v_hh, v_e, 'EASTON', null, 'standard', 2::smallint, array[v_i[3], v_i[1], v_i[5]]);
  if (select label from public.asks where id = v_e) is distinct from 'EASTON' then
    raise exception '083 fixture (7): an ask could not keep its own label in a new case';
  end if;
  v_ok := v_ok + 1;

  -- (8–19) Refusals.
  begin perform public.update_ask(v_hh, v_e, 'EASTON', null, 'simple', 2::smallint, array[v_i[1], v_i[2], v_i[3], v_i[4], v_i[5]]);
        raise exception '083 fixture (8): an edit made a simple ask of 5';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.update_ask(v_hh, v_e, 'EASTON', null, 'standard', 4::smallint, array[v_i[3], v_i[1], v_i[5]]);
        raise exception '083 fixture (9): target 4 with 3 tiles was saved';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.update_ask(v_hh, v_e, 'EASTON', null, 'standard', 1::smallint, array[v_i[1], v_x]);
        raise exception '083 fixture (10): another household''s item went on a shelf';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.update_ask(v_hh, v_e, 'EASTON', null, 'standard', 1::smallint, array[v_i[1], v_gone]);
        raise exception '083 fixture (11): a deleted item went on a shelf';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.update_ask(v_hh, v_e, 'EASTON', null, 'standard', 1::smallint, array[]::uuid[]);
        raise exception '083 fixture (12): a shelf was emptied';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.update_ask(v_hh, v_e, 'EASTON', null, 'standard', 1::smallint, array[v_i[1], v_i[1]]);
        raise exception '083 fixture (13): a duplicate tile was saved';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.update_ask(v_hh, v_e, 'EASTON', null, 'standard', 1::smallint, array[v_i[1], null]);
        raise exception '083 fixture (14): a null tile was saved';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.update_ask(v_hh, v_e, '   ', null, 'standard', 1::smallint, array[v_i[1]]);
        raise exception '083 fixture (15): a blank label was saved';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.update_ask(v_hh, v_e, 'Seventeen chars!!', null, 'standard', 1::smallint, array[v_i[1]]);
        raise exception '083 fixture (16): a 17-character label was saved';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.update_ask(v_hh, v_e, 'EASTON', null, 'fancy', 1::smallint, array[v_i[1]]);
        raise exception '083 fixture (17): an unknown screen style was saved';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.update_ask(v_hh, v_e, 'EASTON', null, 'standard', 0::smallint, array[v_i[1]]);
        raise exception '083 fixture (18): a target of 0 was saved';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.update_ask(v_hh, v_e, 'EASTON', 'seventeen chars!!', 'standard', 1::smallint, array[v_i[1]]);
        raise exception '083 fixture (19): a 17-character noun was saved';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;

  -- (20–21) An outsider; a member of another household naming this ask.
  perform set_config('request.jwt.claims', v_cc, true);
  begin perform public.update_ask(v_hh, v_e, 'Taken', null, 'standard', 1::smallint, array[v_i[1]]);
        raise exception '083 fixture (20): an outsider edited an ask';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  begin perform public.update_ask(v_hh2, v_e, 'Taken', null, 'standard', 1::smallint, array[v_x]);
        raise exception '083 fixture (21): another household edited this ask';
  exception when sqlstate 'P0002' then v_ok := v_ok + 1; end;

  -- (22) None of the refused calls wrote.
  select * into v_r from public.asks where id = v_e;
  if v_r.label is distinct from 'EASTON' or v_r.pick_target is distinct from 2 or v_r.screen_style is distinct from 'standard'
     or (select array_agg(catalog_item_id order by position) from public.ask_shelf_items where ask_id = v_e)
          is distinct from array[v_i[3], v_i[1], v_i[5]] then
    raise exception '083 fixture (22): a refused call wrote';
  end if;
  v_ok := v_ok + 1;

  -- (23) A full shelf lands at its target, as before.
  perform set_config('request.jwt.claims', v_ca, true);
  v_n := public.land_ask_picks(v_hh, v_e, array[v_i[3], v_i[5]]);
  if v_n is distinct from 2 then raise exception '083 fixture (23): a full shelf landed %', v_n; end if;
  v_ok := v_ok + 1;

  -- (24–26) A short shelf: Nina, target 3, one of 3 tiles deleted → the effective target is 2.
  perform public.create_ask(v_nina, v_hh, 'Nina', null, 'standard', 3::smallint, array[v_i[4], v_i[6], v_i[2]]);
  update public.catalog_items set deleted_at = now() where id = v_i[2];
  v_n := public.land_ask_picks(v_hh, v_nina, array[v_i[4], v_i[6]]);
  if v_n is distinct from 2
     or (select count(*) from public.list_items
          where household_id = v_hh and deleted_at is null and 'Nina' = any (picked_by_labels)) <> 2 then
    raise exception '083 fixture (24): a 2-of-3 shelf did not land 2';
  end if;
  v_ok := v_ok + 1;
  begin perform public.land_ask_picks(v_hh, v_nina, array[v_i[4]]);
        raise exception '083 fixture (25): 1 pick landed on an effective target of 2';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.land_ask_picks(v_hh, v_nina, array[v_i[4], v_i[6], v_i[2]]);
        raise exception '083 fixture (26): 3 picks (one dead) landed on a 2-live shelf';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;

  -- (27–28) No live tiles: the ask can't run.
  update public.catalog_items set deleted_at = now() where id in (v_i[4], v_i[6]);
  begin perform public.land_ask_picks(v_hh, v_nina, array[]::uuid[]);
        raise exception '083 fixture (27): an empty confirm landed on a 0-live shelf';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.land_ask_picks(v_hh, v_nina, array[v_i[4]]);
        raise exception '083 fixture (28): a dead tile landed on a 0-live shelf';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;

  -- (29) An edit drops the dead tiles: the shelf is exactly the new list.
  perform public.update_ask(v_hh, v_nina, 'Nina', null, 'standard', 1::smallint, array[v_i[1]]);
  if (select array_agg(catalog_item_id order by position) from public.ask_shelf_items where ask_id = v_nina)
       is distinct from array[v_i[1]] then
    raise exception '083 fixture (29): an edit kept a dead tile';
  end if;
  v_ok := v_ok + 1;

  -- (30–40) As the authenticated role: the plain-update delete, the freed label, D1's revokes.
  execute 'set local role authenticated';
  if current_user <> 'authenticated' then raise exception '083 fixture: the grant probes are not running as authenticated'; end if;
  perform set_config('request.jwt.claims', v_cb, true);
  update public.asks set deleted_at = now(), updated_at = now() where id = v_e;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception '083 fixture (30): a member could not delete an ask (% rows)', v_n; end if;
  v_ok := v_ok + 1;
  v_id := public.create_ask(gen_random_uuid(), v_hh, 'Easton', null, 'standard', 1::smallint, array[v_i[1]]);
  if v_id is null or v_id = v_e then raise exception '083 fixture (31): a deleted ask''s label could not be reused'; end if;
  v_ok := v_ok + 1;
  begin perform public.land_ask_picks(v_hh, v_e, array[v_i[3]]);
        raise exception '083 fixture (32): a deleted ask landed picks';
  exception when sqlstate 'P0002' then v_ok := v_ok + 1; end;
  begin perform public.update_ask(v_hh, v_e, 'Back', null, 'standard', 1::smallint, array[v_i[1]]);
        raise exception '083 fixture (33): a deleted ask was edited';
  exception when sqlstate 'P0002' then v_ok := v_ok + 1; end;
  if public.update_ask(v_hh, v_ev, 'Ev', null, 'simple', 2::smallint, array[v_i[3], v_i[1]]) is distinct from v_ev then
    raise exception '083 fixture (34): authenticated could not call update_ask';
  end if;
  v_ok := v_ok + 1;
  begin update public.asks set label = 'Direct' where id = v_ev;
        raise exception '083 fixture (35): authenticated renamed an ask directly';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  begin update public.asks set screen_style = 'standard' where id = v_ev;
        raise exception '083 fixture (36): authenticated changed a style directly';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  begin insert into public.ask_shelf_items (ask_id, catalog_item_id, position) values (v_ev, v_i[5], 2);
        raise exception '083 fixture (37): authenticated added a tile directly';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  begin delete from public.ask_shelf_items where ask_id = v_ev;
        raise exception '083 fixture (38): authenticated removed tiles directly';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  begin update public.ask_shelf_items set position = 5 where ask_id = v_ev;
        raise exception '083 fixture (39): authenticated moved a tile directly';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  if (select count(*) from public.ask_shelf_items where ask_id = v_ev) <> 2 then
    raise exception '083 fixture (40): authenticated cannot read the shelf';
  end if;
  v_ok := v_ok + 1;
  execute 'reset role';

  perform set_config('request.jwt.claims', '', true);
  raise warning '083 fixture: % checks passed', v_ok;
  if v_ok <> 40 then raise exception '083 fixture: % checks passed, want 40', v_ok; end if;
end
$fixture$;

rollback to savepoint fixture;

commit;

-- Which copy ran, in the Postgres log (log_min_messages = warning). Read-only.
do $which$
begin
  if to_regprocedure('public.update_ask(uuid, uuid, text, text, text, smallint, uuid[])') is not null then
    raise warning '083 COMMITTED — update_ask present on %', (select system_identifier from pg_control_system());
  else
    raise warning '083 ROLLED BACK — parse check, nothing persisted on %', (select system_identifier from pg_control_system());
  end if;
end
$which$;

-- ═══ CLOSING VERIFY (read-only; run on the same database right after the commit) ══════════
-- Expected after the real run, dev and prod alike (except which_db): copy 'committed' · checked 20 ·
--   mismatches 0 · mismatch_detail '' · definers 3 · search_paths_empty 3 · asks_update_cols
--   'deleted_at,updated_at' · shelf_update_cols 0 · simple_over_cap 0 · the three body md5s equal
--   the "083 bodies" log line · fixture_rows 0
-- After the parse-check copy: copy 'rolled back' · mismatches 5 (update_ask MISSING ×4,
--   ask_shelf_items / authenticated got [DELETE,INSERT,SELECT]) · definers 2 · search_paths_empty 2 ·
--   asks_update_cols all six · shelf_update_cols 1 · create_ask / land_ask_picks md5 4bed0754… /
--   778efba6… · update_ask_md5 null · fixture_rows 0.
with fn (sig) as (values
  ('public.create_ask(uuid, uuid, text, text, text, smallint, uuid[])'),
  ('public.update_ask(uuid, uuid, text, text, text, smallint, uuid[])'),
  ('public.land_ask_picks(uuid, uuid, uuid[])')
),
grantees (grantee, fn_want, tbl_want) as (values
  ('PUBLIC', '', ''), ('anon', '', ''), ('authenticated', 'EXECUTE', 'SELECT'), ('service_role', '', 'DELETE,INSERT,SELECT,UPDATE')
),
actual as (
  select fn.sig as obj, g.grantee, g.fn_want as want,
         coalesce((select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                     from pg_proc p, aclexplode(p.proacl) a
                    where p.oid = to_regprocedure(fn.sig)
                      and a.grantee = case g.grantee when 'PUBLIC' then 0 else g.grantee::regrole::oid end), '') as got,
         to_regprocedure(fn.sig) is not null as present
    from fn, grantees g
  union all
  select t.rel, g.grantee, g.tbl_want,
         coalesce((select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                     from pg_class c, aclexplode(c.relacl) a
                    where c.oid = t.rel::regclass and a.privilege_type <> 'MAINTAIN'
                      and a.grantee = case g.grantee when 'PUBLIC' then 0 else g.grantee::regrole::oid end), ''),
         true
    from (values ('public.asks'), ('public.ask_shelf_items')) t (rel), grantees g
)
select
  (select system_identifier from pg_control_system())::text                                       as which_db,
  case when to_regprocedure('public.update_ask(uuid, uuid, text, text, text, smallint, uuid[])') is not null
       then 'committed' else 'rolled back' end                                                     as copy,
  (select count(*) from actual)                                                                    as checked,
  (select count(*) from actual where got <> want or not present)                                   as mismatches,
  (select coalesce(string_agg(obj || '/' || grantee || ' want [' || want || '] got [' || got || ']'
                              || case when present then '' else ' MISSING' end, '; ' order by obj, grantee), '')
     from actual where got <> want or not present)                                                as mismatch_detail,
  (select count(*) from fn join pg_proc p on p.oid = to_regprocedure(fn.sig) where p.prosecdef)  as definers,
  (select count(*) from fn join pg_proc p on p.oid = to_regprocedure(fn.sig)
    where p.proconfig = array['search_path=""'])                                                  as search_paths_empty,
  (select coalesce(string_agg(att.attname, ',' order by att.attname), '')
     from pg_attribute att, aclexplode(att.attacl) a
    where att.attrelid = 'public.asks'::regclass and a.grantee = 'authenticated'::regrole::oid
      and a.privilege_type = 'UPDATE')                                                             as asks_update_cols,
  (select count(*) from pg_attribute att, aclexplode(att.attacl) a
    where att.attrelid = 'public.ask_shelf_items'::regclass and a.grantee = 'authenticated'::regrole::oid
      and a.privilege_type = 'UPDATE')                                                             as shelf_update_cols,
  (select count(*) from public.asks a where a.deleted_at is null and a.screen_style = 'simple'
      and (select count(*) from public.ask_shelf_items s where s.ask_id = a.id) > 4)              as simple_over_cap,
  (select md5(replace(prosrc, E'\r', '')) from pg_proc
    where oid = 'public.create_ask(uuid, uuid, text, text, text, smallint, uuid[])'::regprocedure) as create_ask_md5,
  (select md5(replace(prosrc, E'\r', '')) from pg_proc
    where oid = to_regprocedure('public.update_ask(uuid, uuid, text, text, text, smallint, uuid[])')) as update_ask_md5,
  (select md5(replace(prosrc, E'\r', '')) from pg_proc
    where oid = 'public.land_ask_picks(uuid, uuid, uuid[])'::regprocedure)                         as land_ask_picks_md5,
  (select count(*) from public.users where clerk_id like '083-fixture-%')
  + (select count(*) from public.households where name like '083-fixture-%')                      as fixture_rows;

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '083_ask_edit_and_short_shelves'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '083_ask_edit_and_short_shelves');
