-- ============================================================
-- OurProvisions — Migration 003 (Audit / Catch-Up)
-- Live Schema Audit — June 2026
-- ============================================================
-- This file documents the delta between the Phase 1 schema
-- (001_initial_schema.sql) + harbor migration (002_harbor_crew.sql)
-- and the actual live state of the Supabase public schema as of
-- June 4, 2026.
--
-- Source of truth: column inventory export from Supabase
-- Table Editor → public schema (87 columns across 10 tables/views).
--
-- DO NOT re-run the CREATE TABLE statements — those tables exist.
-- Each section is annotated with its status:
--   [LIVE - undocumented] = exists in Supabase, no prior SQL file
--   [LIVE - column drift]  = table exists, columns added after 001
--   [LIVE - view]          = database view, no RLS needed
--   [LIVE - matches 001]   = no changes, documented for completeness
-- ============================================================


-- ============================================================
-- SECTION 1: COLUMN DRIFT ON EXISTING TABLES
-- Columns added to Phase 1 tables after 001_initial_schema.sql
-- was written. Captured here for reference.
-- ============================================================

-- ------------------------------------------------------------
-- catalog_items — 3 columns added after Phase 1
-- [LIVE - column drift]
-- ------------------------------------------------------------

-- external_id: reserved for future retailer / partner catalog
-- sync (e.g. Market Basket SKU, Fetch item ID). Nullable.
-- ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS
--   external_id text;

-- price_hint: a soft default price for a catalog item, set
-- at the catalog level (not per list_item). Used as a fallback
-- when no real price has been captured via receipt scan.
-- Feeds the category_avg_prices view and budget estimates.
-- ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS
--   price_hint numeric;

-- is_staple: marks an item as a household staple (⭐ toggle).
-- Staples appear in the Browse tab with a visual indicator
-- and are candidates for auto-seeding the next list.
-- Default false. Ships with the staple toggle feature (June 2026).
-- ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS
--   is_staple boolean default false;

-- Live state of catalog_items (all columns):
-- id, name, category, unit, is_global, created_by,
-- household_id, external_id, created_at, deleted_at,
-- price_hint, is_staple


-- ------------------------------------------------------------
-- households — 1 column added by migration 002
-- [LIVE - matches 002_harbor_crew.sql]
-- ------------------------------------------------------------

-- crew_id: links a household to its harbor-level velayo_crew.
-- Added by 002_harbor_crew.sql. Nullable — existing households
-- are not required to have a crew.
-- Already documented in 002_harbor_crew.sql.

-- Live state of households (all columns):
-- id, name, created_by, budget_goal, created_at,
-- updated_at, deleted_at, crew_id


-- ------------------------------------------------------------
-- list_items — 5 columns added after Phase 1
-- [LIVE - column drift]
-- ------------------------------------------------------------
-- These columns were added ahead of the Phase 2 roadmap to
-- capture shopping session intelligence without requiring
-- users to configure anything. Data builds passively.

-- checked_by: the user_id (internal UUID) of the household
-- member who checked off this item. Enables per-member
-- shopping pattern analysis.
-- ALTER TABLE list_items ADD COLUMN IF NOT EXISTS
--   checked_by uuid references users(id);

-- session_id: groups list_items checked off in the same
-- shopping trip. Foreign key to a future shopping_sessions
-- table (Phase 2). Nullable until sessions are built.
-- ALTER TABLE list_items ADD COLUMN IF NOT EXISTS
--   session_id uuid;

-- checked_sequence: the order in which items were checked
-- off within a session. Integer. Used to learn store layout
-- (item A always checked before item B → they're near each
-- other). Foundation for smart list ordering (Phase 2).
-- ALTER TABLE list_items ADD COLUMN IF NOT EXISTS
--   checked_sequence integer;

-- checked_lat / checked_lng: GPS coordinates at the moment
-- an item was checked off. Captured silently. Used with
-- checked_sequence to cluster store locations (Phase 2).
-- ALTER TABLE list_items ADD COLUMN IF NOT EXISTS
--   checked_lat double precision;
-- ALTER TABLE list_items ADD COLUMN IF NOT EXISTS
--   checked_lng double precision;

-- deferred_reason: why an item was skipped in a session.
-- Free text or enum. Enables "leave paper towels for Dan"
-- style nudges when a partner has already deferred an item.
-- ALTER TABLE list_items ADD COLUMN IF NOT EXISTS
--   deferred_reason text;

-- Live state of list_items (all columns):
-- id, household_id, catalog_item_id, quantity,
-- price_per_unit, status, added_by, checked_by,
-- session_id, checked_sequence, checked_lat, checked_lng,
-- deferred_reason, created_at, updated_at, deleted_at


-- ============================================================
-- SECTION 2: NEW TABLES — NOT IN ANY PRIOR MIGRATION FILE
-- These tables exist live in Supabase with no corresponding
-- SQL file. Documented here as the authoritative record.
-- ============================================================


