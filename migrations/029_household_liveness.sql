-- 029_household_liveness.sql
-- Part 0 — household-liveness + account-closed predicates.
--
-- =====================================================================
-- SEQUENCING CONSTRAINT — READ BEFORE SPLITTING THIS MIGRATION
-- =====================================================================
-- The two functions below MUST ship together, in this file, in one
-- transaction. Applying is_member_of alone is a REGRESSION.
--
-- Why: bootstrap_new_user resolves the caller's household. Unfixed, it
-- can hand the client a soft-deleted household_id (step 3 had no join to
-- households and no ORDER BY). If is_member_of is tightened while
-- bootstrap is not, that user is resolved INTO a household they can
-- neither read nor write:
--   * get_my_households already filters h.deleted_at — switcher shows []
--   * get_list_items_for_household returns [] (delete_household
--     tombstoned every list_items row)
--   * every RLS policy keyed on is_member_of now denies
--   * writes fail
-- An app opened onto a household the switcher won't show, empty list,
-- every write erroring — strictly worse than the pre-fix state, where
-- the user at least saw a consistent (if stale) view.
--
-- With BOTH applied, that user auto-provisions: step 3 finds no live
-- household, falls through to step 4, and gets a fresh 'My Household'
-- as owner. Silent (no explanation of where their old list went) but
-- working. That silence is a known, accepted behaviour, not an oversight.
--
-- Do not split this file. Do not apply the first statement alone.
-- =====================================================================
--
-- DECISIONS (2026-07-30):
--   * users.deleted_at means "account closed" — it is now a membership
--     predicate, not merely a column.
--   * Cold-start ordering is most-recently-joined.
--
-- COLUMN NOTE: household_members orders by joined_at. There is no
-- created_at and no updated_at on this table, in either environment.
-- Verified against information_schema on dev and prod, 2026-07-30.
--
-- PRIOR STATE: is_member_of and bootstrap_new_user(4-arg) are
-- byte-identical across dev and prod, so this migration applies cleanly
-- to both and dev is a valid rehearsal for correctness.


-- ---------------------------------------------------------------------
-- 1. is_member_of(uuid)
--
-- SIGNATURE IS LOAD-BEARING. The household-photos storage policies are
-- keyed to the uuid overload. CREATE OR REPLACE preserves the function
-- OID, so those policies keep binding.
-- Do NOT drop-and-recreate. Do NOT change the argument name, argument
-- type, or return type. prosecdef and search_path are reproduced exactly
-- as they exist today.
--
-- OIDs ARE PER-DATABASE. Reference values as of 2026-07-30:
--     dev  (sysid 7642734024280108049): is_member_of = 18480
--     prod (sysid 7606130613603586966): is_member_of = 43112
-- These are NOT interchangeable. The verification check below compares
-- each environment's OID against ITSELF before and after — never against
-- a literal, which would fire falsely on whichever database it was not
-- written for.
-- ---------------------------------------------------------------------
create or replace function public.is_member_of(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from household_members hm
    join users      u on u.id = hm.user_id
    join households h on h.id = hm.household_id
    where u.clerk_id = (auth.jwt() ->> 'sub')
      and hm.household_id = p_household_id
      and hm.deleted_at is null
      and u.deleted_at  is null   -- account closed
      and h.deleted_at  is null   -- household soft-deleted
  );
$$;


