-- ============================================================
-- Migration 008 — insert_list_item: conflict-safe upsert
-- ============================================================
-- PROBLEM
-- The add-item flow is read-then-write: the client UPDATEs the
-- (household, catalog) row, and if zero rows come back it falls
-- through to insert_list_item (a plain INSERT). When two clients
-- add the SAME new item within the polling window, both see "no
-- row," both INSERT, and the second one hits the unique constraint
-- list_items_household_catalog_unique → 409 → error toast on the
-- losing client. Data is correct (one clean row); the failure is a
-- surfaced error, not corruption.
--
-- FIX
-- Convert the plain INSERT to INSERT ... ON CONFLICT DO UPDATE so
-- the losing writer folds into an update instead of erroring. The
-- conflict path also clears any soft-delete tombstone, so a
-- conflict against a previously-deleted slot resurrects cleanly.
--
-- CONFLICT TARGET — uses the COLUMN form (household_id,
-- catalog_item_id), NOT a named constraint. Reason: dev and prod
-- have DRIFTED on the constraint NAME. Dev carries the Postgres
-- auto-name list_items_household_id_catalog_item_id_key; prod was
-- renamed to list_items_household_catalog_unique (per baseline).
-- Same columns, same uniqueness — different name. The column form
-- resolves to whichever unique index covers the pair on each DB,
-- so this one file applies cleanly to both. (Drift flagged for a
-- future reconciliation migration; not fixed here.)
--
-- MERGE SEMANTICS (deliberate)
--   quantity       last-write-wins (EXCLUDED) — matches the absolute
--                  set-value model the updateQty UPDATE path uses;
--                  additive was rejected to avoid two-path drift.
--   status         forced to 'pending' (a fresh add is active)
--   deleted_at     cleared — resurrect any tombstoned slot
--   cycle_id       keep existing if the row already has one; don't
--                  yank a live item out of its open cycle
--   price_per_unit only overwrite when the caller supplied a price;
--                  never blank a known price with NULL
--   updated_at     bumped
--
-- Signature, language (sql), SECURITY DEFINER, and search_path are
-- UNCHANGED from baseline — this is a body-only replacement.
--
-- SAFE TO RE-RUN: CREATE OR REPLACE.
-- DEV FIRST. Verify with the two-window test, then apply to prod.
-- ============================================================

CREATE OR REPLACE FUNCTION public.insert_list_item(
  p_household_id    uuid,
  p_catalog_item_id uuid,
  p_quantity        integer,
  p_status          text,
  p_added_by        uuid,
  p_cycle_id        uuid    DEFAULT NULL::uuid,
  p_price_per_unit  numeric DEFAULT NULL::numeric
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  INSERT INTO list_items (
    household_id, catalog_item_id, quantity, status,
    added_by, cycle_id, price_per_unit
  )
  VALUES (
    p_household_id, p_catalog_item_id, p_quantity, p_status,
    p_added_by, p_cycle_id, p_price_per_unit
  )
  ON CONFLICT (household_id, catalog_item_id)
  DO UPDATE SET
    quantity       = EXCLUDED.quantity,
    status         = 'pending',
    deleted_at     = NULL,
    cycle_id       = COALESCE(list_items.cycle_id, EXCLUDED.cycle_id),
    price_per_unit = COALESCE(EXCLUDED.price_per_unit, list_items.price_per_unit),
    updated_at     = now()
  RETURNING id;
$function$;
