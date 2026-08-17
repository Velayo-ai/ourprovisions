-- 032_rls_cycle_tables.sql
-- Part 4b — enable RLS on the three unprotected tables, add the missing
-- provision_cycles policies, and close two gaps in the existing ones.
-- Spec: docs/specs/active/SPEC_rls_and_rpc_authorization.md, Part 4.
--
-- NUMBERING: 030 is the highest migration on disk. 031 is RESERVED for the
-- cycle-integrity work (SPEC_cycle_integrity_031.md, referenced from ROADMAP and
-- from the NOTE blocks inside 025_meals.sql and 026_resurrect_integrity.sql) and is
-- not yet written to disk. This migration takes 032 rather than backfilling 031.
-- 027 is RETIRED — never written, its work became 031. The 026->028 gap is honest drift.
--
-- =====================================================================
-- SEQUENCING CONSTRAINT — DO NOT SPLIT THIS FILE
-- =====================================================================
-- The policy work and ENABLE ROW LEVEL SECURITY must land in ONE transaction.
-- A table with RLS enabled and no policies denies ALL access to non-owner roles.
-- Applying the three ALTERs alone takes the cycle features down for every user:
-- loadActiveCycle returns nothing, opening a cycle fails, shopping sessions cannot
-- start or close. Run the whole file, or none of it.
-- =====================================================================
--
-- =====================================================================
-- THE SPEC'S FIX BLOCK WAS WRITTEN AGAINST A FALSE PREMISE — READ THIS
-- =====================================================================
-- Part 4 specs "create 3 policies per table" for all three tables, on the
-- assumption that all three were policy-free. THEY ARE NOT. Confirmed identical
-- in dev and prod via pg_policy, 2026-08-16:
--
--   known_stores       3 policies, DORMANT (RLS off)
--   shopping_sessions  3 policies, DORMANT (RLS off)
--   provision_cycles   0 policies   <- the only genuinely missing set
--
-- These six are not fossils. They were deliberately authored in
-- archive/005_provision_cycles_sessions_stores.sql with stated rationale, and
-- REPAIRED once already by 014_fix_authuid_rls.sql, which fixed the known
-- auth.uid()-Clerk-string-vs-uuid debt and explicitly left them as "definitions
-- only" because RLS was off. They encode a design the spec's uniform block does not:
--
--   * shopping_sessions writes are PER-USER, not household-scoped.
--     archive/005: "A user can only create a session for themselves (can't start a
--     session on behalf of Helen)". The spec's "Decision: household-scoped" section
--     reasoned toward the opposite WITHOUT KNOWING this rule already existed.
--   * both SELECT policies carry `deleted_at is null`. The spec's do not.
--
-- Creating the spec'd policies ALONGSIDE these would have been actively harmful.
-- Permissive policies on the same command are OR'd, so the widest wins:
--   * SELECT would become `(is_member_of AND deleted_at IS NULL) OR is_member_of`
--     = is_member_of — DEFEATING the soft-delete filter.
--   * shopping_sessions UPDATE would become `(user_id = me) OR is_member_of(...)`
--     — silently widening a deliberate per-user rule to household-wide.
--
-- DECISION (Dan, 2026-08-16): keep the existing design as the design of record, add
-- only the missing provision_cycles set, and repair two real gaps in the existing
-- policies. The spec's uniform 9-policy block is NOT built as written; Part 4 of the
-- spec has been corrected to match this file.
-- =====================================================================
--
-- CONTEXT
-- All three tables have relrowsecurity = false in both dev and prod. 028 revoked
-- `anon` (closing the no-credential path), but `authenticated` retains full unfiltered
-- SELECT/INSERT/UPDATE/DELETE, and with RLS off the table grant is the only gate. Any
-- signed-in user can read and modify every household's cycles, stores and sessions.
--
-- All three carry household_id uuid NOT NULL FK -> households.id, so is_member_of()
-- applies directly with no join path, exactly as on list_items.
--
-- DEPENDENCY — SATISFIED. These policies are only as correct as is_member_of(). 029
-- rewrote it to join users AND households, filtering u.deleted_at is null and
-- h.deleted_at is null. Confirmed present and byte-identical in dev and prod via
-- pg_get_functiondef before writing this migration, so membership in a soft-deleted
-- household does NOT satisfy anything below.
--
-- get_current_user_id() (used by the session policies) is SECURITY DEFINER, STABLE,
-- search_path-pinned, and resolves users.id from auth.jwt()->>'sub'. That is the same
-- value the client writes as user_id — useProvisions.js:325 sets
-- internalUserIdRef.current = bootstrapData.user_id. Verified before enabling, because
-- enabling RLS activates these six policies for the first time ever.
--
-- WHY NO DELETE POLICY ANYWHERE
-- Deliberate, and it matches what already exists — none of the six has one either.
-- With RLS on and no DELETE policy, deletes are denied to the client outright. All
-- three tables carry deleted_at and soft-delete is the convention, so a hard client
-- delete is something no code does and nothing should start doing casually. Matches
-- household_members. If a genuine delete need appears it should arrive as a SECURITY
-- DEFINER RPC, which bypasses RLS anyway and needs no policy here.
--
-- WHAT THIS DOES NOT DO
--   * Does not revoke the `authenticated` table grants. With RLS enabled they are
--     filtered by the policies, and the unused DELETE grant is inert (no DELETE
--     policy => denied). Revoking is out of scope for this migration.
--   * Does not change the `to public` role targeting on the four existing policies it
--     leaves or repairs. That is pre-existing drift (same shape as list_items_select,
--     already flagged in the spec's Follow-on as a normalize-for-consistency item).
--     Changing it here would be unscoped churn; anon holds no grant on these tables
--     post-028, so `public` fails closed at the grant level regardless.
--   * TRUNCATE is NOT governed by RLS. `authenticated` still holds it. provision_cycles
--     and known_stores are FK-referenced (NO ACTION) so TRUNCATE on them is blocked by
--     Postgres; shopping_sessions is referenced by nothing and is not. Not reachable
--     from the client — PostgREST exposes no TRUNCATE verb and these roles have no
--     direct connection — but it is the one residual item, noted rather than silently
--     assumed away.

begin;

-- -------------------------------------------------------------------------
-- 1. REPAIR — two existing policies with unconstrained UPDATE post-images
-- -------------------------------------------------------------------------
-- An UPDATE policy with USING but no WITH CHECK constrains which rows you may
-- target, but NOT what you may write into them. Both policies below could be used
-- to rewrite household_id and move a row into a household the writer is not a
-- member of. sessions_update_own is the sharper of the two: it never checked
-- membership at all, so "your own row" was the only constraint.
-- Repaired in the 014 house style (drop + recreate), preserving `to public`.

drop policy if exists "sessions_update_own" on public.shopping_sessions;
create policy "sessions_update_own" on public.shopping_sessions
  for update to public
  using (
    user_id = get_current_user_id()
    and is_member_of(household_id)
  )
  with check (
    user_id = get_current_user_id()
    and is_member_of(household_id)
  );

drop policy if exists "known_stores_update_household" on public.known_stores;
create policy "known_stores_update_household" on public.known_stores
  for update to public
  using (is_member_of(household_id))
  with check (is_member_of(household_id));

-- -------------------------------------------------------------------------
-- 2. CREATE — provision_cycles, the only table with no policies at all
-- -------------------------------------------------------------------------
-- Predicate is the spec's plain is_member_of(household_id), NOT the
-- `and deleted_at is null` shape used by the two sibling SELECT policies. This is
-- the deliberate, wider choice: provision_cycles is the one populated table and the
-- only one in the core loop, and a too-narrow policy here does not fail loudly at a
-- security boundary — it fails as the app quietly not finding the active cycle, for
-- everyone, on every session. The client already filters cycle state where it
-- matters (loadActiveCycle filters closed_at). Revisit only with a regression sweep.
-- Role is `authenticated` per the spec — the direction of travel for new policies.

create policy provision_cycles_select on public.provision_cycles
  for select to authenticated
  using (is_member_of(household_id));

create policy provision_cycles_insert on public.provision_cycles
  for insert to authenticated
  with check (is_member_of(household_id));

create policy provision_cycles_update on public.provision_cycles
  for update to authenticated
  using (is_member_of(household_id))
  with check (is_member_of(household_id));

-- -------------------------------------------------------------------------
-- 3. ENABLE — activates all nine policies, six of them for the first time
-- -------------------------------------------------------------------------
alter table public.known_stores      enable row level security;
alter table public.provision_cycles  enable row level security;
alter table public.shopping_sessions enable row level security;

commit;

-- =====================================================================
-- VERIFY
-- =====================================================================
-- (1) STRUCTURAL — RLS on, expected policy counts, no DELETE policy anywhere.
--
-- select c.relname, c.relrowsecurity,
--        count(p.polname) filter (where p.polcmd = 'r') as sel,
--        count(p.polname) filter (where p.polcmd = 'a') as ins,
--        count(p.polname) filter (where p.polcmd = 'w') as upd,
--        count(p.polname) filter (where p.polcmd = 'd') as del
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- left join pg_policy p on p.polrelid = c.oid
-- where n.nspname = 'public'
--   and c.relname in ('known_stores','provision_cycles','shopping_sessions')
-- group by 1,2 order by 1;
--
-- Expect: relrowsecurity true on all three; sel/ins/upd = 1 each; del = 0.
-- Also confirm both repaired policies now report a non-null WITH CHECK:
--
-- select polrelid::regclass as tbl, polname,
--        pg_get_expr(polqual, polrelid)      as using_expr,
--        pg_get_expr(polwithcheck, polrelid) as with_check
-- from pg_policy
-- where polname in ('sessions_update_own','known_stores_update_household');
--
-- (2) DO NOT VERIFY WITH THE SQL EDITOR ALONE. It runs as `postgres`, which owns
-- these tables, and relforcerowsecurity is false — so it bypasses RLS entirely and
-- will happily return every row after a completely correct fix. A structural query
-- like (1) is safe there; a row-visibility check is NOT. Only an anon-key or
-- user-JWT request through PostgREST exercises a policy. Same trap as
-- SPEC_anon_catalog_exposure.
--
-- (3) ANON IS SHUT OUT (PostgREST, no session). Measured on DEV ONLY, 2026-08-16:
-- all three tables return HTTP 401 post-028. Prod was NOT measured from outside —
-- its anon posture is inferred from the catalog (anon absent from relacl), which is
-- weaker evidence. Run this against prod before and after promoting:
--   $anon = "<anon key>"; $h = @{ apikey = $anon; Authorization = "Bearer $anon" }
--   Invoke-WebRequest -Uri "https://<ref>.supabase.co/rest/v1/provision_cycles?select=id" -Headers $h
-- Expect 401 / 42501 permission denied. Repeat for the other two tables.
--
-- (4) CROSS-HOUSEHOLD READ IS REFUSED. Signed in as a member of household A, a
-- select on provision_cycles returns only A's rows. Requires a real Clerk-brokered
-- session — auth is Clerk third-party, tokens are minted per request and there is no
-- Supabase token in localStorage, so this is a browser check, not a console query.
-- A second account that is a member of a DIFFERENT household settles this properly.
--
-- (5) REGRESSION SWEEP on dev.ourprovisions.velayo.ai (NOT localhost), exercising
-- every live call site. Line numbers are as of 2026-08-16 and HAVE ALREADY DRIFTED
-- once from the spec — grep, don't trust them:
--   useProvisions.js:224  loadActiveCycle          provision_cycles  SELECT
--   useProvisions.js:713  auto-open planned cycle  provision_cycles  INSERT + SELECT
--   useProvisions.js:857  openCycle                provision_cycles  INSERT + SELECT
--   useProvisions.js:901  startSession             shopping_sessions INSERT + SELECT
--   useProvisions.js:929  close path auto-open     provision_cycles  INSERT + SELECT
--   useProvisions.js:946  close session            shopping_sessions UPDATE
--   useProvisions.js:986  post-close new cycle     provision_cycles  SELECT
-- The .insert().select().single() chains need BOTH INSERT and SELECT policies or they
-- fail on the returning clause.
-- Walk: reload and confirm the active cycle resolves -> add an item with no active
-- cycle (auto-open) -> open a planned cycle -> start a shopping session -> close the
-- session -> close the cycle with roll-forward -> reload and confirm the new active
-- cycle resolves.
-- WATCH shopping_sessions ESPECIALLY: :901 and :946 are the two call sites now
-- governed by policies that have NEVER executed against live traffic.
-- known_stores has zero references in src/, so its policies cannot regress anything.
--
-- (6) ADVISOR CLEAN: re-run get_advisors -> the policy_exists_rls_disabled ERRORs for
-- known_stores and shopping_sessions should be gone, and no rls_disabled advisory
-- should remain for provision_cycles.
