-- 063_meal_placements_planned_at.sql
-- SPEC_recipe_view.md Amendment A2-R correction (Dan, 2026-10-18) — a real
-- planned-at moment on the placement.
--
-- WHY
--   The recipe view's "bought for this meal" tags need the moment THIS plan
--   began. A2-R anchored the window on the Add-to-Shop link's created_at, and
--   that was wrong: a meal re-planned without a cook keeps its old links, so a
--   purchase from the previous plan read as bought for this one (dev walk,
--   2026-10-18). meal_placements had no planned-at: updated_at moves on every
--   reorder, Ready stamp, cook and skip, and appendPlacement's upsert only
--   nulls cooked_at / skipped_at on a re-plan.
--
-- WHAT (one additive column + a one-time backfill)
--   meal_placements.planned_at timestamptz, nullable, no default. The client's
--   plan path (appendPlacement — the one upsert that sets cooked_at = null on a
--   plan or re-plan) stamps planned_at = now() there, once; every other write
--   (reorder, ready, cook, skip) leaves it alone. Backfill: every OPEN
--   placement (cooked_at and skipped_at null) takes its updated_at — the
--   nearest moment on record; closed rows stay null (history, never re-read
--   as a plan). The view treats a null as "older row" and falls back to the
--   meal's last meal_cooks cook (the backstop).
--
-- NOT CHANGED
--   * RLS — meal_placements_* policies are row-level is_member_of(household_id);
--     a new column inherits them (043 / 061 / 062 precedent). No policy edit.
--   * Grants — a new column inherits the table's grants; no column grant
--     (058 notes none exists on this table).
--   * RPCs — close_cycle and cook_meal never read planned_at; no signature
--     changes. No trigger.
--
-- NUMBER
--   063 confirmed free on disk (062_meals_attribution.sql is the high-water)
--   and recorded as "next free" in ARCHITECTURE on 2026-10-18.
--
-- APPLY
--   Dev first (project zxwtxjjmssykhqrghouf, system_identifier
--   7642734024280108049), VERIFY read back on the same identifier, BEFORE the
--   client that reads and writes the column ships to dev. Prod in Promotion 2,
--   applied and verified by direct query BEFORE the client push (no ledger on
--   prod, by decision). Idempotent: safe to re-run — the backfill only fills
--   nulls.

begin;

alter table public.meal_placements
  add column if not exists planned_at timestamptz;

comment on column public.meal_placements.planned_at is
  '063 — when this placement was last (re)planned: stamped now() by the client''s plan upsert (appendPlacement), the same write that nulls cooked_at / skipped_at. Never moved by reorder, Ready, cook or skip. NULL on rows older than 063 and on closed history; readers fall back to the meal''s last meal_cooks cook. Recipe view A2-R correction, 2026-10-18.';

-- One-time backfill: open placements take their updated_at (the nearest
-- moment on record). Only nulls are filled, so a re-run changes nothing.
update public.meal_placements
   set planned_at = updated_at
 where planned_at is null
   and cooked_at  is null
   and skipped_at is null;

commit;

-- =====================================================================
-- VERIFY — row-returning (the SQL editor does not surface raise notice).
-- Expect: which_db = 7642734024280108049 on dev · planned_at_present 1 ·
--         is_timestamptz true · nullable true · no_default true ·
--         comment_present true · open_rows = the household count of open
--         placements · open_unstamped 0 · policies_unchanged 4 (the
--         pre-migration count on dev).
-- =====================================================================
select
  (select system_identifier from pg_control_system())                                      as which_db,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'meal_placements'
       and column_name = 'planned_at')                                                     as planned_at_present,
  (select upper(data_type) like 'TIMESTAMP%' from information_schema.columns
     where table_schema = 'public' and table_name = 'meal_placements'
       and column_name = 'planned_at')                                                     as is_timestamptz,
  (select upper(is_nullable) = 'YES' from information_schema.columns
     where table_schema = 'public' and table_name = 'meal_placements'
       and column_name = 'planned_at')                                                     as nullable,
  (select column_default is null from information_schema.columns
     where table_schema = 'public' and table_name = 'meal_placements'
       and column_name = 'planned_at')                                                     as no_default,
  (select col_description('public.meal_placements'::regclass,
     (select attnum from pg_attribute where attrelid = 'public.meal_placements'::regclass
        and attname = 'planned_at')) is not null)                                          as comment_present,
  (select count(*) from public.meal_placements
     where cooked_at is null and skipped_at is null)                                       as open_rows,
  (select count(*) from public.meal_placements
     where cooked_at is null and skipped_at is null and planned_at is null)                as open_unstamped,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename = 'meal_placements')                                                    as policies_unchanged;
