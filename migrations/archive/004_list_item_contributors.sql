-- ============================================================
-- OurProvisions — Migration 004
-- Contributor Badges: list_item_contributors
-- ============================================================
-- When multiple household members independently add the same
-- item to the list, we merge into one row (no duplicates) and
-- record each contributor separately in this table.
--
-- The UI shows stacked initials badges: [D][H][E]
-- Quantity on the list_items row is the sum of all
-- contributor quantities.
--
-- Run AFTER 003_live_schema_audit_june2026.sql
-- Depends on: list_items, users (both live)
-- ============================================================


-- ============================================================
-- LIST ITEM CONTRIBUTORS
-- One row per person who added a given list_item.
-- ============================================================
create table list_item_contributors (
  id                uuid primary key default gen_random_uuid(),
  list_item_id      uuid references list_items(id) not null,
  user_id           uuid references users(id) not null,
  quantity_added    integer not null default 1,    -- qty this person added
  added_at          timestamptz default now(),
  unique (list_item_id, user_id)                   -- one row per person per item
);


-- ============================================================
-- INDEXES
-- ============================================================

-- Primary lookup: all contributors for a given list item
create index idx_contributors_list_item
  on list_item_contributors(list_item_id);

-- Reverse lookup: all items a specific user has contributed to
-- (useful for "items I added" filtering and attribution UI)
create index idx_contributors_user
  on list_item_contributors(user_id);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table list_item_contributors enable row level security;

-- Contributors are visible to all members of the same household.
-- We reach the household via list_items → household_id.
create policy "contributors_visible_to_household" on list_item_contributors
  for select using (
    list_item_id in (
      select id from list_items
      where household_id in (
        select household_id from household_members
        where user_id = auth.uid()
        and deleted_at is null
      )
      and deleted_at is null
    )
  );

-- Insert: only household members can add contributor rows,
-- and only for their own user_id (can't impersonate others).
create policy "contributors_insert_own" on list_item_contributors
  for insert with check (
    user_id = auth.uid()
    and
    list_item_id in (
      select id from list_items
      where household_id in (
        select household_id from household_members
        where user_id = auth.uid()
        and deleted_at is null
      )
      and deleted_at is null
    )
  );

-- Update: a user can only update their own contributor row
-- (e.g. to adjust quantity_added if they tap + again)
create policy "contributors_update_own" on list_item_contributors
  for update using (user_id = auth.uid());

-- Delete: a user can remove their own contribution
-- (triggered when they reduce their quantity to 0)
create policy "contributors_delete_own" on list_item_contributors
  for delete using (user_id = auth.uid());


-- ============================================================
-- REALTIME
-- ============================================================
-- Subscribe so all household members see badge updates live
-- when a second person adds the same item.
alter publication supabase_realtime add table list_item_contributors;


-- ============================================================
-- HOW THE MERGE LOGIC WORKS (app-side, not enforced in DB)
-- ============================================================
-- When a user adds an item that already exists on the list:
--
--   1. DO NOT insert a new list_items row.
--   2. Increment list_items.quantity by the new qty.
--   3. Upsert into list_item_contributors:
--        - If a row exists for this user + list_item → increment quantity_added
--        - If no row exists → insert with quantity_added = new qty
--
-- On quantity decrement (user taps minus):
--   1. Decrement list_items.quantity.
--   2. Decrement this user's quantity_added in list_item_contributors.
--   3. If quantity_added reaches 0 → delete the contributor row.
--   4. If list_items.quantity reaches 0 → remove the list_items row entirely.
--
-- Badge display:
--   SELECT lcm.user_id, u.full_name, lc.quantity_added
--   FROM list_item_contributors lc
--   JOIN users u ON u.id = lc.user_id
--   WHERE lc.list_item_id = $1
--   ORDER BY lc.added_at ASC
--
--   Render initials in added_at order: first adder leftmost.
--   Show quantity_added per badge if > 1 (e.g. [D×2]).
--
-- Quantity tooltip (on badge tap):
--   "Dan added 2 · Helen added 1"


-- ============================================================
-- QUERY PATTERN — loading contributors with list items
-- ============================================================
-- The loadListItems function in useProvisions.js should be
-- updated to join contributors:
--
--   select
--     li.id,
--     li.catalog_item_id,
--     li.quantity,
--     li.price_per_unit,
--     li.status,
--     li.added_by,
--     catalog_items(name),
--     list_item_contributors(
--       user_id,
--       quantity_added,
--       added_at,
--       users(full_name, clerk_id)
--     )
--   from list_items li
--   where li.household_id = $household_id
--   and li.deleted_at is null
--   and li.status in ('pending', 'bought')
--
-- The nested list_item_contributors array replaces the single
-- added_by field for multi-contributor display.
-- added_by on list_items is retained as the "primary adder"
-- (first person to add) for backwards compatibility.


-- ============================================================
-- MIGRATION NOTE
-- ============================================================
-- This table is new — no existing list_items rows have
-- contributor records yet. That is expected.
--
-- On first run after deploy:
--   - Existing list items will show no badges (contributors = [])
--   - New items added after deploy will populate contributors
--   - Backfill is optional: could seed one contributor row
--     per list_item using added_by + quantity, but not required
--     for the feature to work going forward.
--
-- Optional backfill (run manually if desired):
-- INSERT INTO list_item_contributors (list_item_id, user_id, quantity_added, added_at)
-- SELECT id, added_by, quantity, created_at
-- FROM list_items
-- WHERE added_by IS NOT NULL
--   AND deleted_at IS NULL
--   AND status IN ('pending', 'bought')
-- ON CONFLICT (list_item_id, user_id) DO NOTHING;


-- ============================================================
-- END OF MIGRATION 004
-- Next: Migration 005 — shopping_sessions + known_stores (Phase 2)
-- ============================================================
