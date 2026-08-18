-- 036_bootstrap_new_user_derive_clerk_id.sql
-- Authorization Part 2 — stop trusting a client-supplied p_clerk_id.
--
-- ############################################################################
-- ##  PART 1 OF 2 — ZERO-DOWNTIME SPLIT. Apply this, THEN deploy the client ##
-- ##  3-arg change, THEN apply 037 (which drops the old 4-arg overload).    ##
-- ##  This file is DELIBERATELY NON-BREAKING: it ADDS the hardened function ##
-- ##  and leaves the live 4-arg overload in place, so the currently-        ##
-- ##  deployed bundle keeps working while both exist.                       ##
-- ##                                                                        ##
-- ##  PART 2 IS NOT CLOSED UNTIL 037 RUNS. Until then the forgeable 4-arg   ##
-- ##  overload is still live and still anon-executable. Do not leave 037    ##
-- ##  dangling.                                                             ##
-- ##                                                                        ##
-- ##  034 and 035 must be applied and verified first.                       ##
-- ##  Applied to BOTH environments in the same 036/037 order, so migration  ##
-- ##  history stays symmetric across dev and prod.                          ##
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
-- THE LIVE 4-ARG OVERLOAD IS NOT DROPPED HERE — IT IS 037'S JOB. That is the entire
-- point of the split, and it is what makes this file safe to apply ahead of the client
-- deploy. See DEPLOY ORDERING below.
--
-- =====================================================================
-- ⚠️ DEPLOY ORDERING — WHY THIS IS SPLIT (decided 2026-08-17)
-- =====================================================================
-- useProvisions.js:312-317 currently calls the 4-arg form and passes p_clerk_id:
--     .rpc("bootstrap_new_user", { p_clerk_id, p_email, p_invite_code, p_full_name })
-- If the 4-arg signature were dropped in this same migration, that call would resolve to
-- NOTHING — PostgREST returns PGRST202 "Could not find the function". Bootstrap runs on
-- EVERY sign-in (Effect 1), not just signup, so until the new bundle is deployed EVERY
-- user's session setup fails. That is a full outage of the auth path, so the drop is
-- deferred to 037.
--
-- THE ORDER, RUN IDENTICALLY ON DEV THEN PROD:
--   1. Apply 036 (this file). Two overloads now coexist: the hardened 3-arg and the old
--      4-arg. The deployed bundle keeps calling the 4-arg. NOTHING BREAKS.
--   2. Deploy the client 3-arg change; verify sign-in and invite-accept on the preview.
--   3. Apply 037 — drops the 4-arg. This is the step that actually closes Part 2.
--
-- Both environments get both migrations in this order, so dev and prod migration history
-- stays symmetric — no environment-specific path, and no "prod did it differently" hole
-- of the kind that produced the 024/033 record gaps.
--
-- ⚠️ THE INTERMEDIATE STATE IS DELIBERATE BUT NOT SAFE TO PARK IN. Between steps 1 and 3
-- the old forgeable overload is still live and still anon-executable. 036 without 037 is
-- a half-shipped fix that LOOKS done because the hardened function exists.
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
-- NOTE: the live 4-arg overload (text,text,text,text) is deliberately NOT dropped here.
-- It is dropped by 037, after the client is calling the 3-arg signature. Do not add it
-- back to this file — doing so re-creates the auth-path outage the split exists to avoid.

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
-- (1) TWO overloads now coexist — this is the expected intermediate state after 036,
--     NOT a failure. "Exactly one" is 037's check, not this file's.
--
-- select pg_get_function_identity_arguments(oid) as sig, proconfig, prosecdef
-- from pg_proc where pronamespace='public'::regnamespace and proname='bootstrap_new_user'
-- order by sig;
--
-- Expect TWO rows in BOTH environments:
--   `p_email text, p_invite_code text, p_full_name text`              <- new, hardened
--   `p_clerk_id text, p_email text, p_invite_code text, p_full_name text`  <- old, to be
--                                                                       dropped by 037
-- The new row must show proconfig {search_path=public, extensions} and prosecdef true.
-- Prod goes 4 -> 2; dev goes 1 -> 2. Both converge on 2 here and on 1 after 037 — that
-- convergence is the point of running the same two files in both environments.
--
-- (2) anon cannot execute the NEW function. Check PER SIGNATURE — a bare
--     `where proname='bootstrap_new_user'` returns both overloads and the old one is
--     still anon-executable at this point, which is expected, not a failure:
--
-- select pg_get_function_identity_arguments(p.oid) as sig,
--        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
-- from pg_proc p where p.pronamespace='public'::regnamespace
--   and p.proname='bootstrap_new_user'
-- order by sig;
--
-- Expect the 3-arg row FALSE, the 4-arg row TRUE (037 removes the latter). Use
-- has_function_privilege, not a raw proacl read — it resolves PUBLIC grants and role
-- inheritance, which proacl does not (the lesson from 028).
--
-- (3) DEFERRED TO 037 — the anon-key forgery check CANNOT pass yet, by design. While the
--     4-arg overload is still live and anon-executable, identity is still forgeable
--     through it. Running that check now and seeing it fail is the CORRECT result at this
--     stage; do not treat it as a broken migration and do not "fix" it by dropping the
--     4-arg early. See 037.
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
-- (6) Advisor, AFTER 036 ONLY: `anon_security_definer_function_executable` should be
--     UNCHANGED on dev (23) and drop by 3 on prod (25 -> 22) — prod loses the three
--     legacy overloads; dev had none to lose, and the newly-created 3-arg function is not
--     anon-executable so it adds nothing. The remaining anon-executable 4-arg row on both
--     is what 037 clears (each environment then drops by 1 more, to dev 22 / prod 21).
--     Measured baseline 2026-08-17: dev 23, prod 25.
