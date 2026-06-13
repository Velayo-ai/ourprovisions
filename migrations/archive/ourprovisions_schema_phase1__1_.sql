-- ============================================================
-- OurProvisions — Phase 1 Schema
-- Supabase / PostgreSQL
-- ============================================================
-- Run this in your Supabase SQL editor in order.
-- Enable the pgcrypto extension first for gen_random_uuid().
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- USERS
-- Managed by Clerk — this table mirrors Clerk user data
-- and stores Velayo-specific fields.
-- ============================================================
create table users (
  id                    uuid primary key default gen_random_uuid(),
  clerk_id              text unique not null,       -- Clerk's user ID
  email                 text unique not null,
  full_name             text,
  avatar_url            text,
  data_sharing_consent  boolean default false,      -- future: data marketplace opt-in
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  deleted_at            timestamptz                 -- soft delete
);

-- ============================================================
-- HOUSEHOLDS
-- The core shared entity. A household owns everything.
-- ============================================================
create table households (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  created_by    uuid references users(id) not null,
  budget_goal   decimal(10,2),                      -- optional monthly budget target
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  deleted_at    timestamptz
);

-- ============================================================
-- HOUSEHOLD MEMBERS
-- Who belongs to a household and what role they have.
-- ============================================================
create table household_members (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid references households(id) not null,
  user_id         uuid references users(id) not null,
  role            text default 'member' check (role in ('owner', 'member')),
  joined_at       timestamptz default now(),
  deleted_at      timestamptz,
  unique (household_id, user_id)
);

-- ============================================================
-- CATALOG ITEMS
-- The global library of items that can be added to any list.
-- Some are global (shared across all users), some are
-- custom (created by a specific household).
-- ============================================================
create table catalog_items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text not null,                      -- produce, dairy, meat, pantry, etc.
  unit          text default 'each',                -- each, lb, oz, bag, box, etc.
  is_global     boolean default false,              -- true = available to all users
  created_by    uuid references users(id),          -- null if global
  household_id  uuid references households(id),     -- null if global
  external_id   text,                               -- future: retailer SKU mapping
  created_at    timestamptz default now(),
  deleted_at    timestamptz
);

-- ============================================================
-- LIST ITEMS
-- The living list for a household. Items are never hard deleted
-- — they move through statuses over time.
-- Phase 2 fields (session, sequence, location) are nullable
-- so they don't block Phase 1 development.
-- ============================================================
create table list_items (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid references households(id) not null,
  catalog_item_id   uuid references catalog_items(id) not null,
  quantity          integer default 1,
  price_per_unit    decimal(10,2),
  status            text default 'pending' check (
                      status in ('pending', 'bought', 'skipped', 'deferred')
                    ),
  added_by          uuid references users(id),
  checked_by        uuid references users(id),
  -- Phase 2: shopping intelligence (nullable for now)
  session_id        uuid,                           -- references shopping_sessions
  checked_sequence  integer,                        -- order checked off in session
  checked_lat       float,                          -- GPS lat at check-off
  checked_lng       float,                          -- GPS lng at check-off
  -- Phase 4: nudge tracking
  deferred_reason   text,                           -- why item was deferred
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  deleted_at        timestamptz
);

-- ============================================================
-- WASTE EVENTS
-- Every time an item is thrown away unconsumed.
-- This is the most important AI training data in the app.
-- ============================================================
create table waste_events (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid references households(id) not null,
  catalog_item_id   uuid references catalog_items(id) not null,
  quantity          integer default 1,
  reason            text,                           -- expired, forgotten, spoiled, etc.
  logged_by         uuid references users(id),
  wasted_at         timestamptz default now(),
  deleted_at        timestamptz
);

