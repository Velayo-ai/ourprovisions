-- 082_member_invite_tap_noop.sql
-- SPEC_durable_invite_hold.md Part B (2026-11-08): a current member tapping an invite is a no-op.
--
-- THE BUG (two, one line): bootstrap_new_user step 2 resolves a valid invite and then always runs
--   insert … on conflict (household_id, user_id) do update set deleted_at = null, role = 'member'
--   and stamps accepted_at. For a caller who is ALREADY a live member of that household, that
--   (a) burns a single-use code nobody new used, and (b) resets their role to 'member' — an owner
--   who taps their own place's invite demotes themselves. (join_household already short-circuits a
--   live member without stamping or touching role; bootstrap did not.)
--
-- STEP 0 (read-only, 2026-11-08):
--   dev  (7642734024280108049): bootstrap_new_user(text,text,text,text) prosrc md5 (CR stripped)
--        9c7510d337819f275491b6088c84fe89 = migration 042's body byte for byte (6166 chars, stored
--        CRLF); SECURITY DEFINER, search_path=public, extensions; EXECUTE authenticated + service_role,
--        not anon, not PUBLIC. Ledger top: 20261108033149 081_backfill_rolled_contributors.
--   prod (7606130613603586966): the same body (CRLF; md5 with CRs stripped = 9c7510d3…), same
--        definer, search_path and grants.
--   join_household(text) already returns a live member's household without stamping accepted_at or
--        touching role, so the client's second look (useProvisions bootstrap: a code present but
--        joined_via_invite false → join_household) lands the member on that place, code unburned.
--
-- WHAT — bootstrap_new_user recreated from 042's body with ONE change: in step 2, once the invite
--   resolves, a caller who is a LIVE member (deleted_at is null) of the invite's household gets the
--   existing-household shape for that place (joined_via_invite false, created_household false) and
--   nothing is written: no accepted_at stamp, no role change. A soft-deleted membership (left, then
--   rejoined by invite) is not live, so it still revives as member and stamps the code, as before.
--   One comment line also changes: the held invite now survives "in the browser" (Part A moved it
--   from sessionStorage to localStorage). Signature, defaults, SECURITY DEFINER, search_path and
--   every other line are 042's. The revoke/grant block re-states the live grants so the read-back
--   proves them. New body md5 e7e524ffe8faf001833df5d8bea92b11.
--
-- NOT IN 082: no client change (Part A, 1384a49, is the client half and does not depend on this).
--
-- FIXTURE: inside `savepoint fixture` … `rollback to savepoint fixture`. Throw-away users: O (owner),
--   M (member), L (left: soft-deleted member), N (brand new). One household, one 7-day invite.
--   Impersonates through request.jwt.claims (is_local = true). Nothing survives.
-- APPLY: dev first. PARSE CHECK = this file with `commit;` → `rollback;`, nothing else changed. Both
--   copies log (warnings): "082 VERIFY: 9 checked, 0 mismatches", "082 fixture: 9 checks passed",
--   then "082 COMMITTED — …" or "082 ROLLED BACK — parse check …". Then the closing VERIFY on the same
--   database and the ledger row (dev only; prod has no ledger, applied = object read-back). Prod by
--   Dan after the dev read-back, then the prod walk (spec Part B Verify 1–4).
-- ROLLBACK: 082_rollback.sql restores 042's body verbatim.
--
-- DRAFTED 2026-11-08 by Claude Code.
-- DEV: parse check clean (VERIFY 9/0, fixture 9/9, nothing persisted); the fixture's owner check run
--   against 042's body failed as it should ("the owner was demoted"). APPLIED ON DEV 2026-11-09
--   03:08 UTC by Claude Code; closing VERIFY all as wanted (body md5 e7e524ff…, grants authenticated +
--   service_role, fixture_rows 0); ledger 20261109030809.
-- PROD: applied by Dan in the prod SQL editor 2026-11-09 (after the Part A client, main 9f4980e).
--   Read back by Claude Code from pg_proc (prod-readonly): which_db 7606130613603586966, committed,
--   one function, secdef, search_path public, extensions, EXECUTE authenticated + service_role only,
--   markers 042 / 082 / revive true, body md5 (CR stripped) e7e524ff… = dev, stored CRLF,
--   fixture_rows 0. No ledger on prod.

begin;

