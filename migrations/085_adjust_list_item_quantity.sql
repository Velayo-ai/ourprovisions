-- 085_adjust_list_item_quantity.sql
-- SPEC_qty_increment.md (design-final 2026-11-15; Q4–Q6 confirmed by Dan). Ask launch blocker 4.
--
-- WHY
--   Every manual quantity change is a read-modify-write split across the network: the phone reads 1,
--   adds 1 and writes `quantity = 2`. Anything that lands between the read and the write is lost —
--   an Ask pick (land_ask_picks: 1 → 2) under a manual + ends at 2, not 3. Three quick + taps can
--   also arrive out of order. land_ask_picks already applies +1 on the server under the household
--   lock; this function makes every manual and meal change do the same.
--
-- WHAT
--   adjust_list_item_quantity(p_household_id, p_catalog_item_id, p_delta, p_price_per_unit = null)
--     → json { list_item_id, quantity, status, outcome }
--   outcome ∈ inserted | revived | bumped | renewed | lowered | removed | absent
--   Keyed by (household, catalog item), like remove_list_item and land_ask_picks (Q1). p_delta is a
--   non-zero integer, |delta| ≤ 99 (Q2). Under the same advisory lock as insert_list_item,
--   add_meal_to_list and land_ask_picks:
--
--   row state            p_delta > 0                                p_delta < 0
--   none                 insert at delta → inserted                 no-op → absent
--   removed              revive at delta → revived                  no-op → absent
--   live, pending        quantity + delta → bumped                  quantity + delta; ≤ 0 removes → lowered | removed
--   live, not pending    the NEW NEED at delta (R1) → renewed       quantity + delta, status kept; ≤ 0 removes → lowered | removed
--
--   Contributors (Q6): on + the caller's quantity_added goes up by delta (reset to delta on renewed;
--   a revive starts the row's badges over, the 009 lesson). On − they are not touched; a removal
--   clears them as remove_list_item does. Other members' rows are never touched on a live row.
--   Removal (Q3) is remove_list_item itself, called in this transaction under the lock.
--   The meal ledger: + on a pending row leaves list_item_meals alone (R2); renewed zeroes
--   quantity_contributed (048/049); a revive's trg_list_items_resurrect deletes the links.
--
-- STEP 0 (2026-11-15, dev 7642734024280108049, read-only through `supabase db query --linked`):
--   live prosrc of insert_list_item (= 051), remove_list_item (= 077), land_ask_picks (= 083) and
--   list_items_resurrect_cleanup (= 077) byte-equal to the repo files this copies. The one-row
--   constraint is list_items_household_id_catalog_item_id_key UNIQUE (household_id,
--   catalog_item_id) (the baseline file's comment names it list_items_household_catalog_unique),
--   plus 020's partial uq_live_list_item. No CHECK on quantity (integer, nullable, default 1).
--   No 085 in migrations/ or the dev ledger (last 084, 20261110044836); the function is absent.
--
-- NOT HERE: land_ask_picks, add_meal_to_list, decrement_meal_from_list (already server-side and
--   locked; Q7 / Q8). No new table, so no table grants. No retry, no idempotency key (Q9).
-- ERRORS: 42501 = not a member / no JWT user; 22023 = a bad delta, or a catalog item that is
--   missing, deleted or another household's.
-- GRANTS: revoke from public, anon, service_role; EXECUTE to authenticated. VERIFY reads the ACL
--   back through aclexplode and wants exactly authenticated = EXECUTE besides the owner.
-- FIXTURE: AS THE OWNER inside `savepoint fixture` … `rollback to savepoint fixture`. Three
--   throw-away users (A, B members; C an outsider), two households, custom items, a soft-deleted
--   item, a meal. Impersonates through request.jwt.claims (is_local = true). The Ask probes (a pick
--   then a +; labels through bumped / lowered / removed) run only where land_ask_picks exists, so
--   the file applies on a database without 077 too. Grant probes under `set local role`.
-- APPLY: dev (zxwtxjjmssykhqrghouf, 7642734024280108049), with fresh eyes, never after midnight.
--   PARSE CHECK = this file with `commit;` → `rollback;`, nothing else changed. Log (warnings):
--   "085 VERIFY: … 0 mismatches", "085 body: adjust_list_item_quantity <md5>", "085 fixture: N
--   checks passed (Ask probes …)", then "085 COMMITTED — …" or "085 ROLLED BACK — parse check".
--   Then the closing VERIFY and the ledger row by hand. Prod (parpauldmbetptkmdwbd,
--   7606130613603586966) BEFORE the next dev → main merge of anything (SPEC §8): the client
--   change is not behind the Ask flag. Idempotent (create or replace; revokes repeat). Run as postgres.
-- ROLLBACK: 085_rollback.sql — revert the client FIRST (every manual + calls this function).
-- DRAFTED 2026-11-15 (ET) by Claude Code. Parse check on dev 2026-11-16 UTC (`supabase db query
--   --linked -f`, the file with `commit;` → `rollback;`): ran to the end; closing row copy 'rolled
--   back', fn_count 0, fixture_rows 0. A canary copy wanting 26 failed "085 fixture: 25 checks
--   passed, want 26" (all probes, Ask probes included, ran). Expected body md5 e1efdee7808c6765d76eb5b16af6cc74
--   (this file's text between the $function$ quotes). 085_rollback.sql parse-checked the same way.
--   Read-back after: no adjust_list_item_quantity, no 085 ledger row, 0 fixture users. NOT APPLIED.

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '085: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '085: run as postgres — current_user is %', current_user;
  end if;
  if to_regprocedure('public.remove_list_item(uuid, uuid)') is null
     or to_regprocedure('public.is_member_of(uuid)') is null
     or to_regprocedure('public.get_current_user_id()') is null then
    raise exception '085: remove_list_item / is_member_of / get_current_user_id missing — 051 is not on this database';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.list_items'::regclass and contype = 'u'
                    and pg_get_constraintdef(oid) = 'UNIQUE (household_id, catalog_item_id)') then
    raise exception '085: list_items has no UNIQUE (household_id, catalog_item_id) — the row identity this function relies on';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_list_items_resurrect'
                  and tgrelid = 'public.list_items'::regclass and not tgisinternal) then
    raise exception '085: trg_list_items_resurrect is missing — a revive would keep stale links';
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

