-- 030_join_household_invite_validation.sql
-- Part 1 of SPEC_rls_and_rpc_authorization — per SPEC_PATCH 2026-07-31.
--
-- =====================================================================
-- THE DEFECT — a two-call chain available to any account that can sign up
-- =====================================================================
--   1. Sign up. Any account.
--   2. select household_id from household_invites
--        -- invites_select has qual = true, so this returns EVERY invite
--        -- row in the system, all households, all states.
--   3. rpc('join_household', { p_household_id: '<any leaked uuid>' })
--        -- checks nothing. Caller is now a member.
--
-- Measured on prod 2026-07-31: 74 invite rows leak 15 distinct household
-- ids, of which 9 are still-live households — 9 of 23 live prod
-- households, 39%. (The other 6 are soft-deleted; post-029 they are not
-- blast radius, since is_member_of now returns false for them.)
--
-- WHY "0 live redeemable invites" IS NOT PROTECTION: step 3 never
-- consults the invite. Expiry, acceptance and soft-deletion are all
-- irrelevant — a dead invite still leaks a permanently valid household
-- UUID, and the UUID is the only input the old RPC took.
--
-- TWO HALVES, ONE COMMIT. Neither is sufficient alone:
--   * join_household alone  -> UUIDs stay readable but become worthless.
--   * invites_select alone  -> leak stops, but every UUID already
--                              harvested still works forever.
-- A partial Part 1 is not a partial fix.
--
-- =====================================================================
-- NOT IN THIS MIGRATION — deliberately
-- =====================================================================
-- NO unique index on household_invites.code. The spec patch (§C1) called
-- for a partial unique index on live rows, on the premise that no unique
-- constraint existed. That premise is WRONG: `household_invites_code_key`
-- (CREATE UNIQUE INDEX ... USING btree (code)) already exists in BOTH
-- environments and is GLOBAL, i.e. strictly stronger than the proposed
-- partial index. Adding the partial index would gain nothing; replacing
-- the global one with it would be a loosening. Duplicate census run
-- 2026-07-31 on dev and prod: zero duplicates, all-rows and live-only.
-- DO NOT TOUCH household_invites_code_key.
--
-- That global uniqueness is what makes the single-row code lookup below
-- safe: `where upper(trim(code)) = ...` cannot resolve to two rows.
--
-- Consequence tracked in ROADMAP LATER (not a Part 1 item): because
-- uniqueness is global rather than partial, a soft-deleted invite's code
-- can never be reused, and createInvite generates 6-char
-- Math.random() codes with no collision retry — the namespace is
-- permanently consumed and birthday-bounded.

begin;

