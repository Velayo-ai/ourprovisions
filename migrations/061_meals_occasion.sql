-- 061_meals_occasion.sql
-- SPEC_meal_library_v1.md (+ the v1.1 amendment, folded 2026-10-03) — the
-- library's "Good for" tags: when a meal is eaten.
--
-- WHY
--   The library decides WHAT, the board decides WHEN — but nothing recorded
--   what a meal is FOR. The v1 library's occasion rail (All · Dinner ·
--   Breakfast · Lunch · Snacks · Sides · Appetizers · Dessert) and the card's
--   occasion word both read this column. Pizza is lunch and dinner; pancakes
--   breakfast and dessert — so a LIST, not a single value. Going single → list
--   later is a data migration; list now costs nothing. Order carries meaning:
--   occasion[1] is the word on the card; the rail matches ANY element.
--
-- WHAT (spec decision 6)
--   meals.occasion text[] NOT NULL DEFAULT '{}' with a CHECK that every element
--   is one of the seven values. Every existing row becomes untagged (shows
--   under All only); no backfill; no NULL-vs-empty ambiguity for the client.
--   Duplicates are not constrained in SQL (a plain CHECK cannot test array
--   uniqueness without a function); the client de-duplicates and never writes
--   one. Accepted.
--
-- NOT CHANGED
--   * RLS — the four meals_* policies are row-level is_member_of(household_id);
--     a new column inherits them (the 043 precedent). No policy edit.
--   * Grants — a new column inherits the table's grants. No column grant.
--   * RPCs — add_meal_to_list, close_cycle, decrement_meal_from_list, cook_meal
--     never read occasion. No-shop rows (kind <> 'meal') keep '{}'.
--
-- NUMBER
--   Spec said 058; 058 is meal_cooks (2026-09-29), 059–060 trip reality
--   (2026-10-01). 061 confirmed free on disk and in the dev ledger
--   (supabase_migrations.schema_migrations high-water 060) on 2026-10-03.
--
-- APPLY
--   Dev first (project zxwtxjjmssykhqrghouf, system_identifier
--   7642734024280108049), VERIFY read back on the same identifier, ledger row
--   by hand if the MCP's apply_migration declines (the 2026-10-01 practice).
--   Prod is its own fresh-eyes promotion (no ledger on prod, by decision).
--   Idempotent: safe to re-run.

begin;

alter table public.meals
  add column if not exists occasion text[] not null default '{}';

alter table public.meals
  drop constraint if exists meals_occasion_values;

alter table public.meals
  add constraint meals_occasion_values check (
    occasion <@ array['breakfast','lunch','dinner','snack','side','appetizer','dessert']::text[]
  );

comment on column public.meals.occasion is
  'When the meal is good for. Ordered: occasion[1] is the word shown on the library card; the rail matches any element. Empty = untagged (shows under All only). Meal Library v1, 2026-09-22; applied as 061, 2026-10-03.';

commit;

-- =====================================================================
-- VERIFY — row-returning (the SQL editor does not surface raise notice).
-- Probes are case-insensitive (upper()/ilike): information_schema renders
-- some values upper-case, and a case-sensitive compare read false on 060.
-- Expect: occasion_is_array true · not_nullable true · default_empty true ·
--         check_present 1 · check_lists_seven true · tagged_rows 0 on first
--         apply · bad_rows 0 · policies_unchanged 4.
-- =====================================================================
select
  (select system_identifier from pg_control_system())                              as db,
  (select upper(data_type) = 'ARRAY' from information_schema.columns
     where table_schema = 'public' and table_name = 'meals'
       and column_name = 'occasion')                                               as occasion_is_array,
  (select upper(is_nullable) = 'NO' from information_schema.columns
     where table_schema = 'public' and table_name = 'meals'
       and column_name = 'occasion')                                               as not_nullable,
  (select column_default ilike '%''{}''%' from information_schema.columns
     where table_schema = 'public' and table_name = 'meals'
       and column_name = 'occasion')                                               as default_empty,
  (select count(*) from pg_constraint
     where conname = 'meals_occasion_values'
       and conrelid = 'public.meals'::regclass)                                    as check_present,
  (select pg_get_constraintdef(oid) ilike '%breakfast%'
      and pg_get_constraintdef(oid) ilike '%dessert%'
      and pg_get_constraintdef(oid) ilike '%appetizer%'
     from pg_constraint where conname = 'meals_occasion_values'
       and conrelid = 'public.meals'::regclass)                                    as check_lists_seven,
  (select count(*) from public.meals where occasion <> '{}')                       as tagged_rows,
  (select count(*) from public.meals
     where not (occasion <@ array['breakfast','lunch','dinner','snack','side','appetizer','dessert']::text[])) as bad_rows,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'meals')                          as policies_unchanged;