-- ---------------------------------------------------------------------
-- 2. bootstrap_new_user(text, text, text, text) — two fixes.
--
-- Body reproduced in full; CREATE OR REPLACE requires it.
-- Return type json, volatile, plpgsql, security definer — all unchanged.
--
-- HARDENING: search_path is now pinned. It was NULL on this overload in
-- both environments — a SECURITY DEFINER function with a mutable search
-- path — while the three legacy overloads queued for removal all pinned
-- search_path=public. That was backwards.
--
-- PARAMETER DEFAULTS ARE MANDATORY — DO NOT STRIP THEM.
-- The live function declares:
--     p_invite_code text DEFAULT NULL::text
--     p_full_name   text DEFAULT NULL::text
-- (pronargdefaults = 2, identical on dev and prod, verified 2026-07-30).
--
-- CREATE OR REPLACE cannot remove defaults from an existing function:
--     ERROR 42P13: cannot remove parameter defaults from existing function
--     HINT:  Use DROP FUNCTION bootstrap_new_user(text,text,text,text) first.
-- DO NOT TAKE THAT HINT. Dropping assigns a new OID and defeats the
-- in-place replacement this migration depends on. Reproduce the defaults
-- verbatim instead — as below.
--
-- Note that pg_get_function_identity_arguments() STRIPS defaults, so a
-- signature read with that function looks default-free and is not a safe
-- basis for authoring CREATE OR REPLACE. Use pg_get_function_arguments().
-- ---------------------------------------------------------------------
create or replace function public.bootstrap_new_user(
  p_clerk_id    text,
  p_email       text,
  p_invite_code text default null::text,
  p_full_name   text default null::text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
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
    -- FIX: the target household was never checked for liveness. A stale
    -- invite that escaped delete_household's cascade would silently
    -- insert a membership into a dead household.
    --
    -- The liveness check is part of invite RESOLUTION (h.deleted_at is
    -- null in the join), so an invite pointing at a dead household
    -- simply does not resolve, and we fall through to step 3/4.
    --
    -- DO NOT "FIX" THIS BACK TO A RAISE. It was drafted as a raise and
    -- that was wrong. The exception rolls back the whole transaction,
    -- including the step-1 user upsert, so a brand-new user arriving on
    -- a stale invite link ends up with NO ACCOUNT. Worse, the client
    -- throws at useProvisions.js:319 and only clears the persisted code
    -- at :323 — so pending_invite_code survives in sessionStorage and
    -- re-fires on every reload. The user is wedged, unable to sign up at
    -- all, until they manually clear browser storage. Falling through
    -- costs nothing (they land in a fresh household) and cannot wedge.
    select hi.id, hi.household_id into v_invite_id, v_household_id
    from household_invites hi
    join households h on h.id = hi.household_id
    where hi.code = upper(p_invite_code)
      and hi.deleted_at is null
      and hi.accepted_at is null
      and hi.expires_at > now()
      and h.deleted_at is null;

    if v_invite_id is not null then
      -- Revive a soft-deleted membership (leave-then-rejoin) or insert
      -- fresh. Was `do nothing`, which silently failed to revive.
      insert into household_members (household_id, user_id, role)
      values (v_household_id, v_user_id, 'member')
      on conflict (household_id, user_id)
        do update set deleted_at = null, role = 'member';

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
  --
  -- FIX: was `from household_members where user_id = … and deleted_at is
  -- null limit 1` — no join to households, no ORDER BY. It could hand
  -- back a soft-deleted household nondeterministically, on heap order.
  -- Confirmed live on prod 2026-07-30: dan@velayo.ai held 3 live
  -- memberships plus one to 'Test House 200' (deleted 2026-07-10), any
  -- of which the old query could return.
  --
  -- ORDERING: hm.joined_at desc — most-recently-joined wins.
  -- CAVEAT: the revive branch above (and join_household) resets
  -- deleted_at but NOT joined_at, so a user who left and rejoined orders
  -- by their ORIGINAL join time, not the rejoin. Someone who first
  -- joined a year ago and rejoined yesterday still sorts below someone
  -- who joined last week. Accepted for now; revisit if rejoin becomes
  -- common.
  select hm.household_id into v_household_id
  from household_members hm
  join households h on h.id = hm.household_id
  where hm.user_id = v_user_id
    and hm.deleted_at is null
    and h.deleted_at is null
  order by hm.joined_at desc
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
$$;


-- ---------------------------------------------------------------------
-- 3. FLAG FOR PART 1 — join_household(uuid) carries the same omission.
--
-- NOT fixed here; recorded so it is not rediscovered in three weeks.
--
-- join_household takes a bare p_household_id and performs NO liveness
-- check, NO invite check, and NO membership check. It resolves the
-- caller from the JWT and unconditionally upserts:
--
--     insert into household_members (household_id, user_id, role, deleted_at)
--     values (p_household_id, v_user_id, 'member', null)
--     on conflict (household_id, user_id)
--     do update set deleted_at = null, role = 'member';
--
-- The corrected join_household MUST carry the same households.deleted_at
-- check added in step 2 above. Fixing bootstrap's invite branch alone
-- leaves join_household as an unguarded second door into a dead
-- household: a caller can name a soft-deleted household_id directly.
-- ---------------------------------------------------------------------


-- =====================================================================
-- VERIFICATION PLAN
-- =====================================================================
-- THE PROBLEM: dev has ZERO affected rows. 52 of 64 dev households are
-- soft-deleted and not one retains a live membership; 6 dev users are
-- soft-deleted and all have 0 live memberships. So dev can prove
-- CORRECTNESS and NON-REGRESSION, but cannot prove IMPACT without
-- manufactured state. Stating that rather than assuming it.
--
-- ---------------------------------------------------------------------
-- TIER 1 — no writes. Run on dev before and after. Proves non-regression.
-- ---------------------------------------------------------------------
--
-- 1a. OID stability (proves the household-photos storage policies still
--     bind). The assertion is SELF-RELATIVE: capture in the same session
--     before applying, compare after. Never assert against a literal —
--     OIDs are per-database (dev 18480, prod 43112 as of 2026-07-30), so
--     a single hardcoded value fires falsely on the other environment.
--
--     -- BEFORE, same editor session as the apply:
--     create temp table _oid_before as
--     select 'public.is_member_of(uuid)'::regprocedure::oid as oid;
--
--     -- AFTER: must return changed = false.
--     select b.oid as before,
--            'public.is_member_of(uuid)'::regprocedure::oid as after,
--            (b.oid <> 'public.is_member_of(uuid)'::regprocedure::oid) as changed
--     from _oid_before b;
--
--     If changed = true, CREATE OR REPLACE did not replace in place —
--     the function was dropped and recreated, and the household-photos
--     storage policies have stopped binding. STOP and report.
--
-- 1b. Storage policies referencing is_member_of still resolve:
--
--     select policyname, qual::text
--     from pg_policies
--     where schemaname = 'storage' and qual::text like '%is_member_of%';
--
-- 1c. Header state applied as intended:
--
--     select proname, pg_get_function_identity_arguments(oid) as args,
--            prosecdef, proconfig, pg_get_function_result(oid) as returns
--     from pg_proc
--     where proname in ('is_member_of','bootstrap_new_user')
--       and pronamespace = 'public'::regnamespace;
--     -- expect: is_member_of unchanged (1 row, uuid, secdef, public+extensions)
--     --         bootstrap_new_user 1 row on dev, proconfig NOW pinned
--
-- 1d. Predicate differential — old vs new logic over every live
--     membership, without calling the function (auth.jwt() is null in
--     the SQL editor, so is_member_of itself cannot be exercised there):
--
--     select hm.user_id, hm.household_id,
--            (hm.deleted_at is null) as old_pred,
--            (hm.deleted_at is null and u.deleted_at is null
--                                   and h.deleted_at is null) as new_pred
--     from household_members hm
--     join users u on u.id = hm.user_id
--     join households h on h.id = hm.household_id
--     where hm.deleted_at is null
--       and (hm.deleted_at is null)
--           is distinct from
--           (hm.deleted_at is null and u.deleted_at is null
--                                  and h.deleted_at is null);
--     -- expect ZERO rows on dev (no behaviour change for the 14 live
--     -- memberships). On prod this returns exactly 1 row:
--     -- dan@velayo.ai / Test House 200. That single row IS the impact.
--
-- ---------------------------------------------------------------------
-- TIER 2 — deployed dev preview, signed in. No writes to set up.
-- ---------------------------------------------------------------------
-- is_member_of reads auth.jwt(), which is NULL in the SQL editor, so the
-- only honest test of the function itself is a real signed-in session.
-- On dev.ourprovisions.velayo.ai (hard-refresh first):
--   * list loads
--   * household switcher shows the expected households
--   * add an item, change a quantity, open/close a cycle
--   * switch households
-- Proves the tightened predicate did not break the 14 live memberships.
--
-- ---------------------------------------------------------------------
-- TIER 3 — IMPACT. REQUIRES MANUFACTURED STATE ON DEV. WRITES INVOLVED.
--          Not to be run without an explicit decision.
-- ---------------------------------------------------------------------
-- To prove the auto-provision path, dev needs what it does not have: a
-- live household_members row pointing at a soft-deleted household.
--
-- Note that bootstrap_new_user takes p_clerk_id as an ARGUMENT rather
-- than reading auth.jwt(), so it CAN be called directly from the SQL
-- editor — no browser session needed. (That argument-derived identity is
-- itself a recorded defect; see ROADMAP 2026-07-30.)
--
-- Setup would be, on DEV ONLY, roughly:
--   1. create a throwaway user + household via bootstrap_new_user with a
--      synthetic clerk_id;
--   2. soft-delete that household directly
--        (update households set deleted_at = now() where id = …)
--      WITHOUT the delete_household cascade, so the membership stays live;
--   3. call bootstrap_new_user again with the same clerk_id;
--   4. EXPECT: a NEW 'My Household' returned, joined_via_invite false,
--      and the dead household not referenced;
--   5. clean up both households and the synthetic user.
--
-- This is 3–5 write statements against dev. It is the only way to
-- observe the behaviour change before prod sees it. Dan's call.
-- =====================================================================
