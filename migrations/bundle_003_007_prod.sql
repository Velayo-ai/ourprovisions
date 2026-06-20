BEGIN;

-- ============================================================
-- Migration 003 — is_member_of(p_household_id)
-- The shared authorization primitive for the active-context standard.
--
-- WHY THIS EXISTS
-- ---------------
-- Decision (2026-06-17): active context is client-authoritative;
-- the server AUTHORIZES the household the client claims, it never
-- PICKS one. Today the write policies on list_items do:
--
--     with check (household_id = get_current_household_id())
--
-- ...and get_current_household_id() returns ONE household via
-- `order by joined_at desc limit 1` — a guess. So a user who
-- belongs to two households can only WRITE to the guessed one;
-- writes to their other household fail the policy check. That is
-- the three-way ordering bug, living in the RLS write path.
--
-- The SELECT policy on list_items already does the RIGHT thing —
-- it allows ANY household the caller belongs to:
--
--     using (household_id in (
--       select hm.household_id from household_members hm
--       join users u on u.id = hm.user_id
--       where u.clerk_id = (auth.jwt() ->> 'sub')
--         and hm.deleted_at is null))
--
-- This function is that exact subquery, extracted and named, so
-- the WRITE policies can authorize the same way the READ policy
-- already does: "is the caller a member of the claimed household?"
-- We are not inventing new semantics — we are propagating the
-- read policy's correct, already-live semantics to writes.
--
-- This becomes the Harbour standard authorization primitive:
-- client says WHICH context, this function says WHETHER-YOU-MAY.
-- ============================================================

-- ------------------------------------------------------------
-- is_member_of — true if the calling user (resolved from the
-- Clerk JWT 'sub') is a non-deleted member of p_household_id.
--
-- SECURITY DEFINER: must read household_members regardless of the
-- caller's RLS, same as the other identity helpers. Returns a
-- plain boolean so it drops straight into a policy's USING /
-- WITH CHECK clause: `using (is_member_of(household_id))`.
--
-- STABLE: result is constant within a statement for a given arg
-- (no writes, depends only on committed rows + the JWT).
--
-- SET search_path: pinned explicitly. The existing identity
-- helpers (get_current_user_id, get_current_household_id) set
-- 'public','extensions'; we match them. This also closes the
-- "SECURITY DEFINER without set search_path" debt for any NEW
-- helper, rather than adding to it.
--
-- NULL SAFETY: if p_household_id is null, EXISTS returns false
-- (no row matches `household_id = null`), so a missing/forgotten
-- client argument fails CLOSED — denies the write — rather than
-- silently authorizing. That is the safe direction for an authz
-- check.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_member_of(p_household_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select exists (
    select 1
    from household_members hm
    join users u on u.id = hm.user_id
    where u.clerk_id = (auth.jwt() ->> 'sub')
      and hm.household_id = p_household_id
      and hm.deleted_at is null
  );
$function$;

-- ------------------------------------------------------------
-- NOTE — this migration ONLY adds the helper. It does NOT yet
-- rewrite any policy to use it. That is migration 004 (convert
-- the list_items write/update/delete policies from
-- `= get_current_household_id()` to `is_member_of(household_id)`),
-- kept as a separate, separately-testable change because it
-- touches LIVE write policies — the highest-stakes RLS surface.
--
-- Adding an unused function is inert and reversible. Changing a
-- write policy is not. Splitting them means migration 003 can be
-- applied and verified (function exists, returns expected bools
-- for a two-household test user) with zero risk to writes, before
-- 004 repoints the policies onto it.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- DEV VERIFICATION (run by hand in the dev SQL Editor; not part
-- of the migration body). Confirms the function actually saved
-- AND returns the right answers for the two-household test user.
--
--   -- 1. Confirm the definition saved (SQL Editor has silently
--   --    kept old versions before):
--   select pg_get_functiondef(oid) from pg_proc
--   where proname = 'is_member_of';
--
--   -- 2. With Dan Holmes' JWT context (two households on dev:
--   --    "My Household" + "Lake House"), both should return true;
--   --    a household he does NOT belong to should return false;
--   --    null should return false.
--   --    (Run via the app/PostgREST so auth.jwt() is populated,
--   --     or substitute a test sub in a local harness.)
-- ------------------------------------------------------------

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

-- ============================================================
-- OurProvisions — Migration 005
-- households RLS: authorize by membership, not active-household
-- ============================================================
-- Replaces the `id = get_current_household_id()` gate on households
-- SELECT/UPDATE with is_member_of(id) (migration 003). Unblocks
-- multi-household reads after the useProvisions active-household re-scope.
-- The invite-code preview branch on SELECT is preserved exactly.
-- Depends on: migration 003 (is_member_of). Dev-first; bundle to prod with 003+004.
-- ============================================================

drop policy if exists households_select on public.households;

create policy households_select on public.households
  for select
  using (
    is_member_of(id)
    OR (id IN (
      SELECT household_invites.household_id
      FROM household_invites
      WHERE ((household_invites.deleted_at IS NULL)
        AND (household_invites.accepted_at IS NULL)
        AND (household_invites.expires_at > now()))
    ))
  );

drop policy if exists households_update on public.households;

create policy households_update on public.households
  for update
  using (is_member_of(id))
  with check (is_member_of(id));

-- households_insert intentionally unchanged (with check = true).

-- ============================================================
-- OurProvisions — Migration 006
-- create_household(p_name, p_clerk_id) — SECURITY DEFINER RPC
-- ============================================================
-- Atomically creates a new household and adds the calling user as its OWNER,
-- returning the new household_id. Needed because a client-side INSERT into
-- households + household_members is blocked by RLS (membership row references a
-- household that does not yet exist at insert time). Mirrors bootstrap_new_user.
--
-- Resolves the internal user UUID from p_clerk_id (the Clerk subject). New
-- household lands EMPTY — no seeded list_items. Returns json:
--   { household_id, household_name }
--
-- Depends on: users, households, household_members tables.
-- Dev-first; bundles to prod with 003 + 004 + 005.
-- ============================================================

create or replace function public.create_household(
  p_name text,
  p_clerk_id text
)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid;
  v_household_id uuid;
  v_name text;
begin
  -- Resolve internal user id from clerk id
  select id into v_user_id from users where clerk_id = p_clerk_id;
  if v_user_id is null then
    raise exception 'create_household: no user for clerk_id %', p_clerk_id;
  end if;

  -- Default + sanitize name
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then
    v_name := 'My Household';
  end if;

  -- Create the household, creator recorded
  insert into households (name, created_by)
  values (v_name, v_user_id)
  returning id into v_household_id;

  -- Add creator as owner
  insert into household_members (household_id, user_id, role)
  values (v_household_id, v_user_id, 'owner');

  return json_build_object(
    'household_id', v_household_id,
    'household_name', v_name
  );
end;
$function$;

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

COMMIT;
