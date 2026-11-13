-- 077_ask.sql
-- SPEC_ask.md + SPEC_ask_amendment_2026-11-03.md (A13–A26) — Slice 1: the schema for Ask.
-- Rulings of 2026-11-03 after Step 0 (design chat, Dan): R1 a pick on a live BOUGHT row is a new
-- need (048/049's bought branch, not the manual path); R2 the ledger invariant is >=, not =; R3 a
-- picked row asks before another member swipes it away (client); R4 a rolled-forward pick keeps
-- its label; R5 one count-only ask_completed span (client); R6 the manual +1 on a bought row is a
-- separate NEXT item and is NOT fixed here.
--
-- STEP 0 (read-only, dev 7642734024280108049 + prod 7606130613603586966, 2026-11-03):
--   #1 A manual +1 (updateQty) is a plain client UPDATE of list_items.quantity; nothing writes
--      list_item_meals and the only list_items trigger is 026's resurrect trigger. So a member's
--      bump on a linked pending row leaves quantity > SUM(quantity_contributed): the difference
--      is need no meal owns. takeMealOffList subtracts only its own share and
--      decrement_meal_from_list is capped at what its link owns, so the remainder is safe.
--      Today's data: every linked live row equals its sum (dev 18/18 pending, prod 24/24).
--      On a BOUGHT row the manual path writes shown + 1 and un-buys it (048's double count) —
--      R6, out of scope; land_ask_picks takes 048/049's branch instead (R1).
--   #2 remove_list_item = 051, list_items_resurrect_cleanup = 026, on both databases
--      (prosrc md5 with CR stripped: c8af5712… / a39601c2…). Prod differs from dev only by CRLF.
--   #3 Zero contributor rows render cleanly (no "Added by" line); swipe-remove treated such a row
--      as the swiper's own (R3, client). close_cycle's roll-forward upserts the LIVE row, so the
--      resurrect trigger does not fire and a rolled pick keeps its label (R4).
--   #4 meal-suggestion and recipe-import make no database call; "picked_by" appears nowhere.
--   #5 The span scrub keeps the URL hash (the route): Ask adds no hash route. household_id is a
--      global span attribute, so ask_completed is household-scoped, not anonymous (R5).
--   #6 Dev ledger tops out at 20261031034428 076_household_showcase; prod has no ledger;
--      item-photos is free on both.
--   #7 meal_photo_sweep_orphans is hard-scoped to bucket_id = 'meal-photos' on both (md5
--      4ec6f85a…, CR stripped). A23 stands; VERIFY reads the body back unchanged.
--
-- WHAT — one transaction, a VERIFY DO block closing each section, a definer-run fixture inside a
--   savepoint that is rolled back, then the closing VERIFY SELECT.
--   §1 list_items.picked_by_labels text[] null + CHECK through picked_by_labels_valid(text[])
--      (immutable: null, or 1–8 distinct trimmed elements of 1–16 chars; A19), and the
--      attribution guard: trg_list_items_picked_by_guard (BEFORE INSERT OR UPDATE, SECURITY
--      INVOKER) refuses any label a client (authenticated / anon) INSERTs or ADDS; clearing to
--      null or a subset is allowed. Definer functions run as postgres and pass (design chat
--      amendment, 2026-11-03: a trigger, not column grants).
--   §2 asks (A3 as amended by A25). Members read, create (created_by = the caller) and edit the
--      label / noun / style / target / deleted_at through column grants; no DELETE (soft).
--   §3 ask_shelf_items. Members read, add (a live catalog item the household can see), reorder
--      (position) and remove. catalog_item_id ON DELETE CASCADE: a shelf releases, never blocks.
--   §4 household_item_photos (A23). Members read; writes ONLY through set_household_item_photo /
--      remove_household_item_photo (065's shape). catalog_item_id ON DELETE CASCADE.
--   §5 bucket item-photos: private, 1 MB, image/webp + image/jpeg (065's mime list — the encoder
--      falls back to JPEG on an older Safari, src/lib/image.js; the amendment's "webp" alone
--      would refuse those uploads). SELECT + INSERT policies = 065's, bucket-guarded.
--   §6 remove_list_item: 051 verbatim + picked_by_labels = null on the soft delete (A20).
--      list_items_resurrect_cleanup: 026 verbatim + NEW.picked_by_labels := null (A20).
--   §7 get_list_items_for_household: + picked_by_labels as the LAST column (drop + create: the
--      return type changes). The old client reads named fields and ignores the new one.
--   §8 land_ask_picks(p_household_id, p_ask_id, p_catalog_item_ids) returns int (A16, A18–A22,
--      R1, R2). The label is read from asks, never sent. Per item, under the household advisory
--      lock and a row lock:
--        none         → insert, quantity 1, pending, added_by = caller, the open cycle, {label}
--        tombstone    → revive at quantity 1 (026 clears links / labels and re-homes the cycle),
--                       stale contributor rows dropped, added_by = caller, then {label}
--        live pending → quantity + 1, label appended if absent (kept at 8); ledger untouched,
--                       the manual +1's shape (R2: quantity >= SUM)
--        live, not pending (bought; also skipped / deferred) → the NEW NEED: quantity 1, pending,
--                       checked_by null, the open cycle, labels reset to {label}; every link's
--                       quantity_contributed zeroed, add_count kept (048/049, R1). The purchase
--                       stays on record as its 'checked' list_item_events row.
--      No list_item_contributors row, no list_item_events row (A21, A22).
--
-- NOT IN 077
--   * The manual updateQty +1 on a bought row (R6, NEXT).
--   * The item-photos sweep pass (Slice 4, its own migration, like S37).
--   * list_items_resurrect_cleanup's PUBLIC / anon EXECUTE (the carried advisor finding):
--     create or replace keeps the ACL as it is; VERIFY records it unchanged.
--   * Any change to add_meal_to_list, decrement_meal_from_list, close_cycle, archive_trip_items.
--   * The Ask screens (Slice 2) — the client half of this slice is landAskPicks, the list rows'
--     pickedByLabels and the swipe confirm.
--
-- FK NOTE: ask_shelf_items and household_item_photos are the 4th and 5th FKs onto catalog_items
--   that do not block (CASCADE), beside household_staples (016), meal_ingredients (025) and
--   list_item_events (SET NULL, 046). Deliberate: delete_custom_catalog_item hard-deletes the
--   catalog row, and a shelf or a photo must never stop that. ARCHITECTURE's FK section and
--   CLAUDE.md's "exactly three" are updated with this migration's docs.
-- ERRORS (065 / 072 / 076's vocabulary): 42501 = no JWT user / not a member / a client adding a
--   pick label (the guard); P0002 = no live ask
--   in this household; 22023 = wrong count, a null or duplicate id, an id off the ask's shelf, a
--   bad path or a missing object.
-- GRANTS: every new table revokes from public, anon, authenticated AND service_role, then grants
--   exactly; every new function revokes from public, anon and service_role. VERIFY reads tables
--   and functions back through aclexplode (information_schema is lossy on 17) and the column
--   grants through pg_attribute.attacl.
-- SEARCH PATH: new functions pinned to '' and schema-qualified (070's form). The two edited
--   functions keep their own (051 'public', 026 'public, extensions') — verbatim plus one line.
-- FIXTURE: runs AS THE OWNER inside the transaction, in `savepoint fixture` … `rollback to
--   savepoint fixture`. Three throw-away users (A runs the asks, B a member, C an outsider), two
--   households, six custom catalog items, a meal, two asks. Impersonates through
--   request.jwt.claims (set_config …, is_local = true); the RLS probes run under
--   `set local role authenticated`. No real row is touched; nothing survives.
-- APPLY: dev (zxwtxjjmssykhqrghouf, 7642734024280108049) first. PARSE CHECK first (a copy with
--   `commit;` → `rollback;` and the closing VERIFY SELECT moved above it) — expect every DO block
--   to pass, the fixture's NOTICE "077 fixture: 49 checks passed", and the VERIFY row below; after
--   the rollback the read-back shows none of 077's objects. Then the real run with `commit;`, the
--   closing VERIFY on the same identifier, and the ledger row by hand. Prod
--   (parpauldmbetptkmdwbd, 7606130613603586966) at Ask's promotion, BEFORE the client; no ledger
--   on prod, by decision — applied = the VERIFY row read back. Idempotent (if not exists / create
--   or replace / drop if exists). Run as postgres.
-- ROLLBACK: 077_rollback.sql — REFUSES while any live list row carries a label or any ask exists
--   (data would be lost); otherwise restores 051's remove_list_item, 026's trigger function and
--   the 9-column get_list_items_for_household, and drops everything 077 created.
-- DRAFTED 2026-11-03 by Claude Code. Parse check on dev 2026-11-03 (49/49, VERIFY 40/0, nothing persisted).
-- APPLIED ON DEV 2026-11-04 03:48:53 UTC by Dan (SQL Editor); VERIFY 40/0 read back by Claude Code;
--   ledger 20261104034853 077_ask. NOT ON PROD.

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '077: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '077: run as postgres — current_user is %', current_user;
  end if;
  if to_regclass('public.list_items') is null or to_regclass('public.list_item_meals') is null
     or to_regclass('public.list_item_contributors') is null or to_regclass('public.list_item_events') is null
     or to_regclass('public.provision_cycles') is null or to_regclass('public.catalog_items') is null
     or to_regprocedure('public.is_member_of(uuid)') is null
     or to_regprocedure('public.get_current_user_id()') is null
     or to_regprocedure('public.remove_list_item(uuid, uuid)') is null
     or to_regprocedure('public.list_items_resurrect_cleanup()') is null
     or to_regprocedure('public.get_list_items_for_household(uuid)') is null
     or to_regprocedure('public.meal_photo_sweep_orphans(integer)') is null then
    raise exception '077: a prerequisite table or function is missing';
  end if;
  -- The 051 lesson: amend only the bodies Step 0 read. A second run finds the 077 bodies.
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc
       where oid = to_regprocedure('public.remove_list_item(uuid, uuid)')) <> 'c8af57125208213cb5d9e4541d8db327'
     and (select prosrc not ilike '%picked_by_labels = null%' from pg_proc
           where oid = to_regprocedure('public.remove_list_item(uuid, uuid)')) then
    raise exception '077: remove_list_item has drifted from 051 — re-read it before amending';
  end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc
       where oid = to_regprocedure('public.list_items_resurrect_cleanup()')) <> 'a39601c2e87249aae1aed10f3bc8f2e4'
     and (select prosrc not ilike '%NEW.picked_by_labels := null%' from pg_proc
           where oid = to_regprocedure('public.list_items_resurrect_cleanup()')) then
    raise exception '077: list_items_resurrect_cleanup has drifted from 026 — re-read it before amending';
  end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc
       where oid = to_regprocedure('public.get_list_items_for_household(uuid)')) <> '66439853a086e87f770f71412014fc27'
     and (select prosrc not ilike '%li.picked_by_labels%' from pg_proc
           where oid = to_regprocedure('public.get_list_items_for_household(uuid)')) then
    raise exception '077: get_list_items_for_household has drifted from 051 — re-read it before replacing';
  end if;
  if exists (select 1 from storage.buckets where id = 'item-photos' and public) then
    raise exception '077: a PUBLIC item-photos bucket already exists';
  end if;
end
$preflight$;

-- ═══ §1 list_items.picked_by_labels ═══════════════════════════════════════════════════════
create or replace function public.picked_by_labels_valid(p_labels text[])
returns boolean
language sql
immutable
set search_path to ''
as $function$
  select case
    when p_labels is null then true
    else coalesce(
      array_ndims(p_labels) = 1
      and cardinality(p_labels) between 1 and 8
      and not exists (select 1 from unnest(p_labels) as e (v)
                       where e.v is null or e.v <> btrim(e.v) or char_length(e.v) not between 1 and 16)
      and (select count(distinct e.v) from unnest(p_labels) as e (v)) = cardinality(p_labels),
      false)
  end
$function$;
comment on function public.picked_by_labels_valid(text[]) is
  '077 — list_items.picked_by_labels CHECK (A19): null, or 1–8 distinct trimmed labels of 1–16 characters.';
revoke all on function public.picked_by_labels_valid(text[]) from public;
revoke all on function public.picked_by_labels_valid(text[]) from anon;
grant execute on function public.picked_by_labels_valid(text[]) to authenticated;
grant execute on function public.picked_by_labels_valid(text[]) to service_role;

alter table public.list_items add column if not exists picked_by_labels text[] null;
do $c$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.list_items'::regclass and conname = 'list_items_picked_by_labels_valid') then
    alter table public.list_items
      add constraint list_items_picked_by_labels_valid check (public.picked_by_labels_valid(picked_by_labels));
  end if;
end
$c$;
comment on column public.list_items.picked_by_labels is
  '077 (A19, A20) — who picked this need through an Ask: free text labels, never a user id. Written only by land_ask_picks; cleared by remove_list_item and by the resurrect trigger (provenance dies with the row); kept on a roll-forward (the need continues). Never sent in a request, never in telemetry.';

-- The attribution guard (design chat, 2026-11-03). authenticated holds table-level INSERT /
-- UPDATE on list_items (updateQty writes it directly), so without this a client could write a
-- label. A trigger, not column grants: re-granting list_items column by column risks breaking
-- the existing list writes. SECURITY INVOKER on purpose — current_user must be the CALLER:
-- a direct client write runs as authenticated; inside land_ask_picks, remove_list_item,
-- close_cycle and every other SECURITY DEFINER list function (all owned by postgres, read
-- 2026-11-03) current_user is postgres, so they pass. Named to sort, and so fire, BEFORE
-- trg_list_items_resurrect (BEFORE triggers fire in name order).
create or replace function public.list_items_picked_by_guard()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.picked_by_labels is not null then
        raise exception 'list_items: picked_by_labels is written only by land_ask_picks' using errcode = '42501';
      end if;
    elsif new.picked_by_labels is not null and cardinality(new.picked_by_labels) > 0
          and not coalesce(new.picked_by_labels <@ old.picked_by_labels, false) then
      -- Clearing is allowed (null, empty, or a subset of OLD); adding a label never is.
      raise exception 'list_items: picked_by_labels may be cleared by a client, never added to' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;
comment on function public.list_items_picked_by_guard() is
  '077 — BEFORE INSERT OR UPDATE on list_items: a client (authenticated / anon) may never add a pick label; SECURITY DEFINER list functions run as postgres and pass.';
-- A trigger function needs no EXECUTE grant to fire; nobody calls it directly.
revoke all on function public.list_items_picked_by_guard() from public;
revoke all on function public.list_items_picked_by_guard() from anon;
revoke all on function public.list_items_picked_by_guard() from authenticated;
revoke all on function public.list_items_picked_by_guard() from service_role;
drop trigger if exists trg_list_items_picked_by_guard on public.list_items;
create trigger trg_list_items_picked_by_guard
  before insert or update on public.list_items
  for each row execute function public.list_items_picked_by_guard();

do $verify$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'list_items'
                    and column_name = 'picked_by_labels' and data_type = 'ARRAY' and is_nullable = 'YES') then
    raise exception '077 §1: list_items.picked_by_labels missing or wrong shape';
  end if;
  if not public.picked_by_labels_valid(null) or not public.picked_by_labels_valid(array['Easton'])
     or not public.picked_by_labels_valid(array['Easton', 'Everett'])
     or public.picked_by_labels_valid('{}'::text[]) or public.picked_by_labels_valid(array['Easton', 'Easton'])
     or public.picked_by_labels_valid(array[' Easton']) or public.picked_by_labels_valid(array[''])
     or public.picked_by_labels_valid(array['abcdefghijklmnopq'])
     or public.picked_by_labels_valid(array['a','b','c','d','e','f','g','h','i'])
     or public.picked_by_labels_valid(array[null::text]) then
    raise exception '077 §1: picked_by_labels_valid accepts or refuses the wrong arrays';
  end if;
  if (select string_agg(t.tgname, ',' order by t.tgname) from pg_trigger t
       where t.tgrelid = 'public.list_items'::regclass and not t.tgisinternal)
     <> 'trg_list_items_picked_by_guard,trg_list_items_resurrect' then
    raise exception '077 §1: list_items triggers are not exactly the guard then the resurrect trigger';
  end if;
  if (select prosecdef from pg_proc where oid = to_regprocedure('public.list_items_picked_by_guard()')) then
    raise exception '077 §1: the guard must be SECURITY INVOKER';
  end if;
