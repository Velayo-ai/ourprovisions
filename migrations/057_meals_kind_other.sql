-- 057_meals_kind_other.sql
-- SPEC_meal_planning_v2_pick_commit_cook.md (amended 2026-09-21) — a fourth
-- kind of plan for a night: 'other' ("Something else": soccer, Mom's, takeout,
-- no idea yet). PLAN is a week-of-food board; Meals, Leftovers, Eating out and
-- Something else are KINDS of plan, not states. States stay three.
--
-- WHAT
--   meals.kind check widens: ('meal','leftovers','out') → (…, 'other').
--   Constraint dropped and re-added under the same name so 055's VERIFY marker
--   (meals_kind_check) still resolves. Default stays 'meal'. No other change.
--
-- 'other' rows behave exactly as the other no-shop kinds: household-owned,
--   no meal_ingredients, never on the list, never Ready (052's link condition
--   has nothing to match), × only, soft-deleted on × (skipMeal's predicate is
--   kind <> 'meal', so it already covers this value). The free name lives in
--   meals.name; blank stores the label "Something else".
--
-- APPLY: dev first, by hand; prod with 055/056 as one promotion, on a
--   fresh-eyes day (09-20 rule). The closing SELECT is the proof.

begin;

alter table public.meals drop constraint meals_kind_check;
alter table public.meals
  add constraint meals_kind_check check (kind in ('meal', 'leftovers', 'out', 'other'));

comment on column public.meals.kind is
  '055/057: meal (a recipe, the library) | leftovers | out | other (no-shop plans for a night; board only, never the list, never Ready)';

commit;

-- VERIFY — one row. Expect kind_check listing all four values, rows_by_kind
-- showing every existing row still valid (the constraint would have refused
-- the ADD otherwise), default_still_meal true, system_identifier as usual.
select
  (pg_control_system()).system_identifier                                                as system_identifier,
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.meals'::regclass and conname = 'meals_kind_check')       as kind_check,
  (select column_default = '''meal''::text' from information_schema.columns
    where table_schema = 'public' and table_name = 'meals' and column_name = 'kind')    as default_still_meal,
  (select string_agg(kind || ':' || n, ', ' order by kind)
     from (select kind, count(*) n from public.meals group by kind) k)                  as rows_by_kind;