-- ------------------------------------------------------------
-- household_invites
-- [LIVE - undocumented]
-- ------------------------------------------------------------
-- Manages the invite-by-code flow for adding household members.
-- An owner generates a code (6-char alphanumeric, 7-day TTL).
-- The invitee visits /?invite=CODE, acceptInvite() in
-- useProvisions.js looks up the code and joins the household.
-- Accepted invites are soft-marked (accepted_at set), not deleted.
--
-- CREATE TABLE household_invites (
--   id            uuid primary key default gen_random_uuid(),
--   household_id  uuid references households(id) not null,
--   created_by    uuid references users(id) not null,
--   code          text not null,                  -- 6-char, uppercase
--   expires_at    timestamptz not null,            -- now() + 7 days
--   accepted_by   uuid references users(id),       -- set on acceptance
--   accepted_at   timestamptz,                     -- set on acceptance
--   created_at    timestamptz default now(),
--   deleted_at    timestamptz
-- );
--
-- RLS: household owners can insert; members can select by code.
-- No realtime subscription needed — invite flow is one-time.

-- Live columns:
-- id, household_id, created_by, code, expires_at,
-- accepted_by, accepted_at, created_at, deleted_at


-- ------------------------------------------------------------
-- user_hidden_items
-- [LIVE - undocumented]
-- ------------------------------------------------------------
-- Per-user catalog item suppression. When a user deletes a
-- global catalog item (not a household custom item), the item
-- is not hard-deleted — instead, a row is inserted here to
-- hide it for that user only. Other household members are
-- unaffected and still see the item.
--
-- Uses clerk_id (not internal user uuid) as the key because
-- this lookup happens early in the auth flow before the
-- internal user record is guaranteed to be loaded.
--
-- CREATE TABLE user_hidden_items (
--   id              uuid primary key default gen_random_uuid(),
--   clerk_id        text not null,                 -- Clerk user ID
--   catalog_item_id uuid references catalog_items(id) not null,
--   hidden_at       timestamptz default now()
-- );
--
-- RLS: users can only see/insert their own rows (clerk_id match).
-- No deleted_at — these rows are permanent suppressions.
-- To "restore" an item, delete the row.

-- Live columns:
-- id, clerk_id, catalog_item_id, hidden_at


-- ============================================================
-- SECTION 3: VIEWS
-- ============================================================


-- ------------------------------------------------------------
-- category_avg_prices
-- [LIVE - view, UNRESTRICTED — expected, no RLS on views]
-- ------------------------------------------------------------
-- A computed view aggregating average prices per category
-- across all list_items with a price_per_unit set.
-- Marked UNRESTRICTED in Supabase Table Editor — this is
-- correct behaviour for views. The underlying list_items
-- table has RLS; the view inherits that restriction at query
-- time for authenticated users.
--
-- Used in App.js as a fallback price display when no real
-- price exists for a specific item. Shown with a ~ prefix
-- to indicate estimated value.
--
-- Approximate definition (reconstruct from live if needed):
-- CREATE OR REPLACE VIEW category_avg_prices AS
--   SELECT
--     ci.category,
--     AVG(li.price_per_unit) as avg_price
--   FROM list_items li
--   JOIN catalog_items ci ON ci.id = li.catalog_item_id
--   WHERE li.price_per_unit IS NOT NULL
--     AND li.deleted_at IS NULL
--   GROUP BY ci.category;

-- Live columns:
-- category (text), avg_price (numeric)


-- ============================================================
-- SECTION 4: TABLES THAT MATCH PRIOR MIGRATIONS EXACTLY
-- No drift. Listed for completeness.
-- ============================================================

-- users             — matches 001_initial_schema.sql exactly
-- household_members — matches 001_initial_schema.sql exactly
-- waste_events      — matches 001_initial_schema.sql exactly
-- velayo_crews      — matches 002_harbor_crew.sql exactly
-- velayo_crew_members — matches 002_harbor_crew.sql exactly


-- ============================================================
-- SECTION 5: KNOWN MISSING — NOT YET IN SUPABASE
-- Features built or designed but not yet reflected in schema.
-- These are the next migrations to write.
-- ============================================================

-- list_item_contributors (designed, not yet live)
-- Supports contributor badges: when multiple household members
-- add the same item, merge into one row with stacked initials.
-- Columns: id, list_item_id, user_id, quantity_added, added_at
-- Status: designed June 2026, awaiting migration.

-- shopping_sessions (Phase 2 — not yet live)
-- Groups a set of list_items checked off in one trip.
-- Columns: id, household_id, user_id, store_id (nullable),
--          started_at, ended_at, total_spent, deleted_at
-- Status: session_id column exists on list_items as a forward ref.

-- known_stores (Phase 2 — not yet live)
-- GPS-clustered store locations learned from check-off patterns.
-- Columns: id, household_id, name (user-set), lat, lng,
--          radius_m, visit_count, last_visited_at
-- Status: planned.

-- price_history (Phase 3 — not yet live)
-- Per-item, per-store price captured from receipt scans.
-- Columns: id, household_id, catalog_item_id, store_id,
--          price, quantity, scanned_at, receipt_id
-- Status: receipt scan is the Phase 3 intelligence layer.

-- receipts (Phase 3 — not yet live)
-- Raw receipt data from scan (image + parsed JSON).
-- Columns: id, household_id, scanned_by, store_id,
--          raw_image_url, parsed_json, total, purchased_at
-- Status: planned. Email receipt parser identified as
--         most actionable near-term path (no partnerships needed).

-- household_category_overrides (queued)
-- Allows a household to rename a global category.
-- Columns: id, household_id, original_category, display_name
-- Status: designed, pending implementation.


-- ============================================================
-- END OF MIGRATION 003
-- Next: Migration 004 — list_item_contributors table
--       Migration 005 — Phase 2 shopping_sessions + known_stores
-- ============================================================
