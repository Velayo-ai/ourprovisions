-- 069_meals_occasion_drink.sql
-- SPEC_meal_occasion_drink.md (design chat 2026-10-24) — "drink" joins the
-- library's Good-for values.
--
-- WHY
--   Dan logged an invented drink (Black n' Pumpkin, prod) and had to tag it
--   appetizer: there was no Drink. Drinks are a real thing households save and
--   share. "drink" becomes one more value in the existing meals.occasion list
--   (061); a separate kind column was considered and rejected — occasion already
--   holds the "not dinner" values (appetizer, dessert, side), so a second field
--   would mostly overlap it. occasion is text[], so {drink} and {drink,
--   appetizer} are both allowed; no exclusivity rule is added.
--
-- WHAT
--   Drop and re-create meals_occasion_values with 'drink' appended. Purely
--   additive: every existing row already satisfies the narrower list, so the
--   re-validation on ADD CONSTRAINT cannot fail. One transaction.
--
-- NOT CHANGED
--   * The column, its NOT NULL and its '{}' default (061).
--   * RLS — the four meals_* policies are row-level is_member_of(household_id).
--   * Grants — a constraint carries none; meals' relacl is untouched.
--   * RPCs — none read occasion. The client (MEAL_OCCASIONS, LibraryCards'
--     OCCASION_ORDER / OCCASION_WORD / OCCASION_PILL, the tint and icon) and
--     recipe-import's ALLOWED_OCCASIONS follow in their own commit, AFTER this
--     is on the database (the spec's Order: an old client never offers drink,
--     so the wider constraint is harmless first; the reverse is not).
--
-- NUMBER
--   069 — the next free number on disk and in the dev ledger (high-water
--   20261023050115 = 068) on 2026-10-24, assigned at build as the spec says.
--   Meal sharing Phase A's draft (Addendum 2026-10-24c S31, "new in 069") moves
--   to the next free number when it is written.
--
-- APPLY
--   Dev first (project zxwtxjjmssykhqrghouf, system_identifier
--   7642734024280108049) by Dan in the SQL editor — the MCP's apply_migration
--   is declined from VS Code — then VERIFY read back on the same identifier and
--   the ledger row below by hand. Prod (parpauldmbetptkmdwbd,
--   7606130613603586966) is step 3 of the spec's Order, after the client is
--   verified on the dev preview; no ledger on prod, by decision. Idempotent.
--   APPLIED ON DEV 2026-10-25 00:45 UTC by Claude Code over the dev MCP's
--   apply_migration (accepted this time), which wrote the ledger row itself:
--   20261025004543 069_meals_occasion_drink — the hand INSERT below was not run.
--   VERIFY read back exact on 7642734024280108049 (tagged_rows 32 = the
--   baseline, bad_rows 0, policies 4, relacl unchanged). Probe in a DO block
--   ending in RAISE (rolled back): {drink, appetizer} accepted, {brunch} refused.

begin;

alter table public.meals
  drop constraint if exists meals_occasion_values;

alter table public.meals
  add constraint meals_occasion_values check (
    occasion <@ array['breakfast','lunch','dinner','snack','side','appetizer','dessert','drink']::text[]
  );

comment on column public.meals.occasion is
  'When the meal is good for. Ordered: occasion[1] is the word shown on the library card; the rail matches any element. Empty = untagged (shows under All only). Meal Library v1, 2026-09-22; applied as 061, 2026-10-03; drink added by 069, 2026-10-24.';

commit;

-- =====================================================================
-- VERIFY — row-returning (the SQL editor does not surface raise notice).
-- Probes are case-insensitive (the 060 lesson). "Success. No rows returned"
-- does not count (the spec).
-- Expect on dev: db 7642734024280108049 · check_present 1 · lists_drink true ·
--   lists_all_eight true · default_empty true · not_nullable true · bad_rows 0 ·
--   tagged_rows 32 (unchanged from the 2026-10-24 baseline) · policies 4 ·
--   relacl {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=arwd/postgres}
-- =====================================================================
select
  (select system_identifier from pg_control_system())                              as db,
  (select count(*) from pg_constraint
     where conname = 'meals_occasion_values' and conrelid = 'public.meals'::regclass) as check_present,
  (select pg_get_constraintdef(oid) ilike '%''drink''%'
     from pg_constraint where conname = 'meals_occasion_values' and conrelid = 'public.meals'::regclass) as lists_drink,
  (select pg_get_constraintdef(oid) ilike all (array['%''breakfast''%','%''lunch''%','%''dinner''%','%''snack''%',
                                                     '%''side''%','%''appetizer''%','%''dessert''%','%''drink''%'])
     from pg_constraint where conname = 'meals_occasion_values' and conrelid = 'public.meals'::regclass) as lists_all_eight,
  (select column_default ilike '%''{}''%' from information_schema.columns
     where table_schema = 'public' and table_name = 'meals' and column_name = 'occasion') as default_empty,
  (select upper(is_nullable) = 'NO' from information_schema.columns
     where table_schema = 'public' and table_name = 'meals' and column_name = 'occasion') as not_nullable,
  (select count(*) from public.meals
     where not (occasion <@ array['breakfast','lunch','dinner','snack','side','appetizer','dessert','drink']::text[])) as bad_rows,
  (select count(*) from public.meals where occasion <> '{}')                       as tagged_rows,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'meals') as policies,
  (select relacl::text from pg_class where oid = 'public.meals'::regclass)        as relacl;

-- =====================================================================
-- LEDGER — dev only, run after VERIFY reads back as expected.
-- =====================================================================
-- The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISS'), '069_meals_occasion_drink'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '069_meals_occasion_drink');
