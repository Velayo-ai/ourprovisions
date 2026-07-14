-- ============================================================
-- Migration 019 — catalog_items: normalized-name unique indexes (F1c)
-- ============================================================
-- Defense-in-depth backstop to migration 018 (idempotent
-- insert_custom_catalog_item). 018 stops the fork at WRITE time
-- via reuse logic; these indexes make a fork IMPOSSIBLE at the
-- DATABASE layer — a second seed run, a manual INSERT, or a buggy
-- code path can no longer create two live rows with the same
-- normalized name in scope.
--
-- CONTEXT (2026-07-13)
-- The English-Muffins incident + a prod census exposed 12 fork
-- sets: 10 GLOBAL seed dups (a manual double-seed on prod, Mar-20
-- + Mar-30 — dev was never affected) and 2 custom forks (English
-- Muffins, Sandwich Bread). All were cleaned (soft-delete / merge,
-- reversible) BEFORE these indexes were created — a partial unique
-- index cannot be built while violating rows exist, so a clean
-- CREATE is itself proof the dedup was complete.
--
-- NORMALIZATION (must match 018 exactly)
--   norm = lower(trim(regexp_replace(name, '\s+', ' ', 'g')))
-- Same-after-normalize ⇒ same item. Case + whitespace variants
-- collapse; genuinely different names ("Wheat Bread" vs "Bread")
-- stay distinct. Never fuzzy.
--
-- SHAPE (confirmed by live query, dev + prod, 2026-07-13)
--   is_global=true  ⇒ household_id IS NULL   (38 global seed rows)
--   is_global=false ⇒ household_id NOT NULL  (9 custom rows)
-- No mixed/surprise combinations — so two clean partial indexes
-- partition the space with no overlap.
--
-- WHAT THESE DO NOT ENFORCE (by design)
-- A custom row is NOT blocked from duplicating a GLOBAL name by
-- these indexes (different partial predicates can't see each other).
-- That rule — "custom may not shadow a global normalized name" —
-- is enforced by 018's reuse logic at write time. Indexes = backstop
-- for SAME-SCOPE self-forks; 018 = backstop for CROSS-SCOPE shadow.
-- Together they cover the whole naming rule.
--
-- APPLIED: dev (zxwtxjjmssykhqrghouf) + prod (parpauldmbetptkmdwbd),
-- 2026-07-13, both "Success. No rows returned".
-- SAFE TO RE-RUN: IF NOT EXISTS on both.
-- ============================================================

-- One live row per normalized name among GLOBAL items
create unique index if not exists uq_global_catalog_norm
  on catalog_items (lower(trim(regexp_replace(name, '\s+', ' ', 'g'))))
  where deleted_at is null and is_global = true;

-- One live CUSTOM row per normalized name per household
create unique index if not exists uq_custom_catalog_norm
  on catalog_items (household_id, lower(trim(regexp_replace(name, '\s+', ' ', 'g'))))
  where deleted_at is null and is_global = false;

-- ------------------------------------------------------------
-- VERIFY
--   select indexname from pg_indexes
--   where tablename = 'catalog_items'
--     and indexname in ('uq_global_catalog_norm','uq_custom_catalog_norm');
--   -- expect 2 rows
-- ------------------------------------------------------------
