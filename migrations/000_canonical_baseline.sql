-- ============================================================
-- OurProvisions — CANONICAL BASELINE
-- ============================================================
-- This file reproduces the ACTUAL live production schema as of
-- 2026-06-12, regenerated from prod introspection (project
-- parpauldmbetptkmdwbd) — not from the historical 00x migration
-- files, which had drifted from reality.
--
-- Run against an EMPTY database to recreate production exactly:
--   tables, columns, constraints, indexes, functions, RLS,
--   policies, realtime, and seed data.
--
-- The old migration files (phase1, 002–006) are kept in
-- archive/ as historical record. THIS FILE is the source of
-- truth going forward. New changes go in 001_*.sql onward.
--
-- Validation: run on a clean dev database, then diff schema
-- against prod. They should match.
--
-- ⚠️  KNOWN DEBT flagged inline below with "-- KNOWN DEBT:".
--     These reproduce prod AS-IS (including bugs). Fixes go in
--     separate, tested migrations — NOT here.
-- ============================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "pgcrypto";


-- ============================================================
-- SECTION 1: TABLES
-- ============================================================
-- Ordered so foreign-key targets exist before their referrers:
--   users → velayo_crews → households → household_members
--   → catalog_items → list_items → (everything else)
-- ============================================================

-- ------------------------------------------------------------
-- users — maps Clerk IDs to internal UUIDs
-- ------------------------------------------------------------
create table users (
  id                    uuid primary key default gen_random_uuid(),
  clerk_id              text unique not null,
  email                 text unique not null,
  full_name             text,
  avatar_url            text,
  data_sharing_consent  boolean default false,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  deleted_at            timestamptz
);

-- ------------------------------------------------------------
-- velayo_crews — harbor-level identity layer (above any app)
-- ------------------------------------------------------------
create table velayo_crews (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  created_by    uuid references users(id) not null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  deleted_at    timestamptz
);

-- ------------------------------------------------------------
-- households — the core shared entity
-- ------------------------------------------------------------
create table households (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  created_by    uuid references users(id) not null,
  budget_goal   numeric(10,2),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  deleted_at    timestamptz,
  crew_id       uuid references velayo_crews(id)
);

-- ------------------------------------------------------------
-- velayo_crew_members — crew membership join table
-- ------------------------------------------------------------
create table velayo_crew_members (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid references velayo_crews(id) not null,
  user_id     uuid references users(id) not null,
  role        text default 'member' check (role in ('owner', 'member', 'guest')),
  invited_by  uuid references users(id),
  joined_at   timestamptz default now(),
  deleted_at  timestamptz,
  unique (crew_id, user_id)
);

-- ------------------------------------------------------------
-- household_members — household membership join table
-- ------------------------------------------------------------
create table household_members (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid references households(id) not null,
  user_id         uuid references users(id) not null,
  role            text default 'member' check (role in ('owner', 'member')),
  joined_at       timestamptz default now(),
  deleted_at      timestamptz,
  unique (household_id, user_id)
);

-- ------------------------------------------------------------
-- household_invites — invite-by-code flow (6-char, 7-day TTL)
-- NOTE: this table was created live and never had a migration
-- file before this baseline.
-- ------------------------------------------------------------
create table household_invites (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid references households(id) not null,
  created_by    uuid references users(id) not null,
  code          text unique not null,
  expires_at    timestamptz not null,
  accepted_by   uuid references users(id),
  accepted_at   timestamptz,
  created_at    timestamptz default now(),
  deleted_at    timestamptz
);

-- ------------------------------------------------------------
-- catalog_items — the item library (global + household-custom)
-- ------------------------------------------------------------
create table catalog_items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text not null,
  unit          text default 'each',
  is_global     boolean default false,
  created_by    uuid references users(id),
  household_id  uuid references households(id),
  external_id   text,
  created_at    timestamptz default now(),
  deleted_at    timestamptz,
  price_hint    numeric,
  is_staple     boolean default false
);

