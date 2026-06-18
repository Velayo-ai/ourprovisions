-- ============================================================
-- Migration 004 — list_items write policies: authorize, don't assume
-- DEPENDS ON 003 (is_member_of). Apply 003 first and verify it
-- before applying this. This migration is INERT without 003 —
-- the policies reference a function that must already exist.
--
-- WHAT THIS FIXES
-- ---------------
-- Today the list_items write policies gate on the SINGLE guessed
-- household:
--     with check (household_id = get_current_household_id())
-- ...where get_current_household_id() returns one household via
-- `order by joined_at desc limit 1`. A user in two households can
-- therefore only WRITE to the guessed one; inserts/updates/deletes
-- targeting their OTHER household fail the policy. That is the
-- three-way ordering bug, living in the write path.
--
-- The SELECT policy already authorizes correctly — it allows ANY
-- household the caller belongs to. This migration brings the WRITE
-- policies into line with that same semantics, via is_member_of:
--     using / with check (is_member_of(household_id))
-- = "the caller may write to ANY household they belong to."
--
-- Division of responsibility (the Harbour standard):
--   - The CLIENT decides which household is active and sends that
--     household_id on the row it writes.
--   - The SERVER (these policies) verifies the caller is a MEMBER
--     of that household. It no longer PICKS a household.
--
-- SCOPE: list_items ONLY. The same `= get_current_household_id()`
-- write-gate pattern also exists on waste_events, catalog_items
-- (insert), households (update/select), household_invites (insert),
-- and household_members (select). Those carry the identical latent
-- bug but are dormant (not exercised by a multi-household user
-- today) and each needs its own judgment — notably the households
-- policies encode "who may rename/delete a household." They are
-- deliberately NOT touched here. Captured as follow-on debt for a
-- future migration (005). Don't-stack: convert the hot path, prove
-- it, then take the rest as its own reviewed arc.
-- ============================================================

-- ------------------------------------------------------------
-- INSERT — was: with check (household_id = get_current_household_id())
-- now:  may insert a row into ANY household the caller belongs to.
-- ------------------------------------------------------------
drop policy if exists "list_items_write" on list_items;
create policy "list_items_write" on list_items
  for insert to authenticated
  with check (is_member_of(household_id));

-- ------------------------------------------------------------
-- UPDATE — was: using (household_id = get_current_household_id())
--               [no with check]
-- now:  USING gates which rows you may touch (must be in a household
--       you belong to). WITH CHECK is ADDED (the original lacked it)
--       so you cannot move a row INTO a household you are not a
--       member of. Both clauses use the same membership test.
-- ------------------------------------------------------------
drop policy if exists "list_items_update" on list_items;
create policy "list_items_update" on list_items
  for update to authenticated
  using (is_member_of(household_id))
  with check (is_member_of(household_id));

-- ------------------------------------------------------------
-- DELETE — was: using (household_id = get_current_household_id())
-- now:  may delete a row in ANY household the caller belongs to.
-- (DELETE takes no with check.)
-- ------------------------------------------------------------
drop policy if exists "list_items_delete" on list_items;
create policy "list_items_delete" on list_items
  for delete to authenticated
  using (is_member_of(household_id));

-- ------------------------------------------------------------
-- NOTE ON SELECT: list_items_select is intentionally NOT changed.
-- It already authorizes against ALL of the caller's households via
-- an inline subquery and is the behavioral model this migration
-- mirrors onto writes. Leaving it as-is keeps the diff minimal;
-- folding it onto is_member_of() is optional cleanup for a later
-- consolidation pass, not a fix.
-- ------------------------------------------------------------

-- ============================================================
-- DEV VERIFICATION (run by hand on dev; NOT part of the migration).
-- Goal: prove a two-household user can now WRITE to BOTH households
-- and still cannot write to a third. Run through the app where
-- possible (real JWT) OR fake the JWT in the SQL Editor as below.
--
-- Setup (same as 003's smoke test):
--   select set_config('request.jwt.claims',
--     json_build_object('sub','user_3BVcVwOqXaBBVxum1d8UZeBQ85S')::text,
--     true);
--
-- Then, as the postgres role, RLS is bypassed — so these manual
-- checks must run under the 'authenticated' role to actually
-- exercise the policy. The cleanest proof is via the APP:
--   1. Switch ActiveHousehold to "My Household" → add an item.
--      Expect: success.
--   2. Switch to "Lake House" → add an item.
--      Expect: success.  (THIS is what was broken before — writing
--      to the non-guessed household.)
--   3. Both items appear under their respective households; neither
--      leaks into the other.
--   4. Regression: single-household user (or a fresh test user) can
--      still add/check/remove items normally.
--
-- If an insert silently fails or returns a policy violation for the
-- second household, is_member_of is returning false for it — re-run
-- 003's smoke test for that household_id before debugging here.
-- ============================================================
