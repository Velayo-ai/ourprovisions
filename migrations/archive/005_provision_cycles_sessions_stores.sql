-- ============================================================
-- OurProvisions — Migration 005
-- Provision Cycles, Shopping Sessions, Known Stores
-- ============================================================
-- This migration introduces the core lifecycle model for
-- how a household provisions itself over time.
--
-- Three new tables:
--   provision_cycles  — the planning unit (one per week/shop-cycle)
--   shopping_sessions — a single person at a single store
--   known_stores      — GPS-learned store locations
--
-- Two updates to existing tables:
--   list_items        — add cycle_id, rolled_from_item_id
--   shopping_sessions — session_id FK now resolvable on list_items
--
-- Scenarios this model supports:
--   1. Household plans together, one person shops
--   2. Household plans together, two people split across stores
--   3. Partial shop, remaining items roll forward to next cycle
--   4. Impromptu trip (one person, spontaneous, closes same day)
--   5. Future: restock cycle (app-suggested based on staples)
--
-- Run AFTER 004_list_item_contributors.sql
-- Depends on: households, users, list_items (all live)
-- ============================================================


-- ============================================================
-- KNOWN STORES
-- GPS-clustered store locations, learned passively over time.
-- Created FIRST because shopping_sessions references it.
-- ============================================================
create table known_stores (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid references households(id) not null,
  name                  text not null,               -- "Market Basket", "Hannaford", "Whole Foods"
  chain                 text,                        -- normalized chain key, e.g. 'market_basket'
                                                     -- used for cross-location price comparisons
  lat                   double precision not null,   -- centroid of GPS cluster
  lng                   double precision not null,
  radius_m              integer default 150,         -- geofence radius in metres
                                                     -- 150m covers most grocery store footprints
  visit_count           integer default 1,           -- incremented on each session close
  last_visited_at       timestamptz,
  confirmed_by_receipt  boolean default false,       -- true once a receipt scan has confirmed
                                                     -- the store name (vs GPS-only inference)
  added_by              uuid references users(id),   -- household member who first visited
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  deleted_at            timestamptz                  -- soft delete if store closes / moves
);

-- Lookup: all stores a household knows about
create index idx_known_stores_household
  on known_stores(household_id)
  where deleted_at is null;

-- Geospatial proximity lookup (lat/lng bounding box scan)
-- PostGIS is not required — we do a simple bounding box in app code
-- using (lat BETWEEN ? AND ?) AND (lng BETWEEN ? AND ?)
-- and then filter by radius_m in JavaScript using Haversine.
-- This index supports that pattern efficiently.
create index idx_known_stores_lat_lng
  on known_stores(lat, lng)
  where deleted_at is null;


