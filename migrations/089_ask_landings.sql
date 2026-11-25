-- 089_ask_landings.sql
-- SPEC_ask_offline.md "Migration 089" (design-ruled 2026-11-24; Step 0 relay 608fdd4; rulings A, B, C
-- agreed by Dan 2026-11-24 21:11).
--
-- WHY
--   Ask's send is going to queue off grid and replay later (O1–O3). A replay must land once (a weak signal
--   can commit the land and lose the reply), must land even if the ask was deleted while this phone was
--   off grid (O5), and the rows it (re)creates must carry the TAP time, or a check Paige tapped after the
--   pick loses to the replay under 088's `status_changed_at < tap` rule (Step 0 finding B).
--
-- WHAT
--   §1 public.ask_landings (run_id pk, household_id → households ON DELETE CASCADE, landed, created_at).
--      RLS on, no policies: only the definer function reads or writes it. Revoked from public, anon,
--      authenticated and service_role; service_role then gets SELECT/INSERT/UPDATE/DELETE (077's pattern;
--      no TRUNCATE). Indexed on (household_id, created_at) for the prune and the cascade.
--   §2 land_ask_picks: the 3-arg function (087, body 1376af1f…) is DROPPED and a 5-arg one created,
--      (p_household_id, p_ask_id, p_catalog_item_ids, p_run_id uuid default null,
--       p_tapped_at timestamptz default null). 087's body, plus:
--      * the household advisory lock moves UP, right after membership (087 took it after the input
--        checks), so the run-id check runs under it: a repeat of the same run waits for the first;
--      * O3: p_run_id already in ask_landings for THIS household → return its `landed`, do nothing else
--        (before the ask is even read, so a run that landed before its ask was deleted still answers);
--        held by another household → 22023. After landing, insert (run_id, household, count) and prune
--        this household's rows older than 30 days;
--      * A (O5, narrowed): a QUALIFYING REPLAY may land on a DELETED ask: p_run_id and p_tapped_at both
--        given, p_tapped_at within the last 7 days and at most 1 minute in the future, and the ask's
--        deleted_at > p_tapped_at − 5 minutes (C's grace for skew between the phone and the server). The
--        label is still read from the ask row. Nothing else is relaxed: 087 already dropped the target and
--        shelf checks. Any other call on a deleted ask is P0002, as in 087;
--      * B: whenever p_tapped_at is given, each row the landing INSERTS, REVIVES or turns into a NEW NEED
--        gets status_changed_at = least(p_tapped_at, now()). A +1 on a live pending row changes no status
--        and leaves it alone. HOW 088's trigger keeps it (088 lines 90, 105, 116–117): the insert has no
--        trigger (088: "Inserts take the default") and the explicit column beats the default now(); the
--        revive and the new need are UPDATEs that fire trg_list_items_status_changed_at (a revive edge /
--        a status change), and the trigger overwrites only when NEW.status_changed_at IS NOT DISTINCT FROM
--        OLD — the update sets it to the tap time, which differs from the old stamp, so it is kept. The one
--        case it isn't: an old stamp exactly equal to the tap time (to the microsecond); the trigger then
--        writes now(), which is 087's behaviour. Not reachable in practice. In the revive branch the stamp
--        is set in the FIRST update (the one that revives); the second (labels) fires no trigger.
--        DEPARTURE (Claude Code, in the relay report): least(…, now()), not the bare tap time. A phone whose
--        clock runs ahead would otherwise stamp a FUTURE time, and every check on that row from any phone
--        (`status_changed_at < tap`) would fail until the clock caught up.
--   §3 asks_stamp_deleted_by (087) also sets new.deleted_at := now() on the live → deleted edge (C): the
--      server's clock, never the deleting phone's. The trigger itself (087) is unchanged.
--
-- SQLSTATES: 42501 not a member / no JWT user · P0002 no live ask (or a deleted one without a qualifying
--   replay) · 22023 a bad input, or a run id held by another household.
-- COMPATIBILITY: the prod client calls with three NAMED args; PostgREST resolves them to the 5-arg function
--   through the defaults once the 3-arg one is gone. So 089 goes on prod BEFORE the new client (O6:
--   088 → 089 → client). Fixture (1) proves the named 3-arg call.
-- GRANTS: land_ask_picks: revoke from public, anon, service_role; EXECUTE to authenticated (087's ACL).
--   asks_stamp_deleted_by: create or replace keeps its ACL (none; a trigger fires without it), restated.
-- FIXTURE: as the owner inside `savepoint fixture` … `rollback to savepoint fixture`, 085/087/088's
--   pattern. Nothing survives; the closing SELECT reads fixture_rows back as 0.
-- APPLY: dev first through the CLI (`npx --no-install supabase db query --linked -f`), never the SQL
--   editor (CRLF). PARSE CHECK = this file with `commit;` → `rollback;`. Then the closing SELECT and the
--   ledger row (dev only). Prod at the promotion, after 088 and BEFORE the client. Run as postgres.
--   Idempotent: create table / index if not exists, drop function if exists, create or replace.
-- ROLLBACK: 089_rollback.sql. Revert the client FIRST (the new client sends p_run_id / p_tapped_at,
--   which the 3-arg function doesn't take).
-- DRAFTED 2026-11-24 (ET) by Claude Code (prompt 69ea55d). PARSE CHECK on dev 2026-11-25 UTC (`supabase db
--   query --linked -f`, `commit;` → `rollback;`): ran to the end, closing row 'rolled back', land_3arg 1,
--   land_5arg 0, landings_table 0, land_md5 1376af1f…, fixture_rows 0. A canary copy wanting 31 failed
--   "089 fixture: 30 checks passed, want 31" (every probe ran).
-- APPLIED on dev 2026-11-25 02:21 UTC (2026-11-24 21:21 ET) by Claude Code through the CLI, ref
--   zxwtxjjmssykhqrghouf: committed; land_3arg 0, land_5arg 1, 2 defaults, ACL authenticated=EXECUTE,
--   secdef + search_path ""; ask_landings RLS on, 0 policies, client grants '', service_role
--   DELETE,INSERT,SELECT,UPDATE; trigger on, its function ACL ''; edit_ask / update_ask unchanged;
--   fixture_rows 0. Bodies (CR stripped = this file): land_ask_picks 9d80b8abd9d784a9690b271d1b32c527,
--   asks_stamp_deleted_by 32ff20db0b8d72379820786717238828. Ledger 20261125022124 089_ask_landings. The
--   fixture re-run standalone against the committed state (begin … rollback): 30/30, cleanup 0.
--   089_rollback.sql parse-checked against the applied state (`commit;` → `rollback;`): its VERIFY passed
--   (land_ask_picks back to 1376af1f…, asks_stamp_deleted_by back to 50b66842…), rolled back. NOT ON PROD.
-- ADDENDUM (2026-11-25): APPLIED on prod 2026-11-25 04:34 UTC by Claude Code through the CLI (Dan approved;
--   after 088, before the client, O6), the fixture-free copy (this file minus the FIXTURE block, a prod-only
--   preflight), as 087. Committed; land_3arg 0, land_5arg 1, 2 defaults, ACL authenticated=EXECUTE, secdef +
--   search_path ""; land_ask_picks 9d80b8abd9d784a9690b271d1b32c527, asks_stamp_deleted_by
--   32ff20db0b8d72379820786717238828 (= dev); ask_landings RLS on, 0 policies, client grants '',
--   service_role DELETE,INSERT,SELECT,UPDATE; edit_ask / update_ask unchanged; fixture_rows 0. The live
--   client's call (main 54d453c: three named args) proven on prod in a rolled-back transaction with
--   throw-away rows: landed 1, labelled from the ask, no ask_landings row; 0 rows left, ask_landings 0.
--   Prod has no ledger: applied = this read-back.

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '089: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '089: run as postgres — current_user is %', current_user;
  end if;
  -- 087's land_ask_picks (by body), or 089's already (a re-run).
  if to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[], uuid, timestamp with time zone)') is null then
    if to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[])') is null then
      raise exception '089: land_ask_picks missing';
    end if;
    if (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[])'))
         <> '1376af1f060719ed42003b6faf08c662' then
      raise exception '089: land_ask_picks is not 087''s body (1376af1f…)';
    end if;
  end if;
  if to_regprocedure('public.asks_stamp_deleted_by()') is null
     or not exists (select 1 from pg_trigger where tgname = 'trg_asks_stamp_deleted_by' and tgrelid = 'public.asks'::regclass) then
    raise exception '089: asks_stamp_deleted_by / its trigger missing — 087 is not on this database';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'list_items' and column_name = 'status_changed_at')
     or not exists (select 1 from pg_trigger where tgname = 'trg_list_items_status_changed_at' and tgrelid = 'public.list_items'::regclass) then
    raise exception '089: list_items.status_changed_at / its trigger missing — 088 is not on this database';
  end if;
