-- 036_bootstrap_new_user_derive_clerk_id.sql
-- Authorization Part 2 — stop trusting a client-supplied p_clerk_id.
--
-- ############################################################################
-- ##  DRAFT — DO NOT APPLY YET.  Authored 2026-08-17 for its own session.   ##
-- ##  Part 2 is NOT SQL-only: it REQUIRES a coordinated useProvisions.js    ##
-- ##  edit in the same commit, and it has a DEPLOY-ORDERING HAZARD that     ##
-- ##  must be decided before this runs. Read "DEPLOY ORDERING" below.       ##
-- ##  034 and 035 must be applied and verified first.                       ##
-- ############################################################################
--
-- THE DEFECT
-- bootstrap_new_user is SECURITY DEFINER with `anon` EXECUTE, and takes the caller's
-- identity as a PARAMETER. An unauthenticated caller holding only the bundled anon key
-- can therefore:
--   * overwrite any existing user's email and full_name (the step-1 upsert is
--     `on conflict (clerk_id) do update`), and
--   * with any valid invite code, join a household AS THAT USER.
-- Identity must come from the verified JWT, never from the request body.
--
-- THE FIX
-- Derive the Clerk id from auth.jwt()->>'sub' — the locked architecture pattern — drop
-- the p_clerk_id parameter entirely, and revoke `anon`. What cannot be supplied cannot
-- be forged.
--
-- =====================================================================
-- ONE PORTABLE MIGRATION — CORRECT FOR BOTH ENVIRONMENTS
-- =====================================================================
-- Prod carries FOUR bootstrap_new_user overloads; dev carries ONE (observed 2026-08-17,
-- dev 7642734024280108049 / prod 7606130613603586966, identified by
-- pg_control_system().system_identifier). This is NOT undocumented drift:
-- 000_canonical_baseline.sql:401-406 states the three dead overloads are *intentionally
-- dropped in the baseline*. Dev matches canonical; PROD is the environment that never
-- received the drop. Corroborated independently by the security advisor — prod's three
-- extra `anon_security_definer_function_executable` and
-- `authenticated_security_definer_function_executable` warnings are exactly these three,
-- still anon-executable on prod today.
--
-- `drop function if exists` no-ops cleanly on a signature that is not present, so ONE
-- file applies identically to both: prod drops three real functions, dev's three clauses
-- are harmless no-ops, and both converge on the same single hardened function. Do NOT
-- write environment-specific migrations for this.
--
-- The live 4-arg bodies are BYTE-IDENTICAL across environments (md5
-- 54518e04f054bbbcfb76b9fcf66dac8b on both), so the replacement below — which preserves
-- that body verbatim apart from the identity change — is correct for both.
--
-- =====================================================================
-- WHY THE DROPS MUST PRECEDE THE CREATE, IN THIS TRANSACTION
-- =====================================================================
-- The hardened signature is (p_email text, p_invite_code text, p_full_name text) =
-- (text, text, text) — TYPE-IDENTICAL to the legacy overload
-- (p_clerk_id, p_email, p_invite_code). Postgres refuses to rename input parameters via
-- CREATE OR REPLACE:
--     ERROR: cannot change name of input parameter "p_clerk_id"
--     HINT:  Use DROP FUNCTION bootstrap_new_user(text,text,text) first.
-- (Same failure mode 029 hit and recorded at 029_household_liveness.sql:104.)
-- So the legacy (text,text,text) MUST be gone before the create. Ordering is load-bearing,
-- not stylistic.
--
-- ALL FOUR ARE DROPPED, INCLUDING THE CURRENTLY-LIVE 4-ARG ONE. Dropping only the three
-- dead ones would leave the vulnerable (text,text,text,text) overload in place and
-- callable — Part 2 would not actually be closed. The vulnerable overload IS the live one.
--
-- =====================================================================
-- ⚠️ DEPLOY ORDERING — DECIDE BEFORE APPLYING
-- =====================================================================
-- useProvisions.js:312-317 currently calls the 4-arg form and passes p_clerk_id:
--     .rpc("bootstrap_new_user", { p_clerk_id, p_email, p_invite_code, p_full_name })
-- The moment this migration lands, that call resolves to NOTHING — PostgREST returns
-- PGRST202 "Could not find the function". Bootstrap runs on EVERY sign-in (Effect 1), so
-- until the new bundle is deployed, EVERY user's session setup fails, not just new
-- signups. Applying this to prod without the client already shipped is a full outage of
-- the auth path.
--
-- Two acceptable ways to sequence it. PICK ONE DELIBERATELY:
--
--   OPTION A — one migration + simultaneous client deploy (this file as written).
--   Apply, then immediately deploy the client commit. Exposure = a short window where
--   signed-in sessions cannot bootstrap. Simplest, closes the defect in one step, and
--   with a ~10-user beta a few minutes of failed bootstrap is recoverable. Do the dev
--   preview first and time the window before repeating on prod.
--
--   OPTION B — zero-downtime, split across two migrations (SAFER; recommended for prod).
--     036: drop the three DEAD overloads + CREATE the hardened 3-arg function + revoke
--          anon. LEAVE the live 4-arg in place. Nothing breaks — the deployed client
--          keeps calling the 4-arg while the hardened path exists alongside it.
--     ---> deploy the client commit, verify sign-in + invite-accept on the preview.
--     037: drop the 4-arg (text,text,text,text). THIS is the commit that actually closes
--          Part 2 — until it runs, the forgeable overload is still live and still
--          anon-executable, so 037 must not be left dangling.
--   To use Option B, delete ONLY the fourth drop statement below from this file and move
--   it into 037.
--
-- =====================================================================
-- BEHAVIOUR PRESERVED
-- =====================================================================
-- The body below is the live body verbatim except for the identity change. Every prior
-- fix encoded in it is retained deliberately:
--   * the invite branch FALLS THROUGH rather than raising on an unresolvable invite
--     (raising rolls back the step-1 upsert and wedges a new user out of signing up
--     entirely — see the in-body comment; do not "fix" it back to a raise);
--   * households liveness (h.deleted_at is null) in invite resolution, from 029;
--   * the revive-on-conflict for leave-then-rejoin;
--   * the ordered, liveness-joined existing-household lookup from 029.
-- The dead `if v_user_id is null` guard before the lookup is preserved as-is: v_user_id
-- is always null at that point, so the branch always runs. Harmless, and NOT tidied here
-- — this migration changes identity handling only, so a behaviour diff stays readable.

