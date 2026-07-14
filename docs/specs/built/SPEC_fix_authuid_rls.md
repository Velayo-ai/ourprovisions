# SPEC — Fix `auth.uid()` RLS policies (migration #1)

**Scope:** OurProvisions
**Type:** DB migration (idempotent, drop-and-recreate)
**Filing number:** `014` (folder convention only — prod has NO `supabase_migrations.schema_migrations` tracker; numbers are not load-bearing). Claude Code: assign final number on merge; `013` is current highest on disk.
**Apply path:** Manual SQL-editor paste (no CLI on this project). Dev first → verify → prod.

---

## Why

8 RLS policies across 4 tables compare a Clerk string ID (`auth.uid()` returns the Clerk `sub`, a text string) against a `uuid` column (`household_members.user_id` / `velayo_crew_members.user_id`). The comparison can never be true.

**Verified on prod (`parpauldmbetptkmdwbd`) this session:**
- RLS state: `known_stores` OFF, `shopping_sessions` OFF, `velayo_crews` ON, `velayo_crew_members` ON.
- All 8 policy bodies confirmed via `pg_get_expr` (CSV export, exact).

## Rewrite mapping (per-policy, semantics preserved)

| policy | rewrite | rationale |
|---|---|---|
| `known_stores_insert/select/update_household` | `is_member_of(household_id)` | pure household-membership check → canonical helper |
| `sessions_select_household` | `is_member_of(household_id)` | pure household-membership check → canonical helper |
| `sessions_insert_own` | `get_current_user_id()` + `is_member_of(household_id)` | **owner-is-you** semantics must be preserved; `is_member_of` alone would let any member insert another's session |
| `sessions_update_own` | `get_current_user_id()` | **owner-is-you** semantics |
| `crew_members_in_same_crew` | `get_current_user_id()` | crew-keyed (no `household_id`); `is_member_of` does not apply |
| `crews_for_members` | `get_current_user_id()` | crew-keyed |

`SELECT` policies retain their `AND deleted_at IS NULL` tail verbatim.

## Deliberate NON-changes (auth-neutral / reversible)

- **RLS stays OFF** on `known_stores` and `shopping_sessions`. This migration fixes policy *definitions* only. Flipping RLS on is a separate, riskier act tracked as its own NEXT item ("re-enable RLS on provision_cycles, shopping_sessions, known_stores"). Crew tables already have RLS ON, so their policy fixes take effect on apply (both tables dormant).
- `is_member_of` is the canonical helper per ARCHITECTURE (SECURITY DEFINER, filters `deleted_at is null`). Used only where the check is pure household membership.

---

## SQL

```sql
-- ============================================================
-- 014 — Fix auth.uid() type-mismatch in RLS policies.
-- auth.uid() (Clerk string) vs uuid columns → always false.
-- Household-membership checks → is_member_of(household_id).
-- Ownership / crew checks → get_current_user_id() (uuid via Clerk sub).
-- Idempotent: drop-and-recreate each policy.
-- Does NOT change RLS enabled/disabled state on any table.
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
```

## Verify after apply (dev, then prod)

```sql
-- Expect ZERO rows: no policy should reference auth.uid() anymore.
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and (coalesce(qual,'') like '%auth.uid()%'
       or coalesce(with_check,'') like '%auth.uid()%')
  and tablename in ('known_stores','shopping_sessions',
                    'velayo_crews','velayo_crew_members');

-- Confirm RLS state UNCHANGED (known_stores/shopping_sessions still OFF).
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public'
  and c.relname in ('known_stores','shopping_sessions','velayo_crews','velayo_crew_members')
order by c.relname;
```