end
$preflight$;

-- ═══ §1 ask_landings (O3) ════════════════════════════════════════════════════════════════════
create table if not exists public.ask_landings (
  run_id       uuid        primary key,
  household_id uuid        not null references public.households(id) on delete cascade,
  landed       integer     not null check (landed between 0 and 48),
  created_at   timestamptz not null default now()
);
create index if not exists ask_landings_household_created_idx on public.ask_landings (household_id, created_at);
comment on table public.ask_landings is
  '089 (O3): one row per Ask run that landed with a run id: the count it landed, so a replay of the same run returns that count and lands nothing. Written and read only by land_ask_picks (security definer); RLS on with no policies; no client grant. Rows older than 30 days are pruned per household by land_ask_picks.';
alter table public.ask_landings enable row level security;
revoke all on table public.ask_landings from public;
revoke all on table public.ask_landings from anon;
revoke all on table public.ask_landings from authenticated;
revoke all on table public.ask_landings from service_role;
grant select, insert, update, delete on table public.ask_landings to service_role;

-- ═══ §2 land_ask_picks with a run id and a tap time ══════════════════════════════════════════
drop function if exists public.land_ask_picks(uuid, uuid, uuid[]);

create or replace function public.land_ask_picks(
  p_household_id     uuid,
  p_ask_id           uuid,
  p_catalog_item_ids uuid[],
  p_run_id           uuid        default null,
  p_tapped_at        timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller   uuid;
  v_label    text;
  v_deleted  timestamptz;
  v_n        integer;
  v_cycle    uuid;
  v_cid      uuid;
  v_id       uuid;
  v_status   text;
  v_tomb     boolean;
  v_count    integer := 0;
  v_prior_hh uuid;
  v_prior    integer;
  v_stamp    timestamptz;
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

  -- One writer per household at a time (insert_list_item / add_meal_to_list share this lock). 089: taken
  -- here, before the run-id check, so a repeat of the same run waits for the first and then sees its row.
  perform pg_advisory_xact_lock(hashtext(p_household_id::text));

  -- 089 (O3): a run that already landed answers with its first count and does nothing else.
  if p_run_id is not null then
    select l.household_id, l.landed into v_prior_hh, v_prior
      from public.ask_landings l
     where l.run_id = p_run_id;
    if found then
      if v_prior_hh <> p_household_id then
        raise exception 'land_ask_picks: that run id is already used' using errcode = '22023';
      end if;
      return v_prior;
    end if;
  end if;

  -- The label comes from the ask, never from the request (A22). 089 (O5, ruling A): a deleted ask lands
  -- only for a qualifying replay — a run id and a tap time, the tap within the last 7 days and at most a
  -- minute ahead, and the ask deleted after the tap (5 minutes' grace for clock skew; deleted_at is the
  -- server's clock since 089 §3).
  select a.label, a.deleted_at into v_label, v_deleted
    from public.asks a
   where a.id = p_ask_id and a.household_id = p_household_id;
  if v_label is not null and v_deleted is not null and not (
       p_run_id is not null and p_tapped_at is not null
       and p_tapped_at >= now() - interval '7 days'
       and p_tapped_at <= now() + interval '1 minute'
       and v_deleted > p_tapped_at - interval '5 minutes') then
    v_label := null;
  end if;
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

  -- 089 (ruling B): a replay's rows keep the tap time, never a future one. Null = 087's behaviour (now()).
  v_stamp := case when p_tapped_at is null then null else least(p_tapped_at, now()) end;

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
      -- None: a new row (A22: added_by = the member running the ask). 089 (B): no INSERT trigger, so the
      -- tap time written here is the stamp; without one, now() (the column's default).
      insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id, picked_by_labels, status_changed_at)
      values (p_household_id, v_cid, 1, 'pending', v_caller, v_cycle, array[v_label], coalesce(v_stamp, now()));

    elsif v_tomb then
      -- Tombstone: revive at 1. trg_list_items_resurrect fires on this UPDATE — links deleted,
      -- cycle re-homed, labels nulled — so the label is written in a second statement after it.
      -- 089 (B): the tap time goes in THIS update (the revive edge fires 088's trigger, which keeps a value
      -- the update set); coalesce to the old value = unchanged = the trigger stamps now(), as 087.
      update public.list_items
         set quantity = 1, status = 'pending', checked_by = null, added_by = v_caller,
             deleted_at = null, updated_at = now(),
             status_changed_at = coalesce(v_stamp, status_changed_at)
       where id = v_id;
      -- A revived row is a new need: no stale badge survives it (the 009 lesson).
      delete from public.list_item_contributors where list_item_id = v_id;
      update public.list_items set picked_by_labels = array[v_label] where id = v_id;

    elsif v_status = 'pending' then
      -- Live, pending: one more (A18), the label appended once (A19), kept at 8. The ledger is
      -- untouched — the manual +1's shape (Step 0 #1, R2). No status change: status_changed_at stays.
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
      -- 089 (B): a status change fires 088's trigger, which keeps the tap time set here.
      update public.list_items
         set quantity = 1, status = 'pending', checked_by = null, cycle_id = v_cycle,
             picked_by_labels = array[v_label], updated_at = now(),
             status_changed_at = coalesce(v_stamp, status_changed_at)
       where id = v_id;
      update public.list_item_meals set quantity_contributed = 0 where list_item_id = v_id;
    end if;

    v_count := v_count + 1;
  end loop;

  -- 089 (O3): record the run (under the lock, so no other call of this household can race it; another
  -- household inserting the same uuid at the same instant is a primary-key violation that rolls this
  -- land back), then prune this household's old runs.
  if p_run_id is not null then
    insert into public.ask_landings (run_id, household_id, landed) values (p_run_id, p_household_id, v_count);
    delete from public.ask_landings l
     where l.household_id = p_household_id and l.created_at < now() - interval '30 days';
  end if;

  -- No list_item_contributors row (A22), no list_item_events row (A21). The client compares this
  -- with the number of picks: fewer means some were skipped (B7's line).
  return v_count;
end;
$function$;
comment on function public.land_ask_picks(uuid, uuid, uuid[], uuid, timestamptz) is
  '077 (A16, A18–A22; R1, R2 of 2026-11-03) + 083 + 087 (B7) + 089 (O3, O5, rulings A/B) — lands one confirmed Ask in one transaction. 1 to 48 picks, no nulls or duplicates. A pick lands if its catalog item is live and global or this household''s own, on the shelf or not (FOR SHARE on the catalog row first); one that can''t is skipped and the rest land. The label is read from asks, never sent. none → new row at 1; tombstone → revived at 1; live pending → +1, label appended once; live bought → the new need at 1, the meals'' contributions zeroed (048/049). No contributor row, no event. Returns the number landed. 089: p_run_id already landed in this household → its first count, nothing else (another household''s → 22023); a deleted ask lands only for a qualifying replay (run id + tap within 7 days, ≤ 1 min ahead, ask deleted after tap − 5 min); with p_tapped_at, (re)created rows get status_changed_at = least(tap, now()).';
revoke all on function public.land_ask_picks(uuid, uuid, uuid[], uuid, timestamptz) from public;
revoke all on function public.land_ask_picks(uuid, uuid, uuid[], uuid, timestamptz) from anon;
revoke all on function public.land_ask_picks(uuid, uuid, uuid[], uuid, timestamptz) from service_role;
grant execute on function public.land_ask_picks(uuid, uuid, uuid[], uuid, timestamptz) to authenticated;

-- ═══ §3 the server stamps deleted_at (ruling C) ═══════════════════════════════════════════════
create or replace function public.asks_stamp_deleted_by()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Fires only on the live → deleted edge (the trigger's WHEN). Null when there is no JWT user.
  new.deleted_by := public.get_current_user_id();
  -- 089 (ruling C): the server's clock, never the deleting phone's. land_ask_picks compares it with a
  -- replay's tap time (O5).
  new.deleted_at := now();
  return new;
end;
$function$;
revoke all on function public.asks_stamp_deleted_by() from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

do $verify$
declare
  v_bad     text[] := array[]::text[];
  v_checked integer := 0;
  v_p       pg_proc%rowtype;
  v_got     text;
begin
  if to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[])') is not null then
    v_bad := v_bad || 'the 3-arg land_ask_picks survived'::text;
  end if;
  v_checked := v_checked + 1;
  select * into v_p from pg_proc where oid = to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[], uuid, timestamp with time zone)');
  if v_p.oid is null then raise exception '089 VERIFY: the 5-arg land_ask_picks is missing'; end if;
  v_checked := v_checked + 1;
  if (select count(*) from pg_proc where proname = 'land_ask_picks' and pronamespace = 'public'::regnamespace) <> 1 then
    v_bad := v_bad || 'land_ask_picks: more than one'::text;
  end if;
  v_checked := v_checked + 1;
  if not v_p.prosecdef then v_bad := v_bad || 'land_ask_picks: not security definer'::text; end if;
  v_checked := v_checked + 1;
  if v_p.proconfig is distinct from array['search_path=""'] then v_bad := v_bad || ('land_ask_picks: search_path ' || coalesce(v_p.proconfig::text, 'null')); end if;
  v_checked := v_checked + 1;
  if v_p.prorettype <> 'integer'::regtype then v_bad := v_bad || 'land_ask_picks: returns not integer'::text; end if;
  v_checked := v_checked + 1;
  if v_p.pronargdefaults <> 2 then v_bad := v_bad || ('land_ask_picks: ' || v_p.pronargdefaults || ' defaults, want 2'); end if;
  v_checked := v_checked + 1;
  select coalesce(string_agg(case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end || '=' || a.privilege_type, ',' order by 1), '')
    into v_got from aclexplode(v_p.proacl) a where a.grantee <> v_p.proowner;
  if v_got <> 'authenticated=EXECUTE' then v_bad := v_bad || ('land_ask_picks: ACL ' || v_got); end if;
  v_checked := v_checked + 1;

  -- ask_landings: RLS on, no policies; no client grant; service_role exactly D/I/S/U.
  if not (select relrowsecurity from pg_class where oid = 'public.ask_landings'::regclass) then
    v_bad := v_bad || 'ask_landings: RLS off'::text;
  end if;
  v_checked := v_checked + 1;
  if exists (select 1 from pg_policy where polrelid = 'public.ask_landings'::regclass) then
    v_bad := v_bad || 'ask_landings: has a policy'::text;
  end if;
  v_checked := v_checked + 1;
  select coalesce(string_agg(grantee || '=' || privilege_type, ',' order by grantee, privilege_type), '') into v_got
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'ask_landings' and grantee in ('PUBLIC', 'anon', 'authenticated');
  if v_got <> '' then v_bad := v_bad || ('ask_landings: client grants ' || v_got); end if;
  v_checked := v_checked + 1;
  select coalesce(string_agg(privilege_type, ',' order by privilege_type), '') into v_got
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'ask_landings' and grantee = 'service_role';
  if v_got <> 'DELETE,INSERT,SELECT,UPDATE' then v_bad := v_bad || ('ask_landings: service_role ' || v_got); end if;
  v_checked := v_checked + 1;

  -- The trigger: still on, still this function; the function has no grant.
  if not exists (select 1 from pg_trigger where tgname = 'trg_asks_stamp_deleted_by' and tgrelid = 'public.asks'::regclass
                  and not tgisinternal and tgenabled = 'O' and tgfoid = to_regprocedure('public.asks_stamp_deleted_by()')) then
    v_bad := v_bad || 'trg_asks_stamp_deleted_by missing or disabled'::text;
  end if;
  v_checked := v_checked + 1;
  if (select proacl from pg_proc where oid = to_regprocedure('public.asks_stamp_deleted_by()')) is not null
     and exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                  where p.oid = to_regprocedure('public.asks_stamp_deleted_by()') and a.grantee <> p.proowner) then
    v_bad := v_bad || 'asks_stamp_deleted_by has a grant'::text;
  end if;
  v_checked := v_checked + 1;

  -- Untouched by 089.
  if (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.edit_ask(uuid, uuid, uuid[], uuid[], text, text, text, smallint)')) <> '394667711aef89e05675cc681623e0d2' then
    v_bad := v_bad || 'edit_ask body changed'::text;
  end if;
  v_checked := v_checked + 1;
  if (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.update_ask(uuid, uuid, text, text, text, smallint, uuid[])')) <> 'bda189ca6f7c1b0af6a5dd26855ad4c8' then
    v_bad := v_bad || 'update_ask body changed'::text;
  end if;
  v_checked := v_checked + 1;
  if (select md5(replace(prosrc, E'\r', '')) from pg_proc where proname = 'list_items_stamp_status_changed_at' and pronamespace = 'public'::regnamespace) <> 'ac36b001fc182d8ba1b06c82522135fb' then
    v_bad := v_bad || '088''s list_items_stamp_status_changed_at body changed'::text;
  end if;
  v_checked := v_checked + 1;

  raise warning '089 body land_ask_picks %', md5(replace(v_p.prosrc, E'\r', ''));
  raise warning '089 body asks_stamp_deleted_by %',
    (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.asks_stamp_deleted_by()'));
  raise warning '089 VERIFY: % checked, % mismatches%', v_checked, cardinality(v_bad),
    case when cardinality(v_bad) > 0 then ' — ' || array_to_string(v_bad, '; ') else '' end;
  if cardinality(v_bad) > 0 then raise exception '089 VERIFY failed: %', array_to_string(v_bad, '; '); end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- FIXTURE — definer-run, inside a savepoint, rolled back. The prompt's six proofs (P1–P6) plus the
-- grants and the prune. Nothing here survives.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
savepoint fixture;

do $fixture$
declare
  v_tag   text := '089-fixture-' || gen_random_uuid()::text;
  v_a     uuid; v_b uuid; v_c uuid;        -- A and B members of hh; C a member of hh2 only
  v_hh    uuid; v_hh2 uuid;
  v_i     uuid[] := array[]::uuid[];       -- i1..i12 live custom items of hh
  v_gone  uuid;                            -- a soft-deleted custom item of hh
  v_x     uuid;                            -- a custom item of hh2
  v_id    uuid;
  v_ask   uuid := gen_random_uuid();       -- Easton (hh), deleted mid-fixture
  v_ask2  uuid := gen_random_uuid();       -- Everett (hh2)
  v_ask3  uuid := gen_random_uuid();       -- Esme (hh), live, for B
  v_dead  uuid := gen_random_uuid();       -- Nina (hh), deleted an hour ago
  v_run   uuid := gen_random_uuid();
  v_old1  uuid := gen_random_uuid();       -- a 31-day-old run of hh (pruned)
  v_old2  uuid := gen_random_uuid();       -- a 31-day-old run of hh2 (kept)
  v_n     integer;
  v_ok    integer := 0;
  v_ca    text; v_cb text; v_cc text;
  v_2001  timestamptz := '2001-01-01 00:00:00+00';
  v_t     timestamptz := now() - interval '20 minutes';
  v_r7 uuid; v_r8 uuid; v_r9 uuid;
  v_li    public.list_items%rowtype;
begin
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-a', v_tag || '-a@fixture.invalid', '089 Alpha') returning id into v_a;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-b', v_tag || '-b@fixture.invalid', '089 Bravo') returning id into v_b;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-c', v_tag || '-c@fixture.invalid', '089 Charlie') returning id into v_c;
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
  insert into public.asks (id, household_id, label, pick_target, created_by) values (v_ask2, v_hh2, 'Everett', 1, v_c);
  insert into public.asks (id, household_id, label, pick_target, created_by) values (v_ask3, v_hh, 'Esme', 1, v_a);
  -- An INSERT doesn't fire the update trigger, so this deleted_at stays an hour ago.
  insert into public.asks (id, household_id, label, pick_target, created_by, deleted_at) values (v_dead, v_hh, 'Nina', 1, v_a, now() - interval '1 hour');

  v_ca := json_build_object('sub', v_tag || '-a', 'role', 'authenticated')::text;
  v_cb := json_build_object('sub', v_tag || '-b', 'role', 'authenticated')::text;
  v_cc := json_build_object('sub', v_tag || '-c', 'role', 'authenticated')::text;
  perform set_config('request.jwt.claims', v_ca, true);
  if public.get_current_user_id() is distinct from v_a then raise exception '089 fixture: impersonation failed'; end if;

  -- ── P1: the prod client's shape — three NAMED args, as authenticated — still lands ─────────────
  -- (1) named, no run id: lands, labelled, no ask_landings row.
  execute 'set local role authenticated';
  v_n := public.land_ask_picks(p_household_id => v_hh, p_ask_id => v_ask, p_catalog_item_ids => array[v_i[1]]);
  execute 'reset role';
  select * into v_li from public.list_items where household_id = v_hh and catalog_item_id = v_i[1];
  if v_n <> 1 or v_li.quantity <> 1 or v_li.status <> 'pending' or v_li.picked_by_labels is distinct from array['Easton']
     or exists (select 1 from public.ask_landings where household_id = v_hh) then
    raise exception '089 fixture (1): named 3-arg call → % / qty % / % / %', v_n, v_li.quantity, v_li.status, v_li.picked_by_labels;
  end if;
  v_ok := v_ok + 1;
  -- (2) positional 3-arg too.
  v_n := public.land_ask_picks(v_hh, v_ask, array[v_i[2]]);
  if v_n <> 1 then raise exception '089 fixture (2): positional 3-arg call returned %', v_n; end if;
  v_ok := v_ok + 1;

  -- ── P2: the same run twice lands once ───────────────────────────────────────────────────────
  -- (3) first send, as authenticated (the definer writes ask_landings): i1 pending 1 → 2, i3 new at 1.
  execute 'set local role authenticated';
  v_n := public.land_ask_picks(v_hh, v_ask, array[v_i[1], v_i[3]], v_run);
  execute 'reset role';
  if v_n <> 2 then raise exception '089 fixture (3): first send returned %', v_n; end if;
  v_ok := v_ok + 1;
  -- (4) the replay (even with a different array) returns 2 and lands nothing: i1 still 2, i3 still 1, no i4.
  execute 'set local role authenticated';
  v_n := public.land_ask_picks(v_hh, v_ask, array[v_i[1], v_i[3], v_i[4]], v_run, now() - interval '1 minute');
  execute 'reset role';
  if v_n <> 2
     or (select quantity from public.list_items where household_id = v_hh and catalog_item_id = v_i[1]) <> 2
     or (select quantity from public.list_items where household_id = v_hh and catalog_item_id = v_i[3]) <> 1
     or exists (select 1 from public.list_items where household_id = v_hh and catalog_item_id = v_i[4]) then
    raise exception '089 fixture (4): the replay landed again (returned %)', v_n;
  end if;
  v_ok := v_ok + 1;
  -- (5) exactly one ask_landings row for the run, landed = 2, this household.
  if (select count(*) from public.ask_landings where run_id = v_run) <> 1
     or (select landed from public.ask_landings where run_id = v_run) <> 2
     or (select household_id from public.ask_landings where run_id = v_run) <> v_hh then
    raise exception '089 fixture (5): ask_landings for the run is wrong';
  end if;
  v_ok := v_ok + 1;

  -- ── P3: another household's run id → 22023, nothing lands ──────────────────────────────────
  -- (6)
  perform set_config('request.jwt.claims', v_cc, true);
  begin perform public.land_ask_picks(v_hh2, v_ask2, array[v_x], v_run);
        raise exception '089 fixture (6): another household''s run id accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  if exists (select 1 from public.list_items where household_id = v_hh2 and catalog_item_id = v_x) then
    raise exception '089 fixture (6): the refused call landed';
  end if;
  perform set_config('request.jwt.claims', v_ca, true);

  -- ── P6: the server stamps deleted_at ──────────────────────────────────────────────────────
  -- (7) B deletes Easton the client's way with a clock an hour behind: deleted_at = now(), deleted_by = B.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', v_cb, true);
  update public.asks set deleted_at = now() - interval '1 hour', updated_at = now() - interval '1 hour'
   where id = v_ask and household_id = v_hh and deleted_at is null;
  execute 'reset role';
  perform set_config('request.jwt.claims', v_ca, true);
  if (select deleted_at from public.asks where id = v_ask) <> now()
     or (select deleted_by from public.asks where id = v_ask) is distinct from v_b then
    raise exception '089 fixture (7): deleted_at %, deleted_by % (want now(), B)',
      (select deleted_at from public.asks where id = v_ask), (select deleted_by from public.asks where id = v_ask);
  end if;
  v_ok := v_ok + 1;
  -- (8) the WHEN is live → deleted only: a later write to deleted_at on a deleted ask is not restamped.
  update public.asks set deleted_at = now() - interval '2 hours' where id = v_ask;
  if (select deleted_at from public.asks where id = v_ask) <> now() - interval '2 hours' then
    raise exception '089 fixture (8): a deleted ask''s deleted_at was restamped';
  end if;
  update public.asks set deleted_at = now() where id = v_ask;   -- back to the server's stamp for P4
  v_ok := v_ok + 1;

  -- ── P4: a deleted ask ─────────────────────────────────────────────────────────────────────
  -- (9) a run that landed before the ask was deleted still answers with its count (the run-id check
  --     runs before the ask is read).
  v_n := public.land_ask_picks(v_hh, v_ask, array[v_i[1]], v_run, now() - interval '1 minute');
  if v_n <> 2 then raise exception '089 fixture (9): an earlier run on a now-deleted ask returned %', v_n; end if;
  v_ok := v_ok + 1;
  -- (10) a qualifying replay (tapped 10 min ago, deleted now) lands with the label, as authenticated.
  execute 'set local role authenticated';
  v_n := public.land_ask_picks(v_hh, v_ask, array[v_i[5]], gen_random_uuid(), now() - interval '10 minutes');
  execute 'reset role';
  if v_n <> 1 or (select picked_by_labels from public.list_items where household_id = v_hh and catalog_item_id = v_i[5]) is distinct from array['Easton'] then
    raise exception '089 fixture (10): a qualifying replay on a deleted ask → %', v_n;
  end if;
  v_ok := v_ok + 1;
  -- (11–13) not a replay → P0002: no run id and no tap; a run id without a tap; a tap without a run id.
  begin perform public.land_ask_picks(v_hh, v_ask, array[v_i[6]]); raise exception '089 fixture (11): a non-replay landed on a deleted ask';
  exception when sqlstate 'P0002' then v_ok := v_ok + 1; end;
  begin perform public.land_ask_picks(v_hh, v_ask, array[v_i[6]], gen_random_uuid()); raise exception '089 fixture (12): a run id without a tap landed on a deleted ask';
  exception when sqlstate 'P0002' then v_ok := v_ok + 1; end;
  begin perform public.land_ask_picks(v_hh, v_ask, array[v_i[6]], null, now() - interval '10 minutes'); raise exception '089 fixture (13): a tap without a run id landed on a deleted ask';
  exception when sqlstate 'P0002' then v_ok := v_ok + 1; end;
  -- (14) Nina was deleted an hour ago: a tap 30 min ago is more than 5 min after the delete → P0002.
  begin perform public.land_ask_picks(v_hh, v_dead, array[v_i[6]], gen_random_uuid(), now() - interval '30 minutes'); raise exception '089 fixture (14): a tap long after the delete landed';
  exception when sqlstate 'P0002' then v_ok := v_ok + 1; end;
  -- (15) …a tap 4 min after it (inside the 5 min grace) lands, labelled Nina.
  v_n := public.land_ask_picks(v_hh, v_dead, array[v_i[6]], gen_random_uuid(), now() - interval '1 hour' + interval '4 minutes');
  if v_n <> 1 or (select picked_by_labels from public.list_items where household_id = v_hh and catalog_item_id = v_i[6]) is distinct from array['Nina'] then
    raise exception '089 fixture (15): a tap inside the grace → %', v_n;
  end if;
  v_ok := v_ok + 1;
  -- (16) a tap older than 7 days → P0002; (17) a tap more than a minute ahead → P0002.
  begin perform public.land_ask_picks(v_hh, v_ask, array[v_i[11]], gen_random_uuid(), now() - interval '8 days'); raise exception '089 fixture (16): an 8-day-old tap landed on a deleted ask';
  exception when sqlstate 'P0002' then v_ok := v_ok + 1; end;
  begin perform public.land_ask_picks(v_hh, v_ask, array[v_i[11]], gen_random_uuid(), now() + interval '2 minutes'); raise exception '089 fixture (17): a future tap landed on a deleted ask';
  exception when sqlstate 'P0002' then v_ok := v_ok + 1; end;
  -- (18) another household's ask is still P0002, replay or not (C calls with hh2 on Easton's id).
  perform set_config('request.jwt.claims', v_cc, true);
  begin perform public.land_ask_picks(v_hh2, v_ask, array[v_x], gen_random_uuid(), now() - interval '10 minutes'); raise exception '089 fixture (18): another household''s ask landed';
  exception when sqlstate 'P0002' then v_ok := v_ok + 1; end;
  perform set_config('request.jwt.claims', v_ca, true);

  -- ── P5 (ruling B): (re)created rows carry the tap time ─────────────────────────────────────
  -- r7 a tombstone (pending, deleted), r8 bought, r9 pending; all stamped 2001. i10 has no row.
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by, deleted_at) values (v_hh, v_i[7], 2, 'pending', v_a, now()) returning id into v_r7;
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by) values (v_hh, v_i[8], 3, 'bought', v_a) returning id into v_r8;
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by) values (v_hh, v_i[9], 1, 'pending', v_a) returning id into v_r9;
  update public.list_items set status_changed_at = v_2001 where id in (v_r7, v_r8, v_r9);
  -- (19) one replay over all four, plus a gone item (skipped): 4 landed.
  v_n := public.land_ask_picks(v_hh, v_ask3, array[v_i[7], v_i[8], v_i[9], v_i[10], v_gone], gen_random_uuid(), v_t);
  if v_n <> 4 then raise exception '089 fixture (19): landed %, want 4', v_n; end if;
  v_ok := v_ok + 1;
  -- (20) insert: the new row carries the tap time.
  select * into v_li from public.list_items where household_id = v_hh and catalog_item_id = v_i[10];
  if v_li.status_changed_at <> v_t or v_li.status <> 'pending' or v_li.quantity <> 1 then
    raise exception '089 fixture (20): insert → stamp % (want %)', v_li.status_changed_at, v_t;
  end if;
  v_ok := v_ok + 1;
  -- (21) revive: back at 1, pending, labelled, and the tap time (not now()).
  select * into v_li from public.list_items where id = v_r7;
  if v_li.status_changed_at <> v_t or v_li.deleted_at is not null or v_li.quantity <> 1 or v_li.picked_by_labels is distinct from array['Esme'] then
    raise exception '089 fixture (21): revive → stamp %, deleted %, qty %, labels %', v_li.status_changed_at, v_li.deleted_at, v_li.quantity, v_li.picked_by_labels;
  end if;
  v_ok := v_ok + 1;
  -- (22) new need: bought → pending at 1, the tap time.
  select * into v_li from public.list_items where id = v_r8;
  if v_li.status_changed_at <> v_t or v_li.status <> 'pending' or v_li.quantity <> 1 then
    raise exception '089 fixture (22): new need → stamp %, status %, qty %', v_li.status_changed_at, v_li.status, v_li.quantity;
  end if;
  v_ok := v_ok + 1;
  -- (23) pending +1: qty 2, the stamp unchanged (2001).
  select * into v_li from public.list_items where id = v_r9;
  if v_li.status_changed_at <> v_2001 or v_li.quantity <> 2 then
    raise exception '089 fixture (23): pending +1 → stamp %, qty %', v_li.status_changed_at, v_li.quantity;
  end if;
  v_ok := v_ok + 1;
  -- (24) the point of B, end to end: Paige's check of the new row, tapped AFTER the pick (5 min ago) and
  --      sent after the replay, lands under 088's rule (1 row, bought, her tap time).
  execute 'set local role authenticated';
  update public.list_items set status = 'bought', status_changed_at = now() - interval '5 minutes'
   where id = (select id from public.list_items where household_id = v_hh and catalog_item_id = v_i[10])
     and household_id = v_hh and deleted_at is null and status <> 'bought' and status_changed_at < now() - interval '5 minutes';
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n <> 1 then raise exception '089 fixture (24): the check tapped after the pick lost (rows %)', v_n; end if;
  v_ok := v_ok + 1;
  -- (25) no tap time = 087's behaviour: a new need is stamped now().
  update public.list_items set status_changed_at = v_2001 where household_id = v_hh and catalog_item_id = v_i[10];
  v_n := public.land_ask_picks(v_hh, v_ask3, array[v_i[10]]);
  if (select status_changed_at from public.list_items where household_id = v_hh and catalog_item_id = v_i[10]) <> now() then
    raise exception '089 fixture (25): a land without a tap was not stamped now()';
  end if;
  v_ok := v_ok + 1;
  -- (26) the departure: a tap 30 s ahead stamps now(), never the future.
  update public.list_items set status = 'bought', status_changed_at = v_2001 where household_id = v_hh and catalog_item_id = v_i[10];
  v_n := public.land_ask_picks(v_hh, v_ask3, array[v_i[10]], gen_random_uuid(), now() + interval '30 seconds');
  if (select status_changed_at from public.list_items where household_id = v_hh and catalog_item_id = v_i[10]) <> now() then
    raise exception '089 fixture (26): a future tap was stamped %', (select status_changed_at from public.list_items where household_id = v_hh and catalog_item_id = v_i[10]);
  end if;
  v_ok := v_ok + 1;

  -- ── The prune ─────────────────────────────────────────────────────────────────────────────
  -- (27) a landing with a run id removes THIS household's runs older than 30 days, and no one else's.
  insert into public.ask_landings (run_id, household_id, landed, created_at) values
    (v_old1, v_hh, 1, now() - interval '31 days'), (v_old2, v_hh2, 1, now() - interval '31 days');
  v_n := public.land_ask_picks(v_hh, v_ask3, array[v_i[12]], gen_random_uuid());
  if exists (select 1 from public.ask_landings where run_id = v_old1)
     or not exists (select 1 from public.ask_landings where run_id = v_old2)
     or not exists (select 1 from public.ask_landings where run_id = v_run) then
    raise exception '089 fixture (27): the prune is wrong';
  end if;
  v_ok := v_ok + 1;

  -- ── Grants ────────────────────────────────────────────────────────────────────────────────
  -- (28) authenticated can't read ask_landings; (29) or write it; (30) anon can't call land_ask_picks.
  execute 'set local role authenticated';
  begin perform 1 from public.ask_landings limit 1;
        execute 'reset role';
        raise exception '089 fixture (28): authenticated read ask_landings';
  exception when insufficient_privilege then v_ok := v_ok + 1; end;
  execute 'reset role';
  execute 'set local role authenticated';
  begin insert into public.ask_landings (run_id, household_id, landed) values (gen_random_uuid(), v_hh, 1);
        execute 'reset role';
        raise exception '089 fixture (29): authenticated wrote ask_landings';
  exception when insufficient_privilege then v_ok := v_ok + 1; end;
  execute 'reset role';
  execute 'set local role anon';
  begin perform public.land_ask_picks(v_hh, v_ask3, array[v_i[12]]);
        execute 'reset role';
        raise exception '089 fixture (30): anon called land_ask_picks';
  exception when insufficient_privilege then v_ok := v_ok + 1; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', '', true);
  raise warning '089 fixture: % checks passed', v_ok;
  if v_ok <> 30 then
    raise exception '089 fixture: % checks passed, want 30', v_ok;
  end if;