-- ============================================================
-- INDEXES
-- Keep queries fast as data grows.
-- ============================================================
create index idx_household_members_household on household_members(household_id);
create index idx_household_members_user on household_members(user_id);
create index idx_list_items_household on list_items(household_id);
create index idx_list_items_status on list_items(status);
create index idx_list_items_catalog_item on list_items(catalog_item_id);
create index idx_waste_events_household on waste_events(household_id);
create index idx_waste_events_catalog_item on waste_events(catalog_item_id);
create index idx_catalog_items_category on catalog_items(category);
create index idx_catalog_items_global on catalog_items(is_global);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Critical for Supabase. Without this, any authenticated user
-- can read any household's data. These policies ensure users
-- only see data they belong to.
-- ============================================================
alter table users enable row level security;
alter table households enable row level security;
alter table household_members enable row level security;
alter table catalog_items enable row level security;
alter table list_items enable row level security;
alter table waste_events enable row level security;

-- Users can only read/update their own profile
create policy "users_own_profile" on users
  for all using (id = auth.uid());

-- Households: visible to members only
create policy "households_for_members" on households
  for all using (
    id in (
      select household_id from household_members
      where user_id = auth.uid()
      and deleted_at is null
    )
  );

-- Household members: visible within same household
create policy "members_in_same_household" on household_members
  for all using (
    household_id in (
      select household_id from household_members
      where user_id = auth.uid()
      and deleted_at is null
    )
  );

-- Catalog items: global items visible to all, custom items to household only
create policy "catalog_items_access" on catalog_items
  for all using (
    is_global = true
    or household_id in (
      select household_id from household_members
      where user_id = auth.uid()
      and deleted_at is null
    )
  );

-- List items: household members only
create policy "list_items_for_household" on list_items
  for all using (
    household_id in (
      select household_id from household_members
      where user_id = auth.uid()
      and deleted_at is null
    )
  );

-- Waste events: household members only
create policy "waste_events_for_household" on waste_events
  for all using (
    household_id in (
      select household_id from household_members
      where user_id = auth.uid()
      and deleted_at is null
    )
  );

-- ============================================================
-- REALTIME
-- Enable Supabase realtime on the tables that need live sync.
-- This powers simultaneous editing across household members.
-- ============================================================
alter publication supabase_realtime add table list_items;
alter publication supabase_realtime add table household_members;

-- ============================================================
-- SEED DATA
-- A starter set of global catalog items across categories.
-- Expand this list as you learn what users actually need.
-- ============================================================
insert into catalog_items (name, category, unit, is_global) values
  -- Produce
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
  -- Meat & Seafood
  ('Chicken breast', 'Meat & Seafood', 'lb', true),
  ('Chicken thighs', 'Meat & Seafood', 'lb', true),
  ('Ground beef', 'Meat & Seafood', 'lb', true),
  ('Salmon fillet', 'Meat & Seafood', 'lb', true),
  ('Shrimp', 'Meat & Seafood', 'lb', true),
  -- Dairy
  ('Butter', 'Dairy', 'each', true),
  ('Cheddar cheese', 'Dairy', 'each', true),
  ('Eggs', 'Dairy', 'dozen', true),
  ('Milk', 'Dairy', 'each', true),
  ('Greek yogurt', 'Dairy', 'each', true),
  ('Heavy cream', 'Dairy', 'each', true),
  -- Pantry
  ('Olive oil', 'Pantry', 'each', true),
  ('Pasta', 'Pantry', 'box', true),
  ('Rice', 'Pantry', 'bag', true),
  ('Canned tomatoes', 'Pantry', 'can', true),
  ('Chicken broth', 'Pantry', 'each', true),
  ('Bread', 'Pantry', 'each', true),
  ('Flour', 'Pantry', 'bag', true),
  ('Sugar', 'Pantry', 'bag', true),
  -- Household
  ('Paper towels', 'Household', 'each', true),
  ('Toilet paper', 'Household', 'each', true),
  ('Dish soap', 'Household', 'each', true),
  ('Laundry detergent', 'Household', 'each', true),
  ('Trash bags', 'Household', 'each', true),
  -- Beverages
  ('Coffee', 'Beverages', 'each', true),
  ('Orange juice', 'Beverages', 'each', true),
  ('Sparkling water', 'Beverages', 'each', true);

-- ============================================================
-- END OF PHASE 1 SCHEMA
-- Next: Phase 2 adds shopping_sessions and known_stores
-- ============================================================
