-- 056_meals_from_meal_ids.sql
-- SPEC_meal_planning_v2_pick_commit_cook.md (amended 2026-09-21) — a Leftovers
-- card can name MORE THAN ONE source meal ("From the Porterhouse and the
-- Caprese"). 055's single from_meal_id becomes an array.
--
-- WHAT
--   meals.from_meal_ids  uuid[] null   — the meals these leftovers are from
--   Existing from_meal_id values are carried over as one-element arrays, then
--   from_meal_id is DROPPED. Rows with no source stay null (never an empty
--   array — the client treats null and [] alike, the column has one "none").
--
-- NO FOREIGN KEY, DELIBERATELY. Postgres cannot enforce an FK over array
--   elements. 055's SET NULL therefore has no equivalent here: a source meal
--   that is hard-deleted leaves a dangling id in the array. That is harmless
--   by construction — deleteMeal is a SOFT delete (deleted_at), the client
--   resolves ids against the household's live meals and simply skips any it
--   cannot find, and the card is a caption, not a join. The 025 rule ("FKs to
--   catalog_items are NO ACTION") is about catalog_items, not meals, and is
--   untouched.
--
-- RLS / GRANTS: unchanged (meals_insert / meals_update, authenticated).
--
-- APPLY: dev first, by hand; prod as one promotion with 055 and the client,
--   on a fresh-eyes day (09-20 rule). The closing SELECT is the proof; it
--   also shows the carried-over rows, so the migrate step is visible.

begin;

alter table public.meals
  add column from_meal_ids uuid[] null;

update public.meals
   set from_meal_ids = array[from_meal_id]
 where from_meal_id is not null;

alter table public.meals
  drop column from_meal_id;

comment on column public.meals.from_meal_ids is
  '056: leftovers only — the meals these are left over from (0..n). No FK: array elements cannot carry one; the client resolves ids against live meals and skips misses. Replaced 055 from_meal_id.';

commit;

-- VERIFY — one row. Expect: from_meal_ids_col = ARRAY / YES; from_meal_id_gone
-- = true; rows_with_sources = the pre-migration count of non-null from_meal_id
-- (1 on dev at apply time); every element resolves to a live meals row
-- (unresolved_elements = 0); system_identifier so a wrong-project paste shows.
select
  (pg_control_system()).system_identifier                                                     as system_identifier,
  (select data_type || ' / ' || is_nullable
     from information_schema.columns
    where table_schema = 'public' and table_name = 'meals' and column_name = 'from_meal_ids')     as from_meal_ids_col,
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'meals' and column_name = 'from_meal_id') as from_meal_id_gone,
  (select count(*) from public.meals where from_meal_ids is not null)                          as rows_with_sources,
  (select count(*) from public.meals m, unnest(m.from_meal_ids) src
     where not exists (select 1 from public.meals s where s.id = src))                         as unresolved_elements,
  (select count(*) from public.meals where kind <> 'meal')                                     as noshop_rows;