end
$verify$;

-- ═══ §2 asks ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.asks (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null references public.households(id) on delete cascade,
  label        text        not null
               constraint asks_label_valid check (label = btrim(label) and char_length(label) between 1 and 16),
  shelf_noun   text        null
               constraint asks_shelf_noun_valid check (shelf_noun is null or (shelf_noun = btrim(shelf_noun) and char_length(shelf_noun) between 1 and 16)),
  screen_style text        not null default 'standard'
               constraint asks_screen_style_values check (screen_style in ('standard', 'simple')),
  pick_target  smallint    not null
               constraint asks_pick_target_range check (pick_target between 1 and 6),
  created_by   uuid        not null references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz null
);
comment on table public.asks is
  '077 — an Ask (SPEC_ask + 2026-11-03 amendment): a household''s saved invitation for someone without an account to pick from a photo shelf onto the shared list. label is free text naming the picker (A3/A19), never a user. Soft delete; any member reads, runs, edits and deletes (Verification 9).';
create index if not exists asks_household_live_idx
  on public.asks (household_id, created_at) where deleted_at is null;

alter table public.asks enable row level security;
revoke all on table public.asks from public;
revoke all on table public.asks from anon;
revoke all on table public.asks from authenticated;
revoke all on table public.asks from service_role;
grant select, insert on table public.asks to authenticated;
grant update (label, shelf_noun, screen_style, pick_target, updated_at, deleted_at) on table public.asks to authenticated;
grant select, insert, update, delete on table public.asks to service_role;

