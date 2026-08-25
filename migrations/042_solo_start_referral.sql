-- ============================================================
-- OurProvisions — Migration 042
-- Solo-start experience: referral carry + create-vs-join signal + D11 cleanup
-- Spec: docs/specs/active/SPEC_solo_start_experience.md (designed 2026-08-25)
-- ============================================================
--
-- ⚠️ DEPLOY ORDERING — APPLY THIS BEFORE DEPLOYING THE CLIENT.
-- The client passes `p_ref_code` only when a ?ref= code is actually present, so an
-- un-migrated database keeps serving every ordinary sign-in unchanged (the no-ref case
-- IS the regression guard — see ARCHITECTURE, migration 023 row). But a ?ref= arrival
-- against an un-migrated database resolves to nothing and returns PGRST202. Apply here
-- first, then deploy. Dev first, verified, before prod is even considered.
--
-- This file is SAFE TO APPLY AHEAD OF THE CLIENT: the new 4th parameter is DEFAULTED, so
-- the currently-deployed 3-named-arg call still resolves. There is no window in which the
-- live bundle is broken, which is why this does not need the 036/037 two-file split.
--
-- WHY THE 3-ARG MUST BE DROPPED IN THIS TRANSACTION (ordering is load-bearing, not style):
-- leaving it in place alongside a 4-arg-with-default makes the deployed 3-named-arg call
-- AMBIGUOUS — Postgres raises "function ... is not unique" and every sign-in fails. The
-- drop is what keeps resolution deterministic. Same lesson as 036's parameter-rename note.
--
-- NOTE ON THE SIGNATURE: (text,text,text,text) is the same TYPE signature 037 dropped
-- (the old forgeable p_clerk_id overload). It is not that function returning — identity
-- still comes from auth.jwt() and never from the request body. Only the 4th name/meaning
-- is new. Verify by parameter NAMES, not by arity, or the check is meaningless.
--
-- Steps:
--   1. users.referral_code + users.referred_by, with backfill
--   2. bootstrap_new_user → adds p_ref_code, returns created_household + referral_code
--   3. discard_unclaimed_household — the D11 four-condition guard
-- ============================================================

begin;

-- ============================================================
-- 1. Referral columns on users
-- ============================================================
-- referral_code: ONE STABLE CODE PER USER (D9). Different species from an invite code —
-- invite grants membership, is minted per share, and expires; ref grants nothing, is
-- stable, and is identity-shaped. Never unified, never rotated.
--
-- Alphabet: uppercase hex. Chosen because hex contains no letter O and no letter I, so
-- the classic 0/O and 1/I read-aloud collisions cannot occur — the alphabet is
-- unambiguous by construction rather than by a hand-maintained exclusion list.
-- 8 chars = 16^8 ≈ 4.3e9.

alter table users add column if not exists referral_code text;
alter table users add column if not exists referred_by uuid references users(id);

comment on column users.referral_code is
  'Stable per-user referral code (D9). Minted once, never rotated. Carried by Share the app as ?ref=. Grants nothing.';
comment on column users.referred_by is
  'Who referred this user (D7/D10). Written ONCE at signup iff the arrival carried a valid ?ref=. NULL = organic arrival, which is a meaningful value, not an accident (D8).';

-- Mint helper. Loops until unused. This closes the ordinary collision case, not the
-- concurrent one — two simultaneous signups could still both pass the check and race the
-- UNIQUE index. At 16^8 that is vanishingly rare and it fails loudly rather than
-- silently duplicating, which is the right way round for an identity column.
create or replace function public.mint_referral_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
begin
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from users where referral_code = v_code);
  end loop;
  return v_code;
end;
$$;

revoke all on function public.mint_referral_code() from public;
revoke all on function public.mint_referral_code() from anon;
revoke all on function public.mint_referral_code() from authenticated;
-- Not callable by any client role. It is an internal helper for the SECURITY DEFINER
-- functions below, which run as owner. Nothing outside this file needs it.

-- Backfill every existing user. Row-by-row because each code must be checked for
-- uniqueness against the codes minted earlier in this same loop.
do $$
declare
  r record;
begin
  for r in select id from users where referral_code is null loop
    update users set referral_code = public.mint_referral_code() where id = r.id;
  end loop;
end;
$$;

