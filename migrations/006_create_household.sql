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
