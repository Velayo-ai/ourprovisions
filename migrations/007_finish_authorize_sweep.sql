-- ============================================================
-- Migration 007 — finish the authorize-don't-guess sweep
-- Converts the last get_current_household_id() gates to is_member_of.
-- DEPENDS ON 003 (is_member_of). Apply 003 first.
-- Scope: waste_events, catalog_items (select+insert),
--        household_invites (insert), household_members (select).
--
-- ROOT CAUSE this fixes: household_members_select was gated on
-- household_id = get_current_household_id(), so under the
-- authenticated role a multi-household user could only SEE their
-- membership row for the single guessed household. Every inline
-- membership join inherited that blindness — including the
-- list_item_contributors INSERT policy, which 403'd when adding
-- an item to any non-guessed household. Authorizing SELECT across
-- all memberships clears the contributor 403 without touching the
-- contributor policy.
--
-- DEFERRED (not in this migration, by design — don't-stack):
--   - Owner-gate for household_invites INSERT / households rename /
--     delete_household. Invites stays is_member_of here; the
--     owner-capabilities migration tightens invites+rename+delete
--     together.
--   - Contributor INSERT/UPDATE policies still use inline joins and
--     the UPDATE policy lacks WITH CHECK. Cleanup, not a blocker —
--     they work once household_members_select is fixed.
-- ============================================================

-- ---- household_members: SEE membership in ANY household you belong to
drop policy if exists "household_members_select" on household_members;
create policy "household_members_select" on household_members
  for select to authenticated
  using (is_member_of(household_id));

-- ---- waste_events: read/write in ANY household you belong to
drop policy if exists "waste_events_all" on waste_events;
create policy "waste_events_all" on waste_events
  for all to authenticated
  using (is_member_of(household_id))
  with check (is_member_of(household_id));

-- ---- catalog_items SELECT: global items, plus custom items in ANY of your households
drop policy if exists "catalog_items_select" on catalog_items;
create policy "catalog_items_select" on catalog_items
  for select to authenticated
  using ((is_global = true) or is_member_of(household_id));

-- ---- catalog_items INSERT: custom items into ANY of your households
drop policy if exists "catalog_items_insert" on catalog_items;
create policy "catalog_items_insert" on catalog_items
  for insert to authenticated
  with check ((is_global = false) and is_member_of(household_id));

-- ---- household_invites INSERT: create invites for ANY of your households
--      (member-gated for now; owner-gate deferred to the owner-capabilities migration)
drop policy if exists "invites_insert" on household_invites;
create policy "invites_insert" on household_invites
  for insert to authenticated
  with check (is_member_of(household_id));