-- ------------------------------------------------------------
-- provision_cycles — the planning unit (one per shop-cycle)
-- No deleted_at by design: cycles are permanent history.
-- ------------------------------------------------------------
create table provision_cycles (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid references households(id) not null,
  cycle_type      text not null default 'planned'
                    check (cycle_type in ('planned', 'impromptu', 'restock')),
  label           text,
  started_at      timestamptz default now(),
  closed_at       timestamptz,
  seeded_from     uuid references provision_cycles(id),
  item_count      integer,
  sessions_count  integer,
  created_by      uuid references users(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ------------------------------------------------------------
-- known_stores — GPS-learned store locations
-- ------------------------------------------------------------
create table known_stores (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid references households(id) not null,
  name                  text not null,
  chain                 text,
  lat                   double precision not null,
  lng                   double precision not null,
  radius_m              integer default 150,
  visit_count           integer default 1,
  last_visited_at       timestamptz,
  confirmed_by_receipt  boolean default false,
  added_by              uuid references users(id),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  deleted_at            timestamptz
);

-- ------------------------------------------------------------
-- list_items — the living household list
-- ------------------------------------------------------------
create table list_items (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid references households(id) not null,
  catalog_item_id     uuid references catalog_items(id) not null,
  quantity            integer default 1,
  price_per_unit      numeric(10,2),
  status              text default 'pending'
                        check (status in ('pending', 'bought', 'skipped', 'deferred')),
  added_by            uuid references users(id),
  checked_by          uuid references users(id),
  session_id          uuid,
  checked_sequence    integer,
  checked_lat         double precision,
  checked_lng         double precision,
  deferred_reason     text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  deleted_at          timestamptz,
  cycle_id            uuid references provision_cycles(id),
  rolled_from_item_id uuid references list_items(id),
  -- One active row per (household, catalog item). Powers the
  -- contributor-merge upsert in close_cycle and the app.
  -- Named explicitly to match prod (prod's name is
  -- list_items_household_catalog_unique, not the PG auto-name).
  constraint list_items_household_catalog_unique unique (household_id, catalog_item_id)
);

-- ------------------------------------------------------------
-- shopping_sessions — one person, one store, one trip
-- ------------------------------------------------------------
create table shopping_sessions (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid references households(id) not null,
  cycle_id        uuid references provision_cycles(id),
  user_id         uuid references users(id) not null,
  store_id        uuid references known_stores(id),
  store_name_raw  text,
  started_at      timestamptz default now(),
  ended_at        timestamptz,
  item_count      integer,
  total_spent     numeric(10,2),
  receipt_scanned boolean default false,
  gps_lat         double precision,
  gps_lng         double precision,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  deleted_at      timestamptz
);

-- ------------------------------------------------------------
-- list_item_contributors — one row per person per item (badges)
-- ------------------------------------------------------------
create table list_item_contributors (
  id                uuid primary key default gen_random_uuid(),
  list_item_id      uuid references list_items(id) not null,
  user_id           uuid references users(id) not null,
  quantity_added    integer not null default 1,
  added_at          timestamptz default now(),
  unique (list_item_id, user_id)
);

-- ------------------------------------------------------------
-- waste_events — thrown-away unconsumed items (AI training data)
-- ------------------------------------------------------------
create table waste_events (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid references households(id) not null,
  catalog_item_id   uuid references catalog_items(id) not null,
  quantity          integer default 1,
  reason            text,
  logged_by         uuid references users(id),
  wasted_at         timestamptz default now(),
  deleted_at        timestamptz
);

-- ------------------------------------------------------------
-- user_hidden_items — per-user catalog suppression
-- Keyed on clerk_id (not user uuid) because the hide lookup
-- runs early in auth before the internal user row is loaded.
-- ------------------------------------------------------------
create table user_hidden_items (
  id              uuid primary key default gen_random_uuid(),
  clerk_id        text not null,
  catalog_item_id uuid references catalog_items(id) not null,
  hidden_at       timestamptz default now(),
  unique (clerk_id, catalog_item_id)
);


-- ============================================================
-- SECTION 2: INDEXES
-- ============================================================
-- (Primary-key and unique-constraint indexes are created
-- automatically by the table definitions above and are not
-- repeated here. These are the explicit secondary indexes.)
-- ============================================================

-- catalog_items
create index idx_catalog_items_category on catalog_items(category);
create index idx_catalog_items_global   on catalog_items(is_global);

-- household_invites
create index idx_household_invites_code      on household_invites(code);
create index idx_household_invites_household on household_invites(household_id);

-- household_members
create index idx_household_members_household on household_members(household_id);
create index idx_household_members_user      on household_members(user_id);

-- households
create index idx_households_crew on households(crew_id);

-- known_stores (partial: active rows only)
create index idx_known_stores_household
  on known_stores(household_id) where deleted_at is null;
create index idx_known_stores_lat_lng
  on known_stores(lat, lng) where deleted_at is null;

-- list_item_contributors
create index idx_contributors_list_item on list_item_contributors(list_item_id);
create index idx_contributors_user      on list_item_contributors(user_id);

-- list_items
create index idx_list_items_catalog_item on list_items(catalog_item_id);
create index idx_list_items_household    on list_items(household_id);
create index idx_list_items_status       on list_items(status);
create index idx_list_items_cycle
  on list_items(cycle_id) where deleted_at is null;
create index idx_list_items_rolled_from
  on list_items(rolled_from_item_id) where rolled_from_item_id is not null;

-- provision_cycles (partial: open vs. closed)
create index idx_cycles_household_open
  on provision_cycles(household_id) where closed_at is null;
create index idx_cycles_household_closed
  on provision_cycles(household_id, closed_at desc) where closed_at is not null;

-- shopping_sessions (partial: active / by cycle / by user)
create index idx_sessions_household_active
  on shopping_sessions(household_id) where ended_at is null and deleted_at is null;
create index idx_sessions_cycle
  on shopping_sessions(cycle_id) where deleted_at is null;
create index idx_sessions_user
  on shopping_sessions(user_id) where deleted_at is null;

-- velayo_crew_members
create index idx_velayo_crew_members_crew on velayo_crew_members(crew_id);
create index idx_velayo_crew_members_user on velayo_crew_members(user_id);

-- waste_events
create index idx_waste_events_catalog_item on waste_events(catalog_item_id);
create index idx_waste_events_household     on waste_events(household_id);


-- ============================================================
-- SECTION 3: VIEWS
-- ============================================================

-- category_avg_prices — average price_per_unit per category,
-- used as a fallback estimate in the UI (shown with a ~ prefix).
-- A view inherits RLS from the underlying list_items at query
-- time, so it is intentionally "unrestricted" on its own.
create or replace view category_avg_prices as
  select
    ci.category,
    avg(li.price_per_unit) as avg_price
  from list_items li
  join catalog_items ci on ci.id = li.catalog_item_id
  where li.price_per_unit is not null
  group by ci.category;


-- ============================================================
-- SECTION 4: FUNCTIONS
-- ============================================================
-- All function bodies below are reproduced VERBATIM from the
-- live prod dump (pg_get_functiondef). The auth pattern is
-- auth.jwt()->>'sub' (Clerk ID), per locked architecture.
--
-- NOTE ON bootstrap_new_user: prod carried FOUR overloaded
-- versions. The app calls the 4-arg signature
--   (p_clerk_id, p_email, p_invite_code, p_full_name)
-- confirmed in useProvisions.js. Only that version is kept here.
-- The three dead overloads — (text,text), (text,text,boolean),
-- (text,text,text) — are intentionally DROPPED in this baseline.
-- ============================================================

-- ------------------------------------------------------------
-- bootstrap_new_user — atomic user + household onboarding,
-- with invite-code join taking priority. (4-arg, canonical)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bootstrap_new_user(p_clerk_id text, p_email text, p_invite_code text DEFAULT NULL::text, p_full_name text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_user_id uuid;
  v_household_id uuid;
  v_invite_id uuid;
  v_household_name text;
begin
  -- 1. Upsert the user — save full_name if provided
  insert into users (clerk_id, email, full_name)
  values (p_clerk_id, p_email, p_full_name)
  on conflict (clerk_id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, users.full_name);

  if v_user_id is null then
    select id into v_user_id from users where clerk_id = p_clerk_id;
  end if;

  -- 2. Handle invite code first (takes priority over existing household)
  if p_invite_code is not null and p_invite_code != '' then
    select id, household_id into v_invite_id, v_household_id
    from household_invites
    where code = upper(p_invite_code)
    and deleted_at is null
    and accepted_at is null
    and expires_at > now();

    if v_invite_id is not null then
      insert into household_members (household_id, user_id, role)
      values (v_household_id, v_user_id, 'member')
      on conflict (household_id, user_id) do nothing;

      update household_invites
      set accepted_by = v_user_id,
          accepted_at = now()
      where id = v_invite_id;

      select name into v_household_name
      from households where id = v_household_id;

      return json_build_object(
        'user_id', v_user_id,
        'household_id', v_household_id,
        'household_name', v_household_name,
        'joined_via_invite', true
      );
    end if;
  end if;

  -- 3. Check if user already has a household
  select household_id into v_household_id
  from household_members
  where user_id = v_user_id
  and deleted_at is null
  limit 1;

  if v_household_id is not null then
    select name into v_household_name
    from households where id = v_household_id;

    return json_build_object(
      'user_id', v_user_id,
      'household_id', v_household_id,
      'household_name', v_household_name,
      'joined_via_invite', false
    );
  end if;

  -- 4. Create a new household
  insert into households (name, created_by)
  values ('My Household', v_user_id)
  returning id into v_household_id;

  insert into household_members (household_id, user_id, role)
  values (v_household_id, v_user_id, 'owner');

  return json_build_object(
    'user_id', v_user_id,
    'household_id', v_household_id,
    'household_name', 'My Household',
    'joined_via_invite', false
  );
end;
$function$;

-- ------------------------------------------------------------
-- archive_trip_items — archive bought + unkept-pending items,
-- clear all contributor badges for the household.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_trip_items(p_household_id uuid, p_keep_item_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_item_id uuid;
begin
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

-- ------------------------------------------------------------
-- close_cycle — snapshot + close a cycle, open a new one, and
-- roll selected items forward (upsert + badge reset).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_cycle(p_cycle_id uuid, p_roll_item_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  update provision_cycles
  set
    closed_at      = now(),
    item_count     = (select count(*) from list_items
                      where household_id = v_household_id and deleted_at is null),
    sessions_count = (select count(*) from shopping_sessions
                      where cycle_id = p_cycle_id and deleted_at is null),
    updated_at     = now()
  where id = p_cycle_id;

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

-- ------------------------------------------------------------
-- delete_custom_catalog_item — hard-delete a custom catalog
-- item household-wide, cascading references first.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_custom_catalog_item(p_household_id uuid, p_catalog_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_global boolean;
  v_household uuid;
BEGIN
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

-- ------------------------------------------------------------
-- get_active_cycle — the open cycle for a household, if any.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_cycle(p_household_id uuid)
 RETURNS provision_cycles
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select * from provision_cycles
  where household_id = p_household_id
    and closed_at is null
  order by started_at desc
  limit 1;
$function$;

-- ------------------------------------------------------------
-- get_catalog_names_by_ids — id→name resolver for a set of ids.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_catalog_names_by_ids(p_ids uuid[])
 RETURNS TABLE(id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select id, name
  from catalog_items
  where id = any(p_ids)
  and deleted_at is null;
$function$;

-- ------------------------------------------------------------
-- get_current_household_id — caller's household, via Clerk sub.
-- Used widely in RLS policies.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_household_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select hm.household_id
  from household_members hm
  join users u on u.id = hm.user_id
  where u.clerk_id = (auth.jwt() ->> 'sub')
  and hm.deleted_at is null
  order by hm.joined_at desc
  limit 1;
$function$;

-- ------------------------------------------------------------
-- get_current_user_id — caller's internal user id, via Clerk sub.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select id from public.users
  where clerk_id = (auth.jwt() ->> 'sub')
  limit 1;
$function$;

-- ------------------------------------------------------------
-- get_household_id_for_current_user — variant household lookup.
-- KNOWN DEBT: overlaps get_current_household_id(). Two functions
-- do nearly the same thing. Consolidate in a later migration.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_household_id_for_current_user()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select household_id
  from household_members
  where user_id = (
    select id from users
    where clerk_id = auth.jwt() ->> 'sub'
    limit 1
  )
  and deleted_at is null
  limit 1;
$function$;

-- ------------------------------------------------------------
-- get_household_member_profiles — member profiles for a household.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_household_member_profiles(p_household_id uuid)
 RETURNS TABLE(user_id uuid, clerk_id text, full_name text, email text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select
    u.id as user_id,
    u.clerk_id,
    u.full_name,
    u.email
  from household_members hm
  join users u on u.id = hm.user_id
  where hm.household_id = p_household_id
  and hm.deleted_at is null;
$function$;

-- ------------------------------------------------------------
-- get_household_user_ids — user ids in a household.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_household_user_ids(p_household_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  select user_id from household_members
  where household_id = p_household_id
  and deleted_at is null;
$function$;

-- ------------------------------------------------------------
-- get_list_items_for_household — the SHOP list read. Returns
-- name/category/is_staple inline via JOIN, bypassing RLS so a
-- separate catalog resolver round-trip isn't needed.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_list_items_for_household(p_household_id uuid)
 RETURNS TABLE(id uuid, catalog_item_id uuid, quantity integer, price_per_unit numeric, status text, added_by uuid, name text, category text, is_staple boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    li.id, li.catalog_item_id, li.quantity, li.price_per_unit,
    li.status, li.added_by,
    ci.name, ci.category, ci.is_staple
  from list_items li
  join catalog_items ci on ci.id = li.catalog_item_id
  where li.household_id = p_household_id
    and li.deleted_at is null
    and li.status in ('pending','bought')
    and ci.deleted_at is null
$function$;

-- ------------------------------------------------------------
-- get_user_id_from_clerk — internal user id from Clerk sub.
-- KNOWN DEBT: duplicates get_current_user_id(). Consolidate later.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_id_from_clerk()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select id from users where clerk_id = (auth.jwt() ->> 'sub') limit 1;
$function$;

-- ------------------------------------------------------------
-- insert_custom_catalog_item — create a household-custom item.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_custom_catalog_item(p_name text, p_category text, p_household_id uuid, p_created_by uuid)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  INSERT INTO catalog_items (name, category, is_global, household_id, created_by)
  VALUES (p_name, p_category, false, p_household_id, p_created_by)
  RETURNING id;
$function$;

-- ------------------------------------------------------------
-- insert_list_item — add a row to the living list.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_list_item(p_household_id uuid, p_catalog_item_id uuid, p_quantity integer, p_status text, p_added_by uuid, p_cycle_id uuid DEFAULT NULL::uuid, p_price_per_unit numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  INSERT INTO list_items (
    household_id, catalog_item_id, quantity, status,
    added_by, cycle_id, price_per_unit
  )
  VALUES (
    p_household_id, p_catalog_item_id, p_quantity, p_status,
    p_added_by, p_cycle_id, p_price_per_unit
  )
  RETURNING id;
$function$;

-- ------------------------------------------------------------
-- match_known_store — closest known store to a GPS point
-- (bounding-box pre-filter + Haversine sort). Radius check is
-- enforced app-side after this returns.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_known_store(p_household_id uuid, p_lat double precision, p_lng double precision)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select id
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
$function$;

-- ------------------------------------------------------------
-- rls_auto_enable — EVENT TRIGGER function. Auto-enables RLS on
-- any newly created public table. (Event trigger itself is
-- created in Section 5.)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;


-- ============================================================
-- SECTION 5: ROW-LEVEL SECURITY — ENABLEMENT
-- ============================================================
-- Reproduced EXACTLY as prod. Note three tables have RLS OFF.
-- ============================================================

alter table catalog_items          enable row level security;
alter table household_invites      enable row level security;
alter table household_members      enable row level security;
alter table households             enable row level security;
alter table list_item_contributors enable row level security;
alter table list_items             enable row level security;
alter table user_hidden_items      enable row level security;
alter table users                  enable row level security;
alter table velayo_crew_members    enable row level security;
alter table velayo_crews           enable row level security;
alter table waste_events           enable row level security;

-- KNOWN DEBT: these three tables have RLS DISABLED in prod.
-- They are reachable only through SECURITY DEFINER RPCs today,
-- so the lack of RLS is not currently exploited — but any
-- direct PostgREST access would be unprotected. Enabling RLS
-- here requires first fixing the broken policies below (they
-- use auth.uid(), which returns the Clerk string, not a UUID).
-- Do that in a separate, tested migration.
alter table known_stores      disable row level security;
alter table provision_cycles  disable row level security;
alter table shopping_sessions disable row level security;
--   (provision_cycles has no policies at all.)

-- Event trigger: auto-enable RLS on any future public table.
-- Drop-and-recreate so this file is idempotent on re-run.
drop event trigger if exists rls_auto_enable_trigger;
create event trigger rls_auto_enable_trigger
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function rls_auto_enable();


-- ============================================================
-- SECTION 6: RLS POLICIES
-- ============================================================
-- Reproduced VERBATIM from prod (pg_policies). The canonical
-- auth pattern is auth.jwt()->>'sub'. Policies that instead use
-- auth.uid() are flagged KNOWN DEBT: auth.uid() returns the
-- Clerk string ID, NOT the internal user UUID, so those policies
-- compare a text Clerk ID against a uuid column and never match.
-- They are inert today because their tables have RLS disabled
-- (or are RPC-only). Fix in a separate, tested migration.
-- ============================================================

-- ---- catalog_items ----
create policy "Anyone can read global catalog items" on catalog_items
  for select to anon
  using (deleted_at is null);

create policy "catalog_items_select" on catalog_items
  for select to authenticated
  using ((is_global = true) or (household_id = get_current_household_id()));

create policy "catalog_items_insert" on catalog_items
  for insert to authenticated
  with check ((is_global = false) and (household_id = get_current_household_id()));

-- NOTE: prod names this policy "...delete their custom items" but
-- it is actually an UPDATE policy. Name preserved as-is.
create policy "household members can delete their custom items" on catalog_items
  for update to public
  using (household_id in (
    select hm.household_id from household_members hm
    join users u on u.id = hm.user_id
    where u.clerk_id = (auth.jwt() ->> 'sub') and hm.deleted_at is null))
  with check (household_id in (
    select hm.household_id from household_members hm
    join users u on u.id = hm.user_id
    where u.clerk_id = (auth.jwt() ->> 'sub') and hm.deleted_at is null));

-- ---- household_invites ----
create policy "invites_select" on household_invites
  for select to authenticated using (true);

create policy "invites_insert" on household_invites
  for insert to authenticated
  with check (household_id = get_current_household_id());

create policy "invites_accept" on household_invites
  for update to authenticated
  using ((deleted_at is null) and (accepted_at is null) and (expires_at > now()))
  with check (accepted_by = get_current_user_id());

-- ---- household_members ----
create policy "household_members_select" on household_members
  for select to authenticated
  using (household_id = get_current_household_id());

create policy "household_members_insert" on household_members
  for insert to authenticated with check (true);

-- ---- households ----
create policy "households_select" on households
  for select to authenticated
  using ((id = get_current_household_id()) or (id in (
    select household_invites.household_id from household_invites
    where (household_invites.deleted_at is null)
      and (household_invites.accepted_at is null)
      and (household_invites.expires_at > now()))));

create policy "households_insert" on households
  for insert to public with check (true);

create policy "households_update" on households
  for update to authenticated
  using (id = get_current_household_id());

-- ---- list_items ----
create policy "list_items_select" on list_items
  for select to public
  using (household_id in (
    select hm.household_id from household_members hm
    join users u on u.id = hm.user_id
    where u.clerk_id = (auth.jwt() ->> 'sub') and hm.deleted_at is null));

create policy "list_items_write" on list_items
  for insert to authenticated
  with check (household_id = get_current_household_id());

create policy "list_items_update" on list_items
  for update to authenticated
  using (household_id = get_current_household_id());

create policy "list_items_delete" on list_items
  for delete to authenticated
  using (household_id = get_current_household_id());

-- ---- list_item_contributors ----
create policy "contributors_visible_to_household" on list_item_contributors
  for select to public using (true);

create policy "contributors_insert_own" on list_item_contributors
  for insert to public
  with check ((user_id in (
      select users.id from users where users.clerk_id = (auth.jwt() ->> 'sub')))
    and (list_item_id in (
      select li.id from list_items li
      join household_members hm on hm.household_id = li.household_id
      join users u on u.id = hm.user_id
      where u.clerk_id = (auth.jwt() ->> 'sub')
        and hm.deleted_at is null and li.deleted_at is null)));

create policy "contributors_update_own" on list_item_contributors
  for update to public
  using (user_id in (
    select users.id from users where users.clerk_id = (auth.jwt() ->> 'sub')));

create policy "contributors_delete_own" on list_item_contributors
  for delete to public
  using (user_id in (
    select users.id from users where users.clerk_id = (auth.jwt() ->> 'sub')));

-- ---- user_hidden_items ----
create policy "hidden_items_for_user" on user_hidden_items
  for all to public
  using (clerk_id = (auth.jwt() ->> 'sub'));

-- ---- users ----
create policy "users_select_own" on users
  for select to authenticated
  using (clerk_id = (auth.jwt() ->> 'sub'));

create policy "users_insert" on users
  for insert to public
  with check (clerk_id = (auth.jwt() ->> 'sub'));

create policy "users_insert_own" on users
  for insert to authenticated
  with check (clerk_id = (auth.jwt() ->> 'sub'));

create policy "users_update" on users
  for update to public
  using (clerk_id = (auth.jwt() ->> 'sub'));

create policy "users_update_own" on users
  for update to authenticated
  using (clerk_id = (auth.jwt() ->> 'sub'))
  with check (clerk_id = (auth.jwt() ->> 'sub'));

-- ---- waste_events ----
create policy "waste_events_all" on waste_events
  for all to authenticated
  using (household_id = get_current_household_id())
  with check (household_id = get_current_household_id());

-- ---- known_stores ----
-- KNOWN DEBT: uses auth.uid() (Clerk string) against user_id (uuid).
-- These never match. Inert today: known_stores has RLS disabled.
create policy "known_stores_select_household" on known_stores
  for select to public
  using ((household_id in (
      select household_members.household_id from household_members
      where (household_members.user_id = auth.uid())
        and (household_members.deleted_at is null)))
    and (deleted_at is null));

create policy "known_stores_insert_household" on known_stores
  for insert to public
  with check (household_id in (
    select household_members.household_id from household_members
    where (household_members.user_id = auth.uid())
      and (household_members.deleted_at is null)));

create policy "known_stores_update_household" on known_stores
  for update to public
  using (household_id in (
    select household_members.household_id from household_members
    where (household_members.user_id = auth.uid())
      and (household_members.deleted_at is null)));

-- ---- shopping_sessions ----
-- KNOWN DEBT: uses auth.uid() (Clerk string) against user_id (uuid).
-- These never match. Inert today: shopping_sessions has RLS disabled.
create policy "sessions_select_household" on shopping_sessions
  for select to public
  using ((household_id in (
      select household_members.household_id from household_members
      where (household_members.user_id = auth.uid())
        and (household_members.deleted_at is null)))
    and (deleted_at is null));

create policy "sessions_insert_own" on shopping_sessions
  for insert to public
  with check ((user_id = auth.uid()) and (household_id in (
    select household_members.household_id from household_members
    where (household_members.user_id = auth.uid())
      and (household_members.deleted_at is null))));

create policy "sessions_update_own" on shopping_sessions
  for update to public
  using (user_id = auth.uid());

-- ---- velayo_crews ----
-- KNOWN DEBT: uses auth.uid() (Clerk string) against user_id (uuid).
-- These never match. RLS is ENABLED on this table, so crew reads
-- via PostgREST will return nothing until this is fixed. Harbor
-- crew UI is not yet built, so no live feature depends on it today.
create policy "crews_for_members" on velayo_crews
  for all to public
  using (id in (
    select velayo_crew_members.crew_id from velayo_crew_members
    where (velayo_crew_members.user_id = auth.uid())
      and (velayo_crew_members.deleted_at is null)));

-- ---- velayo_crew_members ----
-- KNOWN DEBT: same auth.uid()/uuid mismatch as above. RLS enabled.
create policy "crew_members_in_same_crew" on velayo_crew_members
  for all to public
  using (crew_id in (
    select velayo_crew_members_1.crew_id from velayo_crew_members velayo_crew_members_1
    where (velayo_crew_members_1.user_id = auth.uid())
      and (velayo_crew_members_1.deleted_at is null)));


-- ============================================================
-- SECTION 7: REALTIME
-- ============================================================
-- Tables published for Supabase realtime. (App uses 2s polling
-- for the list due to Clerk/Supabase subscription auth issues;
-- these publications are retained from earlier design.)
-- ============================================================
alter publication supabase_realtime add table list_items;
alter publication supabase_realtime add table household_members;
alter publication supabase_realtime add table velayo_crew_members;
alter publication supabase_realtime add table list_item_contributors;


-- ============================================================
-- SECTION 8: SEED DATA
-- ============================================================
-- 38 global catalog items (Phase 1 seed set).
-- NOTE: prod additionally carries 10 DUPLICATE global seed items
-- (Flour, Sugar, Bananas, Broccoli, Carrots, Garlic, Lemons,
-- Potatoes, Spinach, Tomatoes), left intentionally as an
-- acceptance-test fixture for the catalog-merge feature. They are
-- NOT reproduced here — a clean baseline should seed clean. If you
-- want the fixture in dev, add the dupes manually after load.
-- ============================================================
insert into catalog_items (name, category, unit, is_global) values
  ('Apples', 'Produce', 'bag', true),
  ('Bananas', 'Produce', 'bunch', true),
  ('Broccoli', 'Produce', 'each', true),
  ('Carrots', 'Produce', 'bag', true),
  ('Garlic', 'Produce', 'each', true),
  ('Lemons', 'Produce', 'each', true),
  ('Lettuce', 'Produce', 'each', true),
  ('Onions', 'Produce', 'bag', true),
  ('Potatoes', 'Produce', 'bag', true),
  ('Spinach', 'Produce', 'bag', true),
  ('Tomatoes', 'Produce', 'each', true),
  ('Chicken breast', 'Meat & Seafood', 'lb', true),
  ('Chicken thighs', 'Meat & Seafood', 'lb', true),
  ('Ground beef', 'Meat & Seafood', 'lb', true),
  ('Salmon fillet', 'Meat & Seafood', 'lb', true),
  ('Shrimp', 'Meat & Seafood', 'lb', true),
  ('Butter', 'Dairy', 'each', true),
  ('Cheddar cheese', 'Dairy', 'each', true),
  ('Eggs', 'Dairy', 'dozen', true),
  ('Milk', 'Dairy', 'each', true),
  ('Greek yogurt', 'Dairy', 'each', true),
  ('Heavy cream', 'Dairy', 'each', true),
  ('Olive oil', 'Pantry', 'each', true),
  ('Pasta', 'Pantry', 'box', true),
  ('Rice', 'Pantry', 'bag', true),
  ('Canned tomatoes', 'Pantry', 'can', true),
  ('Chicken broth', 'Pantry', 'each', true),
  ('Bread', 'Pantry', 'each', true),
  ('Flour', 'Pantry', 'bag', true),
  ('Sugar', 'Pantry', 'bag', true),
  ('Paper towels', 'Household', 'each', true),
  ('Toilet paper', 'Household', 'each', true),
  ('Dish soap', 'Household', 'each', true),
  ('Laundry detergent', 'Household', 'each', true),
  ('Trash bags', 'Household', 'each', true),
  ('Coffee', 'Beverages', 'each', true),
  ('Orange juice', 'Beverages', 'each', true),
  ('Sparkling water', 'Beverages', 'each', true);


-- ============================================================
-- END OF CANONICAL BASELINE
-- ============================================================