drop policy if exists asks_select on public.asks;
create policy asks_select on public.asks
  for select to authenticated
  using (public.is_member_of(household_id));
drop policy if exists asks_insert on public.asks;
create policy asks_insert on public.asks
  for insert to authenticated
  with check (public.is_member_of(household_id)
              and created_by = public.get_current_user_id()
              and deleted_at is null);
drop policy if exists asks_update on public.asks;
create policy asks_update on public.asks
  for update to authenticated
  using (public.is_member_of(household_id))
  with check (public.is_member_of(household_id));

-- ═══ §3 ask_shelf_items ═══════════════════════════════════════════════════════════════════
create table if not exists public.ask_shelf_items (
  ask_id          uuid     not null references public.asks(id) on delete cascade,
  catalog_item_id uuid     not null references public.catalog_items(id) on delete cascade,   -- a shelf releases, never blocks
  position        smallint not null constraint ask_shelf_items_position_range check (position between 0 and 47),
  primary key (ask_id, catalog_item_id)
);
comment on table public.ask_shelf_items is
  '077 — the tiles on an Ask''s shelf, in order. catalog_item_id CASCADE (a deleted custom item leaves the shelf; it never blocks the delete). Read and written by members of the ask''s household.';
create index if not exists ask_shelf_items_catalog_item_idx on public.ask_shelf_items (catalog_item_id);

alter table public.ask_shelf_items enable row level security;
revoke all on table public.ask_shelf_items from public;
revoke all on table public.ask_shelf_items from anon;
revoke all on table public.ask_shelf_items from authenticated;
revoke all on table public.ask_shelf_items from service_role;
grant select, insert, delete on table public.ask_shelf_items to authenticated;
grant update (position) on table public.ask_shelf_items to authenticated;
grant select, insert, update, delete on table public.ask_shelf_items to service_role;

drop policy if exists ask_shelf_items_select on public.ask_shelf_items;
create policy ask_shelf_items_select on public.ask_shelf_items
  for select to authenticated
  using (exists (select 1 from public.asks a where a.id = ask_id and public.is_member_of(a.household_id)));
drop policy if exists ask_shelf_items_insert on public.ask_shelf_items;
create policy ask_shelf_items_insert on public.ask_shelf_items
  for insert to authenticated
  with check (exists (select 1 from public.asks a
                        join public.catalog_items ci on ci.id = catalog_item_id
                       where a.id = ask_id and public.is_member_of(a.household_id)
                         and ci.deleted_at is null
                         and (ci.is_global or ci.household_id = a.household_id)));
drop policy if exists ask_shelf_items_update on public.ask_shelf_items;
create policy ask_shelf_items_update on public.ask_shelf_items
  for update to authenticated
  using (exists (select 1 from public.asks a where a.id = ask_id and public.is_member_of(a.household_id)))
  with check (exists (select 1 from public.asks a where a.id = ask_id and public.is_member_of(a.household_id)));
drop policy if exists ask_shelf_items_delete on public.ask_shelf_items;
create policy ask_shelf_items_delete on public.ask_shelf_items
  for delete to authenticated
  using (exists (select 1 from public.asks a where a.id = ask_id and public.is_member_of(a.household_id)));

-- ═══ §4 household_item_photos ═════════════════════════════════════════════════════════════
create table if not exists public.household_item_photos (
  id              uuid        primary key default gen_random_uuid(),
  household_id    uuid        not null references public.households(id) on delete cascade,
  catalog_item_id uuid        not null references public.catalog_items(id) on delete cascade,
  thumb_path      text        not null,
  view_path       text        not null,
  created_by      uuid        not null references public.users(id),
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz null
);
comment on table public.household_item_photos is
  '077 (A23) — the household''s photo of a catalog item, reused by every Ask that shelves it. Two renditions in the private item-photos bucket under {household_id}/{catalog_item_id}/. One live row per (household, item). Writes ONLY through set_household_item_photo / remove_household_item_photo (SECURITY DEFINER); soft delete; objects swept later by the service role (Slice 4).';
create unique index if not exists household_item_photos_one_live
  on public.household_item_photos (household_id, catalog_item_id) where deleted_at is null;
create index if not exists household_item_photos_catalog_item_idx
  on public.household_item_photos (catalog_item_id);

alter table public.household_item_photos enable row level security;
revoke all on table public.household_item_photos from public;
revoke all on table public.household_item_photos from anon;
revoke all on table public.household_item_photos from authenticated;
revoke all on table public.household_item_photos from service_role;
grant select on table public.household_item_photos to authenticated;
grant select, insert, update, delete on table public.household_item_photos to service_role;

drop policy if exists household_item_photos_select on public.household_item_photos;
create policy household_item_photos_select on public.household_item_photos
  for select to authenticated
  using (public.is_member_of(household_id));

