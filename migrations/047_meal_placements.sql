-- 047_meal_placements.sql
-- SPEC_meal_planning_v1_board.md — the single-surface PLAN, v1 (Board only).
--
-- WHAT
--   meal_placements: one row per (household, meal) holding the meal's position
--   on the household's Plan board. The board itself is DERIVED — a meal is on
--   it iff it is active (has live list_item_meals rows, the same source the
--   library's stepper reads) — and this table only says WHERE on the board it
--   sits. An inactive meal's row is inert: not drawn, not cleaned up.
--
-- WHY A JOIN TABLE, NOT meals.sort_order (spec, "Placement storage")
--   Order is a property of the PLAN, not the recipe. A recipe that reaches two
--   households via a future give must be able to sit in two different
--   positions. Per-household rather than per-cycle because the board carries
--   across wrap-ups — a meal you didn't get to this trip is still planned.
--
-- SHAPE
--   * ordered (sort_order), NOT x/y. A phone-width board gains nothing from a
--     freeform canvas, and v2's Days lens is "group by day, order within day",
--     which reuses a sort order directly.
--   * DELIBERATELY ABSENT, RESERVED FOR v2: planned_for date null and
--     slot text null. Both nullable, both one additive migration when the Days
--     lens lands. Do not add them here.
--   * Both FKs CASCADE: rows die with the meal (deleteMeal is a SOFT delete, so
--     in practice the cascade fires only on a hard purge) or with the household.
--     This is the household_staples / meal_ingredients precedent, not the
--     catalog_items NO ACTION rule — nothing here references catalog_items.
--   * updated_by → users, SET NULL: a placement outlives the person who moved
--     it. Nullable — the client may write before its internal user id resolves.
--   * The primary key IS the household index; no further index needed.
--
-- LIFECYCLE (no cleanup machinery, by design)
--   * Add a meal → client upserts sort_order = max+1 for the household. ALWAYS
--     append, even over a stale row — a re-added meal joins the END of the
--     board, never the slot it held three weeks ago.
--   * Reorder → the client renumbers the household's active set 0..n-1 in one
--     upsert batch (small n, no gap arithmetic).
--   * Remove / delete / wrap-up never touch this table.
--   * An active meal with NO row renders last (meals.created_at order) and
--     gets a row on its next add or reorder. Missing rows are never an error.
--
-- RLS — the 032 idiom, role `authenticated`
--   * SELECT  — is_member_of(household_id)
--   * INSERT  — is_member_of(household_id)
--   * UPDATE  — is_member_of(household_id), USING and WITH CHECK both, so a
--               row cannot be rewritten into another household (the 032 repair)
--   * NO DELETE policy. Rows leave by cascade only, never by client delete —
--     the household_members / cycle-tables shape. A client delete matches zero
--     rows and raises nothing (the 041 lesson), which is why verification reads
--     the table back rather than trusting a 2xx.
--   * GRANTS ARE LOAD-BEARING (the 046 lesson): Supabase's schema default
--     privileges hand a new table ALL to authenticated and anon, and RLS does
--     not cover TRUNCATE. Revoke from public, anon AND authenticated by name
--     before granting back exactly select, insert, update.
--
-- APPLY
--   Dev first, by hand; prod only after the v1 verification passes on dev,
--   migration before client. The closing SELECT is the proof — the SQL editor
--   never surfaces `raise notice`. Expected: rls_on = true, sel = 1, ins = 1,
--   upd = 1, del = 0, anon_privs = 0, authenticated_privs = EXACTLY
--   "INSERT,SELECT,UPDATE", relacl shows authenticated=arw/postgres and no anon
--   entry, household_fk = CASCADE, meal_fk = CASCADE, updated_by_fk = SET NULL,
--   idx_count = 1 (the pkey), reserved_cols_absent = true.
--   NOTE: information_schema.role_table_grants is blind to grants the querying
--   role neither gave nor received (found 2026-09-11 on the read-only prod
--   role) — relacl is the authoritative column, the grants string a courtesy.

begin;

create table public.meal_placements (
  household_id uuid        not null references public.households(id) on delete cascade,
  meal_id      uuid        not null references public.meals(id)      on delete cascade,
  sort_order   integer     not null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid        references public.users(id) on delete set null,
  primary key (household_id, meal_id)
);

alter table public.meal_placements enable row level security;

create policy meal_placements_select on public.meal_placements
  for select to authenticated
  using (is_member_of(household_id));

create policy meal_placements_insert on public.meal_placements
  for insert to authenticated
  with check (is_member_of(household_id));

create policy meal_placements_update on public.meal_placements
  for update to authenticated
  using (is_member_of(household_id))
  with check (is_member_of(household_id));

-- No DELETE policy. Rows leave by cascade only.

-- Revoke from ALL THREE before granting (046). Revoking from PUBLIC does not
-- remove an explicit role grant, so anon and authenticated are each revoked by
-- name; the authenticated revoke is what strips the schema-default ALL.
revoke all on table public.meal_placements from public;
revoke all on table public.meal_placements from anon;
revoke all on table public.meal_placements from authenticated;
grant select, insert, update on table public.meal_placements to authenticated;
grant all on table public.meal_placements to service_role;

commit;

-- =====================================================================
-- VERIFY — row-returning, so the SQL editor shows it. Paste the result into
-- the commit body. authenticated_privs must read EXACTLY INSERT,SELECT,UPDATE
-- and relacl must carry no anon entry; both cascade FKs must read CASCADE.
-- =====================================================================
select
  c.relname,
  c.relrowsecurity                                                        as rls_on,
  c.relacl::text                                                          as relacl,
  count(p.polname) filter (where p.polcmd = 'r')                           as sel,
  count(p.polname) filter (where p.polcmd = 'a')                           as ins,
  count(p.polname) filter (where p.polcmd = 'w')                           as upd,
  count(p.polname) filter (where p.polcmd = 'd')                           as del,
  (select count(*) from information_schema.role_table_grants g
     where g.table_schema = 'public' and g.table_name = 'meal_placements'
       and g.grantee = 'anon')                                              as anon_privs,
  (select string_agg(g.privilege_type, ',' order by g.privilege_type)
     from information_schema.role_table_grants g
     where g.table_schema = 'public' and g.table_name = 'meal_placements'
       and g.grantee = 'authenticated')                                     as authenticated_privs,
  (select case k.confdeltype when 'n' then 'SET NULL' when 'c' then 'CASCADE'
                             when 'a' then 'NO ACTION' else k.confdeltype::text end
     from pg_constraint k
     where k.conrelid = c.oid and k.contype = 'f'
       and k.conkey = array[(select attnum from pg_attribute
                              where attrelid = c.oid and attname = 'household_id')]) as household_fk,
  (select case k.confdeltype when 'n' then 'SET NULL' when 'c' then 'CASCADE'
                             when 'a' then 'NO ACTION' else k.confdeltype::text end
     from pg_constraint k
     where k.conrelid = c.oid and k.contype = 'f'
       and k.conkey = array[(select attnum from pg_attribute
                              where attrelid = c.oid and attname = 'meal_id')])      as meal_fk,
  (select case k.confdeltype when 'n' then 'SET NULL' when 'c' then 'CASCADE'
                             when 'a' then 'NO ACTION' else k.confdeltype::text end
     from pg_constraint k
     where k.conrelid = c.oid and k.contype = 'f'
       and k.conkey = array[(select attnum from pg_attribute
                              where attrelid = c.oid and attname = 'updated_by')])   as updated_by_fk,
  (select count(*) from pg_indexes i
     where i.schemaname = 'public' and i.tablename = 'meal_placements')     as idx_count,
  not exists (select 1 from pg_attribute a
                where a.attrelid = c.oid and a.attname in ('planned_for', 'slot')) as reserved_cols_absent
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.oid = 'public.meal_placements'::regclass
group by c.relname, c.relrowsecurity, c.relacl, c.oid;