-- ---------------------------------------------------------------------
-- 1. The RPC. New signature: invite code, not household id.
--
-- Returns json { household_id, household_name, revived }.
--   household_id   — replaces the deleted client pre-flight's value;
--                    the client needs it for the households fetch.
--   household_name — replaces invite.households?.name for the toast.
--                    Once invites_select is members-only, a not-yet-member
--                    CANNOT resolve a code to a name client-side, so this
--                    is not a convenience, it is the only source.
--   revived        — true if a soft-deleted membership was revived
--                    (leave-then-rejoin). Not read by the client today
--                    (the old call discarded its return entirely, and the
--                    joined_via_invite banner comes from
--                    bootstrap_new_user), but exposed so §F2
--                    rejoin-after-leave is observable FROM THE APP rather
--                    than only from the database.
-- ---------------------------------------------------------------------
create or replace function public.join_household(p_invite_code text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_clerk_id       text;
  v_user_id        uuid;
  v_code           text;
  v_invite         household_invites%rowtype;
  v_household_name text;
  v_existing_id    uuid;
  v_was_deleted    boolean := false;
  v_revived        boolean := false;
begin
  -- Step 1 — caller identity from the JWT, never from an argument.
  v_clerk_id := auth.jwt()->>'sub';
  if v_clerk_id is null then
    raise exception 'join_household: no clerk subject on JWT';
  end if;

  select id into v_user_id from users
  where clerk_id = v_clerk_id and deleted_at is null;
  if v_user_id is null then
    raise exception 'join_household: no user for clerk_id %', v_clerk_id;
  end if;

  -- NORMALIZE (§C2). The client uppercases and createInvite writes
  -- uppercase, so today they agree BY ACCIDENT. Invite links get shared
  -- into chat apps and retyped by hand; without this every
  -- lowercase-typed code fails.
  v_code := upper(trim(p_invite_code));

  -- Resolve the invite row WITHOUT state filters, purely to learn which
  -- household is being targeted. Safe as a single-row lookup because
  -- household_invites_code_key makes `code` globally unique.
  --
  -- Deviation from §D1 worth stating: the patch orders the live-membership
  -- check (step 2) BEFORE invite resolution (step 3), but the target
  -- household is unknowable until the invite is resolved. Resolving
  -- state-blind here preserves the patch's INTENT — an existing member
  -- re-tapping a dead link still succeeds — without inverting causality.
  --
  -- STATE-BLIND MEANS ALL THREE STATES, deleted_at INCLUDED — A DECISION,
  -- NOT AN ACCIDENT OF WHERE THE PREDICATE LANDED.
  -- This lookup ignores accepted_at, expires_at AND deleted_at. §D1's
  -- step 3 filters `deleted_at is null`; that filter lives at step 3 below
  -- (the not-found raise), deliberately NOT here.
  --
  -- The single case it decides: an existing LIVE MEMBER taps a link whose
  -- invite row has been soft-deleted. Here that SUCCEEDS as a no-op.
  --   * It leaks nothing. The only thing returned is the household id and
  --     name of a household the caller is already a member of — they can
  --     read both from get_my_households already.
  --   * It cannot be used to gain access. Step 2 requires an existing live
  --     membership; a non-member with the same soft-deleted code falls
  --     through to step 3 and gets `Invite not found.`
  --   * It matches the reason step 2 exists at all: a member is already
  --     through the door, so the invite's state is irrelevant to them.
  --     Revoking an invite is about who may ENTER, not about evicting
  --     people already inside — eviction is remove_member's job.
  -- If that ever needs to change, change it HERE and say why; do not add a
  -- deleted_at filter to this select and assume the behaviour is unaffected.
  select * into v_invite from household_invites where upper(trim(code)) = v_code;

  -- Step 2 — LIVE MEMBERSHIP SHORT-CIRCUIT.
  -- An existing member re-tapping their own link succeeds regardless of
  -- the invite's state. They are already through the door; telling them
  -- their own household's invite expired is noise about a door they have
  -- already walked through.
  --
  -- deleted_at IS NULL is load-bearing: a soft-deleted membership is NOT
  -- live membership and must fall through to full validation so the row
  -- gets revived — the rejoin-after-leave behaviour migration 011 built.
  -- Do NOT "optimize" this into ignoring deleted_at.
  if v_invite.id is not null and exists (
       select 1 from household_members hm
        where hm.household_id = v_invite.household_id
          and hm.user_id = v_user_id
          and hm.deleted_at is null
     ) then
    select name into v_household_name from households
     where id = v_invite.household_id and deleted_at is null;
    if v_household_name is not null then
      return json_build_object(
        'household_id',   v_invite.household_id,
        'household_name', v_household_name,
        'revived',        false
      );
    end if;
  end if;

  -- Step 3 — invite exists and is not soft-deleted.
  if v_invite.id is null or v_invite.deleted_at is not null then
    raise exception 'Invite not found.' using errcode = 'P0002';
  end if;

  -- Step 4 — household liveness. Folds into "not found" (§D3).
  -- Matches the precedent 029 set: dead is ABSENT, not a special error
  -- state. One rule across the auth surface — three functions with three
  -- opinions about what a tombstone means is how the next gap appears.
  select name into v_household_name from households
   where id = v_invite.household_id and deleted_at is null;
  if v_household_name is null then
    raise exception 'Invite not found.' using errcode = 'P0002';
  end if;

  -- Step 5 — already used. Checked BEFORE expiry: an invite both used and
  -- since expired reports "used", the more informative fact, matching the
  -- client's current ordering so behaviour does not shift silently
  -- beneath the same three strings.
  if v_invite.accepted_at is not null then
    raise exception 'This invite has already been used.' using errcode = 'P0002';
  end if;

  -- Step 6 — expiry.
  if v_invite.expires_at <= now() then
    raise exception 'This invite has expired.' using errcode = 'P0002';
  end if;

  -- Step 7 — upsert membership. Revives a soft-deleted row rather than
  -- colliding with UNIQUE(household_id, user_id) — migration 011.
  --
  -- NOTE: the revive path does NOT reset joined_at (verified: no trigger
  -- on household_members, no write to joined_at in any function). A
  -- leave-and-rejoin user keeps their ORIGINAL joined_at, which feeds
  -- 029's `order by hm.joined_at desc` cold-start resolution. Known and
  -- accepted; see 029's caveat.
  select id into v_existing_id from household_members
   where household_id = v_invite.household_id and user_id = v_user_id;
  if v_existing_id is not null then
    select (deleted_at is not null) into v_was_deleted
      from household_members where id = v_existing_id;
    v_revived := v_was_deleted;
  end if;

  insert into household_members (household_id, user_id, role, deleted_at)
  values (v_invite.household_id, v_user_id, 'member', null)
  on conflict (household_id, user_id)
  do update set deleted_at = null, role = 'member';

  -- Step 8 — stamp the invite used, IN THE SAME TRANSACTION.
  -- NOT OPTIONAL. Today the client stamps this after the join
  -- (useProvisions.js:1129-1132). Moving validation server-side while
  -- leaving the stamp client-side means an attacker who calls the RPC
  -- directly and never issues the UPDATE holds a PERMANENTLY REUSABLE
  -- invite — one leaked code becomes an unlimited-use door. Read,
  -- validate, join and stamp are one transaction, or Part 1 closes the
  -- door and leaves the frame off.
  update household_invites
     set accepted_by = v_user_id,
         accepted_at = now()
   where id = v_invite.id;

  return json_build_object(
    'household_id',   v_invite.household_id,
    'household_name', v_household_name,
    'revived',        v_revived
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Drop the uuid overload. Its continued existence IS the exploit —
--    it is not replaced, it is removed.
-- ---------------------------------------------------------------------
drop function if exists public.join_household(uuid);

-- ---------------------------------------------------------------------
-- 3. EXECUTE grants. Postgres grants EXECUTE to PUBLIC by default, which
--    is wrong for a SECURITY DEFINER function. Joining requires an
--    identity, so anon has no business calling this at all.
-- ---------------------------------------------------------------------
revoke execute on function public.join_household(text) from public;
revoke execute on function public.join_household(text) from anon;
grant  execute on function public.join_household(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Close the leak. invites_select was qual = true — every authenticated
--    user could read every invite row in the system.
--
--    The RPC above is SECURITY DEFINER and reads the invite itself, so a
--    members-only SELECT policy does not block redemption. That is
--    exactly why the read had to move into the function BEFORE this
--    policy tightens — in the other order, invite acceptance breaks.
-- ---------------------------------------------------------------------
drop policy if exists invites_select on public.household_invites;

create policy invites_select on public.household_invites
  for select to authenticated
  using (is_member_of(household_id));

-- ---------------------------------------------------------------------
-- 5. Hygiene. anon holds full DML on household_invites in both
--    environments. Inert today — RLS is on and no policy admits anon —
--    but there is no reason for the grant to exist.
-- ---------------------------------------------------------------------
revoke all on public.household_invites from anon;

commit;

-- =====================================================================
-- VERIFY — §F. On the DEPLOYED DEV PREVIEW, never localhost.
-- =====================================================================
-- F1. Invite accept, fresh user -> joins; correct household name in toast.
-- F2. Rejoin after leave -> soft-deleted membership revived, not a
--     constraint violation. Observable from the app: the RPC returns
--     revived = true.
-- F3. Re-click by an existing member -> success, no-op, no error.
-- F4. Re-click by an existing member on an EXPIRED invite -> still
--     success. (Proves the membership short-circuit precedes validation.)
-- F5. Lowercase-typed code -> succeeds. (Proves §C2 normalization.)
-- F6. Each of the three errors raised distinctly, including a deleted
--     household returning `Invite not found.`
-- F7. The exploit is dead: from the browser console,
--       rpc('join_household', { p_household_id: '<uuid>' })
--     -> function does not exist.
-- F8. The leak is closed: an authenticated NON-MEMBER running
--       select * from household_invites
--     returns ZERO rows. MUST be run FROM THE RUNNING APP, not the SQL
--     editor — the editor runs as postgres and bypasses RLS entirely, so
--     it would return every row and prove nothing.
--
-- F7 and F8 must BOTH pass. F8 is the half the parent spec treated as
-- optional.
--
-- SQL-side sanity (safe from the editor):
--   select p.oid, pg_get_function_arguments(p.oid), p.proacl::text
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname='join_household';
--   -- expect exactly ONE row, args = p_invite_code text,
--   --   proacl showing authenticated=X and NO anon, NO bare =X/ (PUBLIC)
--
--   select policyname, cmd, qual from pg_policies
--    where schemaname='public' and tablename='household_invites';
--   -- expect invites_select qual = is_member_of(household_id)
-- =====================================================================
