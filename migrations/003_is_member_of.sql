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