begin;

-- --- Drops. `if exists` makes this portable: no-ops on dev, real on prod. ---
-- The three dead overloads (present on prod only):
drop function if exists public.bootstrap_new_user(text, text);
drop function if exists public.bootstrap_new_user(text, text, boolean);
drop function if exists public.bootstrap_new_user(text, text, text);
-- The live, VULNERABLE overload (present on both) — see DEPLOY ORDERING before running.
-- Move this line to 037 if taking Option B.
drop function if exists public.bootstrap_new_user(text, text, text, text);

-- --- The hardened replacement. Identity comes from the JWT, never the request body. ---
create function public.bootstrap_new_user(
  p_email text,
  p_invite_code text default null,
  p_full_name text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_clerk_id text;
  v_user_id uuid;
  v_household_id uuid;
  v_invite_id uuid;
  v_household_name text;
begin
  -- 0. Identity from the verified JWT. NOT a parameter — this is the whole point of
  -- Part 2. auth.jwt() is schema-qualified, so the pinned search_path does not affect it.
  v_clerk_id := auth.jwt() ->> 'sub';
  if v_clerk_id is null or v_clerk_id = '' then
    raise exception 'not authenticated'
      using errcode = '28000';
  end if;

  -- 1. Upsert the user — save full_name if provided
  insert into users (clerk_id, email, full_name)
  values (v_clerk_id, p_email, p_full_name)
  on conflict (clerk_id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, users.full_name);

  if v_user_id is null then
    select id into v_user_id from users where clerk_id = v_clerk_id;
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

-- --- Grants. A fresh CREATE does not inherit the old ACL, but PUBLIC EXECUTE is the
-- --- Postgres default on new functions — revoke explicitly rather than assume.
revoke all on function public.bootstrap_new_user(text, text, text) from public;
revoke all on function public.bootstrap_new_user(text, text, text) from anon;
grant execute on function public.bootstrap_new_user(text, text, text) to authenticated;

commit;

-- =====================================================================
-- REQUIRED CLIENT CHANGE — SAME COMMIT, NOT A FOLLOW-UP
-- =====================================================================
-- useProvisions.js:312-317 — drop the p_clerk_id line:
--
--     const { data: bootstrapData, error: bootstrapErr } = await db
--       .rpc("bootstrap_new_user", {
--         p_email: email,
--         p_invite_code: pendingInviteCode || null,
--         p_full_name: fullName || null,
--       });
--
-- `clerkId` stays in scope — it still gates the effect at :242 and remains an effect
-- dependency at :380 — so removing the argument does NOT create an unused variable.
-- Confirm before pushing: CI=true on Vercel treats an unused var as a build error.
--
-- Also update the stale comment at useProvisions.js:387-388, which says this function
-- avoids "its 4-overload ambiguity" — after this migration exactly one overload exists.
--
-- =====================================================================
-- VERIFY
-- =====================================================================
-- (1) Exactly ONE overload remains, in BOTH environments:
--
-- select pg_get_function_identity_arguments(oid) as sig, proconfig, prosecdef
-- from pg_proc where pronamespace='public'::regnamespace and proname='bootstrap_new_user';
--
-- Expect ONE row: `p_email text, p_invite_code text, p_full_name text`,
-- proconfig {search_path=public, extensions}, prosecdef true.
-- Prod goes 4 -> 1; dev goes 1 -> 1 (same end state, which is the point).
--
-- (2) anon cannot execute it:
--
-- select has_function_privilege('anon', p.oid, 'EXECUTE')
-- from pg_proc p where p.pronamespace='public'::regnamespace
--   and p.proname='bootstrap_new_user';
--
-- Expect FALSE. Use has_function_privilege, not a raw proacl read — it resolves PUBLIC
-- grants and role inheritance, which proacl does not (the lesson from 028).
--
-- (3) THE REAL CHECK — identity can no longer be forged. From OUTSIDE the database, with
--     the bundled anon key only:
--
--       POST /rest/v1/rpc/bootstrap_new_user  { "p_email": "attacker@example.com" }
--
--     Expect 401/permission-denied (grant revoked). BEFORE this migration, the equivalent
--     call with a victim's p_clerk_id succeeded and overwrote their row. The SQL editor
--     CANNOT test this — it runs as postgres and bypasses the grant entirely. Same trap
--     as 022/033/035.
--
-- (4) Real sign-in still bootstraps, on the deployed dev preview (not localhost):
--     an existing user signs in and lands in their household; a NEW user signs up and
--     gets 'My Household'; a new user arriving on a valid `?invite=` link joins that
--     household with joined_via_invite true.
--
-- (5) STALE-INVITE REGRESSION — the one most likely to be broken by a careless rewrite:
--     a new user signing up on an EXPIRED or already-accepted invite code must still end
--     up with a working account in a fresh household, NOT an error. If they get an error
--     and cannot sign up at all, the fall-through was turned back into a raise. Revert.
--
-- (6) Advisor: `anon_security_definer_function_executable` should drop by 1 on dev and by
--     4 on prod (three legacy overloads + the live one, all previously anon-executable).
--     Measured baseline 2026-08-17: dev 23, prod 25.