-- UNIQUE only AFTER the backfill — a partial backfill against a live constraint would
-- abort the migration halfway. NULLs are permitted by a UNIQUE constraint, so this also
-- stays correct if a row somehow arrives uncoded.
create unique index if not exists users_referral_code_key on users (referral_code);

-- ============================================================
-- 2. bootstrap_new_user — referral attribution + create-vs-join signal
-- ============================================================
-- Two additions, both of which the solo-start experience depends on:
--
--   (a) `created_household` in the returned JSON. The client needs to know that bootstrap
--       CREATED a fresh solo place rather than joining one or resolving an existing one —
--       that is the create-vs-join seam the welcome sheet's trigger flag hangs off. It
--       cannot be inferred client-side: an existing user who never renamed their place is
--       indistinguishable from a brand-new one by (name, joined_via_invite) alone, and
--       firing the sheet at them is verification item 10's explicit failure.
--
--   (b) `p_ref_code`. Attribution rides the bootstrap seam so the arrival and the
--       attribution are one transaction. `ref` GRANTS NOTHING — it is not an
--       authorization surface, and it is deliberately never consulted for membership,
--       household selection, or any branch below. It is still validated (resolves to a
--       live user, is not the caller) rather than trusted, per the derive-from-JWT
--       discipline: a parameter that cannot escalate is still a parameter.
--
-- EVERYTHING ELSE IS THE 036 BODY VERBATIM. Every fix encoded in it is retained
-- deliberately — re-read 036's BEHAVIOUR PRESERVED block before touching this:
--   * the invite branch FALLS THROUGH rather than raising on an unresolvable invite
--     (raising rolls back the step-1 upsert and wedges a new user out of signing up);
--   * households liveness (h.deleted_at is null) in invite resolution, from 029;
--   * the revive-on-conflict for leave-then-rejoin;
--   * the ordered, liveness-joined existing-household lookup from 029.

drop function if exists public.bootstrap_new_user(text, text, text);

create function public.bootstrap_new_user(
  p_email text,
  p_invite_code text default null,
  p_full_name text default null,
  p_ref_code text default null
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
  v_is_new_user boolean;
  v_referrer_id uuid;
  v_referral_code text;
begin
  -- 0. Identity from the verified JWT. NOT a parameter — this is the whole point of
  -- Part 2. auth.jwt() is schema-qualified, so the pinned search_path does not affect it.
  v_clerk_id := auth.jwt() ->> 'sub';
  if v_clerk_id is null or v_clerk_id = '' then
    raise exception 'not authenticated'
      using errcode = '28000';
  end if;

  -- 1. Upsert the user — save full_name if provided, mint a referral code on first sight.
  --
  -- `xmax = 0` distinguishes an INSERT from an ON CONFLICT UPDATE in the same statement.
  -- That is the create-vs-return-visit signal, and it is what makes `referred_by` a
  -- write-once column: a returning user cannot be re-attributed by appending ?ref= to
  -- their URL, because the attribution branch below is gated on this flag.
  insert into users (clerk_id, email, full_name, referral_code)
  values (v_clerk_id, p_email, p_full_name, public.mint_referral_code())
  on conflict (clerk_id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, users.full_name),
        -- coalesce, never overwrite: a user minted before 042's backfill (or by it) keeps
        -- the code they already have. The code is stable for the life of the account.
        referral_code = coalesce(users.referral_code, excluded.referral_code)
  returning id, (xmax = 0) into v_user_id, v_is_new_user;

  select referral_code into v_referral_code from users where id = v_user_id;

  -- 1a. Referral attribution (D7/D10). New users only, write-once, never overwritten.
  -- Failure to resolve is SILENT AND HARMLESS — an unrecognised or stale ref code leaves
  -- referred_by null, which is exactly the organic-arrival value. A referral code must
  -- never be able to block a signup; that is the whole difference between ref and invite.
  if v_is_new_user and p_ref_code is not null and p_ref_code != '' then
    select id into v_referrer_id
    from users
    where referral_code = upper(p_ref_code)
      and deleted_at is null
      and id <> v_user_id;          -- self-referral rejected server-side

    if v_referrer_id is not null then
      update users
      set referred_by = v_referrer_id
      where id = v_user_id
        and referred_by is null;    -- belt and braces: write-once at the SQL level too
    end if;
  end if;

  -- 2. Handle invite code first (takes priority over existing household)
  if p_invite_code is not null and p_invite_code != '' then
    -- The liveness check is part of invite RESOLUTION (h.deleted_at is null in the join),
    -- so an invite pointing at a dead household simply does not resolve, and we fall
    -- through to step 3/4.
    --
    -- DO NOT "FIX" THIS BACK TO A RAISE. The exception rolls back the whole transaction,
    -- including the step-1 user upsert, so a brand-new user arriving on a stale invite
    -- link ends up with NO ACCOUNT, and pending_invite_code survives in sessionStorage
    -- and re-fires on every reload. The user is wedged, unable to sign up at all, until
    -- they manually clear browser storage. Falling through costs nothing.
    select hi.id, hi.household_id into v_invite_id, v_household_id
    from household_invites hi
    join households h on h.id = hi.household_id
    where hi.code = upper(p_invite_code)
      and hi.deleted_at is null
      and hi.accepted_at is null
      and hi.expires_at > now()
      and h.deleted_at is null;

    if v_invite_id is not null then
      -- Revive a soft-deleted membership (leave-then-rejoin) or insert fresh.
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
        'joined_via_invite', true,
        'created_household', false,
        'referral_code', v_referral_code
      );
    end if;
  end if;

  -- 3. Check if user already has a household
  --
  -- ORDERING: hm.joined_at desc — most-recently-joined wins.
  -- CAVEAT: the revive branch above (and join_household) resets deleted_at but NOT
  -- joined_at, so a user who left and rejoined orders by their ORIGINAL join time.
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
      'joined_via_invite', false,
      'created_household', false,
      'referral_code', v_referral_code
    );
  end if;

  -- 4. Create a new household
  --
  -- THIS is the create-vs-join seam. `created_household` is true on this path and this
  -- path only — including for an EXISTING user who has left every household and is
  -- landing in a fresh one, which is correct: they are solo in an unnamed place, which
  -- is precisely the state the welcome sheet exists to resolve.
  insert into households (name, created_by)
  values ('My Household', v_user_id)
  returning id into v_household_id;

  insert into household_members (household_id, user_id, role)
  values (v_household_id, v_user_id, 'owner');

  return json_build_object(
    'user_id', v_user_id,
    'household_id', v_household_id,
    'household_name', 'My Household',
    'joined_via_invite', false,
    'created_household', true,
    'referral_code', v_referral_code
  );
