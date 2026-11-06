-- 078_create_ask.sql
-- SPEC_ask_slice2.md, "078 — create_ask" (rulings K1, K2, D-a of 2026-11-06, Dan): an ask and its
-- shelf are created in ONE transaction, the client supplies the id so a retry returns the same ask,
-- and no two live asks in a household share a label (case-insensitive).
--
-- STEP 0 (read-only, dev 7642734024280108049, 2026-11-06): 077 is the latest ledger row
--   (20261104034853); land_ask_picks is the only Ask function; 0 asks, 0 shelf rows, 0 labelled
--   list rows, so the unique index builds cleanly. authenticated holds INSERT,SELECT on asks (077)
--   and no client code inserts into asks. Prod has no Ask objects. log_min_messages = warning, so
--   this file's `raise warning` lines are what reach the Postgres log.
--
-- WHAT — one transaction, a VERIFY DO block, a definer-run fixture inside a savepoint that is
--   rolled back, `commit;`, a post-transaction log line, then the closing VERIFY SELECT.
--   §1 asks_household_label_live_uq: unique (household_id, lower(label)) where deleted_at is null
--      (K2). A soft-deleted ask frees its label.
--   §2 create_ask(p_id, p_household_id, p_label, p_shelf_noun, p_screen_style, p_pick_target,
--      p_catalog_item_ids) returns uuid. land_ask_picks's posture: SECURITY DEFINER, search_path
--      '', EXECUTE to authenticated only. In order:
--        1 membership (is_member_of), else 42501; no user for the JWT subject, 42501
--        2 one creator per household at a time (advisory lock 'create_ask:' || household), so two
--          concurrent retries of one id serialize instead of meeting at the primary key
--        3 RETRY: p_id already an ask → the same household, the same trimmed label and still live
--          returns p_id and writes nothing; anything else raises 42710. Runs BEFORE the label check,
--          so a retry never hits K2
--        4 label trimmed, 1–16 chars (077's check), else 22023; a live ask with the same lower(label)
--          → 23505 (raised here; the index is the backstop)
--        5 noun trimmed, '' → null, at most 16 chars; style standard | simple (null → standard)
--        6 items: 1–48, one-dimensional, no null, no duplicate; each live and global or this
--          household's own (077's shelf insert policy), else 22023
--        7 target 1–6 (077's range) and no greater than the tile count, else 22023
--        8 insert the ask (created_by = the caller), the shelf with position = array order − 1,
--          return p_id
--   §3 revoke insert on asks from authenticated (D-a): create_ask is the only door, so the target
--      check can't be skipped. asks_insert (077's policy) stays, inert; the shelf's INSERT /
--      DELETE grants stay for Slice 4's shelf editing.
--
-- NOT IN 078
--   * Photos: optional, uploaded after the create through 077's set_household_item_photo.
--   * Edit and delete (Slice 4). Slice 4 must keep target <= tiles when a shelf shrinks; a
--     catalog-item CASCADE can shrink a shelf today (the spec's WATCH item).
--   * Any change to land_ask_picks or the 077 tables' other grants.
--
-- ERRORS: 42501 = not a member / no JWT user / a direct client insert into asks; 42710 = the id is
--   an ask that is not this retry; 23505 = a live ask already has this label; 22023 = a bad label,
--   noun, style, target, id or item list. The client maps 23505 to "You already have Ask {Label}."
--   and 22023 to the target-vs-tiles message; it starts a NEW id whenever the form changes.
-- GRANTS: create_ask revokes from public, anon and service_role, grants EXECUTE to authenticated.
--   VERIFY reads both the function and asks back through aclexplode (information_schema is lossy
--   on 17).
-- FIXTURE: runs AS THE OWNER inside `savepoint fixture` … `rollback to savepoint fixture`. Three
--   throw-away users (A creates, B a member, C an outsider), two households, five custom items
--   (one soft-deleted), one in the other household, and one live global item borrowed read-only.
--   Impersonates through request.jwt.claims (is_local = true); the grant probes run under
--   `set local role authenticated`. Nothing survives.
-- APPLY: dev (zxwtxjjmssykhqrghouf, 7642734024280108049) first. PARSE CHECK = this file with
--   `commit;` → `rollback;`, nothing else changed. Both copies write their story to the Postgres log
--   (warnings): "078 VERIFY: 13 checked, 0 mismatches", "078 fixture: 26 checks passed", then
--   "078 COMMITTED — create_ask present" or "078 ROLLED BACK — parse check, nothing persisted".
--   The closing SELECT's `copy` column says the same. Then the real run, the closing VERIFY on the
--   same identifier, and the ledger row by hand. Prod (parpauldmbetptkmdwbd, 7606130613603586966)
--   with 077 at Ask's promotion, BEFORE the client, never before 077. Idempotent (if not exists /
--   create or replace). Run as postgres.
-- ROLLBACK: 078_rollback.sql — roll the client back first (C2 calls create_ask).
-- DRAFTED 2026-11-06 by Claude Code. Parse check on dev 2026-11-06 15:31:17 UTC (log: VERIFY 13/0,
--   fixture 26/26, "078 ROLLED BACK — parse check"; closing row copy 'rolled back', mismatches 5 as
--   expected); read-back after: no create_ask, no index, asks authenticated INSERT,SELECT, ledger
--   still 20261104034853. 078_rollback.sql parse-checked the same way. NOT APPLIED.

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '078: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '078: run as postgres — current_user is %', current_user;
  end if;
  if to_regclass('public.asks') is null or to_regclass('public.ask_shelf_items') is null
     or to_regclass('public.catalog_items') is null
     or to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[])') is null
     or to_regprocedure('public.is_member_of(uuid)') is null
     or to_regprocedure('public.get_current_user_id()') is null then
    raise exception '078: 077 is not on this database — apply 077 first';
  end if;
  if exists (select 1 from public.asks where deleted_at is null
              group by household_id, lower(label) having count(*) > 1) then
    raise exception '078: live asks already share a label in one household — resolve them before the index';
  end if;