create or replace function public.bootstrap_new_user(
  p_email text,
  p_invite_code text default null,
  p_full_name text default null,
  p_ref_code text default null
)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
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
    -- link ends up with NO ACCOUNT, and pending_invite_code survives in the browser
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
      -- 082: the caller is already a LIVE member of the invite's household, so the
      -- tap is a no-op: the code is not burned (no accepted_at) and the role is not
      -- touched (an owner's tap used to demote them to member). They get the
      -- existing-household shape, for the invite's place. A soft-deleted member
      -- (left, then rejoined by invite) is not live and is revived below, as before.
      if exists (
        select 1 from household_members hm
        where hm.household_id = v_household_id
          and hm.user_id = v_user_id
          and hm.deleted_at is null
      ) then
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
$function$;

revoke all on function public.bootstrap_new_user(text, text, text, text) from public;
revoke all on function public.bootstrap_new_user(text, text, text, text) from anon;
grant execute on function public.bootstrap_new_user(text, text, text, text) to authenticated;
grant execute on function public.bootstrap_new_user(text, text, text, text) to service_role;

-- VERIFY — inside the transaction; any mismatch raises and rolls everything back.
do $verify$
declare
  v_bad     text[] := array[]::text[];
  v_checked integer := 0;
  v_oid     oid;
  v_src     text;
begin
  v_checked := v_checked + 1;
  if (select count(*) from pg_proc where proname = 'bootstrap_new_user' and pronamespace = 'public'::regnamespace) <> 1 then v_bad := v_bad || 'not exactly one bootstrap_new_user'; end if;
  select p.oid, p.prosrc into v_oid, v_src from pg_proc p
   where p.proname = 'bootstrap_new_user' and p.pronamespace = 'public'::regnamespace
     and p.oid = 'public.bootstrap_new_user(text,text,text,text)'::regprocedure;
  v_checked := v_checked + 1;
  if not (select prosecdef from pg_proc where oid = v_oid) then v_bad := v_bad || 'not security definer'; end if;
  v_checked := v_checked + 1;
  if (select proconfig from pg_proc where oid = v_oid) is distinct from array['search_path=public, extensions'] then v_bad := v_bad || 'search_path changed'; end if;
  v_checked := v_checked + 1;
  if has_function_privilege('anon', v_oid, 'execute')
     or not has_function_privilege('authenticated', v_oid, 'execute')
     or not has_function_privilege('service_role', v_oid, 'execute') then v_bad := v_bad || 'grants: want authenticated + service_role, not anon'; end if;
  v_checked := v_checked + 1;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) x where p.oid = v_oid and x.grantee = 0) then v_bad := v_bad || 'PUBLIC holds EXECUTE'; end if;
  v_checked := v_checked + 1;
  if v_src not like '%1a. Referral attribution (D7/D10)%' or v_src not like '%THIS is the create-vs-join seam%' then v_bad := v_bad || 'markers 042 missing'; end if;
  v_checked := v_checked + 1;
  if v_src not like '%082: the caller is already a LIVE member of the invite''s household%' then v_bad := v_bad || 'marker 082 missing'; end if;
  v_checked := v_checked + 1;
  if v_src not like '%do update set deleted_at = null, role = ''member''%' then v_bad := v_bad || 'the revive branch is gone'; end if;
  v_checked := v_checked + 1;
  if md5(replace(v_src, chr(13), '')) <> 'e7e524ffe8faf001833df5d8bea92b11' then v_bad := v_bad || ('body md5 ' || md5(replace(v_src, chr(13), '')) || ' is not the file''s'); end if;
  raise warning '082 VERIFY: % checked, % mismatches%', v_checked, cardinality(v_bad),
    case when cardinality(v_bad) > 0 then ' — ' || array_to_string(v_bad, '; ') else '' end;
  if cardinality(v_bad) > 0 then
    raise exception '082 VERIFY failed: %', array_to_string(v_bad, '; ');
  end if;
end
$verify$;

-- FIXTURE — definer-run, inside a savepoint, rolled back. Nothing here survives.
savepoint fixture;

do $fixture$
declare
  v_tag   text := '082-fixture-' || gen_random_uuid()::text;
  v_code  text := 'F082' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
  v_code2 text := 'G082' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
  v_o uuid; v_m uuid; v_l uuid;            -- owner, member, left (soft-deleted) member
  v_hh uuid; v_other uuid; v_inv uuid; v_inv2 uuid;
  v_r json;
  v_ok integer := 0;
