-- 062_meals_attribution.sql
-- SPEC_recipe_import.md (design chat 2026-10-07) — "From": a free-text,
-- household-editable credit for where a meal came from.
--
-- WHY
--   Recipe import reads a screenshot or pasted text into the New Meal form.
--   The source is usually visible in the input — a site name, a creator's
--   @handle, a name written on a card — and the household wants to keep it.
--   Matches the July sharing spec: displayed attribution is the household's
--   own free text, editable, never validated against anything.
--
-- WHAT (spec: Database — one additive migration)
--   meals.attribution text, nullable, no default, no CHECK, no backfill.
--   NULL = no credit (hand-built meals never show the field). Clearing the
--   field in the UI saves NULL, never ''.
--
-- NOT meals.source
--   Provenance (manual / galley / import) is Galley Phase B's column and a
--   different thing — provenance is a fact, attribution is a label.
--
-- NOT CHANGED
--   * RLS — the four meals_* policies are row-level is_member_of(household_id);
--     a new column inherits them (the 043 / 061 precedent). No policy edit.
--   * Grants — a new column inherits the table's grants. No column grant.
--   * RPCs — add_meal_to_list, close_cycle, decrement_meal_from_list, cook_meal
--     never read attribution.
--
-- NUMBER
--   Spec said "06x — take the next free number at build". 062 confirmed free
--   on disk (061_meals_occasion.sql is the high-water) and in the dev ledger
--   (supabase_migrations.schema_migrations high-water 20261003140257 =
--   061_meals_occasion) on 2026-10-09.
--
-- APPLY
--   Dev first (project zxwtxjjmssykhqrghouf, system_identifier
--   7642734024280108049), VERIFY read back on the same identifier, ledger row
--   written by the MCP's apply_migration (the 2026-10-03 practice — never
--   double-insert). Prod is its own fresh-eyes promotion with the client (no
--   ledger on prod, by decision). Idempotent: safe to re-run.

begin;

alter table public.meals
  add column if not exists attribution text;

comment on column public.meals.attribution is
  'Free-text, household-editable credit for where a meal came from (e.g. "NYT Cooking", "@handle on Instagram", "Grandma Phyllis"). Never validated against share history. NULL = none. Recipe import 2026-10-07; applied as 062, 2026-10-09.';

commit;

-- =====================================================================
-- VERIFY — row-returning (the SQL editor does not surface raise notice).
-- Probes are case-insensitive (upper()/ilike): information_schema renders
-- some values upper-case, and a case-sensitive compare read false on 060.
-- Expect: attribution_present 1 · attribution_is_text true ·
--         attribution_nullable true · attribution_no_default true ·
--         comment_present true · attributed_rows 0 on first apply ·
--         policies_unchanged 4 (pre-migration count on dev, read 2026-10-09).
-- =====================================================================
select
  (select system_identifier from pg_control_system())                              as db,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'meals'
       and column_name = 'attribution')                                            as attribution_present,
  (select upper(data_type) = 'TEXT' from information_schema.columns
     where table_schema = 'public' and table_name = 'meals'
       and column_name = 'attribution')                                            as attribution_is_text,
  (select upper(is_nullable) = 'YES' from information_schema.columns
     where table_schema = 'public' and table_name = 'meals'
       and column_name = 'attribution')                                            as attribution_nullable,
  (select column_default is null from information_schema.columns
     where table_schema = 'public' and table_name = 'meals'
       and column_name = 'attribution')                                            as attribution_no_default,
  (select col_description('public.meals'::regclass,
     (select attnum from pg_attribute
        where attrelid = 'public.meals'::regclass
          and attname = 'attribution')) ilike '%recipe import%')                   as comment_present,
  (select count(*) from public.meals where attribution is not null)                as attributed_rows,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'meals')                          as policies_unchanged;