end
$preflight$;

-- ═══ §1 one live label per household (K2) ════════════════════════════════════════════════
create unique index if not exists asks_household_label_live_uq
  on public.asks (household_id, lower(label)) where deleted_at is null;
comment on index public.asks_household_label_live_uq is
  '078 (K2) — no two live asks in a household share a label, case-insensitive. A soft-deleted ask frees its label.';

-- ═══ §2 create_ask ═══════════════════════════════════════════════════════════════════════
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
revoke all on function public.create_ask(uuid, uuid, text, text, text, smallint, uuid[]) from public;
revoke all on function public.create_ask(uuid, uuid, text, text, text, smallint, uuid[]) from anon;
revoke all on function public.create_ask(uuid, uuid, text, text, text, smallint, uuid[]) from service_role;
grant execute on function public.create_ask(uuid, uuid, text, text, text, smallint, uuid[]) to authenticated;

-- ═══ §3 create_ask is the only door (D-a) ════════════════════════════════════════════════
revoke insert on table public.asks from authenticated;

notify pgrst, 'reload schema';

do $verify$
declare
  v_checked integer := 0;
  v_bad     text[] := array[]::text[];
  v_fn      oid := to_regprocedure('public.create_ask(uuid, uuid, text, text, text, smallint, uuid[])');
  v_got     text;
  g         record;
