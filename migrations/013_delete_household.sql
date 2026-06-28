-- ============================================================
-- OurProvisions — Migration 013
-- delete_household(p_household_id uuid) — SECURITY DEFINER RPC
-- ============================================================
-- Soft-delete cascade for an entire household. Owner-only guard.
-- Applied to dev (zxwtxjjmssykhqrghouf) 2026-06-27 by hand.
-- Prod apply PENDING.
--
-- Prerequisites (all live on dev + prod before this migration):
--   - provision_cycles, list_item_contributors — no deleted_at column yet
--   - users.clerk_id (Clerk third-party auth — auth.uid() not populated)
--   - households.created_by (owner anchor)
--
-- Steps:
--   1. Add deleted_at to provision_cycles (no soft-delete support prior)
--   2. Add deleted_at to list_item_contributors (D1: soft-delete for recoverability)
--   3. Create delete_household RPC
-- ============================================================

-- 1. Extend provision_cycles with soft-delete support
alter table provision_cycles
  add column deleted_at timestamptz;

-- 2. Extend list_item_contributors with soft-delete support (D1 — keeps deletion recoverable)
alter table list_item_contributors
  add column deleted_at timestamptz;

-- 3. delete_household: owner-only soft-delete cascade
--
-- Auth: resolves caller from Clerk JWT sub → users.clerk_id.
--       auth.uid() is not populated in this Clerk-auth stack.
-- Guard: caller must be households.created_by AND household must exist
--        AND deleted_at IS NULL (idempotency / double-tap safety).
-- Returns: { deleted, member_count, household_id }
--   member_count captured BEFORE the household_members soft-delete
--   so the client can render honest confirm copy.
-- Cascade order: deepest FK dependents first, household row last.
-- user_hidden_items: hard-deleted — per-user view state, disposable;
--   subquery still resolves because catalog_items are only soft-deleted.

create or replace function public.delete_household(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller       uuid;
  v_member_count int;
begin
  -- Resolve caller from Clerk JWT (auth.uid() not populated with Clerk auth)
  select id into v_caller from users where clerk_id = auth.jwt()->>'sub';
  if v_caller is null then
    raise exception 'delete_household: caller not resolved';
  end if;

  -- Owner-only + existence + not-already-deleted guard
  if not exists (
    select 1 from households
    where id = p_household_id
      and created_by = v_caller
      and deleted_at is null
  ) then
    raise exception 'delete_household: not authorized, not found, or already deleted';
  end if;

  -- Capture member count BEFORE soft-deleting household_members
  select count(*) into v_member_count
  from household_members
  where household_id = p_household_id and deleted_at is null;

  -- Soft-delete cascade: deepest FK dependents first
  update list_item_contributors
    set deleted_at = now()
    where list_item_id in (
      select id from list_items where household_id = p_household_id
    )
    and deleted_at is null;

  update waste_events
    set deleted_at = now()
    where household_id = p_household_id and deleted_at is null;

  update shopping_sessions
    set deleted_at = now()
    where household_id = p_household_id and deleted_at is null;

  update list_items
    set deleted_at = now()
    where household_id = p_household_id and deleted_at is null;

  update provision_cycles
    set deleted_at = now()
    where household_id = p_household_id and deleted_at is null;

  update catalog_items
    set deleted_at = now()
    where household_id = p_household_id and deleted_at is null;

  update known_stores
    set deleted_at = now()
    where household_id = p_household_id and deleted_at is null;

  update household_invites
    set deleted_at = now()
    where household_id = p_household_id and deleted_at is null;

  update household_members
    set deleted_at = now()
    where household_id = p_household_id and deleted_at is null;

  -- Hard-delete user_hidden_items: per-user view state, disposable
  delete from user_hidden_items
  where catalog_item_id in (
    select id from catalog_items where household_id = p_household_id
  );

  -- Soft-delete the household itself (last)
  update households
    set deleted_at = now()
    where id = p_household_id and deleted_at is null;

  return jsonb_build_object(
    'deleted',       true,
    'member_count',  v_member_count,
    'household_id',  p_household_id
  );
end;
$$;