-- ═══ VERIFY (inside the transaction; raises on any mismatch) ═══════════════════════════════
do $verify$
declare
  v_p       pg_proc%rowtype;
  v_bad     text[] := array[]::text[];
  v_checked integer := 0;
  v_got     text;
begin
  select * into v_p from pg_proc where oid = to_regprocedure('public.adjust_list_item_quantity(uuid, uuid, integer, numeric)');
  if v_p.oid is null then raise exception '085 VERIFY: adjust_list_item_quantity is missing'; end if;
  v_checked := v_checked + 1;
  if (select count(*) from pg_proc where proname = 'adjust_list_item_quantity' and pronamespace = 'public'::regnamespace) <> 1 then
    v_bad := v_bad || 'more than one adjust_list_item_quantity'::text;
  end if;
  v_checked := v_checked + 1;
  if not v_p.prosecdef then v_bad := v_bad || 'not security definer'::text; end if;
  v_checked := v_checked + 1;
  if v_p.proconfig is distinct from array['search_path=""'] then v_bad := v_bad || ('search_path ' || coalesce(v_p.proconfig::text, 'null')); end if;
  v_checked := v_checked + 1;
  if v_p.prorettype <> 'json'::regtype then v_bad := v_bad || 'returns not json'::text; end if;
  v_checked := v_checked + 1;
  select coalesce(string_agg(case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end || '=' || a.privilege_type, ',' order by 1), '')
    into v_got
    from aclexplode(v_p.proacl) a
   where a.grantee <> v_p.proowner;
  if v_got <> 'authenticated=EXECUTE' then v_bad := v_bad || ('ACL ' || v_got); end if;
  v_checked := v_checked + 1;
  raise warning '085 VERIFY: % checked, % mismatches%', v_checked, cardinality(v_bad),
    case when cardinality(v_bad) > 0 then ' — ' || array_to_string(v_bad, '; ') else '' end;
  raise warning '085 body: adjust_list_item_quantity %', md5(v_p.prosrc);
  if cardinality(v_bad) > 0 then raise exception '085 VERIFY failed'; end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- FIXTURE — definer-run, inside a savepoint, rolled back. Every cell of the §5.2 table, the