begin
  -- (1) the index, exactly.
  v_checked := v_checked + 1;
  if (select pg_get_indexdef(i.indexrelid) from pg_index i
       where i.indexrelid = to_regclass('public.asks_household_label_live_uq'))
     is distinct from 'CREATE UNIQUE INDEX asks_household_label_live_uq ON public.asks USING btree (household_id, lower(label)) WHERE (deleted_at IS NULL)' then
    v_bad := v_bad || 'index';
  end if;
  -- (2–4) the function: present, definer, search_path ''.
  v_checked := v_checked + 1;
  if v_fn is null then v_bad := v_bad || 'create_ask MISSING'; end if;
  v_checked := v_checked + 1;
  if not coalesce((select prosecdef from pg_proc where oid = v_fn), false) then v_bad := v_bad || 'create_ask not definer'; end if;
  v_checked := v_checked + 1;
  if (select proconfig from pg_proc where oid = v_fn) is distinct from array['search_path=""'] then
    v_bad := v_bad || 'create_ask search_path';
  end if;
  -- (5–8) the function's grants, per grantee.
  for g in select * from (values ('PUBLIC', ''), ('anon', ''), ('authenticated', 'EXECUTE'), ('service_role', '')) t (grantee, want) loop
    v_checked := v_checked + 1;
    v_got := coalesce((select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                         from pg_proc p, aclexplode(p.proacl) a
                        where p.oid = v_fn
                          and a.grantee = case g.grantee when 'PUBLIC' then 0 else g.grantee::regrole::oid end), '');
    if v_got <> g.want then v_bad := v_bad || ('create_ask/' || g.grantee || ' want [' || g.want || '] got [' || v_got || ']'); end if;
  end loop;
  -- (9–12) asks' table grants after the revoke: authenticated SELECT only.
  for g in select * from (values ('PUBLIC', ''), ('anon', ''), ('authenticated', 'SELECT'), ('service_role', 'DELETE,INSERT,SELECT,UPDATE')) t (grantee, want) loop
    v_checked := v_checked + 1;
    v_got := coalesce((select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                         from pg_class c, aclexplode(c.relacl) a
                        where c.oid = 'public.asks'::regclass and a.privilege_type <> 'MAINTAIN'
                          and a.grantee = case g.grantee when 'PUBLIC' then 0 else g.grantee::regrole::oid end), '');
    if v_got <> g.want then v_bad := v_bad || ('asks/' || g.grantee || ' want [' || g.want || '] got [' || v_got || ']'); end if;
  end loop;
  -- (13) 077's column UPDATE grants on asks are untouched (6 columns to authenticated).
  v_checked := v_checked + 1;
  if (select count(*) from pg_attribute att, aclexplode(att.attacl) a
       where att.attrelid = 'public.asks'::regclass and a.grantee = 'authenticated'::regrole::oid
         and a.privilege_type = 'UPDATE') <> 6 then
    v_bad := v_bad || 'asks column UPDATE grants moved';
  end if;

  raise warning '078 VERIFY: % checked, % mismatches%', v_checked, cardinality(v_bad),
    case when cardinality(v_bad) > 0 then ' — ' || array_to_string(v_bad, '; ') else '' end;
  if cardinality(v_bad) > 0 or v_checked <> 13 then
    raise exception '078 VERIFY failed: %', array_to_string(v_bad, '; ');
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- FIXTURE — definer-run, inside a savepoint, rolled back. Probes the spec's VERIFY list: a create,
-- its retry, both duplicate-label cases, target above tiles, an outsider's item, a non-member, every
-- field refusal, the freed label of a soft-deleted ask, land_ask_picks on a created ask, and the
-- grants as authenticated. Nothing here survives.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
savepoint fixture;

do $fixture$
declare
  v_tag   text := '078-fixture-' || gen_random_uuid()::text;
  v_a     uuid; v_b uuid; v_c uuid;        -- A creates, B a member, C an outsider
  v_hh    uuid; v_hh2 uuid;
  v_i     uuid[] := array[]::uuid[];       -- i1..i4 live custom items of hh
  v_gone  uuid;                            -- a soft-deleted custom item of hh
  v_x     uuid;                            -- a custom item of hh2
  v_g     uuid;                            -- a live global item, borrowed read-only
  v_e     uuid := gen_random_uuid();       -- Ask Easton's id
  v_id    uuid;
  v_r     public.asks%rowtype;
  v_n     integer;
  v_ok    integer := 0;
  v_ca    text; v_cb text; v_cc text;