end
$fixture$;

rollback to savepoint fixture;

commit;

-- Which copy ran, in the Postgres log (log_min_messages = warning). Read-only.
do $which$
begin
  if to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[], uuid, timestamp with time zone)') is not null then
    raise warning '089 COMMITTED — 5-arg land_ask_picks present on %', (select system_identifier from pg_control_system());
  else
    raise warning '089 ROLLED BACK — parse check, nothing persisted on %', (select system_identifier from pg_control_system());
  end if;
end
$which$;

-- ═══ CLOSING VERIFY — one row (read-only; right after the commit) ═════════════════════════
-- Expected: copy 'committed' · land_3arg 0 · land_5arg 1 · land_acl 'authenticated=EXECUTE' ·
--   land_secdef_sp true · land_defaults 2 · land_md5 = the "089 body land_ask_picks" log line ·
--   trigger_md5 = the "089 body asks_stamp_deleted_by" line · trigger_fn_acl '' · trigger_on true ·
--   landings_table 1 · landings_rls true · landings_policies 0 · landings_client_grants '' ·
--   landings_service_grants 'DELETE,INSERT,SELECT,UPDATE' · edit_ask_md5 39466771… · update_ask_md5
--   bda189ca… · fixture_rows 0. Dev which_db 7642734024280108049; prod 7606130613603586966.
-- After the parse-check copy: copy 'rolled back' · land_3arg 1 · land_5arg 0 · landings_table 0 ·
--   land_md5 1376af1f… (087's) · fixture_rows 0.
with f as (
  select p.oid, p.proname, p.prosecdef, p.proconfig = array['search_path=""'] as sp_empty, p.pronargdefaults,
         md5(replace(p.prosrc, E'\r', '')) as body,
         (select coalesce(string_agg(case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end || '=' || a.privilege_type, ',' order by 1), '')
            from aclexplode(p.proacl) a where a.grantee <> p.proowner) as acl
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('land_ask_picks', 'asks_stamp_deleted_by', 'edit_ask', 'update_ask')
)
select
  (select system_identifier from pg_control_system())::text                                   as which_db,
  case when to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[], uuid, timestamp with time zone)') is not null
       then 'committed' else 'rolled back' end                                                 as copy,
  (to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[])') is not null)::int             as land_3arg,
  (to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[], uuid, timestamp with time zone)') is not null)::int as land_5arg,
  (select acl from f where proname = 'land_ask_picks')                                        as land_acl,
  (select prosecdef and sp_empty from f where proname = 'land_ask_picks')                     as land_secdef_sp,
  (select pronargdefaults from f where proname = 'land_ask_picks')                            as land_defaults,
  (select body from f where proname = 'land_ask_picks')                                       as land_md5,
  (select body from f where proname = 'asks_stamp_deleted_by')                                as trigger_md5,
  (select acl from f where proname = 'asks_stamp_deleted_by')                                 as trigger_fn_acl,
  exists (select 1 from pg_trigger where tgname = 'trg_asks_stamp_deleted_by' and tgenabled = 'O') as trigger_on,
  (to_regclass('public.ask_landings') is not null)::int                                       as landings_table,
  (select relrowsecurity from pg_class where oid = to_regclass('public.ask_landings'))        as landings_rls,
  (select count(*) from pg_policy where polrelid = to_regclass('public.ask_landings'))        as landings_policies,
  (select coalesce(string_agg(grantee || '=' || privilege_type, ',' order by grantee, privilege_type), '')
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'ask_landings' and grantee in ('PUBLIC', 'anon', 'authenticated')) as landings_client_grants,
  (select coalesce(string_agg(privilege_type, ',' order by privilege_type), '')
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'ask_landings' and grantee = 'service_role') as landings_service_grants,
  (select body from f where proname = 'edit_ask')                                             as edit_ask_md5,
  (select body from f where proname = 'update_ask')                                           as update_ask_md5,
  (select count(*) from public.users where clerk_id like '089-fixture-%')
  + (select count(*) from public.households where name like '089-fixture-%')                 as fixture_rows;

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '089_ask_landings'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '089_ask_landings');
