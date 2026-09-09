-- ============================================================
-- OurProvisions — Migration 043
-- meals.instructions — free-text cooking steps
-- ============================================================
--
-- ⚠️ RECONSTRUCTED AFTER THE FACT — 2026-08-31. READ THIS BEFORE TRUSTING IT.
--
-- This migration was applied by hand to BOTH databases on 2026-08-30 and verified
-- there, but the .sql was never committed. This file was written on 2026-08-31 by
-- reading the live schema of both projects (information_schema.columns +
-- col_description) — NOT from anyone's memory of the original patch text, and not
-- from `handoff/PATCH_meals_instructions_column.md`, which is gitignored and never
-- travelled off the machine that applied it.
--
-- It is therefore a faithful description of the DEPLOYED STATE, which is the thing
-- that matters, but it is not guaranteed to be byte-identical to the script that was
-- actually run. If the two ever disagree, the databases are right and this file is
-- wrong.
--
-- ALREADY APPLIED TO DEV **AND** PROD — DO NOT RE-RUN AS A NEW MIGRATION.
--   dev  — zxwtxjjmssykhqrghouf (system_identifier 7642734024280108049)
--   prod — parpauldmbetptkmdwbd (system_identifier 7606130613603586966)
-- Both confirmed carrying the column, with identical comment text, on 2026-08-31.
-- Every statement below is idempotent, so re-running is harmless — but it should be
-- unnecessary, and needing it would mean something else is wrong.
--
-- SCOPE — COLUMN ONLY. Verified against dev on 2026-08-31:
--   * no function body in `public` references `instructions` (pg_get_functiondef scan,
--     prokind='f', zero rows) — no RPC was touched, create/update meal paths unchanged;
--   * no index, constraint or RLS policy on `meals` belongs to this migration. The
--     four `meals_*` policies and `idx_meals_household` predate it and are untouched.
--     Existing policies are `is_member_of(household_id)` on all four verbs, so the new
--     column inherits household scoping with no policy edit — that is why there isn't one.
--
-- NOT A DEPLOY GATE. The column is nullable with no default and no client reads or
-- writes it as of 043, so client and database are independent here in both directions.
-- This is groundwork for the AI meal-suggestion feature (the "Ask for a meal" flow),
-- deliberately landed ahead of it so generated steps have somewhere to go.
-- ============================================================

begin;

-- ============================================================
-- 1. meals.instructions
-- ============================================================
-- Nullable by design. NULL means "no steps recorded", which is the correct state for
-- every meal that existed before this column and for every meal created by hand
-- without them — it is an ordinary value, not a missing one, so there is no backfill.
--
-- Not AI-only. The AI suggestion flow is what motivated the column, but a manually
-- created meal may carry instructions too; nothing in the schema distinguishes the
-- author. Keeping it author-agnostic is what stops a second, near-duplicate column
-- appearing the first time someone types steps in by hand.

alter table meals add column if not exists instructions text;

comment on column meals.instructions is
  'Optional free-text cooking steps for the meal. Nullable and unused by the client as of 043 — added ahead of the AI meal-suggestion feature so generated steps have somewhere to live. Manual meals may use it too; it is not an AI-only field.';

commit;

-- ============================================================
-- Verification — row-returning, per migrations/README.md
-- ============================================================
-- `raise notice` is invisible in the Supabase SQL editor, so the proof has to arrive
-- as rows. Expect exactly one row: text / YES / no default.

select
  column_name,
  data_type,
  is_nullable,
  coalesce(column_default, '(none)') as column_default,
  col_description('public.meals'::regclass, ordinal_position) as column_comment
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'meals'
  and column_name  = 'instructions';