begin
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-o', v_tag || '-o@fixture.invalid', '082 Owner') returning id into v_o;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-m', v_tag || '-m@fixture.invalid', '082 Member') returning id into v_m;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-l', v_tag || '-l@fixture.invalid', '082 Left') returning id into v_l;
  insert into public.households (name, created_by) values (v_tag, v_o) returning id into v_hh;
  insert into public.households (name, created_by) values (v_tag || '-other', v_m) returning id into v_other;
  insert into public.household_members (household_id, user_id, role) values (v_hh, v_o, 'owner'), (v_hh, v_m, 'member'), (v_other, v_m, 'owner');
  insert into public.household_members (household_id, user_id, role, deleted_at) values (v_hh, v_l, 'member', now() - interval '1 day');
  insert into public.household_invites (household_id, created_by, code, expires_at) values (v_hh, v_o, v_code, now() + interval '7 days') returning id into v_inv;
  insert into public.household_invites (household_id, created_by, code, expires_at) values (v_hh, v_o, v_code2, now() + interval '7 days') returning id into v_inv2;

  -- (1) The OWNER taps their own place's invite: still owner, code unburned, the existing-household shape for that place.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tag || '-o', 'role', 'authenticated')::text, true);
  v_r := public.bootstrap_new_user(v_tag || '-o@fixture.invalid', lower(v_code), null, null);
  if (select role from public.household_members where household_id = v_hh and user_id = v_o) <> 'owner' then raise exception '082 fixture (1): the owner was demoted'; end if;
  if (select accepted_at from public.household_invites where id = v_inv) is not null then raise exception '082 fixture (1): the owner''s tap burned the code'; end if;
  if (v_r->>'joined_via_invite')::boolean or (v_r->>'created_household')::boolean or (v_r->>'household_id')::uuid <> v_hh or v_r->>'household_name' <> v_tag then
    raise exception '082 fixture (1): wrong shape: %', v_r;
  end if;
  v_ok := v_ok + 1;

  -- (2) A MEMBER taps (they also own another place): role unchanged, code unburned, lands on the invite's place.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tag || '-m', 'role', 'authenticated')::text, true);
  v_r := public.bootstrap_new_user(v_tag || '-m@fixture.invalid', v_code, null, null);
  if (select role from public.household_members where household_id = v_hh and user_id = v_m) <> 'member'
     or (select role from public.household_members where household_id = v_other and user_id = v_m) <> 'owner' then raise exception '082 fixture (2): a role changed'; end if;
  if (select accepted_at from public.household_invites where id = v_inv) is not null then raise exception '082 fixture (2): the member''s tap burned the code'; end if;
  if (v_r->>'joined_via_invite')::boolean or (v_r->>'household_id')::uuid <> v_hh then raise exception '082 fixture (2): wrong shape: %', v_r; end if;
  v_ok := v_ok + 1;

  -- (3) No membership row was added or revived by either tap.
  if (select count(*) from public.household_members where household_id = v_hh and deleted_at is null) <> 2 then raise exception '082 fixture (3): live membership count changed'; end if;
  v_ok := v_ok + 1;

  -- (4) A BRAND-NEW user then uses the same code: joins as member, the code is stamped to them.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tag || '-n', 'role', 'authenticated')::text, true);
  v_r := public.bootstrap_new_user(v_tag || '-n@fixture.invalid', v_code, '082 New', null);
  if not (v_r->>'joined_via_invite')::boolean or (v_r->>'household_id')::uuid <> v_hh or (v_r->>'created_household')::boolean then raise exception '082 fixture (4): the new user did not join: %', v_r; end if;
  if (select accepted_by from public.household_invites where id = v_inv) is distinct from (v_r->>'user_id')::uuid then raise exception '082 fixture (4): the code is not stamped to the new user'; end if;
  if (select role from public.household_members where household_id = v_hh and user_id = (v_r->>'user_id')::uuid and deleted_at is null) <> 'member' then raise exception '082 fixture (4): the new user is not a live member'; end if;
  v_ok := v_ok + 1;

  -- (5) The used code no longer resolves for a member: step 3 as before (a live household, not joined).
  perform set_config('request.jwt.claims', json_build_object('sub', v_tag || '-m', 'role', 'authenticated')::text, true);
  v_r := public.bootstrap_new_user(v_tag || '-m@fixture.invalid', v_code, null, null);
  if (v_r->>'joined_via_invite')::boolean or (v_r->>'created_household')::boolean then raise exception '082 fixture (5): a used code acted: %', v_r; end if;
  v_ok := v_ok + 1;

  -- (6) LEFT, then rejoins by invite: the soft-deleted row is revived as member and the code is stamped (unchanged).
  perform set_config('request.jwt.claims', json_build_object('sub', v_tag || '-l', 'role', 'authenticated')::text, true);
  v_r := public.bootstrap_new_user(v_tag || '-l@fixture.invalid', v_code2, null, null);
  if not (v_r->>'joined_via_invite')::boolean or (v_r->>'household_id')::uuid <> v_hh then raise exception '082 fixture (6): the left member did not rejoin: %', v_r; end if;
  if (select deleted_at is null and role = 'member' from public.household_members where household_id = v_hh and user_id = v_l) is not true then raise exception '082 fixture (6): not revived as a live member'; end if;
  if (select accepted_by from public.household_invites where id = v_inv2) is distinct from v_l then raise exception '082 fixture (6): the rejoin did not stamp the code'; end if;
  if (select count(*) from public.household_members where household_id = v_hh and user_id = v_l) <> 1 then raise exception '082 fixture (6): a second membership row'; end if;
  v_ok := v_ok + 1;

  -- (7) No code: an existing member gets their household, nothing created (unchanged).
  perform set_config('request.jwt.claims', json_build_object('sub', v_tag || '-o', 'role', 'authenticated')::text, true);
  v_r := public.bootstrap_new_user(v_tag || '-o@fixture.invalid', null, null, null);
  if (v_r->>'created_household')::boolean or (v_r->>'joined_via_invite')::boolean then raise exception '082 fixture (7): %', v_r; end if;
  v_ok := v_ok + 1;

  -- (8) A brand-new user with no code still gets a fresh solo place (the create-vs-join seam, unchanged).
  perform set_config('request.jwt.claims', json_build_object('sub', v_tag || '-s', 'role', 'authenticated')::text, true);
  v_r := public.bootstrap_new_user(v_tag || '-s@fixture.invalid', null, null, null);
  if not (v_r->>'created_household')::boolean or v_r->>'household_name' <> 'My Household' then raise exception '082 fixture (8): %', v_r; end if;
  v_ok := v_ok + 1;

  -- (9) The owner is still owner at the end, after every other tap.
  if (select role from public.household_members where household_id = v_hh and user_id = v_o and deleted_at is null) <> 'owner' then raise exception '082 fixture (9): owner lost'; end if;
  v_ok := v_ok + 1;

  raise warning '082 fixture: % checks passed', v_ok;