begin
  select id into v_g from public.catalog_items where is_global and deleted_at is null order by id limit 1;
  if v_g is null then raise exception '078 fixture: no live global catalog item to borrow'; end if;

  insert into public.users (clerk_id, email, full_name) values (v_tag || '-a', v_tag || '-a@fixture.invalid', '078 Alpha') returning id into v_a;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-b', v_tag || '-b@fixture.invalid', '078 Bravo') returning id into v_b;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-c', v_tag || '-c@fixture.invalid', '078 Charlie') returning id into v_c;
  insert into public.households (name, created_by) values (v_tag, v_a) returning id into v_hh;
  insert into public.households (name, created_by) values (v_tag || '-other', v_c) returning id into v_hh2;
  insert into public.household_members (household_id, user_id) values (v_hh, v_a), (v_hh, v_b), (v_hh2, v_c);
  for v_n in 1..4 loop
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
  if public.get_current_user_id() is distinct from v_a then raise exception '078 fixture: impersonation failed'; end if;

  -- (1–3) A normal create: the id back, the row as sent (trimmed), the shelf in array order.
  if public.create_ask(v_e, v_hh, ' Easton ', ' snacks ', 'standard', 3::smallint, array[v_i[1], v_i[2], v_i[3], v_g])
     is distinct from v_e then
    raise exception '078 fixture (1): create did not return its id';
  end if;
  v_ok := v_ok + 1;
  select * into v_r from public.asks where id = v_e;
  if v_r.household_id is distinct from v_hh or v_r.label is distinct from 'Easton' or v_r.shelf_noun is distinct from 'snacks'
     or v_r.screen_style is distinct from 'standard' or v_r.pick_target is distinct from 3
     or v_r.created_by is distinct from v_a or v_r.deleted_at is not null then
    raise exception '078 fixture (2): the ask row is % % % % % %', v_r.label, v_r.shelf_noun, v_r.screen_style, v_r.pick_target, v_r.created_by, v_r.deleted_at;
  end if;
  v_ok := v_ok + 1;
  if (select array_agg(catalog_item_id order by position) from public.ask_shelf_items where ask_id = v_e)
       is distinct from array[v_i[1], v_i[2], v_i[3], v_g]
     or (select array_agg(position order by position) from public.ask_shelf_items where ask_id = v_e)
       is distinct from array[0, 1, 2, 3]::smallint[] then
    raise exception '078 fixture (3): the shelf is not the 4 tiles in order';
  end if;
  v_ok := v_ok + 1;

  -- (4) The same call again (another member retrying is the same call): the same id, nothing new.
  -- Each call is its own statement, the check the next one: a statement's subqueries don't see
  -- what a function called in that same statement wrote.
  perform set_config('request.jwt.claims', v_cb, true);
  v_id := public.create_ask(v_e, v_hh, 'Easton', 'snacks', 'standard', 3::smallint, array[v_i[1], v_i[2], v_i[3], v_g]);
  if v_id is distinct from v_e
     or (select count(*) from public.asks where household_id = v_hh) <> 1
     or (select count(*) from public.ask_shelf_items where ask_id = v_e) <> 4
     or (select created_by from public.asks where id = v_e) is distinct from v_a then
    raise exception '078 fixture (4): a retry wrote or returned another id';
  end if;
  v_ok := v_ok + 1;
  perform set_config('request.jwt.claims', v_ca, true);

  -- (5–6) K2: the same label under a new id, then the same label in another case.
  begin perform public.create_ask(gen_random_uuid(), v_hh, 'Easton', null, 'standard', 1::smallint, array[v_i[4]]);
        raise exception '078 fixture (5): a second live Easton was created';
  exception when sqlstate '23505' then v_ok := v_ok + 1; end;
  begin perform public.create_ask(gen_random_uuid(), v_hh, 'easton', null, 'standard', 1::smallint, array[v_i[4]]);
        raise exception '078 fixture (6): "easton" beside "Easton" was created';
  exception when sqlstate '23505' then v_ok := v_ok + 1; end;

  -- (7) Target above the tile count.
  begin perform public.create_ask(gen_random_uuid(), v_hh, 'Nina', null, 'standard', 3::smallint, array[v_i[1], v_i[2]]);
        raise exception '078 fixture (7): target 3 with 2 tiles was created';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;

  -- (8–9) Items the household can't shelve: another household's, and a soft-deleted one.
  begin perform public.create_ask(gen_random_uuid(), v_hh, 'Nina', null, 'standard', 1::smallint, array[v_i[1], v_x]);
        raise exception '078 fixture (8): another household''s item went on a shelf';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.create_ask(gen_random_uuid(), v_hh, 'Nina', null, 'standard', 1::smallint, array[v_i[1], v_gone]);
        raise exception '078 fixture (9): a deleted item went on a shelf';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;

  -- (10–17) Field refusals.
  begin perform public.create_ask(gen_random_uuid(), v_hh, 'Nina', null, 'standard', 1::smallint, array[]::uuid[]);
        raise exception '078 fixture (10): an empty shelf was created';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.create_ask(gen_random_uuid(), v_hh, 'Nina', null, 'standard', 1::smallint, array[v_i[1], v_i[1]]);
        raise exception '078 fixture (11): a duplicate tile was created';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.create_ask(gen_random_uuid(), v_hh, 'Nina', null, 'standard', 1::smallint, array[v_i[1], null]);
        raise exception '078 fixture (12): a null tile was created';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.create_ask(gen_random_uuid(), v_hh, '   ', null, 'standard', 1::smallint, array[v_i[1]]);
        raise exception '078 fixture (13): a blank label was created';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.create_ask(gen_random_uuid(), v_hh, 'Seventeen chars!!', null, 'standard', 1::smallint, array[v_i[1]]);
        raise exception '078 fixture (14): a 17-character label was created';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.create_ask(gen_random_uuid(), v_hh, 'Nina', null, 'fancy', 1::smallint, array[v_i[1]]);
        raise exception '078 fixture (15): an unknown screen style was created';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.create_ask(gen_random_uuid(), v_hh, 'Nina', null, 'standard', 0::smallint, array[v_i[1]]);
        raise exception '078 fixture (16): a target of 0 was created';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.create_ask(null, v_hh, 'Nina', null, 'standard', 1::smallint, array[v_i[1]]);
        raise exception '078 fixture (17): an ask without an id was created';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;

  -- (18–19) The id is another ask: a different label here, or any call from another household.
  begin perform public.create_ask(v_e, v_hh, 'Nina', null, 'standard', 1::smallint, array[v_i[4]]);
        raise exception '078 fixture (18): an existing id took a new label';
  exception when sqlstate '42710' then v_ok := v_ok + 1; end;
  perform set_config('request.jwt.claims', v_cc, true);
  begin perform public.create_ask(v_e, v_hh2, 'Easton', null, 'standard', 1::smallint, array[v_x]);
        raise exception '078 fixture (19): another household reused an ask id';
  exception when sqlstate '42710' then v_ok := v_ok + 1; end;

  -- (20) A non-member.
  begin perform public.create_ask(gen_random_uuid(), v_hh, 'Nina', null, 'standard', 1::smallint, array[v_i[1]]);
        raise exception '078 fixture (20): a non-member created an ask';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;

  -- (21) None of the refused calls wrote.
  if (select count(*) from public.asks where household_id in (v_hh, v_hh2)) <> 1
     or (select count(*) from public.ask_shelf_items s join public.asks a on a.id = s.ask_id
          where a.household_id in (v_hh, v_hh2)) <> 4 then
    raise exception '078 fixture (21): a refused call wrote';
  end if;
  v_ok := v_ok + 1;

  -- (22) A soft-deleted ask frees its label.
  perform set_config('request.jwt.claims', v_ca, true);
  v_id := public.create_ask(gen_random_uuid(), v_hh, 'Gone', null, 'standard', 1::smallint, array[v_i[4]]);
  update public.asks set deleted_at = now() where id = v_id;
  v_id := public.create_ask(gen_random_uuid(), v_hh, 'gone', null, 'standard', 1::smallint, array[v_i[4]]);
  if v_id is null
     or (select count(*) from public.asks where household_id = v_hh and lower(label) = 'gone') <> 2
     or (select count(*) from public.asks where household_id = v_hh and lower(label) = 'gone' and deleted_at is null) <> 1 then
    raise exception '078 fixture (22): a deleted ask''s label could not be reused';
  end if;
  v_ok := v_ok + 1;

  -- (23) land_ask_picks on a created ask lands, with Easton's label.
  v_n := public.land_ask_picks(v_hh, v_e, array[v_i[1], v_i[2], v_g]);
  if v_n is distinct from 3
     or (select count(*) from public.list_items
          where household_id = v_hh and deleted_at is null and picked_by_labels = array['Easton']) <> 3 then
    raise exception '078 fixture (23): land_ask_picks did not land 3 on a created ask';
  end if;
  v_ok := v_ok + 1;

  -- (24–26) As the authenticated role: no direct insert; create_ask and its retry work.
  execute 'set local role authenticated';
  if current_user <> 'authenticated' then raise exception '078 fixture: the grant probes are not running as authenticated'; end if;
  begin insert into public.asks (household_id, label, pick_target, created_by) values (v_hh, 'Direct', 1, v_a);
        raise exception '078 fixture (24): authenticated inserted into asks directly';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  v_e := gen_random_uuid();                                                                -- Everett's id now
  v_id := public.create_ask(v_e, v_hh, 'Everett', null, 'simple', 1::smallint, array[v_i[4]]);
  if v_id is distinct from v_e
     or (select count(*) from public.asks where household_id = v_hh and label = 'Everett') <> 1 then
    raise exception '078 fixture (25): authenticated could not create an ask';
  end if;
  v_ok := v_ok + 1;
  v_id := public.create_ask(v_e, v_hh, 'Everett', null, 'simple', 1::smallint, array[v_i[4]]);
  if v_id is distinct from v_e
     or (select count(*) from public.asks where household_id = v_hh and label = 'Everett') <> 1
     or (select count(*) from public.ask_shelf_items where ask_id = v_e) <> 1 then
    raise exception '078 fixture (26): an authenticated retry wrote or returned another id';
  end if;
  v_ok := v_ok + 1;
  execute 'reset role';

  perform set_config('request.jwt.claims', '', true);
  raise warning '078 fixture: % checks passed', v_ok;
  if v_ok <> 26 then raise exception '078 fixture: % checks passed, want 26', v_ok; end if;
