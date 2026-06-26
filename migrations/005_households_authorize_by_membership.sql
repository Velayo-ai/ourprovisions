-- ============================================================
-- OurProvisions — Migration 005
-- households RLS: authorize by membership, not active-household
-- ============================================================
-- Replaces the `id = get_current_household_id()` gate on households
-- SELECT/UPDATE with is_member_of(id) (migration 003). Unblocks
-- multi-household reads after the useProvisions active-household re-scope.
-- The invite-code preview branch on SELECT is preserved exactly.
-- Depends on: migration 003 (is_member_of). Dev-first; bundle to prod with 003+004.
-- ============================================================

begin;

drop policy if exists households_select on public.households;

create policy households_select on public.households
  for select
  using (
    is_member_of(id)
    OR (id IN (
      SELECT household_invites.household_id
      FROM household_invites
      WHERE ((household_invites.deleted_at IS NULL)
        AND (household_invites.accepted_at IS NULL)
        AND (household_invites.expires_at > now()))
    ))
  );

drop policy if exists households_update on public.households;

create policy households_update on public.households
  for update
  using (is_member_of(id))
  with check (is_member_of(id));

-- households_insert intentionally unchanged (with check = true).

commit;
