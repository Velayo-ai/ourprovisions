-- ============================================================
-- Migration 001 — get_my_households()
-- First migration after canonical baseline (000).
-- ============================================================
-- The household_members SELECT policy is scoped to the caller's
-- ACTIVE household: (household_id = get_current_household_id()).
-- A user therefore cannot enumerate their OTHER memberships via
-- normal RLS — but the multi-household switcher must list ALL of
-- them. This SECURITY DEFINER function returns every household the
-- CALLING user belongs to. Safety: identity is resolved INTERNALLY
-- via get_current_user_id() (which reads auth.jwt()->>'sub'); the
-- function takes no user-id parameter, so no caller can read the
-- households of a user other than themselves.
-- ============================================================

create or replace function get_my_households()
returns table (
  household_id  uuid,
  name          text,
  role          text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    h.id    as household_id,
    h.name  as name,
    hm.role as role
  from household_members hm
  join households h on h.id = hm.household_id
  where hm.user_id = get_current_user_id()
    and hm.deleted_at is null
    and h.deleted_at is null
  order by hm.joined_at asc;
  -- Note: household_members uses joined_at (not created_at) as its timestamp column.
  -- Ordering by joined_at asc returns the oldest membership first, which is the
  -- intended fallback default for active-household resolution.
$$;

grant execute on function get_my_households() to authenticated;