-- ============================================================
-- PROVISION CYCLES
-- The planning unit. One cycle = one "round" of provisioning.
-- May span multiple shopping sessions and multiple days.
-- ============================================================
create table provision_cycles (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid references households(id) not null,
  cycle_type      text not null default 'planned'
                    check (cycle_type in (
                      'planned',    -- household builds list, one or more people shop
                      'impromptu',  -- one person, spontaneous, opens and closes fast
                      'restock'     -- app-suggested top-up of staples (Phase 4)
                    )),
  label           text,            -- optional human label, e.g. "Week of June 9"
                                   -- shown in history view; auto-generated if null
  started_at      timestamptz default now(),
  closed_at       timestamptz,     -- null = cycle is still active / open
                                   -- set when household wraps up the cycle
  seeded_from     uuid references provision_cycles(id),
                                   -- which prior cycle did this one roll from?
                                   -- null for the first cycle or manual starts
  item_count      integer,         -- snapshot of total items at close
  sessions_count  integer,         -- how many shopping sessions contributed
  created_by      uuid references users(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()

  -- No deleted_at — cycles are permanent historical records.
  -- Closing a cycle sets closed_at. Cycles are never deleted.
);

-- The active cycle per household (most common query)
create index idx_cycles_household_open
  on provision_cycles(household_id)
  where closed_at is null;

-- History view: all closed cycles for a household, newest first
create index idx_cycles_household_closed
  on provision_cycles(household_id, closed_at desc)
  where closed_at is not null;


-- ============================================================
-- SHOPPING SESSIONS
-- One person, one store, one trip.
-- A session belongs to a cycle. A cycle can have many sessions.
-- ============================================================
create table shopping_sessions (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid references households(id) not null,
  cycle_id        uuid references provision_cycles(id),
                                   -- which cycle is this session fulfilling?
                                   -- null for impromptu trips where cycle is
                                   -- created at the same moment as the session
  user_id         uuid references users(id) not null,
                                   -- the person who went shopping
  store_id        uuid references known_stores(id),
                                   -- which store? null until detected or confirmed
  store_name_raw  text,            -- raw store name from receipt OCR before it's
                                   -- matched to a known_stores row. Kept for audit.
  started_at      timestamptz default now(),
                                   -- first check-off, or explicit "I'm going shopping" tap
  ended_at        timestamptz,     -- set at wrap-up. null = session still active
  item_count      integer,         -- snapshot: how many items checked off this session
  total_spent     decimal(10,2),   -- filled in by receipt scan at wrap-up
  receipt_scanned boolean default false,
                                   -- did the user scan a receipt for this session?
  gps_lat         double precision,-- GPS at session open (first check-off location)
  gps_lng         double precision,-- used to match against known_stores radius
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  deleted_at      timestamptz
);

-- Active sessions for a household (used during shopping)
create index idx_sessions_household_active
  on shopping_sessions(household_id)
  where ended_at is null and deleted_at is null;

-- All sessions in a cycle (used for cycle summary view)
create index idx_sessions_cycle
  on shopping_sessions(cycle_id)
  where deleted_at is null;

-- All sessions by a specific user (used for per-member history)
create index idx_sessions_user
  on shopping_sessions(user_id)
  where deleted_at is null;


-- ============================================================
-- LIST ITEMS — add cycle_id and rolled_from_item_id
-- ============================================================
-- Every list item now belongs to a cycle. When items roll
-- forward to a new cycle, we create new rows (not move the
-- old ones) and set rolled_from_item_id to preserve lineage.
--
-- This means history is always intact — you can always trace
-- an item back through every cycle it appeared in.
-- ============================================================

alter table list_items
  add column if not exists cycle_id uuid references provision_cycles(id);
  -- which cycle does this item belong to?
  -- null on existing rows (pre-migration items are unassigned)
  -- all new items will have this set on insert

alter table list_items
  add column if not exists rolled_from_item_id uuid references list_items(id);
  -- if this item was rolled forward from a prior cycle,
  -- this points to the original list_items row.
  -- null for items added fresh (not rolled from anywhere).
  -- enables "this item has been on the list for 3 cycles" nudge later.


-- Index: all items in a given cycle (primary list query will use this)
create index if not exists idx_list_items_cycle
  on list_items(cycle_id)
  where deleted_at is null;

-- Index: roll-forward lineage (find all descendants of an item)
create index if not exists idx_list_items_rolled_from
  on list_items(rolled_from_item_id)
  where rolled_from_item_id is not null;


-- ============================================================
-- ADD FOREIGN KEY: list_items.session_id → shopping_sessions
-- ============================================================
-- session_id was added to list_items in migration 003 as a
-- forward reference (uuid, no FK). Now that shopping_sessions
-- exists we can make it a proper foreign key.
--
-- NOTE: Run this only if the column exists with no FK yet.
-- Check in Supabase Table Editor before running.
-- ============================================================

-- alter table list_items
--   add constraint list_items_session_id_fkey
--   foreign key (session_id) references shopping_sessions(id);
--
-- Commented out by default — uncomment and run manually after
-- confirming no orphaned session_id values exist in list_items.
-- Query to check: SELECT COUNT(*) FROM list_items WHERE session_id IS NOT NULL;
-- Expected: 0 (no sessions existed before this migration)


-- ============================================================
-- ROW LEVEL SECURITY — known_stores
-- ============================================================
alter table known_stores enable row level security;

-- All household members can read stores their household knows
create policy "known_stores_select_household" on known_stores
  for select using (
    household_id in (
      select household_id from household_members
      where user_id = auth.uid()
      and deleted_at is null
    )
    and deleted_at is null
  );

-- Any household member can add a store (discovered on a trip)
create policy "known_stores_insert_household" on known_stores
  for insert with check (
    household_id in (
      select household_id from household_members
      where user_id = auth.uid()
      and deleted_at is null
    )
  );

-- Any household member can update a store (e.g. rename, confirm)
create policy "known_stores_update_household" on known_stores
  for update using (
    household_id in (
      select household_id from household_members
      where user_id = auth.uid()
      and deleted_at is null
    )
  );


-- ============================================================
-- ROW LEVEL SECURITY — provision_cycles
-- ============================================================
alter table provision_cycles enable row level security;

-- All household members can read cycles
create policy "cycles_select_household" on provision_cycles
  for select using (
    household_id in (
      select household_id from household_members
      where user_id = auth.uid()
      and deleted_at is null
    )
  );

-- Any household member can create a cycle for their household
create policy "cycles_insert_household" on provision_cycles
  for insert with check (
    household_id in (
      select household_id from household_members
      where user_id = auth.uid()
      and deleted_at is null
    )
  );

-- Any household member can update a cycle (close it, add label)
create policy "cycles_update_household" on provision_cycles
  for update using (
    household_id in (
      select household_id from household_members
      where user_id = auth.uid()
      and deleted_at is null
    )
  );


-- ============================================================
-- ROW LEVEL SECURITY — shopping_sessions
-- ============================================================
alter table shopping_sessions enable row level security;

-- All household members can read sessions (for coordination UI)
create policy "sessions_select_household" on shopping_sessions
  for select using (
    household_id in (
      select household_id from household_members
      where user_id = auth.uid()
      and deleted_at is null
    )
    and deleted_at is null
  );

-- A user can only create a session for themselves
-- (can't start a session on behalf of Helen)
create policy "sessions_insert_own" on shopping_sessions
  for insert with check (
    user_id = auth.uid()
    and
    household_id in (
      select household_id from household_members
      where user_id = auth.uid()
      and deleted_at is null
    )
  );

-- A user can only update their own sessions (wrap up, add receipt)
create policy "sessions_update_own" on shopping_sessions
  for update using (user_id = auth.uid());


-- ============================================================
-- REALTIME
-- ============================================================
-- Subscribe to shopping_sessions so all household members see
-- when someone starts or completes a shopping trip in real time.
-- This is what enables "Dan is shopping right now" awareness.
alter publication supabase_realtime add table shopping_sessions;

-- Subscribe to provision_cycles for cycle open/close events.
-- When Helen closes a cycle, Dan's app refreshes to the new one.
alter publication supabase_realtime add table provision_cycles;

-- known_stores: no realtime needed — store list changes rarely
-- and is loaded once on app start.


-- ============================================================
-- HELPER: get_active_cycle(p_household_id)
-- ============================================================
-- Returns the open cycle for a household, or null if none.
-- Used by app on load to determine whether to show the
-- current list or prompt to start a new cycle.
-- ============================================================
create or replace function get_active_cycle(p_household_id uuid)
returns provision_cycles
language sql
security definer
stable
as $$
  select * from provision_cycles
  where household_id = p_household_id
    and closed_at is null
  order by started_at desc
  limit 1;
$$;


-- ============================================================
-- HELPER: close_cycle(p_cycle_id, p_roll_item_ids)
-- ============================================================
-- Closes a cycle and optionally rolls a subset of its items
-- forward into a new cycle. Called from the wrap-up screen.
--
-- p_cycle_id      — the cycle to close
-- p_roll_item_ids — uuid[] of list_item ids to roll forward
--                   pass '{}' (empty array) to close with no rollover
--
-- Returns the new cycle id (or null if no items rolled forward
-- and no new cycle was created).
--
-- NOTE: This function creates the new cycle but does NOT add
-- staple-seeded items — that is handled app-side after calling
-- this function, so the app controls the staples logic.
-- ============================================================
create or replace function close_cycle(
  p_cycle_id      uuid,
  p_roll_item_ids uuid[]
)
returns uuid   -- new cycle id, or null
language plpgsql
security definer
as $$
declare
  v_household_id  uuid;
  v_new_cycle_id  uuid;
  v_item          record;
begin
  -- Look up the household for this cycle
  select household_id into v_household_id
  from provision_cycles
  where id = p_cycle_id;

  if not found then
    raise exception 'Cycle % not found', p_cycle_id;
  end if;

  -- Snapshot item_count and sessions_count, then close the cycle
  update provision_cycles
  set
    closed_at      = now(),
    item_count     = (
      select count(*) from list_items
      where cycle_id = p_cycle_id
        and deleted_at is null
    ),
    sessions_count = (
      select count(*) from shopping_sessions
      where cycle_id = p_cycle_id
        and deleted_at is null
    ),
    updated_at     = now()
  where id = p_cycle_id;

  -- If no items to roll forward, we're done
  if array_length(p_roll_item_ids, 1) is null
     or array_length(p_roll_item_ids, 1) = 0 then
    return null;
  end if;

  -- Create the new cycle, seeded from this one
  insert into provision_cycles (
    household_id,
    cycle_type,
    seeded_from,
    created_by
  )
  select
    v_household_id,
    'planned',
    p_cycle_id,
    auth.uid()
  returning id into v_new_cycle_id;

  -- Roll the selected items forward into the new cycle
  -- Creates new list_items rows — does NOT move old rows.
  -- Old rows remain in the closed cycle as permanent history.
  for v_item in
    select * from list_items
    where id = any(p_roll_item_ids)
      and deleted_at is null
  loop
    insert into list_items (
      household_id,
      catalog_item_id,
      quantity,
      price_per_unit,       -- carry the last known price forward
      status,               -- always 'pending' on a fresh cycle
      added_by,             -- preserve original adder attribution
      cycle_id,
      rolled_from_item_id   -- lineage: points back to the closed cycle's row
    ) values (
      v_household_id,
      v_item.catalog_item_id,
      v_item.quantity,
      v_item.price_per_unit,
      'pending',
      v_item.added_by,
      v_new_cycle_id,
      v_item.id             -- the item in the closed cycle
    );
  end loop;

  return v_new_cycle_id;
end;
$$;


-- ============================================================
-- HELPER: match_known_store(p_household_id, p_lat, p_lng)
-- ============================================================
-- Given a GPS coordinate, returns the closest known store for
-- a household that falls within that store's radius_m.
-- Returns null if no match (new store, or GPS unavailable).
--
-- Uses a simple bounding box pre-filter then Haversine distance.
-- Accurate enough for grocery store footprints (~50–200m radius).
-- Not a PostGIS query — no extension needed.
-- ============================================================
create or replace function match_known_store(
  p_household_id  uuid,
  p_lat           double precision,
  p_lng           double precision
)
returns uuid   -- known_stores.id, or null if no match
language sql
security definer
stable
as $$
  select id
  from known_stores
  where household_id = p_household_id
    and deleted_at is null
    -- Bounding box pre-filter: ~0.05 degrees ≈ 5.5km. Wide net.
    and lat between p_lat - 0.05 and p_lat + 0.05
    and lng between p_lng - 0.05 and p_lng + 0.05
  order by
    -- Haversine approximation: sort by great-circle distance
    -- 111320 = metres per degree of latitude
    sqrt(
      power((lat - p_lat) * 111320, 2) +
      power((lng - p_lng) * 111320 * cos(radians(p_lat)), 2)
    ) asc
  limit 1;
  -- NOTE: the radius_m check is enforced app-side after this call.
  -- The function returns the closest store; the app checks whether
  -- the actual distance is within that store's radius_m.
$$;


-- ============================================================
-- BACKWARD COMPATIBILITY NOTE
-- ============================================================
-- Existing list_items rows have cycle_id = null.
-- The app should treat null cycle_id as "pre-migration" items
-- and display them on the active cycle if one exists, or prompt
-- the user to start a new cycle.
--
-- No backfill is required — null cycle_id rows will naturally
-- age out as the household builds new cycles.
--
-- Suggested app logic on load:
--   1. Call get_active_cycle(household_id)
--   2. If a cycle exists: fetch list_items where cycle_id = cycle.id
--                         OR (cycle_id IS NULL and status = 'pending')
--                         [the OR clause handles pre-migration items]
--   3. If no cycle exists: prompt "Start a new list?" to open one
-- ============================================================


-- ============================================================
-- WHAT THIS ENABLES — SUMMARY
-- ============================================================
--
-- Scenario A: Household plans, Dan shops (20/30 items)
--   - One provision_cycle (planned)
--   - Dan opens a shopping_session → session.cycle_id = cycle.id
--   - Dan checks 20 items → each list_item gets session_id
--   - Dan taps "Wrap up" → close_cycle() called with 10 remaining ids
--   - close_cycle() closes cycle, creates new cycle, rolls 10 items
--
-- Scenario B: Dan shops at Market Basket, Helen at Hannaford
--   - One provision_cycle (planned)
--   - Dan's session + Helen's session both have cycle_id = same cycle
--   - Items Dan checks → session_id = Dan's session
--   - Items Helen checks → session_id = Helen's session
--   - Cycle closes when both are done
--
-- Scenario C: Impromptu trip (Dan at the gym → steak run)
--   - App creates provision_cycle (impromptu) + shopping_session atomically
--   - 3 items added, checked off, receipt scanned, session ends
--   - cycle.closed_at set immediately on wrap-up
--   - seeded_from = null (no prior cycle)
--
-- Scenario D: Store detection
--   - On session open, app calls match_known_store(household_id, lat, lng)
--   - If match: session.store_id = matched store id (silent, no prompt)
--   - If no match: session.store_id = null until receipt scan confirms
--   - On receipt scan: store name parsed → upsert into known_stores
--                      session.store_id set retroactively
--                      known_stores.confirmed_by_receipt = true
--                      known_stores.visit_count incremented
--
-- ============================================================
-- END OF MIGRATION 005
-- Next: Migration 006 — receipts + price_history (Phase 3)
-- ============================================================
