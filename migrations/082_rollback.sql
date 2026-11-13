-- 082_rollback.sql — restores bootstrap_new_user to migration 042's body, verbatim
-- (md5 9c7510d337819f275491b6088c84fe89, the body live on dev and prod before 082).
-- Run only to undo 082. A live member's invite tap goes back to burning the code and
-- resetting role to 'member'.

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
$function$;

revoke all on function public.bootstrap_new_user(text, text, text, text) from public;
revoke all on function public.bootstrap_new_user(text, text, text, text) from anon;
grant execute on function public.bootstrap_new_user(text, text, text, text) to authenticated;
grant execute on function public.bootstrap_new_user(text, text, text, text) to service_role;

do $verify$
begin
  if md5(replace((select prosrc from pg_proc where oid = 'public.bootstrap_new_user(text,text,text,text)'::regprocedure), chr(13), ''))
     <> '9c7510d337819f275491b6088c84fe89' then
    raise exception '082 rollback VERIFY failed: body is not 042''s';
  end if;
  raise warning '082 rollback VERIFY: body = 042''s on %', (select system_identifier from pg_control_system());
end
$verify$;

commit;

-- Ledger (dev only): delete from supabase_migrations.schema_migrations where name = '082_member_invite_tap_noop';
