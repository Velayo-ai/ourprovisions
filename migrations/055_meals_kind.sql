-- 055_meals_kind.sql
-- SPEC_meal_planning_v2_pick_commit_cook.md — no-shop placements (Leftovers,
-- Eating out) as meals rows with a kind. The spec names this file 053; 053
-- (learning qualification) and 054 (store identity) were already applied on
-- both databases when it was written, so it ships as 055. Content unchanged.
--
-- WHAT
--   meals.kind          text not null default 'meal', check in ('meal','leftovers','out')
--   meals.from_meal_id  uuid null → meals(id) on delete set null
--                       (leftovers: "From the Porterhouse")
--   Two additive columns. Every existing row is kind = 'meal' by default.
--   Nothing else in the database changes.
--
-- WHY ON meals, NOT meal_placements (spec decision 8)
--   meal_placements' PK is (household_id, meal_id); RLS, the cascade,
--   placements[mealId] in the hook, upNext, reorder and deleteMeal all key on
--   meal_id. A nullable meal_id would mean a new surrogate PK on a table that
--   is live on prod. A kind on meals is one column and one WHERE: each
--   no-shop card is its OWN meals row (household-owned, no meal_ingredients,
--   instructions null), created and placed in one client action (planNoShop).
--
-- READERS
--   * Library reads add kind = 'meal' (client). Miss this and Leftovers rows
--     show up as recipes.
--   * The board's meal lookup includes ALL kinds.
--   * × on a no-shop card stamps skipped_at on the placement AND deleted_at on
--     the meals row in one client action — they are one-shot.
--   * close_cycle is NOT touched: 052's condition requires ≥ 1 list_item_meals
--     link into the closing cycle; a no-shop meal has none, so it is never
--     stamped Ready. Do not add a kind check there (052 is the prod body; the
--     051 rule applies).
--   * fetchMealProvenance joins through list_item_meals; no-shop meals never
--     appear in it.
--
-- GRANTS / RLS: unchanged. meals already carries meals_insert / meals_update
--   for authenticated (createMeal and deleteMeal use them); planNoShop and the
--   × soft-delete ride the same policies. No new table, so the 046 revoke
--   ritual does not apply.
--
-- APPLY: dev first, by hand; prod as one promotion with the client, on a
--   fresh-eyes day (09-20 rule). The closing SELECT is the proof.

begin;

alter table public.meals
  add column kind text not null default 'meal'
    constraint meals_kind_check check (kind in ('meal', 'leftovers', 'out')),
  add column from_meal_id uuid null
    references public.meals(id) on delete set null;

comment on column public.meals.kind is
  '055: meal (a recipe, the library) | leftovers | out (no-shop placements; board only, never the list, never Ready)';
comment on column public.meals.from_meal_id is
  '055: leftovers only — the meal these are left over from. SET NULL if that row is ever hard-deleted.';

commit;

-- VERIFY — one row. Expect: kind_col = text / NO / 'meal'::text;
-- from_meal_col = uuid / YES; kind_check = the three-value CHECK;
-- from_meal_fk = REFERENCES meals(id) ON DELETE SET NULL; rows_not_meal = 0
-- (every pre-existing row defaulted); system_identifier so a wrong-project
-- paste shows in its own output.
select
  (pg_control_system()).system_identifier                                            as system_identifier,
  (select data_type || ' / ' || is_nullable || ' / ' || column_default
     from information_schema.columns
    where table_schema = 'public' and table_name = 'meals' and column_name = 'kind')       as kind_col,
  (select data_type || ' / ' || is_nullable
     from information_schema.columns
    where table_schema = 'public' and table_name = 'meals' and column_name = 'from_meal_id') as from_meal_col,
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.meals'::regclass and conname = 'meals_kind_check')          as kind_check,
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.meals'::regclass and conname = 'meals_from_meal_id_fkey')   as from_meal_fk,
  (select count(*) from public.meals where kind <> 'meal')                               as rows_not_meal,
  (select count(*) from public.meals)                                                    as rows_total;