create or replace function public.set_household_item_photo(
  p_household_id    uuid,
  p_catalog_item_id uuid,
  p_thumb_path      text,
  p_view_path       text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller uuid;
  v_prefix text;
  v_stem   text;
  v_id     uuid;
begin
  -- Membership FIRST (051).
  if p_household_id is null or not public.is_member_of(p_household_id) then
    raise exception 'set_household_item_photo: not a member of household %', p_household_id using errcode = '42501';
  end if;
  v_caller := public.get_current_user_id();
  if v_caller is null then
    raise exception 'set_household_item_photo: no user for the JWT subject' using errcode = '42501';
  end if;
  if not exists (select 1 from public.catalog_items ci
                  where ci.id = p_catalog_item_id and ci.deleted_at is null
                    and (ci.is_global or ci.household_id = p_household_id)) then
    raise exception 'set_household_item_photo: no live catalog item % for this household', p_catalog_item_id using errcode = '22023';
  end if;
  -- Both paths under {household}/{item}/, one shared uuid stem, an allowed extension (065's form).
  v_prefix := p_household_id::text || '/' || p_catalog_item_id::text || '/';
  v_stem := substring(p_thumb_path from '^' || v_prefix || '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-thumb\.(webp|jpg)$');
  if v_stem is null or p_view_path !~ ('^' || v_prefix || v_stem || '-view\.(webp|jpg)$') then
    raise exception 'set_household_item_photo: paths must be %<uuid>-thumb / -view', v_prefix using errcode = '22023';
  end if;
  -- Upload order: both objects first, then this call.
  if (select count(*) from storage.objects o
       where o.bucket_id = 'item-photos' and o.name in (p_thumb_path, p_view_path)) <> 2 then
    raise exception 'set_household_item_photo: both objects must be uploaded before the row' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_household_id::text));
  -- One live photo per (household, item): a new one replaces it.
  update public.household_item_photos set deleted_at = now()
   where household_id = p_household_id and catalog_item_id = p_catalog_item_id and deleted_at is null;
  insert into public.household_item_photos (household_id, catalog_item_id, thumb_path, view_path, created_by)
  values (p_household_id, p_catalog_item_id, p_thumb_path, p_view_path, v_caller)
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.remove_household_item_photo(p_photo_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hh uuid;
begin
  select household_id into v_hh from public.household_item_photos where id = p_photo_id;
  if v_hh is null or not public.is_member_of(v_hh) then
    raise exception 'remove_household_item_photo: not a member of the photo''s household' using errcode = '42501';
  end if;
  -- Any member removes any item photo. Soft delete — the object stays until the sweep.
  update public.household_item_photos set deleted_at = now() where id = p_photo_id and deleted_at is null;
  return found;
end;
$function$;

revoke all on function public.set_household_item_photo(uuid, uuid, text, text) from public;
revoke all on function public.set_household_item_photo(uuid, uuid, text, text) from anon;
revoke all on function public.set_household_item_photo(uuid, uuid, text, text) from service_role;
grant execute on function public.set_household_item_photo(uuid, uuid, text, text) to authenticated;
revoke all on function public.remove_household_item_photo(uuid) from public;
revoke all on function public.remove_household_item_photo(uuid) from anon;
revoke all on function public.remove_household_item_photo(uuid) from service_role;
grant execute on function public.remove_household_item_photo(uuid) to authenticated;

do $verify$
begin
  if to_regclass('public.asks') is null or to_regclass('public.ask_shelf_items') is null
     or to_regclass('public.household_item_photos') is null then
    raise exception '077 §2–§4: a table is missing';
  end if;
  if (select count(*) from pg_class where oid in ('public.asks'::regclass, 'public.ask_shelf_items'::regclass,
        'public.household_item_photos'::regclass) and relrowsecurity) <> 3 then
    raise exception '077 §2–§4: RLS is not enabled on all three tables';
  end if;
  if (select count(*) from pg_constraint c
       where c.contype = 'f' and c.confrelid = 'public.catalog_items'::regclass and c.confdeltype = 'c'
         and c.conrelid in ('public.ask_shelf_items'::regclass, 'public.household_item_photos'::regclass)) <> 2 then
    raise exception '077 §3–§4: the two catalog_items FKs are not CASCADE';
  end if;
end
$verify$;

-- ═══ §5 bucket item-photos + storage.objects policies ═════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', false, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "item photos readable by members" on storage.objects;
create policy "item photos readable by members" on storage.objects
  for select to authenticated
  using (
    case
      when bucket_id <> 'item-photos' then false
      when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_member_of(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

drop policy if exists "item photos writable by members" on storage.objects;
create policy "item photos writable by members" on storage.objects
  for insert to authenticated
  with check (
    case
      when bucket_id <> 'item-photos' then false
      when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_member_of(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

do $verify$
begin
  if not exists (select 1 from storage.buckets where id = 'item-photos' and not public
                  and file_size_limit = 1048576 and allowed_mime_types = array['image/webp', 'image/jpeg']) then
    raise exception '077 §5: item-photos bucket missing or misconfigured';
  end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
       and policyname in ('item photos readable by members', 'item photos writable by members')) <> 2 then
    raise exception '077 §5: item-photos policies missing';
  end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc
       where oid = to_regprocedure('public.meal_photo_sweep_orphans(integer)')) <> '4ec6f85a41b68e7caa34cd05dce61c09' then
    raise exception '077 §5: meal_photo_sweep_orphans is not 070''s meal-photos-only body';
  end if;
end
$verify$;

-- ═══ §6 the two label-clearing edits (A20) ════════════════════════════════════════════════
-- remove_list_item: 051 verbatim, plus picked_by_labels = null on the soft delete.
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

  -- Soft-delete the list_items row. 077 (A20): the pick labels die with the row.
  update list_items
  set deleted_at = now(),
      picked_by_labels = null
  where id = v_list_item_id;

  return json_build_object(
    'removed', true,
    'list_item_id', v_list_item_id,
    'contributors_cleared', v_cleared
  );
end;
$function$;

-- list_items_resurrect_cleanup: 026 verbatim, plus (c).
create or replace function public.list_items_resurrect_cleanup()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
BEGIN
  -- (a) Provenance dies with the row: clear stale meal links.
  DELETE FROM list_item_meals WHERE list_item_id = NEW.id;

  -- (b) Re-home the row on the current open cycle (NULL if none).
  --     SELECT INTO with zero rows assigns NULL — the intended state.
  SELECT id INTO NEW.cycle_id
    FROM provision_cycles
    WHERE household_id = NEW.household_id
      AND closed_at IS NULL
      AND deleted_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1;

  -- (c) 077 (A20): the pick labels die with the row too. A revived row is a new need;
  --     land_ask_picks sets its own label in a second statement, after this trigger.
  NEW.picked_by_labels := null;

  RETURN NEW;
END;
$function$;

do $verify$
begin
  if (select prosrc not ilike '%picked_by_labels = null%' from pg_proc
       where oid = to_regprocedure('public.remove_list_item(uuid, uuid)')) then
    raise exception '077 §6: remove_list_item does not clear the labels';
  end if;
  if (select prosrc not ilike '%NEW.picked_by_labels := null%' from pg_proc
       where oid = to_regprocedure('public.list_items_resurrect_cleanup()')) then
    raise exception '077 §6: list_items_resurrect_cleanup does not clear the labels';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_list_items_resurrect'
                  and tgrelid = 'public.list_items'::regclass and not tgisinternal) then
    raise exception '077 §6: trg_list_items_resurrect is missing';
  end if;
end
$verify$;

-- ═══ §7 get_list_items_for_household + picked_by_labels ═══════════════════════════════════
-- 051's body; the new column is LAST so every existing reader's fields keep their names.
drop function if exists public.get_list_items_for_household(uuid);
create function public.get_list_items_for_household(p_household_id uuid)
returns table (id uuid, catalog_item_id uuid, quantity integer, price_per_unit numeric, status text,
               added_by uuid, name text, category text, is_staple boolean, picked_by_labels text[])
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
    ) as is_staple,
    li.picked_by_labels
  from list_items li
  join catalog_items ci on ci.id = li.catalog_item_id
  where li.household_id = p_household_id
    and li.deleted_at is null
    and li.status in ('pending','bought')
    and ci.deleted_at is null;
end;
$function$;
revoke all on function public.get_list_items_for_household(uuid) from public;
revoke all on function public.get_list_items_for_household(uuid) from anon;
revoke all on function public.get_list_items_for_household(uuid) from service_role;
grant execute on function public.get_list_items_for_household(uuid) to authenticated;

-- ═══ §8 land_ask_picks ════════════════════════════════════════════════════════════════════
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
revoke all on function public.land_ask_picks(uuid, uuid, uuid[]) from public;
revoke all on function public.land_ask_picks(uuid, uuid, uuid[]) from anon;
revoke all on function public.land_ask_picks(uuid, uuid, uuid[]) from service_role;
grant execute on function public.land_ask_picks(uuid, uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- FIXTURE — definer-run, inside a savepoint, rolled back. Probes the four row states, repeated
-- picks and a second label, every refusal, the ledger under decrement, remove and revive, the
-- roll-forward, no events and no contributors, the list RPC, the RLS and column grants, the
-- photo RPCs, the storage policies, and that the meal-photos sweep cannot see item-photos.
-- Nothing here survives.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
savepoint fixture;

do $fixture$
declare
  v_tag   text := '077-fixture-' || gen_random_uuid()::text;
  v_a     uuid; v_b uuid; v_c uuid;        -- A runs the asks, B a member, C an outsider
  v_hh    uuid; v_hh2 uuid;
  v_cyc   uuid;
  v_i     uuid[] := array[]::uuid[];       -- i1..i6 custom items of hh; i6 is on no shelf
  v_x     uuid;                            -- a custom item of hh2
  v_meal  uuid;
  v_easton uuid; v_everett uuid; v_dead uuid; v_other uuid;
  v_r     public.list_items%rowtype;
  v_n     integer;
  v_ok    integer := 0;
  v_ph    uuid; v_ph2 uuid;
  v_stem  text;
  v_ca    text; v_cb text; v_cc text;
begin
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-a', v_tag || '-a@fixture.invalid', '077 Alpha') returning id into v_a;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-b', v_tag || '-b@fixture.invalid', '077 Bravo') returning id into v_b;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-c', v_tag || '-c@fixture.invalid', '077 Charlie') returning id into v_c;
  insert into public.households (name, created_by) values (v_tag, v_a) returning id into v_hh;
  insert into public.households (name, created_by) values (v_tag || '-other', v_c) returning id into v_hh2;
  insert into public.household_members (household_id, user_id) values (v_hh, v_a), (v_hh, v_b), (v_hh2, v_c);
  insert into public.provision_cycles (household_id, cycle_type, created_by) values (v_hh, 'planned', v_a) returning id into v_cyc;
  for v_n in 1..6 loop
    insert into public.catalog_items (name, category, is_global, household_id, created_by)
    values (v_tag || '-item-' || v_n, 'Snacks', false, v_hh, v_a) returning id into v_x;
    v_i := v_i || v_x;
  end loop;
  insert into public.catalog_items (name, category, is_global, household_id, created_by)
  values (v_tag || '-foreign', 'Snacks', false, v_hh2, v_c) returning id into v_x;
  insert into public.meals (household_id, name, created_by) values (v_hh, v_tag, v_a) returning id into v_meal;
  insert into public.meal_ingredients (meal_id, catalog_item_id, quantity_per_serving) values (v_meal, v_i[3], 2), (v_meal, v_i[4], 2);

  -- The four row states before any pick:
  --   i1 none · i2 tombstone (stale label, link, contributor) · i3 live pending 2, meal owns 2,
  --   B's contributor row · i4 live bought 2, meal owned 2 · i5 none.
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id, deleted_at, picked_by_labels)
  values (v_hh, v_i[2], 3, 'pending', v_b, v_cyc, now() - interval '3 days', array['Stale']);
  insert into public.list_item_meals (list_item_id, meal_id, quantity_contributed, add_count)
  select id, v_meal, 3, 1 from public.list_items where household_id = v_hh and catalog_item_id = v_i[2];
  insert into public.list_item_contributors (list_item_id, user_id, quantity_added)
  select id, v_b, 3 from public.list_items where household_id = v_hh and catalog_item_id = v_i[2];
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id)
  values (v_hh, v_i[3], 2, 'pending', v_b, v_cyc);
  insert into public.list_item_meals (list_item_id, meal_id, quantity_contributed, add_count)
  select id, v_meal, 2, 1 from public.list_items where household_id = v_hh and catalog_item_id = v_i[3];
  insert into public.list_item_contributors (list_item_id, user_id, quantity_added)
  select id, v_b, 2 from public.list_items where household_id = v_hh and catalog_item_id = v_i[3];
  insert into public.list_items (household_id, catalog_item_id, quantity, status, added_by, checked_by, cycle_id)
  values (v_hh, v_i[4], 2, 'bought', v_b, v_b, v_cyc);
  insert into public.list_item_meals (list_item_id, meal_id, quantity_contributed, add_count)
  select id, v_meal, 2, 1 from public.list_items where household_id = v_hh and catalog_item_id = v_i[4];

  insert into public.asks (household_id, label, shelf_noun, screen_style, pick_target, created_by)
  values (v_hh, 'Easton', 'snacks', 'standard', 3, v_a) returning id into v_easton;
  insert into public.asks (household_id, label, screen_style, pick_target, created_by)
  values (v_hh, 'Everett', 'simple', 1, v_b) returning id into v_everett;
  insert into public.asks (household_id, label, pick_target, created_by, deleted_at)
  values (v_hh, 'Gone', 1, v_a, now()) returning id into v_dead;
  insert into public.asks (household_id, label, pick_target, created_by)
  values (v_hh2, 'Other', 1, v_c) returning id into v_other;
  insert into public.ask_shelf_items (ask_id, catalog_item_id, position)
  select v_easton, v_i[k], k - 1 from generate_series(1, 5) k;
  insert into public.ask_shelf_items (ask_id, catalog_item_id, position)
  values (v_everett, v_i[3], 0), (v_everett, v_i[4], 1), (v_dead, v_i[1], 0), (v_other, v_x, 0);

  v_ca := json_build_object('sub', v_tag || '-a', 'role', 'authenticated')::text;
  v_cb := json_build_object('sub', v_tag || '-b', 'role', 'authenticated')::text;
  v_cc := json_build_object('sub', v_tag || '-c', 'role', 'authenticated')::text;
  perform set_config('request.jwt.claims', v_ca, true);
  if public.get_current_user_id() is distinct from v_a then raise exception '077 fixture: impersonation failed'; end if;

  -- (1–7) Refusals, before any write.
  begin perform public.land_ask_picks(v_hh, v_easton, array[v_i[1], v_i[1], v_i[2]]);
        raise exception '077 fixture (1): a duplicate id landed';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.land_ask_picks(v_hh, v_easton, array[v_i[1], v_i[2], v_i[6]]);
        raise exception '077 fixture (2): an off-shelf id landed';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.land_ask_picks(v_hh, v_easton, array[v_i[1]]);
        raise exception '077 fixture (3): a short pick landed';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  begin perform public.land_ask_picks(v_hh, v_dead, array[v_i[1]]);
        raise exception '077 fixture (4): a deleted ask landed';
  exception when sqlstate 'P0002' then v_ok := v_ok + 1; end;
  begin perform public.land_ask_picks(v_hh, v_other, array[v_x]);
        raise exception '077 fixture (5): another household''s ask landed';
  exception when sqlstate 'P0002' then v_ok := v_ok + 1; end;
  begin perform public.land_ask_picks(v_hh, v_easton, array[v_i[1], v_i[2], null]);
        raise exception '077 fixture (6): a null id landed';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  perform set_config('request.jwt.claims', v_cc, true);
  begin perform public.land_ask_picks(v_hh, v_easton, array[v_i[1], v_i[2], v_i[3]]);
        raise exception '077 fixture (7): a non-member landed';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  perform set_config('request.jwt.claims', v_ca, true);
  if exists (select 1 from public.list_items where household_id = v_hh and catalog_item_id = v_i[1])
     or (select quantity from public.list_items where household_id = v_hh and catalog_item_id = v_i[3]) is distinct from 2 then
    raise exception '077 fixture (7): a refused call wrote';
  end if;
  v_ok := v_ok + 1;

  -- (8–11) Easton picks i1 (none), i2 (tombstone), i3 (live pending); A runs it.
  if public.land_ask_picks(v_hh, v_easton, array[v_i[1], v_i[2], v_i[3]]) is distinct from 3 then
    raise exception '077 fixture (8): landed count is not 3';
  end if;
  select * into v_r from public.list_items where household_id = v_hh and catalog_item_id = v_i[1];
  if v_r.quantity is distinct from 1 or v_r.status is distinct from 'pending' or v_r.added_by is distinct from v_a or v_r.cycle_id is distinct from v_cyc
     or v_r.picked_by_labels is distinct from array['Easton'] then
    raise exception '077 fixture (8): none → % % % %', v_r.quantity, v_r.status, v_r.added_by, v_r.picked_by_labels;
  end if;
  v_ok := v_ok + 1;
  select * into v_r from public.list_items where household_id = v_hh and catalog_item_id = v_i[2];
  if v_r.deleted_at is not null or v_r.quantity is distinct from 1 or v_r.added_by is distinct from v_a or v_r.picked_by_labels is distinct from array['Easton']
     or exists (select 1 from public.list_item_meals where list_item_id = v_r.id)
     or exists (select 1 from public.list_item_contributors where list_item_id = v_r.id) then
    raise exception '077 fixture (9): tombstone → % % % (stale label, link or badge left?)', v_r.quantity, v_r.added_by, v_r.picked_by_labels;
  end if;
  v_ok := v_ok + 1;
  select * into v_r from public.list_items where household_id = v_hh and catalog_item_id = v_i[3];
  if v_r.quantity is distinct from 3 or v_r.picked_by_labels is distinct from array['Easton'] or v_r.added_by is distinct from v_b
     or (select quantity_contributed from public.list_item_meals where list_item_id = v_r.id) is distinct from 2
     or (select count(*) from public.list_item_contributors where list_item_id = v_r.id) is distinct from 1 then
    raise exception '077 fixture (10): live pending → % % (ledger or B''s badge moved?)', v_r.quantity, v_r.picked_by_labels;
  end if;
  v_ok := v_ok + 1;
  -- (11) R2: quantity >= SUM on every live pending row of the household.
  if exists (select 1 from public.list_items li
              where li.household_id = v_hh and li.deleted_at is null and li.status = 'pending'
                and li.quantity < (select coalesce(sum(m.quantity_contributed), 0) from public.list_item_meals m where m.list_item_id = li.id)) then
    raise exception '077 fixture (11): a pending row owes less than its meals own';
  end if;
  v_ok := v_ok + 1;

  -- (12–13) Everett (run by B) picks i4 (live bought): the new need.
  perform set_config('request.jwt.claims', v_cb, true);
  if public.land_ask_picks(v_hh, v_everett, array[v_i[4]]) is distinct from 1 then
    raise exception '077 fixture (12): landed count is not 1';
  end if;
  select * into v_r from public.list_items where household_id = v_hh and catalog_item_id = v_i[4];
  if v_r.quantity is distinct from 1 or v_r.status is distinct from 'pending' or v_r.checked_by is not null or v_r.picked_by_labels is distinct from array['Everett'] then
    raise exception '077 fixture (12): bought → % % % % (the bought units came back?)', v_r.quantity, v_r.status, v_r.checked_by, v_r.picked_by_labels;
  end if;
  v_ok := v_ok + 1;
  if (select quantity_contributed from public.list_item_meals where list_item_id = v_r.id) is distinct from 0
     or (select add_count from public.list_item_meals where list_item_id = v_r.id) is distinct from 1 then
    raise exception '077 fixture (13): the bought row''s link was not zeroed with its add_count kept';
  end if;
  v_ok := v_ok + 1;

  -- (14–16) A second label, then a repeat that must not duplicate it.
  perform public.land_ask_picks(v_hh, v_everett, array[v_i[3]]);
  select * into v_r from public.list_items where household_id = v_hh and catalog_item_id = v_i[3];
  if v_r.quantity is distinct from 4 or v_r.picked_by_labels is distinct from array['Easton', 'Everett'] then
    raise exception '077 fixture (14): second label → % %', v_r.quantity, v_r.picked_by_labels;
  end if;
  v_ok := v_ok + 1;
  perform set_config('request.jwt.claims', v_ca, true);
  perform public.land_ask_picks(v_hh, v_easton, array[v_i[3], v_i[1], v_i[5]]);
  select * into v_r from public.list_items where household_id = v_hh and catalog_item_id = v_i[3];
  if v_r.quantity is distinct from 5 or v_r.picked_by_labels is distinct from array['Easton', 'Everett'] then
    raise exception '077 fixture (15): repeat pick → % %', v_r.quantity, v_r.picked_by_labels;
  end if;
  v_ok := v_ok + 1;
  select * into v_r from public.list_items where household_id = v_hh and catalog_item_id = v_i[1];
  if v_r.quantity is distinct from 2 or v_r.picked_by_labels is distinct from array['Easton'] then
    raise exception '077 fixture (16): repeat on i1 → % %', v_r.quantity, v_r.picked_by_labels;
  end if;
  v_ok := v_ok + 1;

  -- (17–18) A21 / A22: no events, no contributor rows for the picks.
  if exists (select 1 from public.list_item_events where household_id = v_hh) then
    raise exception '077 fixture (17): a pick wrote a list_item_events row';
  end if;
  v_ok := v_ok + 1;
  if exists (select 1 from public.list_item_contributors c join public.list_items li on li.id = c.list_item_id
              where li.household_id = v_hh and li.catalog_item_id in (v_i[1], v_i[2], v_i[4], v_i[5])) then
    raise exception '077 fixture (18): a pick wrote a contributor row';
  end if;
  v_ok := v_ok + 1;

  -- (19) The list RPC returns the labels.
  if (select r.picked_by_labels from public.get_list_items_for_household(v_hh) r where r.catalog_item_id = v_i[3])
       is distinct from array['Easton', 'Everett']
     or (select count(*) from public.get_list_items_for_household(v_hh)) is distinct from 5 then
    raise exception '077 fixture (19): get_list_items_for_household does not carry the labels';
  end if;
  v_ok := v_ok + 1;

  -- (20–21) The meal comes off: it takes only what it owns. i3: 5 − 2 = 3 (the picks survive);
  --   i4: its link owns 0 → the row stays at 1 (Everett's need survives).
  perform public.decrement_meal_from_list(v_meal);
  if (select quantity from public.list_items where household_id = v_hh and catalog_item_id = v_i[3]) is distinct from 3 then
    raise exception '077 fixture (20): the meal took more than it owned from i3';
  end if;
  v_ok := v_ok + 1;
  if (select quantity from public.list_items where household_id = v_hh and catalog_item_id = v_i[4]) is distinct from 1 then
    raise exception '077 fixture (21): the meal took the bought row''s new need';
  end if;
  v_ok := v_ok + 1;

  -- (22–23) Remove clears; a manual revive (updateQty's UPDATE) clears.
  perform set_config('request.jwt.claims', v_cb, true);
  perform public.remove_list_item(v_hh, v_i[5]);
  select * into v_r from public.list_items where household_id = v_hh and catalog_item_id = v_i[5];
  if v_r.deleted_at is null or v_r.picked_by_labels is not null then
    raise exception '077 fixture (22): remove_list_item left % on the tombstone', v_r.picked_by_labels;
  end if;
  v_ok := v_ok + 1;
  update public.list_items set picked_by_labels = array['Stale'] where id = v_r.id;   -- as archive_trip_items would leave it
  update public.list_items set quantity = 1, status = 'pending', deleted_at = null where id = v_r.id;
  if (select picked_by_labels from public.list_items where id = v_r.id) is not null then
    raise exception '077 fixture (23): a revive kept a stale label';
  end if;
  v_ok := v_ok + 1;

  -- (24–25) Roll-forward (R4): keep i3 through Wrap up; its labels survive, its badges do not.
  perform public.archive_trip_items(v_hh, array[(select id from public.list_items where household_id = v_hh and catalog_item_id = v_i[3])]);
  perform public.close_cycle(v_cyc, array[(select id from public.list_items where household_id = v_hh and catalog_item_id = v_i[3])]);
  select * into v_r from public.list_items where household_id = v_hh and catalog_item_id = v_i[3];
  if v_r.deleted_at is not null or v_r.picked_by_labels is distinct from array['Easton', 'Everett'] or v_r.cycle_id = v_cyc then
    raise exception '077 fixture (24): roll-forward → deleted % labels % cycle %', v_r.deleted_at, v_r.picked_by_labels, v_r.cycle_id;
  end if;
  v_ok := v_ok + 1;
  -- i4 was archived by Wrap up, not removed: its tombstone keeps a label (stand-in 'Stale'), but a
  -- pick revive starts clean (the resurrect trigger) and carries only the new picker.
  update public.list_items set picked_by_labels = array['Stale'] where household_id = v_hh and catalog_item_id = v_i[4];
  perform set_config('request.jwt.claims', v_ca, true);
  perform public.land_ask_picks(v_hh, v_everett, array[v_i[4]]);
  select * into v_r from public.list_items where household_id = v_hh and catalog_item_id = v_i[4];
  if v_r.deleted_at is not null or v_r.quantity is distinct from 1 or v_r.picked_by_labels is distinct from array['Everett'] then
    raise exception '077 fixture (25): pick on an archived row → % % %', v_r.deleted_at, v_r.quantity, v_r.picked_by_labels;
  end if;
  v_ok := v_ok + 1;

  -- (26–29) Photo RPCs (as A). Objects first, as the client uploads them.
  v_stem := gen_random_uuid()::text;
  insert into storage.objects (bucket_id, name) values
    ('item-photos', v_hh || '/' || v_i[1] || '/' || v_stem || '-thumb.webp'),
    ('item-photos', v_hh || '/' || v_i[1] || '/' || v_stem || '-view.webp');
  v_ph := public.set_household_item_photo(v_hh, v_i[1], v_hh || '/' || v_i[1] || '/' || v_stem || '-thumb.webp',
                                          v_hh || '/' || v_i[1] || '/' || v_stem || '-view.webp');
  if (select created_by from public.household_item_photos where id = v_ph) is distinct from v_a then
    raise exception '077 fixture (26): the photo row is not the caller''s';
  end if;
  v_ok := v_ok + 1;
  v_ph2 := public.set_household_item_photo(v_hh, v_i[1], v_hh || '/' || v_i[1] || '/' || v_stem || '-thumb.webp',
                                           v_hh || '/' || v_i[1] || '/' || v_stem || '-view.webp');
  if (select deleted_at from public.household_item_photos where id = v_ph) is null
     or (select count(*) from public.household_item_photos where household_id = v_hh and catalog_item_id = v_i[1] and deleted_at is null) is distinct from 1 then
    raise exception '077 fixture (27): a second photo did not replace the first';
  end if;
  v_ok := v_ok + 1;
  begin perform public.set_household_item_photo(v_hh, v_i[1], v_hh || '/' || v_i[2] || '/' || v_stem || '-thumb.webp',
                                                v_hh || '/' || v_i[2] || '/' || v_stem || '-view.webp');
        raise exception '077 fixture (28): a path outside the item''s folder was accepted';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  perform set_config('request.jwt.claims', v_cc, true);
  begin perform public.remove_household_item_photo(v_ph2);
        raise exception '077 fixture (29): an outsider removed a photo';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;

  -- (30) The meal-photos sweep cannot see item-photos: an 8-day-old item-photos orphan is not listed.
  insert into storage.objects (bucket_id, name, created_at)
  values ('item-photos', v_hh || '/' || v_i[2] || '/orphan-thumb.webp', now() - interval '8 days');
  if exists (select 1 from public.meal_photo_sweep_orphans(1000) o where o.name like v_hh || '/%') then
    raise exception '077 fixture (30): meal_photo_sweep_orphans listed an item-photos object';
  end if;
  v_ok := v_ok + 1;

  -- (31–41) RLS and column grants, as the authenticated role.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', v_ca, true);
  insert into public.asks (household_id, label, pick_target, created_by) values (v_hh, 'Nina', 2, v_a);
  v_ok := v_ok + 1;                                                                                   -- (31) a member creates
  begin insert into public.asks (household_id, label, pick_target, created_by) values (v_hh, 'Spoof', 2, v_b);
        raise exception '077 fixture (32): created_by was spoofed';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  perform set_config('request.jwt.claims', v_cb, true);                                         -- B edits A's ask
  update public.asks set label = 'Easton J', updated_at = now() where id = v_easton;
  if (select label from public.asks where id = v_easton) is distinct from 'Easton J' then
    raise exception '077 fixture (33): a member could not edit another member''s ask';
  end if;
  v_ok := v_ok + 1;
  begin update public.asks set household_id = v_hh2 where id = v_easton;
        raise exception '077 fixture (34): an ask moved households';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  begin delete from public.asks where id = v_easton;
        raise exception '077 fixture (35): an ask was hard-deleted';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  begin insert into public.ask_shelf_items (ask_id, catalog_item_id, position) values (v_easton, v_x, 9);
        raise exception '077 fixture (36): another household''s item went on a shelf';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  begin insert into public.household_item_photos (household_id, catalog_item_id, thumb_path, view_path, created_by)
        values (v_hh, v_i[2], 'x', 'y', v_a);
        raise exception '077 fixture (37): a photo row was written directly';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  begin execute 'truncate public.asks';
        raise exception '077 fixture (38): authenticated truncated asks';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  if (select count(*) from storage.objects where bucket_id = 'item-photos' and name like v_hh || '/%') is distinct from 3 then
    raise exception '077 fixture (39): a member cannot read the household''s item photos';
  end if;
  v_ok := v_ok + 1;
  perform set_config('request.jwt.claims', v_cc, true);
  if exists (select 1 from public.asks where household_id = v_hh)
     or exists (select 1 from public.ask_shelf_items where ask_id = v_easton)
     or exists (select 1 from public.household_item_photos where household_id = v_hh) then
    raise exception '077 fixture (40): an outsider reads the household''s asks, shelf or photos';
  end if;
  v_ok := v_ok + 1;
  if exists (select 1 from storage.objects where bucket_id = 'item-photos' and name like v_hh || '/%') then
    raise exception '077 fixture (41): an outsider reads the household''s item-photos objects';
  end if;
  v_ok := v_ok + 1;

  -- (42–48) The attribution guard, still as authenticated, as member A.
  perform set_config('request.jwt.claims', v_ca, true);
  if current_user <> 'authenticated' then raise exception '077 fixture: the guard probes are not running as authenticated'; end if;
  begin update public.list_items set picked_by_labels = array['Everett', 'Spoof']
         where household_id = v_hh and catalog_item_id = v_i[4];
        raise exception '077 fixture (42): a client added a label';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  begin insert into public.list_items (household_id, catalog_item_id, quantity, status, picked_by_labels)
        values (v_hh, v_i[6], 1, 'pending', array['Spoof']);
        raise exception '077 fixture (43): a client inserted a labelled row';
  exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  -- updateQty's own write (quantity / status / deleted_at only) still works on a labelled row.
  update public.list_items set quantity = quantity + 1, status = 'pending', deleted_at = null
   where household_id = v_hh and catalog_item_id = v_i[3];
  if (select picked_by_labels from public.list_items where household_id = v_hh and catalog_item_id = v_i[3])
       is distinct from array['Easton', 'Everett'] then
    raise exception '077 fixture (44): a plain client bump changed or lost the labels';
  end if;
  v_ok := v_ok + 1;
  update public.list_items set picked_by_labels = array['Everett']
   where household_id = v_hh and catalog_item_id = v_i[3];                                         -- clearing to a subset
  if (select picked_by_labels from public.list_items where household_id = v_hh and catalog_item_id = v_i[3])
       is distinct from array['Everett'] then
    raise exception '077 fixture (45): a client could not clear a label';
  end if;
  v_ok := v_ok + 1;
  perform public.remove_list_item(v_hh, v_i[4]);                                                    -- a client remove
  if (select picked_by_labels from public.list_items where household_id = v_hh and catalog_item_id = v_i[4]) is not null then
    raise exception '077 fixture (46): a client remove left a label';
  end if;
  v_ok := v_ok + 1;
  update public.list_items set quantity = 1, status = 'pending', deleted_at = null                  -- a client revive (updateQty)
   where household_id = v_hh and catalog_item_id = v_i[4];
  select * into v_r from public.list_items where household_id = v_hh and catalog_item_id = v_i[4];
  if v_r.deleted_at is not null or v_r.picked_by_labels is not null then
    raise exception '077 fixture (47): a client revive failed or kept a label';
  end if;
  v_ok := v_ok + 1;
  perform public.land_ask_picks(v_hh, v_everett, array[v_i[4]]);                                   -- the RPC, called by a client
  if (select picked_by_labels from public.list_items where household_id = v_hh and catalog_item_id = v_i[4])
       is distinct from array['Everett'] then
    raise exception '077 fixture (48): the guard stopped land_ask_picks';
  end if;
  v_ok := v_ok + 1;
  execute 'reset role';

  perform set_config('request.jwt.claims', '', true);
  raise notice '077 fixture: % checks passed', v_ok;
  if v_ok <> 49 then raise exception '077 fixture: % checks passed, want 49', v_ok; end if;
end
$fixture$;

rollback to savepoint fixture;

commit;

-- ═══ CLOSING VERIFY (read-only; run on the same database right after the commit) ══════════
-- Expected, dev and prod alike (except which_db): checked 40 · mismatches 0 · mismatch_detail '' ·
--   col true · col_check true · guard_trigger true · tables 3 · rls 3 · asks_update_cols 6 · shelf_update_cols 1 ·
--   cascade_fks 2 · bucket true · storage_policies 2 · remove_clears true · trigger_clears true ·
--   list_rpc_cols 10 · sweep_body_070 true · forbidden_cols 0 · labelled_rows 0 · asks 0 · fixture_rows 0
with tbl_target (obj, anon_p, auth_p, svc_p) as (values
  ('public.asks',                  '', 'INSERT,SELECT',        'DELETE,INSERT,SELECT,UPDATE'),
  ('public.ask_shelf_items',       '', 'DELETE,INSERT,SELECT', 'DELETE,INSERT,SELECT,UPDATE'),
  ('public.household_item_photos', '', 'SELECT',               'DELETE,INSERT,SELECT,UPDATE')
),
fn_target (obj, anon_p, auth_p, svc_p) as (values
  ('public.land_ask_picks(uuid, uuid, uuid[])',                    '', 'EXECUTE', ''),
  ('public.set_household_item_photo(uuid, uuid, text, text)',      '', 'EXECUTE', ''),
  ('public.remove_household_item_photo(uuid)',                     '', 'EXECUTE', ''),
  ('public.get_list_items_for_household(uuid)',                    '', 'EXECUTE', ''),
  ('public.picked_by_labels_valid(text[])',                        '', 'EXECUTE', 'EXECUTE'),
  ('public.remove_list_item(uuid, uuid)',                          '', 'EXECUTE', ''),
  ('public.list_items_picked_by_guard()',                          '', '',        '')
),
expected (kind, obj, grantee, want) as (
  select 'table', t.obj, v.grantee, v.p from tbl_target t,
         lateral (values ('PUBLIC', ''), ('anon', t.anon_p), ('authenticated', t.auth_p), ('service_role', t.svc_p)) v (grantee, p)
  union all
  select 'function', f.obj, v.grantee, v.p from fn_target f,
         lateral (values ('PUBLIC', ''), ('anon', f.anon_p), ('authenticated', f.auth_p), ('service_role', f.svc_p)) v (grantee, p)
),
actual as (
  select e.obj, e.grantee, e.want,
         coalesce(case e.kind
           when 'table' then (select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                                from pg_class c, aclexplode(c.relacl) a
                               where c.oid = to_regclass(e.obj)
                                 and a.grantee = case e.grantee when 'PUBLIC' then 0 else e.grantee::regrole::oid end
                                 and a.privilege_type <> 'MAINTAIN')
           else (select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                   from pg_proc p, aclexplode(p.proacl) a
                  where p.oid = to_regprocedure(e.obj)
                    and a.grantee = case e.grantee when 'PUBLIC' then 0 else e.grantee::regrole::oid end)
         end, '') as got,
         case e.kind when 'table' then to_regclass(e.obj) is not null else to_regprocedure(e.obj) is not null end as present
    from expected e
)
select
  (select system_identifier from pg_control_system())::text                                       as which_db,
  (select count(*) from actual)                                                                    as checked,
  (select count(*) from actual where got <> want or not present)
  + (select count(*) from (values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')) g (grantee)
      where not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                         where p.oid = to_regprocedure('public.list_items_resurrect_cleanup()')
                           and a.grantee = case g.grantee when 'PUBLIC' then 0 else g.grantee::regrole::oid end
                           and a.privilege_type = 'EXECUTE'))
  + (select count(*) from pg_attribute att, aclexplode(att.attacl) a
      where att.attrelid in ('public.asks'::regclass, 'public.ask_shelf_items'::regclass)
        and a.grantee in (0, 'anon'::regrole::oid))
  + (select count(*) from pg_attribute att, aclexplode(att.attacl) a
      where att.attrelid = 'public.household_item_photos'::regclass)                              as mismatches,
  (select coalesce(string_agg(obj || '/' || grantee || ' want [' || want || '] got [' || got || ']'
                              || case when present then '' else ' MISSING' end, '; ' order by obj, grantee), '')
     from actual where got <> want or not present)                                                as mismatch_detail,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'list_items'
           and column_name = 'picked_by_labels')                                                  as col,
  exists (select 1 from pg_constraint where conrelid = 'public.list_items'::regclass
           and conname = 'list_items_picked_by_labels_valid')                                      as col_check,
  (select string_agg(t.tgname, ',' order by t.tgname) = 'trg_list_items_picked_by_guard,trg_list_items_resurrect'
     from pg_trigger t where t.tgrelid = 'public.list_items'::regclass and not t.tgisinternal)
  and (select not prosecdef from pg_proc where oid = to_regprocedure('public.list_items_picked_by_guard()')) as guard_trigger,
  (select count(*) from pg_class where oid in (to_regclass('public.asks'), to_regclass('public.ask_shelf_items'),
     to_regclass('public.household_item_photos')))                                                 as tables,
  (select count(*) from pg_class where oid in (to_regclass('public.asks'), to_regclass('public.ask_shelf_items'),
     to_regclass('public.household_item_photos')) and relrowsecurity)                              as rls,
  (select count(*) from pg_attribute att, aclexplode(att.attacl) a
    where att.attrelid = 'public.asks'::regclass and a.grantee = 'authenticated'::regrole::oid
      and a.privilege_type = 'UPDATE')                                                             as asks_update_cols,
  (select count(*) from pg_attribute att, aclexplode(att.attacl) a
    where att.attrelid = 'public.ask_shelf_items'::regclass and a.grantee = 'authenticated'::regrole::oid
      and a.privilege_type = 'UPDATE' and att.attname = 'position')                                as shelf_update_cols,
  (select count(*) from pg_constraint where contype = 'f' and confrelid = 'public.catalog_items'::regclass
    and confdeltype = 'c' and conrelid in (to_regclass('public.ask_shelf_items'), to_regclass('public.household_item_photos'))) as cascade_fks,
  exists (select 1 from storage.buckets where id = 'item-photos' and not public and file_size_limit = 1048576
           and allowed_mime_types = array['image/webp', 'image/jpeg'])                             as bucket,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('item photos readable by members', 'item photos writable by members'))     as storage_policies,
  (select prosrc ilike '%picked_by_labels = null%' from pg_proc
    where oid = to_regprocedure('public.remove_list_item(uuid, uuid)'))                            as remove_clears,
  (select prosrc ilike '%NEW.picked_by_labels := null%' from pg_proc
    where oid = to_regprocedure('public.list_items_resurrect_cleanup()'))                          as trigger_clears,
  (select cardinality(proallargtypes) - 1 from pg_proc
    where oid = to_regprocedure('public.get_list_items_for_household(uuid)'))                      as list_rpc_cols,
  (select md5(replace(prosrc, chr(13), '')) = '4ec6f85a41b68e7caa34cd05dce61c09' from pg_proc
    where oid = to_regprocedure('public.meal_photo_sweep_orphans(integer)'))                       as sweep_body_070,
  (select count(*) from information_schema.columns
    where table_schema = 'public'
      and table_name in ('asks', 'ask_shelf_items', 'household_item_photos', 'list_items')
      and column_name ~* '(age|birth|relationship|reason|condition|language|device)')
  - (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'list_items' and column_name = 'deferred_reason') as forbidden_cols,
  (select count(*) from public.list_items where picked_by_labels is not null)                     as labelled_rows,
  (select count(*) from public.asks)                                                               as asks,
  (select count(*) from public.users where clerk_id like '077-fixture-%')
  + (select count(*) from public.households where name like '077-fixture-%')                      as fixture_rows;

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '077_ask'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '077_ask');
