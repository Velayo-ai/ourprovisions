-- ============================================================
-- OurProvisions — Migration 014
-- Fix auth.uid() type-mismatch in RLS policies.
-- ============================================================
-- 8 RLS policies across 4 tables compare auth.uid() (Clerk `sub`,
-- a text string) against a uuid column → the comparison is always
-- false. This migration rewrites the policy DEFINITIONS only:
--   - pure household-membership checks → is_member_of(household_id)
--   - ownership / crew checks          → get_current_user_id()
--
-- Idempotent: drop-and-recreate each policy.
-- Does NOT change RLS enabled/disabled state on any table
-- (known_stores + shopping_sessions stay OFF — flipping RLS on is a
-- separate, riskier act tracked as its own NEXT item).
--
-- Verified on prod (parpauldmbetptkmdwbd) before authoring:
--   RLS state: known_stores OFF, shopping_sessions OFF,
--              velayo_crews ON, velayo_crew_members ON.
--   All 8 policy bodies confirmed via pg_get_expr.
--
-- Apply path: manual SQL-editor paste (no CLI on this project).
-- Dev first → verify → prod.
-- ============================================================

-- ---- known_stores (RLS currently OFF — definitions only) ----
drop policy if exists "known_stores_select_household" on public.known_stores;
create policy "known_stores_select_household" on public.known_stores
  for select to public
  using (is_member_of(household_id) and (deleted_at is null));

drop policy if exists "known_stores_insert_household" on public.known_stores;
create policy "known_stores_insert_household" on public.known_stores
  for insert to public
  with check (is_member_of(household_id));

drop policy if exists "known_stores_update_household" on public.known_stores;
create policy "known_stores_update_household" on public.known_stores
  for update to public
  using (is_member_of(household_id));

-- ---- shopping_sessions (RLS currently OFF — definitions only) ----
drop policy if exists "sessions_select_household" on public.shopping_sessions;
create policy "sessions_select_household" on public.shopping_sessions
  for select to public
  using (is_member_of(household_id) and (deleted_at is null));

-- owner-is-you preserved: get_current_user_id(), AND household membership
drop policy if exists "sessions_insert_own" on public.shopping_sessions;
create policy "sessions_insert_own" on public.shopping_sessions
  for insert to public
  with check (
    (user_id = get_current_user_id())
    and is_member_of(household_id)
  );

drop policy if exists "sessions_update_own" on public.shopping_sessions;
create policy "sessions_update_own" on public.shopping_sessions
  for update to public
  using (user_id = get_current_user_id());

-- ---- velayo_crew_members (RLS ON — fix takes effect on apply) ----
-- crew-keyed: is_member_of does not apply; swap auth.uid() → get_current_user_id()
drop policy if exists "crew_members_in_same_crew" on public.velayo_crew_members;
create policy "crew_members_in_same_crew" on public.velayo_crew_members
  for all to public
  using (
    crew_id in (
      select cm.crew_id
      from velayo_crew_members cm
      where cm.user_id = get_current_user_id()
        and cm.deleted_at is null
    )
  );

-- ---- velayo_crews (RLS ON — fix takes effect on apply) ----
drop policy if exists "crews_for_members" on public.velayo_crews;
create policy "crews_for_members" on public.velayo_crews
  for all to public
  using (
    id in (
      select cm.crew_id
      from velayo_crew_members cm
      where cm.user_id = get_current_user_id()
        and cm.deleted_at is null
    )
  );

-- ============================================================
-- Verify after apply (dev, then prod)
-- ============================================================
-- Expect ZERO rows: no policy should reference auth.uid() anymore.
--   select tablename, policyname
--   from pg_policies
--   where schemaname = 'public'
--     and (coalesce(qual,'') like '%auth.uid()%'
--          or coalesce(with_check,'') like '%auth.uid()%')
--     and tablename in ('known_stores','shopping_sessions',
--                       'velayo_crews','velayo_crew_members');
--
-- Confirm RLS state UNCHANGED (known_stores/shopping_sessions still OFF).
--   select c.relname, c.relrowsecurity
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname='public'
--     and c.relname in ('known_stores','shopping_sessions','velayo_crews','velayo_crew_members')
--   order by c.relname;
-- ============================================================