end;
$$;

revoke all on function public.bootstrap_new_user(text, text, text, text) from public;
revoke all on function public.bootstrap_new_user(text, text, text, text) from anon;
grant execute on function public.bootstrap_new_user(text, text, text, text) to authenticated;

-- ============================================================
-- 3. discard_unclaimed_household — the D11 guard
-- ============================================================
-- "Naming is claiming." Code-join from the welcome sheet soft-deletes the solo place
-- bootstrap made seconds earlier — but ONLY while nobody has claimed it. One name, one
-- item, or one other member makes it theirs permanently.
--
-- Cleanup exists at THIS MOMENT ONLY. There is no background sweeper, no scheduled job,
-- and no other caller. Tapping Join is the user saying "this isn't where I meant to be";
-- absent that statement, an unnamed empty place is still a place someone might use.
--
-- The four conditions, and where each is enforced:
--   1. created this session by bootstrap  → created_by = caller AND created_at recent
--   2. name still the sentinel            → name = 'My Household'
--   3. zero list items                    → no live list_items rows
--   4. caller is sole member              → exactly one live membership, and it is theirs
--
-- On condition 1: "this session" is a client-side fact the server cannot observe, so it
-- is bounded server-side instead — the caller must be the CREATOR, and the row must be
-- young. The window is deliberately generous (1 hour, not 1 minute) because it is a
-- backstop against a stale client, not the actual guard; conditions 2-4 are what make the
-- deletion safe. A tighter window would only add flakiness on a slow signup.
--
-- Returns { discarded: bool, reason: text } rather than raising: a refusal here is a
-- NORMAL outcome, not an error. The join it follows has already succeeded, and failing
-- the caller's join because we declined to tidy up would be the tail wagging the dog.