end
$fixture$;

rollback to savepoint fixture;

commit;

-- Which copy ran, in the Postgres log (log_min_messages = warning). Read-only.
do $which$
begin
  if to_regprocedure('public.create_ask(uuid, uuid, text, text, text, smallint, uuid[])') is not null then
    raise warning '078 COMMITTED — create_ask present on %', (select system_identifier from pg_control_system());
  else
    raise warning '078 ROLLED BACK — parse check, nothing persisted on %', (select system_identifier from pg_control_system());
  end if;
end
$which$;

-- ═══ CLOSING VERIFY (read-only; run on the same database right after the commit) ══════════
-- Expected after the real run, dev and prod alike (except which_db): copy 'committed' · checked 8 ·
--   mismatches 0 · mismatch_detail '' · index true · definer true · search_path_empty true ·
--   asks_authenticated 'SELECT' · asks_update_cols 6 · asks_insert_policy true · live_label_dupes 0 ·
--   fixture_rows 0
-- After the parse-check copy: copy 'rolled back' · mismatches 5 (create_ask MISSING ×4, asks /
--   authenticated got [INSERT,SELECT]) · index false · asks_authenticated 'INSERT,SELECT' ·
--   fixture_rows 0.
with fn_target (grantee, want) as (values
  ('PUBLIC', ''), ('anon', ''), ('authenticated', 'EXECUTE'), ('service_role', '')
),
tbl_target (grantee, want) as (values
  ('PUBLIC', ''), ('anon', ''), ('authenticated', 'SELECT'), ('service_role', 'DELETE,INSERT,SELECT,UPDATE')
),
actual as (
  select 'create_ask' as obj, f.grantee, f.want,
         coalesce((select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                     from pg_proc p, aclexplode(p.proacl) a
                    where p.oid = to_regprocedure('public.create_ask(uuid, uuid, text, text, text, smallint, uuid[])')
                      and a.grantee = case f.grantee when 'PUBLIC' then 0 else f.grantee::regrole::oid end), '') as got,
         to_regprocedure('public.create_ask(uuid, uuid, text, text, text, smallint, uuid[])') is not null as present
    from fn_target f
  union all
  select 'asks', t.grantee, t.want,
         coalesce((select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                     from pg_class c, aclexplode(c.relacl) a
                    where c.oid = 'public.asks'::regclass and a.privilege_type <> 'MAINTAIN'
                      and a.grantee = case t.grantee when 'PUBLIC' then 0 else t.grantee::regrole::oid end), ''),
         true
    from tbl_target t
)
select
  (select system_identifier from pg_control_system())::text                                       as which_db,
  case when to_regprocedure('public.create_ask(uuid, uuid, text, text, text, smallint, uuid[])') is not null
       then 'committed' else 'rolled back' end                                                     as copy,
  (select count(*) from actual)                                                                    as checked,
  (select count(*) from actual where got <> want or not present)                                   as mismatches,
  (select coalesce(string_agg(obj || '/' || grantee || ' want [' || want || '] got [' || got || ']'
                              || case when present then '' else ' MISSING' end, '; ' order by obj, grantee), '')
     from actual where got <> want or not present)                                                as mismatch_detail,
  coalesce((select pg_get_indexdef(i.indexrelid) from pg_index i
             where i.indexrelid = to_regclass('public.asks_household_label_live_uq'))
    = 'CREATE UNIQUE INDEX asks_household_label_live_uq ON public.asks USING btree (household_id, lower(label)) WHERE (deleted_at IS NULL)',
    false)                                                                                          as index,
  coalesce((select prosecdef from pg_proc
             where oid = to_regprocedure('public.create_ask(uuid, uuid, text, text, text, smallint, uuid[])')), false) as definer,
  coalesce((select proconfig = array['search_path=""'] from pg_proc
             where oid = to_regprocedure('public.create_ask(uuid, uuid, text, text, text, smallint, uuid[])')), false) as search_path_empty,
  (select coalesce(string_agg(distinct a.privilege_type, ',' order by a.privilege_type), '')
     from pg_class c, aclexplode(c.relacl) a
    where c.oid = 'public.asks'::regclass and a.grantee = 'authenticated'::regrole::oid
      and a.privilege_type <> 'MAINTAIN')                                                          as asks_authenticated,
  (select count(*) from pg_attribute att, aclexplode(att.attacl) a
    where att.attrelid = 'public.asks'::regclass and a.grantee = 'authenticated'::regrole::oid
      and a.privilege_type = 'UPDATE')                                                             as asks_update_cols,
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'asks'
           and policyname = 'asks_insert')                                                         as asks_insert_policy,
  (select count(*) from (select 1 from public.asks where deleted_at is null
                          group by household_id, lower(label) having count(*) > 1) d)              as live_label_dupes,
  (select count(*) from public.users where clerk_id like '078-fixture-%')
  + (select count(*) from public.households where name like '078-fixture-%')                      as fixture_rows;

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '078_create_ask'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '078_create_ask');
