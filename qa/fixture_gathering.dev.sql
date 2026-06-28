-- ============================================================
-- OurProvisions Test Harness — FIXTURE GATHERING
-- Run on DEV (zxwtxjjmssykhqrghouf) — confirm the ref in the URL first.
-- Purpose: collect the real IDs that replace <PLACEHOLDERS> in
-- agent_test_harness.md, so the destructive suite (Part B) can run.
--
-- Output → save as test_fixture.dev.json OUTSIDE the repo (secrets hygiene,
-- same reason as the Supabase creds / Bitwarden item). The harness reads
-- from that file instead of the placeholders.
-- ============================================================

-- 1) Test accounts: clerk_id + user UUID + email
--    Pick: DAN_CLERK_ID + DAN_USER_UUID (primary owner),
--          TEST_CLERK_ID + TEST_USER_UUID (secondary),
--          NONMEMBER_CLERK_ID (a user who is NOT in household A — for B3).
select clerk_id,
       id   as user_uuid,
       email,
       full_name
from users
where deleted_at is null
order by created_at;

-- 2) Households you own/belong to: pick HOUSEHOLD_A_ID and HOUSEHOLD_B_ID
--    (two DIFFERENT households the test user belongs to — for write isolation B2).
--    Also note one HOUSEHOLD_DAN_BELONGS_TO and one HOUSEHOLD_DAN_DOES_NOT (for B4).
select h.id        as household_id,
       h.name,
       u.email     as owner_email,
       u.clerk_id  as owner_clerk_id,
       (select count(*) from household_members m
         where m.household_id = h.id and m.deleted_at is null) as live_members
from households h
join household_members hm on hm.household_id = h.id and hm.role = 'owner' and hm.deleted_at is null
join users u on u.id = hm.user_id
where h.deleted_at is null
order by h.name;

-- 3) Which households does the test user actually belong to?
--    Confirms A/B candidates are both live memberships for the SAME user.
--    Replace the email filter with your chosen test account.
select u.clerk_id,
       u.email,
       h.id   as household_id,
       h.name as household_name,
       hm.role
from household_members hm
join users u      on u.id = hm.user_id
join households h on h.id = hm.household_id
where hm.deleted_at is null
  and h.deleted_at is null
  and u.email ilike '%dan%'         -- <-- adjust to your test account
order by u.email, h.name;

-- 4) A global catalog item id to add/remove in tests (CATALOG_ITEM_ID).
--    Global = safe, exists for every household, never household-specific.
select id   as catalog_item_id,
       name,
       category,
       is_global
from catalog_items
where is_global = true
  and deleted_at is null
order by name
limit 10;

-- 5) (Optional) A user UUID that is a removable non-owner member of a chosen
--    household, for B6 (remove_member). Replace the household name.
select u.id        as target_user_uuid,
       u.email,
       hm.role,
       h.name      as household
from household_members hm
join users u      on u.id = hm.user_id
join households h on h.id = hm.household_id
where hm.deleted_at is null
  and hm.role <> 'owner'
  and h.name = 'REPLACE_WITH_A_HOUSEHOLD_NAME'   -- e.g. a dev test household
order by u.email;

-- ============================================================
-- ASSEMBLE THE FIXTURE (example shape — fill from the outputs above):
--
-- test_fixture.dev.json
-- {
--   "dan_clerk_id":        "user_2....",
--   "dan_user_uuid":       "....-....-....",
--   "test_clerk_id":       "user_2....",
--   "test_user_uuid":      "....-....-....",
--   "nonmember_clerk_id":  "user_2....",
--   "household_a_id":      "....-....-....",
--   "household_b_id":      "....-....-....",
--   "household_dan_belongs_to":  "....",
--   "household_dan_does_not":    "....",
--   "catalog_item_id":     "....-....-....",
--   "owner_clerk_id":      "user_2....",
--   "target_user_uuid":    "....-....-...."
-- }
--
-- Store OUTSIDE the repo. Never commit real IDs/tokens.
-- ============================================================