end
$fixture$;

rollback to savepoint fixture;

commit;

do $log$
begin
  if (select prosrc like '%082: the caller is already a LIVE member of the invite''s household%' from pg_proc
       where oid = 'public.bootstrap_new_user(text,text,text,text)'::regprocedure) then
    raise warning '082 COMMITTED — a live member''s invite tap is a no-op on %', (select system_identifier from pg_control_system());
  else
    raise warning '082 ROLLED BACK — parse check, nothing persisted on %', (select system_identifier from pg_control_system());
  end if;
end
$log$;

-- ═══ CLOSING VERIFY (read-only; run on the same database right after the commit) ══════════
-- Want: which_db as expected, copy committed, functions 1, secdef true, anon false,
-- authenticated true, service_role true, public_exec false, marker_042 / marker_082 true,
-- revive_kept true, body_md5_ok true, fixture_rows 0.
select
  (select system_identifier from pg_control_system())::text                                   as which_db,
  case when p.prosrc like '%082: the caller is already a LIVE member of the invite''s household%'
       then 'committed' else 'rolled back' end                                                 as copy,
  count(*) over ()                                                                             as functions_named_bootstrap_new_user,
  p.prosecdef                                                                                  as secdef,
  p.proconfig::text                                                                            as search_path,
  has_function_privilege('anon', p.oid, 'execute')                                             as anon,
  has_function_privilege('authenticated', p.oid, 'execute')                                    as authenticated,
  has_function_privilege('service_role', p.oid, 'execute')                                     as service_role,
  exists (select 1 from aclexplode(p.proacl) x where x.grantee = 0)                            as public_exec,
  p.prosrc like '%THIS is the create-vs-join seam%'                                            as marker_042,
  p.prosrc like '%082: the caller is already a LIVE member of the invite''s household%'        as marker_082,
  p.prosrc like '%do update set deleted_at = null, role = ''member''%'                         as revive_kept,
  md5(replace(p.prosrc, chr(13), '')) = 'e7e524ffe8faf001833df5d8bea92b11'                                          as body_md5_ok,
  (select count(*) from public.users where clerk_id like '082-fixture-%')
  + (select count(*) from public.households where name like '082-fixture-%')
  + (select count(*) from public.household_invites where code like 'F082%' or code like 'G082%') as fixture_rows
from pg_proc p
where p.proname = 'bootstrap_new_user' and p.pronamespace = 'public'::regnamespace;

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '082_member_invite_tap_noop'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '082_member_invite_tap_noop');
