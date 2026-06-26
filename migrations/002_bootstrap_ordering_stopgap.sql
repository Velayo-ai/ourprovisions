-- ============================================================
-- Migration 002 — bootstrap_new_user ordering STOPGAP (TEMPORARY)
-- ============================================================
-- TEMPORARY: aligns bootstrap_new_user's household pick (was an
-- unordered LIMIT 1) to joined_at DESC, matching get_current_household_id()
-- so RLS permits the read. This is a holdover to unblock multi-household
-- testing. The REAL fix (next session) is to make bootstrap load the
-- ACTIVE household resolved by ActiveHouseholdContext rather than picking
-- one by any heuristic. Remove/supersede this when that lands.
-- Note: three orderings currently exist — bootstrap (this, DESC),
-- get_current_household_id (DESC), get_my_households/context default (ASC).
-- The DESC choice here matches the RLS GATE, not the context default.
-- ============================================================

CREATE OR REPLACE FUNCTION public.bootstrap_new_user(p_clerk_id text, p_email text, p_invite_code text DEFAULT NULL::text, p_full_name text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    select id, household_id into v_invite_id, v_household_id
    from household_invites
    where code = upper(p_invite_code)
    and deleted_at is null
    and accepted_at is null
    and expires_at > now();

    if v_invite_id is not null then
      insert into household_members (household_id, user_id, role)
      values (v_household_id, v_user_id, 'member')
      on conflict (household_id, user_id) do nothing;

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
  -- CHANGED (migration 002): added ORDER BY joined_at DESC to match
  -- get_current_household_id() and satisfy the households_select RLS gate.
  select household_id into v_household_id
  from household_members
  where user_id = v_user_id
  and deleted_at is null
  order by joined_at desc
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
$function$;