-- refusals, the meal ledger, the badges, the labels (Ask probes where 077 is present), and the
-- grants as authenticated / anon. Nothing here survives.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
savepoint fixture;

do $fixture$
declare
  v_tag   text := '085-fixture-' || gen_random_uuid()::text;
  v_a     uuid; v_b uuid; v_c uuid;        -- A and B members; C an outsider
  v_hh    uuid; v_hh2 uuid;
  v_i     uuid[] := array[]::uuid[];       -- i1..i8 live custom items of hh
  v_gone  uuid;                            -- a soft-deleted custom item of hh
  v_x     uuid;                            -- a custom item of hh2
  v_meal  uuid;
  v_id    uuid;
  v_ask   uuid := gen_random_uuid();
  v_r     json;
  v_li    public.list_items%rowtype;
  v_row   text;
  v_n     integer;
  v_ok    integer := 0;
  v_asks  boolean := to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[])') is not null;
  v_ca    text; v_cb text; v_cc text;
begin
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-a', v_tag || '-a@fixture.invalid', '085 Alpha') returning id into v_a;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-b', v_tag || '-b@fixture.invalid', '085 Bravo') returning id into v_b;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-c', v_tag || '-c@fixture.invalid', '085 Charlie') returning id into v_c;
  insert into public.households (name, created_by) values (v_tag, v_a) returning id into v_hh;
  insert into public.households (name, created_by) values (v_tag || '-other', v_c) returning id into v_hh2;
  insert into public.household_members (household_id, user_id) values (v_hh, v_a), (v_hh, v_b), (v_hh2, v_c);
  for v_n in 1..8 loop
    insert into public.catalog_items (name, category, is_global, household_id, created_by)
    values (v_tag || '-item-' || v_n, 'Produce', false, v_hh, v_a) returning id into v_id;
    v_i := v_i || v_id;
  end loop;
  insert into public.catalog_items (name, category, is_global, household_id, created_by, deleted_at)
  values (v_tag || '-gone', 'Produce', false, v_hh, v_a, now()) returning id into v_gone;
  insert into public.catalog_items (name, category, is_global, household_id, created_by)
  values (v_tag || '-foreign', 'Produce', false, v_hh2, v_c) returning id into v_x;
  insert into public.meals (household_id, name, created_by) values (v_hh, v_tag || '-meal', v_a) returning id into v_meal;

  v_ca := json_build_object('sub', v_tag || '-a', 'role', 'authenticated')::text;
  v_cb := json_build_object('sub', v_tag || '-b', 'role', 'authenticated')::text;
  v_cc := json_build_object('sub', v_tag || '-c', 'role', 'authenticated')::text;
  perform set_config('request.jwt.claims', v_ca, true);
  if public.get_current_user_id() is distinct from v_a then raise exception '085 fixture: impersonation failed'; end if;

  -- (1) none, +2 → inserted at 2, pending, on an open cycle, A's badge 2, the price kept.
  v_r := public.adjust_list_item_quantity(v_hh, v_i[1], 2, 2.50);
  select * into v_li from public.list_items where household_id = v_hh and catalog_item_id = v_i[1];
  if v_r->>'outcome' <> 'inserted' or (v_r->>'quantity')::int <> 2 or (v_r->>'list_item_id')::uuid <> v_li.id
     or v_li.quantity <> 2 or v_li.status <> 'pending' or v_li.added_by <> v_a or v_li.cycle_id is null
     or v_li.price_per_unit <> 2.50
     or (select quantity_added from public.list_item_contributors where list_item_id = v_li.id and user_id = v_a) <> 2 then
    raise exception '085 fixture (1): insert %', v_r;
  end if;
  v_ok := v_ok + 1;

  -- (2) live pending, +1 by B → bumped to 3; B's badge 1, A's untouched at 2.
  perform set_config('request.jwt.claims', v_cb, true);
  v_r := public.adjust_list_item_quantity(v_hh, v_i[1], 1);
  if v_r->>'outcome' <> 'bumped' or (v_r->>'quantity')::int <> 3
     or (select quantity from public.list_items where id = v_li.id) <> 3
     or (select quantity_added from public.list_item_contributors where list_item_id = v_li.id and user_id = v_b) <> 1
     or (select quantity_added from public.list_item_contributors where list_item_id = v_li.id and user_id = v_a) <> 2 then
    raise exception '085 fixture (2): bump %', v_r;
  end if;
  v_ok := v_ok + 1;

  -- (3) live pending, +2 by B again → B's badge goes UP by delta (1 + 2 = 3), not to the total.
  v_r := public.adjust_list_item_quantity(v_hh, v_i[1], 2);
  if (v_r->>'quantity')::int <> 5
     or (select quantity_added from public.list_item_contributors where list_item_id = v_li.id and user_id = v_b) <> 3 then
    raise exception '085 fixture (3): badge %', v_r;
  end if;
  v_ok := v_ok + 1;

  -- (4) live pending, −2 → lowered to 3; contributors untouched.
  v_r := public.adjust_list_item_quantity(v_hh, v_i[1], -2);
  if v_r->>'outcome' <> 'lowered' or (v_r->>'quantity')::int <> 3
     or (select quantity from public.list_items where id = v_li.id) <> 3
     or (select quantity_added from public.list_item_contributors where list_item_id = v_li.id and user_id = v_b) <> 3 then
    raise exception '085 fixture (4): lower %', v_r;
  end if;
  v_ok := v_ok + 1;

  -- (5) live pending, −3 → exactly 0 → removed; soft-deleted, badges cleared, quantity 0 + the id returned.
  v_r := public.adjust_list_item_quantity(v_hh, v_i[1], -3);
  select * into v_li from public.list_items where id = v_li.id;
  if v_r->>'outcome' <> 'removed' or (v_r->>'quantity')::int <> 0 or (v_r->>'list_item_id')::uuid <> v_li.id
     or v_li.deleted_at is null
     or exists (select 1 from public.list_item_contributors where list_item_id = v_li.id) then
    raise exception '085 fixture (5): remove at 0 %', v_r;
  end if;
  v_ok := v_ok + 1;

  -- (6) removed, −1 → absent, writes nothing.
  v_row := (select row_to_json(li)::text from public.list_items li where id = v_li.id);
  v_r := public.adjust_list_item_quantity(v_hh, v_i[1], -1);
  if v_r->>'outcome' <> 'absent' or v_r->>'list_item_id' is not null or v_r->>'quantity' is not null
     or (select row_to_json(li)::text from public.list_items li where id = v_li.id) <> v_row then
    raise exception '085 fixture (6): − on a removed row %', v_r;
  end if;
  v_ok := v_ok + 1;

  -- (7) none, −1 → absent, no row created.
  v_r := public.adjust_list_item_quantity(v_hh, v_i[2], -1);
  if v_r->>'outcome' <> 'absent' or exists (select 1 from public.list_items where household_id = v_hh and catalog_item_id = v_i[2]) then
    raise exception '085 fixture (7): − on no row %', v_r;
  end if;
  v_ok := v_ok + 1;

  -- (8) removed, +2 by A → revived at 2: pending, live, the same id, only A's badge at 2; a stale
  --     link is gone (trg_list_items_resurrect).
  insert into public.list_item_meals (list_item_id, meal_id, quantity_contributed) values (v_li.id, v_meal, 1);
  insert into public.list_item_contributors (list_item_id, user_id, quantity_added) values (v_li.id, v_b, 7);  -- a stale badge a non-RPC removal left
  perform set_config('request.jwt.claims', v_ca, true);
  v_r := public.adjust_list_item_quantity(v_hh, v_i[1], 2);
  select * into v_li from public.list_items where id = v_li.id;
  if v_r->>'outcome' <> 'revived' or (v_r->>'list_item_id')::uuid <> v_li.id or (v_r->>'quantity')::int <> 2
     or v_li.deleted_at is not null or v_li.status <> 'pending' or v_li.quantity <> 2 or v_li.cycle_id is null
     or exists (select 1 from public.list_item_meals where list_item_id = v_li.id)
     or (select string_agg(user_id::text || ':' || quantity_added, ',') from public.list_item_contributors where list_item_id = v_li.id)
        <> v_a::text || ':2' then
    raise exception '085 fixture (8): revive %', v_r;
  end if;
  v_ok := v_ok + 1;

  -- (9) live pending with a meal link (contributed 2 of 3), +1 → bumped to 4, the link unchanged (R2).
  v_r := public.adjust_list_item_quantity(v_hh, v_i[3], 3);
  v_li.id := (v_r->>'list_item_id')::uuid;
  insert into public.list_item_meals (list_item_id, meal_id, quantity_contributed) values (v_li.id, v_meal, 2);
  v_r := public.adjust_list_item_quantity(v_hh, v_i[3], 1);
  if v_r->>'outcome' <> 'bumped' or (v_r->>'quantity')::int <> 4
     or (select quantity_contributed from public.list_item_meals where list_item_id = v_li.id and meal_id = v_meal) <> 2 then
    raise exception '085 fixture (9): a + touched the meal ledger %', v_r;
  end if;
  v_ok := v_ok + 1;

  -- (10) live BOUGHT at 4, +1 by A → renewed: 1 to buy (never old + new), pending, checked_by null,
  --      on the open cycle, the meal's contribution zeroed, A's badge reset to 1, B's untouched.
  insert into public.list_item_contributors (list_item_id, user_id, quantity_added) values (v_li.id, v_b, 2);
  update public.list_items set status = 'bought', checked_by = v_b where id = v_li.id;
  v_r := public.adjust_list_item_quantity(v_hh, v_i[3], 1);
  select * into v_li from public.list_items where id = v_li.id;
  if v_r->>'outcome' <> 'renewed' or (v_r->>'quantity')::int <> 1
     or v_li.quantity <> 1 or v_li.status <> 'pending' or v_li.checked_by is not null
     or v_li.cycle_id is distinct from (select id from public.provision_cycles where household_id = v_hh and closed_at is null and deleted_at is null order by started_at desc limit 1)
     or (select quantity_contributed from public.list_item_meals where list_item_id = v_li.id and meal_id = v_meal) <> 0
     or (select quantity_added from public.list_item_contributors where list_item_id = v_li.id and user_id = v_a) <> 1
     or (select quantity_added from public.list_item_contributors where list_item_id = v_li.id and user_id = v_b) <> 2 then
    raise exception '085 fixture (10): new need %', v_r;
  end if;
  v_ok := v_ok + 1;

  -- (11) live BOUGHT at 3, −1 → lowered to 2 and STILL bought (Q5: fewer never un-buys).
  update public.list_items set quantity = 3, status = 'bought', checked_by = v_a where id = v_li.id;
  v_r := public.adjust_list_item_quantity(v_hh, v_i[3], -1);
  select * into v_li from public.list_items where id = v_li.id;
  if v_r->>'outcome' <> 'lowered' or (v_r->>'quantity')::int <> 2 or v_r->>'status' <> 'bought'
     or v_li.quantity <> 2 or v_li.status <> 'bought' or v_li.checked_by <> v_a then
    raise exception '085 fixture (11): − on bought %', v_r;
  end if;
  v_ok := v_ok + 1;

  -- (12) live BOUGHT at 2, −5 → below 0 → removed.
  v_r := public.adjust_list_item_quantity(v_hh, v_i[3], -5);
  if v_r->>'outcome' <> 'removed' or (v_r->>'quantity')::int <> 0
     or (select deleted_at from public.list_items where id = v_li.id) is null then
    raise exception '085 fixture (12): remove below 0 %', v_r;
  end if;
  v_ok := v_ok + 1;

  -- (13–17) Refusals: delta 0, 100, −100, null → 22023; another household's / a deleted item → 22023.
  begin perform public.adjust_list_item_quantity(v_hh, v_i[4], 0);
        raise exception '085 fixture (13): delta 0 accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.adjust_list_item_quantity(v_hh, v_i[4], 100);
        raise exception '085 fixture (14): delta 100 accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.adjust_list_item_quantity(v_hh, v_i[4], -100);
        raise exception '085 fixture (15): delta −100 accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.adjust_list_item_quantity(v_hh, v_x, 1);
        raise exception '085 fixture (16): another household''s item accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.adjust_list_item_quantity(v_hh, v_gone, 1);
        raise exception '085 fixture (17): a deleted item accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  -- 99 is allowed.
  v_r := public.adjust_list_item_quantity(v_hh, v_i[4], 99);
  if (v_r->>'quantity')::int <> 99 then raise exception '085 fixture (18): delta 99 %', v_r; end if;
  v_ok := v_ok + 1;

  -- (19) a non-member → 42501, nothing written.
  perform set_config('request.jwt.claims', v_cc, true);
  begin perform public.adjust_list_item_quantity(v_hh, v_i[5], 1);
        raise exception '085 fixture (19): an outsider changed a quantity';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  if exists (select 1 from public.list_items where household_id = v_hh and catalog_item_id = v_i[5]) then
    raise exception '085 fixture (19): an outsider''s call left a row';
  end if;
  perform set_config('request.jwt.claims', v_ca, true);

  -- (20–23) The Ask probes, where land_ask_picks exists (077 / 083).
  if v_asks then
    insert into public.asks (id, household_id, label, pick_target, created_by) values (v_ask, v_hh, 'Easton', 1, v_a);
    insert into public.ask_shelf_items (ask_id, catalog_item_id, position) values (v_ask, v_i[6], 0), (v_ask, v_i[7], 1);
    -- (20) at 1, a pick then a + → start + 2 = 3, labelled.
    perform public.adjust_list_item_quantity(v_hh, v_i[6], 1);
    perform public.land_ask_picks(v_hh, v_ask, array[v_i[6]]);
    v_r := public.adjust_list_item_quantity(v_hh, v_i[6], 1);
    select * into v_li from public.list_items where household_id = v_hh and catalog_item_id = v_i[6];
    if v_li.quantity <> 3 or v_li.picked_by_labels is distinct from array['Easton'] or v_r->>'outcome' <> 'bumped' then
      raise exception '085 fixture (20): pick then + is % %', v_li.quantity, v_li.picked_by_labels;
    end if;
    v_ok := v_ok + 1;
    -- (21) the label survives a lower.
    v_r := public.adjust_list_item_quantity(v_hh, v_i[6], -2);
    if (select picked_by_labels from public.list_items where id = v_li.id) is distinct from array['Easton'] or v_r->>'outcome' <> 'lowered' then
      raise exception '085 fixture (21): a lower dropped the label %', v_r;
    end if;
    v_ok := v_ok + 1;
    -- (22) the label dies with a removal.
    v_r := public.adjust_list_item_quantity(v_hh, v_i[6], -1);
    if (select picked_by_labels from public.list_items where id = v_li.id) is not null or v_r->>'outcome' <> 'removed' then
      raise exception '085 fixture (22): a removal kept the label %', v_r;
    end if;
    v_ok := v_ok + 1;
    -- (23) as authenticated: a + on a labelled row; the attribution guard doesn't fire (definer).
    perform public.land_ask_picks(v_hh, v_ask, array[v_i[7]]);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' then raise exception '085 fixture: not running as authenticated'; end if;
    perform set_config('request.jwt.claims', v_ca, true);
    v_r := public.adjust_list_item_quantity(v_hh, v_i[7], 1);
    execute 'reset role';
    if v_r->>'outcome' <> 'bumped' or (v_r->>'quantity')::int <> 2
       or (select picked_by_labels from public.list_items where household_id = v_hh and catalog_item_id = v_i[7]) is distinct from array['Easton'] then
      raise exception '085 fixture (23): authenticated + on a labelled row %', v_r;
    end if;
    v_ok := v_ok + 1;
  end if;

  -- (24) as authenticated: EXECUTE works.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', v_ca, true);
  v_r := public.adjust_list_item_quantity(v_hh, v_i[8], 1);
  execute 'reset role';
  if v_r->>'outcome' <> 'inserted' then raise exception '085 fixture (24): authenticated could not call it %', v_r; end if;
  v_ok := v_ok + 1;

  -- (25) as anon: no EXECUTE.
  execute 'set local role anon';
  begin perform public.adjust_list_item_quantity(v_hh, v_i[8], 1);
        execute 'reset role';
        raise exception '085 fixture (25): anon called it';
  exception when insufficient_privilege then v_ok := v_ok + 1; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', '', true);
  raise warning '085 fixture: % checks passed (Ask probes %)', v_ok, case when v_asks then 'run' else 'skipped — no land_ask_picks' end;
  if v_ok <> (case when v_asks then 25 else 21 end) then
    raise exception '085 fixture: % checks passed, want %', v_ok, case when v_asks then 25 else 21 end;
  end if;