create or replace function public.discard_unclaimed_household(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller      uuid;
  v_item_count  int;
  v_member_count int;
begin
  select id into v_caller from users where clerk_id = auth.jwt()->>'sub';
  if v_caller is null then
    raise exception 'discard_unclaimed_household: caller not resolved';
  end if;

  -- Conditions 1 + 2, plus existence and idempotency.
  if not exists (
    select 1 from households
    where id = p_household_id
      and created_by = v_caller
      and deleted_at is null
      and name = 'My Household'
      and created_at > now() - interval '1 hour'
  ) then
    return jsonb_build_object('discarded', false, 'reason', 'not an unclaimed sentinel place');
  end if;

  -- Condition 3 — zero list items. THE control case in verification item 4: a place with
  -- one item added must SURVIVE. First item breaks zero-items forever.
  select count(*) into v_item_count
  from list_items
  where household_id = p_household_id and deleted_at is null;

  if v_item_count > 0 then
    return jsonb_build_object('discarded', false, 'reason', 'place has items');
  end if;

  -- Condition 4 — sole member, and it is the caller. A place someone else has already
  -- joined is shared, and shared is claimed.
  select count(*) into v_member_count
  from household_members
  where household_id = p_household_id and deleted_at is null;

  if v_member_count <> 1 or not exists (
    select 1 from household_members
    where household_id = p_household_id and user_id = v_caller and deleted_at is null
  ) then
    return jsonb_build_object('discarded', false, 'reason', 'place is shared');
  end if;

  -- All four hold. Delegate the actual cascade to delete_household rather than
  -- reimplementing it — ONE soft-delete cascade, guarded twice. delete_household's own
  -- owner-only guard re-checks created_by = caller from the same JWT, so this is
  -- defence in depth, not a bypass. Anything added to that cascade later is inherited
  -- here for free, which is the entire reason not to copy it.
  perform public.delete_household(p_household_id);

  return jsonb_build_object('discarded', true, 'reason', 'unclaimed');
end;
$$;

revoke all on function public.discard_unclaimed_household(uuid) from public;
revoke all on function public.discard_unclaimed_household(uuid) from anon;
grant execute on function public.discard_unclaimed_household(uuid) to authenticated;

commit;

-- =====================================================================
-- VERIFY
-- =====================================================================
-- (1) EXACTLY ONE bootstrap_new_user, and it carries p_ref_code.
--     Check by parameter NAMES — arity alone cannot tell this function from the
--     forgeable p_clerk_id overload 037 dropped, which had the same type signature.
--
-- select pg_get_function_identity_arguments(oid) as sig, prosecdef, proconfig
-- from pg_proc where pronamespace='public'::regnamespace and proname='bootstrap_new_user';
--
-- Expect ONE row: `p_email text, p_invite_code text, p_full_name text, p_ref_code text`,
-- prosecdef true, proconfig {search_path=public, extensions}. If a row mentioning
-- p_clerk_id appears, STOP — 037 has been reverted and identity is forgeable again.
--
-- (2) anon cannot execute either new function:
-- select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
-- from pg_proc p where p.pronamespace='public'::regnamespace
--   and p.proname in ('bootstrap_new_user','discard_unclaimed_household','mint_referral_code');
-- Expect FALSE on all three. Use has_function_privilege, not a raw proacl read — it
-- resolves PUBLIC grants and role inheritance, which proacl does not (the lesson from 028).
--
-- (3) Backfill is complete and unique:
-- select count(*) as total,
--        count(referral_code) as coded,
--        count(distinct referral_code) as distinct_codes
-- from users;
-- Expect total = coded = distinct_codes.
--
-- (4) Existing sign-in is UNCHANGED — the regression that matters most. An existing user
--     signs in on the deployed dev preview (not localhost) and lands in their household,
--     with created_household FALSE. If it returns true for an existing user, the welcome
--     sheet will fire at them and verification item 10 fails.
--
-- (5) STALE-INVITE REGRESSION (inherited from 036, re-check it here): a new user signing
--     up on an EXPIRED or already-accepted invite code must still end up with a working
--     account in a fresh household, NOT an error. If they get an error and cannot sign up
--     at all, the fall-through was turned back into a raise. Revert.
--
-- (6) D11 CONTROL CASE — the one most likely to be got wrong. Add one list item to a
--     fresh sentinel place, then call discard_unclaimed_household on it. Expect
--     {"discarded": false, "reason": "place has items"} and the household still live.
--     A `true` here means the zero-items condition is not doing its job and real users'
--     places are deletable.
--
-- (7) Referral write-once: sign in an EXISTING user with p_ref_code set to another
--     user's code. referred_by must stay unchanged (null for an organic account) —
--     v_is_new_user gates it. Re-attribution by appending ?ref= to a URL must be impossible.
