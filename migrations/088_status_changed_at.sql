-- 088_status_changed_at.sql
-- SPEC_offline_checkoff_amendment_2026-11-23.md R1 (Dan, 2026-11-23): only check changes compete.
--
-- WHY
--   Offline check-off queues a check with its tap time and sends it later as a conditional update that
--   applies only if the row's CHECK hasn't changed since that tap. Step 0 (relay ccce278) found no
--   column that records that: updated_at is set by the RPCs (including qty-only changes, so a +1 would
--   cancel a queued check) and never by the client's check write (183 of 184 bought rows on dev carry
--   an updated_at older than their check). So: a column of its own, stamped by a trigger.
--
-- WHAT
--   §1 list_items.status_changed_at timestamptz not null default now(). Backfilled ONCE (only when this
--      file adds the column): the row's newest 'checked' / 'unchecked' event in list_item_events, else
--      updated_at, else created_at. (Event types confirmed on dev 2026-11-23: checked 1184, unchecked
--      311, added_in_store 31.) Precision barely matters: every tap the new client compares against it
--      is later than this apply, but the values are as true as the history allows.
--   §2 trg_list_items_status_changed_at, BEFORE UPDATE, FOR EACH ROW, when the status changes OR a
--      soft-deleted row comes back (deleted_at not null → null):
--        * the update set status_changed_at itself (NEW is distinct from OLD) → kept (a client's tap time);
--        * otherwise → now().
--      A qty / price / meal change doesn't fire it, so it never cancels a queued check (R1). Every server
--      path that changes status (085's re-need, land_ask_picks, the add_meal_to_list / insert_list_item
--      upserts, close_cycle's upsert) is stamped without touching its body, and so is a phone on older JS
--      that checks online without the column (Step 0's rollout caveat).
--      DEPARTURE from the amendment (Claude Code, 2026-11-23, in the relay report): the revive edge also
--      stamps. list_items is one row per (household, catalog item) for ever — a removed item that is added
--      back revives the SAME row id. Reviving a row that was deleted while pending changes no status, so
--      a status-only trigger would leave the old stamp, and an older queued check of that id would land on
--      the newer need. Stamping the revive makes the re-add the newer change.
--   FIRING ORDER (BEFORE UPDATE, same event → alphabetical by name): trg_list_items_picked_by_guard
--      (077; raises on a client adding picked_by_labels, changes nothing) → trg_list_items_resurrect (026/
--      077; on the revive edge: clears meal links, re-homes cycle_id, nulls picked_by_labels) →
--      trg_list_items_status_changed_at (088). 088 runs last and reads only status, deleted_at and its own
--      column, none of which the other two write. No conflict. Inserts take the default (no INSERT trigger).
--
-- GRANTS: none change. authenticated already has table-wide UPDATE on list_items under list_items_update
--   (is_member_of), so the client can write status_changed_at; anon has nothing. The trigger function is
--   SECURITY INVOKER (it only edits NEW) with search_path ''; EXECUTE revoked from public, anon,
--   authenticated, service_role (a trigger fires without it).
-- FIXTURE: as the owner inside `savepoint fixture` … `rollback to savepoint fixture`, 085/087's pattern.
--   Nothing survives.
-- APPLY: dev first through the CLI (`npx --no-install supabase db query --linked -f`), never the SQL editor
--   (CRLF). PARSE CHECK = this file with `commit;` → `rollback;`. Then the closing SELECT and the ledger
--   row (dev only). Prod: at promotion, BEFORE the client (the new client writes status_changed_at;
--   PostgREST refuses an unknown column). Idempotent (the backfill runs only with the add). Run as postgres.
-- ROLLBACK: 088_rollback.sql — revert the client FIRST.
-- DRAFTED 2026-11-23 (ET) by Claude Code (prompt cdc6965). PARSE CHECK on dev 2026-11-23 (`supabase db
--   query --linked -f`, `commit;` → `rollback;`): ran to the end, closing row 'rolled back', col 0,
--   trigger_on false, BEFORE UPDATE order unchanged, fixture_rows 0. A canary copy wanting 18 failed
--   "088 fixture: 17 checks passed, want 18" (every probe ran). Read back after: no column, no function,
--   no fixture users.
-- APPLIED on dev 2026-11-23 06:16 UTC by Claude Code through the CLI (Dan approved): committed; col 1, not
--   null, default now(); trigger on; BEFORE UPDATE order picked_by_guard → resurrect → status_changed_at;
--   function invoker, search_path "", ACL ''; authenticated may UPDATE the column, anon may not;
--   fixture_rows 0. Body (CR stripped = this file): list_items_stamp_status_changed_at
--   ac36b001fc182d8ba1b06c82522135fb. Backfill: 252 rows from an event, 202 from the fallback, 0
--   mismatched, of 454. Ledger 20261123061608 088_status_changed_at. 088_rollback.sql parse-checked
--   against the applied state (`commit;` → `rollback;`): its VERIFY passed, rolled back. NOT ON PROD.
-- ADDENDUM (2026-11-25): APPLIED on prod 2026-11-25 04:27 UTC by Claude Code through the CLI (Dan approved;
--   linked by ref parpauldmbetptkmdwbd, relinked to dev after): the fixture-free copy (this file minus the
--   FIXTURE block, a prod-only preflight), as 087. Committed; col 1, not null, default now(); trigger on;
--   BEFORE UPDATE order picked_by_guard → resurrect → status_changed_at; function invoker, search_path "",
--   ACL ''; body ac36b001fc182d8ba1b06c82522135fb (= dev); authenticated may write the column, anon may not;
--   backfill 260 rows from an event + 449 from the fallback = 709, 0 null; fixture_rows 0. Prod has no
--   ledger: applied = this read-back. Before 089, as O6 orders.

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '088: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '088: run as postgres — current_user is %', current_user;
  end if;
  if to_regprocedure('public.adjust_list_item_quantity(uuid, uuid, integer, numeric)') is null then
    raise exception '088: adjust_list_item_quantity missing — 085 is not on this database';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_list_items_resurrect' and tgrelid = 'public.list_items'::regclass)
     or not exists (select 1 from pg_trigger where tgname = 'trg_list_items_picked_by_guard' and tgrelid = 'public.list_items'::regclass) then
    raise exception '088: trg_list_items_resurrect / trg_list_items_picked_by_guard missing';
  end if;
end
$preflight$;

-- ═══ §1 the column + the one-time backfill ═══════════════════════════════════════════════════
do $column$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'list_items' and column_name = 'status_changed_at') then
    raise warning '088: status_changed_at already present — backfill skipped';
    return;
  end if;

  alter table public.list_items add column status_changed_at timestamptz not null default now();

  -- No trigger on this column yet (§2 comes after), and the two existing BEFORE UPDATE triggers don't
  -- fire for it: the guard passes as postgres, the resurrect WHEN needs a revive.
  update public.list_items li
     set status_changed_at = coalesce(
           (select max(e.created_at) from public.list_item_events e
             where e.list_item_id = li.id and e.event_type in ('checked', 'unchecked')),
           li.updated_at,
           li.created_at,
           li.status_changed_at);
end
$column$;

comment on column public.list_items.status_changed_at is
  '088: when the row''s check state (status) last changed, or the row was revived. A check write sets it to the tap time (the offline check-off conflict rule: applies only if status_changed_at < tap); any other status change or revive is stamped now() by trg_list_items_status_changed_at. Qty, price and meal changes never move it.';

-- ═══ §2 the trigger ══════════════════════════════════════════════════════════════════════════
create or replace function public.list_items_stamp_status_changed_at()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  -- Fires only on a status change or a revive (the trigger's WHEN). A value the update set itself is a
  -- tap time from the client: keep it. Otherwise this change is now.
  if new.status_changed_at is not distinct from old.status_changed_at then
    new.status_changed_at := now();
  end if;
  return new;
end;
$function$;

revoke all on function public.list_items_stamp_status_changed_at() from public, anon, authenticated, service_role;

drop trigger if exists trg_list_items_status_changed_at on public.list_items;
create trigger trg_list_items_status_changed_at
  before update on public.list_items
  for each row
  when (new.status is distinct from old.status
        or (old.deleted_at is not null and new.deleted_at is null))
  execute function public.list_items_stamp_status_changed_at();

do $verify$
declare
  v_order text;
begin
  if (select count(*) from public.list_items where status_changed_at is null) > 0 then
    raise exception '088 VERIFY: null status_changed_at';
  end if;
  select string_agg(tgname, ' → ' order by tgname) into v_order
    from pg_trigger where tgrelid = 'public.list_items'::regclass and not tgisinternal
     and (tgtype & 2) = 2 and (tgtype & 16) = 16;   -- BEFORE, UPDATE
  if v_order <> 'trg_list_items_picked_by_guard → trg_list_items_resurrect → trg_list_items_status_changed_at' then
    raise exception '088 VERIFY: BEFORE UPDATE order is %', v_order;
  end if;
  raise warning '088 VERIFY: BEFORE UPDATE order %', v_order;
  raise warning '088 body list_items_stamp_status_changed_at %',
    (select md5(replace(prosrc, E'\r', '')) from pg_proc where proname = 'list_items_stamp_status_changed_at' and pronamespace = 'public'::regnamespace);
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- FIXTURE — definer-run, inside a savepoint, rolled back. The amendment's five cases plus the revive
-- departure, the 085 / insert_list_item paths, and the grants. Nothing here survives.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
savepoint fixture;

do $fixture$
declare
  v_tag  text := '088-fixture-' || gen_random_uuid()::text;
  v_a    uuid; v_c uuid;                    -- A a member; C an outsider
  v_hh   uuid; v_hh2 uuid;
  v_i    uuid[] := array[]::uuid[];         -- i1..i5 live custom items of hh
  v_r    uuid[] := array[]::uuid[];         -- r1..r5 their list rows
  v_id   uuid;
  v_n    integer;
  v_ok   integer := 0;
  v_ca   text; v_cc text;
  v_old  timestamptz := '2001-01-01 00:00:00+00';
  v_t0   timestamptz := '2010-01-01 00:00:00+00';
  v_t1   timestamptz := '2020-01-01 00:00:00+00';
  v_at   timestamptz;
  v_st   text;
begin
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-a', v_tag || '-a@fixture.invalid', '088 Alpha') returning id into v_a;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-c', v_tag || '-c@fixture.invalid', '088 Charlie') returning id into v_c;
  insert into public.households (name, created_by) values (v_tag, v_a) returning id into v_hh;
  insert into public.households (name, created_by) values (v_tag || '-other', v_c) returning id into v_hh2;
  insert into public.household_members (household_id, user_id) values (v_hh, v_a), (v_hh2, v_c);
  for v_n in 1..5 loop
    insert into public.catalog_items (name, category, is_global, household_id, created_by)
    values (v_tag || '-item-' || v_n, 'Produce', false, v_hh, v_a) returning id into v_id;
    v_i := v_i || v_id;
  end loop;
  -- r1 pending · r2 bought · r3 bought + deleted · r4 pending + deleted · r5 pending
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by) values (v_hh, v_i[1], 1, 'pending', v_a) returning id into v_id; v_r := v_r || v_id;
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by) values (v_hh, v_i[2], 1, 'bought',  v_a) returning id into v_id; v_r := v_r || v_id;
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by, deleted_at) values (v_hh, v_i[3], 1, 'bought',  v_a, now()) returning id into v_id; v_r := v_r || v_id;
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by, deleted_at) values (v_hh, v_i[4], 1, 'pending', v_a, now()) returning id into v_id; v_r := v_r || v_id;
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by) values (v_hh, v_i[5], 1, 'pending', v_a) returning id into v_id; v_r := v_r || v_id;

  -- (1) An insert takes the default: now().
  if (select bool_and(status_changed_at = now()) from public.list_items where id = any (v_r)) is not true then
    raise exception '088 fixture (1): an insert did not take now()';
  end if;
  v_ok := v_ok + 1;

  -- (2) A column-only update (no status change, no revive) is kept as written: every row goes back to 2001.
  update public.list_items set status_changed_at = v_old where id = any (v_r);
  if (select bool_and(status_changed_at = v_old) from public.list_items where id = any (v_r)) is not true then
    raise exception '088 fixture (2): a column-only update was not kept';
  end if;
  v_ok := v_ok + 1;

  v_ca := json_build_object('sub', v_tag || '-a', 'role', 'authenticated')::text;
  v_cc := json_build_object('sub', v_tag || '-c', 'role', 'authenticated')::text;
  perform set_config('request.jwt.claims', v_ca, true);
  if public.get_current_user_id() is distinct from v_a then raise exception '088 fixture: impersonation failed'; end if;

  -- (3) The conflict rule, a tap newer than the stamp: 1 row, status bought, the CLIENT's tap time kept.
  execute 'set local role authenticated';
  update public.list_items set status = 'bought', status_changed_at = v_t1
   where id = v_r[1] and household_id = v_hh and deleted_at is null and status <> 'bought' and status_changed_at < v_t1;
  get diagnostics v_n = row_count;
  execute 'reset role';
  select status, status_changed_at into v_st, v_at from public.list_items where id = v_r[1];
  if v_n <> 1 or v_st <> 'bought' or v_at <> v_t1 then
    raise exception '088 fixture (3): rows %, status %, stamp % (want 1, bought, %)', v_n, v_st, v_at, v_t1;
  end if;
  v_ok := v_ok + 1;

  -- (4) A queued tap OLDER than the stamp (a newer change won): 0 rows, nothing moves.
  execute 'set local role authenticated';
  update public.list_items set status = 'pending', status_changed_at = v_t0
   where id = v_r[1] and household_id = v_hh and deleted_at is null and status <> 'pending' and status_changed_at < v_t0;
  get diagnostics v_n = row_count;
  execute 'reset role';
  select status, status_changed_at into v_st, v_at from public.list_items where id = v_r[1];
  if v_n <> 0 or v_st <> 'bought' or v_at <> v_t1 then
    raise exception '088 fixture (4): rows %, status %, stamp % (want 0, bought, %)', v_n, v_st, v_at, v_t1;
  end if;
  v_ok := v_ok + 1;

  -- (5) A status change WITHOUT the column (a phone on older JS, online): stamped now().
  execute 'set local role authenticated';
  update public.list_items set status = 'pending' where id = v_r[1] and household_id = v_hh and deleted_at is null and status <> 'pending';
  execute 'reset role';
  select status, status_changed_at into v_st, v_at from public.list_items where id = v_r[1];
  if v_st <> 'pending' or v_at <> now() then
    raise exception '088 fixture (5): status %, stamp % (want pending, now())', v_st, v_at;
  end if;
  v_ok := v_ok + 1;

  -- (6) …so a tap queued before it (2020) loses: 0 rows (V6 / the rollout caveat).
  execute 'set local role authenticated';
  update public.list_items set status = 'bought', status_changed_at = v_t1
   where id = v_r[1] and household_id = v_hh and deleted_at is null and status <> 'bought' and status_changed_at < v_t1;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n <> 0 or (select status from public.list_items where id = v_r[1]) <> 'pending' then
    raise exception '088 fixture (6): an older queued tap landed (rows %)', v_n;
  end if;
  v_ok := v_ok + 1;

  -- (7) A qty-only client update leaves the stamp (R1).
  update public.list_items set status_changed_at = v_old where id = v_r[1];
  execute 'set local role authenticated';
  update public.list_items set quantity = 5 where id = v_r[1];
  execute 'reset role';
  if (select status_changed_at from public.list_items where id = v_r[1]) <> v_old then
    raise exception '088 fixture (7): a qty-only update moved the stamp';
  end if;
  v_ok := v_ok + 1;

  -- (8) 085's qty-only path on a pending row (+1) leaves it too (R1: a bump never cancels a queued check).
  perform public.adjust_list_item_quantity(v_hh, v_i[1], 1, null);
  select quantity, status_changed_at into v_n, v_at from public.list_items where id = v_r[1];
  if v_n <> 6 or v_at <> v_old then
    raise exception '088 fixture (8): adjust +1 → qty %, stamp % (want 6, %)', v_n, v_at, v_old;
  end if;
  v_ok := v_ok + 1;

  -- (9) …and the R1 case end to end: a check queued at 2020 then lands over that bump: 1 row, bought, qty 6.
  execute 'set local role authenticated';
  update public.list_items set status = 'bought', status_changed_at = v_t1
   where id = v_r[1] and household_id = v_hh and deleted_at is null and status <> 'bought' and status_changed_at < v_t1;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n <> 1 or (select status from public.list_items where id = v_r[1]) <> 'bought' or (select quantity from public.list_items where id = v_r[1]) <> 6 then
    raise exception '088 fixture (9): R1 check over a bump (rows %)', v_n;
  end if;
  v_ok := v_ok + 1;

  -- (10) 085's re-need of a bought row (bought → pending): stamped now().
  perform public.adjust_list_item_quantity(v_hh, v_i[2], 1, null);
  select status, status_changed_at into v_st, v_at from public.list_items where id = v_r[2];
  if v_st <> 'pending' or v_at <> now() then
    raise exception '088 fixture (10): adjust re-need → status %, stamp %', v_st, v_at;
  end if;
  v_ok := v_ok + 1;

  -- (11) An upsert-revive of a deleted BOUGHT row (insert_list_item's ON CONFLICT): pending, stamped now().
  perform public.insert_list_item(v_hh, v_i[3], 1, 'pending', null, null, null);
  select status, status_changed_at into v_st, v_at from public.list_items where id = v_r[3];
  if v_st <> 'pending' or v_at <> now() or (select deleted_at from public.list_items where id = v_r[3]) is not null then
    raise exception '088 fixture (11): upsert-revive → status %, stamp %', v_st, v_at;
  end if;
  v_ok := v_ok + 1;

  -- (12) The departure: an upsert-revive of a deleted PENDING row (no status change) is stamped too.
  perform public.insert_list_item(v_hh, v_i[4], 1, 'pending', null, null, null);
  if (select status_changed_at from public.list_items where id = v_r[4]) <> now() then
    raise exception '088 fixture (12): a revive without a status change kept the old stamp';
  end if;
  v_ok := v_ok + 1;

  -- (13) …so an older queued check of that revived id loses: 0 rows.
  execute 'set local role authenticated';
  update public.list_items set status = 'bought', status_changed_at = v_t1
   where id = v_r[4] and household_id = v_hh and deleted_at is null and status <> 'bought' and status_changed_at < v_t1;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n <> 0 then raise exception '088 fixture (13): an older check landed on a revived row'; end if;
  v_ok := v_ok + 1;

  -- (14) A soft-delete (remove) doesn't stamp; the queued check of a deleted row matches nothing (V8).
  execute 'set local role authenticated';
  update public.list_items set deleted_at = now() where id = v_r[5];
  update public.list_items set status = 'bought', status_changed_at = v_t1
   where id = v_r[5] and household_id = v_hh and deleted_at is null and status <> 'bought' and status_changed_at < v_t1;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n <> 0 or (select status_changed_at from public.list_items where id = v_r[5]) <> v_old then
    raise exception '088 fixture (14): delete → rows %, stamp %', v_n, (select status_changed_at from public.list_items where id = v_r[5]);
  end if;
  v_ok := v_ok + 1;

  -- (15) An outsider's conditional update matches nothing (RLS).
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', v_cc, true);
  update public.list_items set status = 'pending', status_changed_at = now() + interval '1 day' where id = v_r[1];
  get diagnostics v_n = row_count;
  execute 'reset role';
  perform set_config('request.jwt.claims', v_ca, true);
  if v_n <> 0 then raise exception '088 fixture (15): an outsider updated a row'; end if;
  v_ok := v_ok + 1;

  -- (16) anon can't update list_items at all.
  execute 'set local role anon';
  begin update public.list_items set status_changed_at = now() where id = v_r[1];
        execute 'reset role';
        raise exception '088 fixture (16): anon updated list_items';
  exception when insufficient_privilege then v_ok := v_ok + 1; end;
  execute 'reset role';

  -- (17) authenticated may write the column (the client's tap time); anon may not.
  if not has_column_privilege('authenticated', 'public.list_items', 'status_changed_at', 'UPDATE')
     or has_column_privilege('anon', 'public.list_items', 'status_changed_at', 'UPDATE') then
    raise exception '088 fixture (17): column privileges are wrong';
  end if;
  v_ok := v_ok + 1;

  perform set_config('request.jwt.claims', '', true);
  raise warning '088 fixture: % checks passed', v_ok;
  if v_ok <> 17 then
    raise exception '088 fixture: % checks passed, want 17', v_ok;
  end if;
end
$fixture$;

rollback to savepoint fixture;

commit;

-- Which copy ran, in the Postgres log (log_min_messages = warning). Read-only.
do $which$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'list_items' and column_name = 'status_changed_at') then
    raise warning '088 COMMITTED — status_changed_at present on %', (select system_identifier from pg_control_system());
  else
    raise warning '088 ROLLED BACK — parse check, nothing persisted on %', (select system_identifier from pg_control_system());
  end if;
end
$which$;

-- ═══ CLOSING VERIFY — one row (read-only; right after the commit) ═════════════════════════
-- Expected: copy 'committed' · col 1 · not_null true · col_default 'now()' · null_rows 0 · trigger_on true ·
--   before_update_order 'trg_list_items_picked_by_guard → trg_list_items_resurrect →
--   trg_list_items_status_changed_at' · fn_secdef false · fn_sp_empty true · fn_acl '' · fn_md5 = the
--   "088 body" log line · client_can_write true · anon_can_write false · from_events + fallback = rows ·
--   fixture_rows 0. Dev which_db 7642734024280108049; prod 7606130613603586966.
-- After the parse-check copy: copy 'rolled back' · col 0 · trigger_on false · fixture_rows 0.
with f as (
  select p.prosecdef, p.proconfig = array['search_path=""'] as sp_empty, md5(replace(p.prosrc, E'\r', '')) as body,
         (select coalesce(string_agg(case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end || '=' || a.privilege_type, ',' order by 1), '')
            from aclexplode(p.proacl) a where a.grantee <> p.proowner) as acl
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'list_items_stamp_status_changed_at'
), c as (
  select count(*) as n, bool_and(is_nullable = 'NO') as not_null, max(column_default) as dflt
    from information_schema.columns
   where table_schema = 'public' and table_name = 'list_items' and column_name = 'status_changed_at'
)
select
  (select system_identifier from pg_control_system())::text                                   as which_db,
  case when (select n from c) = 1 then 'committed' else 'rolled back' end                     as copy,
  (select n from c)                                                                           as col,
  (select not_null from c)                                                                    as not_null,
  (select dflt from c)                                                                        as col_default,
  exists (select 1 from pg_trigger where tgname = 'trg_list_items_status_changed_at' and tgenabled = 'O') as trigger_on,
  (select string_agg(tgname, ' → ' order by tgname) from pg_trigger
    where tgrelid = 'public.list_items'::regclass and not tgisinternal and (tgtype & 2) = 2 and (tgtype & 16) = 16) as before_update_order,
  (select prosecdef from f)                                                                   as fn_secdef,
  (select sp_empty from f)                                                                    as fn_sp_empty,
  (select acl from f)                                                                         as fn_acl,
  (select body from f)                                                                        as fn_md5,
  case when (select n from c) = 1 then has_column_privilege('authenticated', 'public.list_items', 'status_changed_at', 'UPDATE') end as client_can_write,
  case when (select n from c) = 1 then has_column_privilege('anon', 'public.list_items', 'status_changed_at', 'UPDATE') end          as anon_can_write,
  (select count(*) from public.list_items)                                                    as rows_total,
  (select count(*) from public.users where clerk_id like '088-fixture-%')
  + (select count(*) from public.households where name like '088-fixture-%')                 as fixture_rows;

-- Backfill read-back (after the real apply; read-only): rows stamped from an event vs from the fallback.
-- select count(*) filter (where li.status_changed_at = e.at) as from_events,
--        count(*) filter (where e.at is null)                as fallback
--   from public.list_items li
--   left join (select list_item_id, max(created_at) at from public.list_item_events
--               where event_type in ('checked', 'unchecked') group by 1) e on e.list_item_id = li.id;

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '088_status_changed_at'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '088_status_changed_at');