end
$fixture$;

rollback to savepoint fixture;

commit;

-- Which copy ran, in the Postgres log (log_min_messages = warning). Read-only.
do $which$
begin
  if to_regprocedure('public.adjust_list_item_quantity(uuid, uuid, integer, numeric)') is not null then
    raise warning '085 COMMITTED — adjust_list_item_quantity present on %', (select system_identifier from pg_control_system());
  else
    raise warning '085 ROLLED BACK — parse check, nothing persisted on %', (select system_identifier from pg_control_system());
  end if;
end
$which$;

-- ═══ CLOSING VERIFY — one row (read-only; right after the commit) ═════════════════════════
-- Expected (dev): which_db 7642734024280108049 · copy 'committed' · fn_count 1 · secdef true ·
--   search_path_empty true · grantees 'authenticated=EXECUTE' · body_md5 = the "085 body" log line ·
--   fixture_rows 0. Prod: identical except which_db 7606130613603586966.
-- After the parse-check copy: copy 'rolled back' · fn_count 0 · the rest null · fixture_rows 0.
select
  (select system_identifier from pg_control_system())::text                              as which_db,
  case when p.oid is not null then 'committed' else 'rolled back' end                    as copy,
  (select count(*) from pg_proc where proname = 'adjust_list_item_quantity'
      and pronamespace = 'public'::regnamespace)                                         as fn_count,
  p.prosecdef                                                                            as secdef,
  p.proconfig = array['search_path=""']                                                  as search_path_empty,
  (select coalesce(string_agg(case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end
                              || '=' || a.privilege_type, ',' order by 1), '')
     from aclexplode(p.proacl) a where a.grantee <> p.proowner)                          as grantees,
  md5(p.prosrc)                                                                          as body_md5,
  (select count(*) from public.users where clerk_id like '085-fixture-%')
  + (select count(*) from public.households where name like '085-fixture-%')            as fixture_rows
from (select 1) one
left join pg_proc p on p.oid = to_regprocedure('public.adjust_list_item_quantity(uuid, uuid, integer, numeric)');

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '085_adjust_list_item_quantity'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '085_adjust_list_item_quantity');
