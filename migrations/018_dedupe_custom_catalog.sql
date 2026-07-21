-- ============================================================
-- Migration 018 — insert_custom_catalog_item: idempotent (stop the fork)
-- ============================================================
-- PROBLEM (Bug 1, catalog-layer — confirmed by prod query 2026-07-12)
-- The baseline insert_custom_catalog_item is a BLIND INSERT (000
-- baseline L804): no existence check, no case-fold. Any add of a
-- custom item mints a NEW catalog row, even when a live same-name
-- row (global OR this household's own) already exists. Combined with
-- the client evicting hidden names from its resolver, re-adding a
-- just-hidden item routes through this insert and FORKS the catalog.
--
-- The English-Muffins incident (2026-07-11): three list rows pointed
-- at three distinct catalog ids — "English muffins" (lowercase,
-- soft-deleted), "English Muffins" (bought), "English Muffins"
-- (pending). Case-variance forked independently of hide/re-add — a
-- normalization gap on top of the blind insert.
--
-- FIX
-- Make the RPC reuse an existing live same-name row instead of
-- blind-inserting. Match on the NORMALIZED name only — never fuzzy.
--   normalize = lower(trim(collapse-internal-whitespace))
-- Same-after-normalize ⇒ same item; anything else ⇒ distinct. So
-- "Wheat Bread" / "White Bread" / "Breading" stay separate from
-- global "Bread" — fuzzy matching is deliberately avoided (it would
-- wrongly merge legitimately different names).
--
-- DEDUP RULE (confirmed with Dan 2026-07-12)
--   * A custom item may NOT share a normalized name with a GLOBAL
--     item → on exact-normalized match to a global, reuse the global
--     row (a household never gets a private "Bread" beside global
--     "Bread").
--   * Within a household, reuse that household's own existing custom
--     row on exact-normalized match (prevents self-forking).
--   * A slightly different name is a legitimate distinct custom item.
-- Ordering prefers a global match, else the oldest custom row.
--
-- The original user casing is stored for display; matching is on the
-- normalized form. This alone stops NEW forks regardless of the
-- client resolver bug (F1b, separate commit).
--
-- SIGNATURE unchanged (p_name, p_category, p_household_id,
-- p_created_by → uuid). Language changes sql → plpgsql to allow the
-- lookup-then-insert. SECURITY DEFINER and search_path unchanged.
--
-- SAFE TO RE-RUN: CREATE OR REPLACE.
-- DEV FIRST. Verify a hide→re-add reuses the id (query below), then
-- apply to prod. Prod dedup cleanup of existing forks is a SEPARATE
-- manual step AFTER this is live (so no new fork races the cleanup).
-- ============================================================

CREATE OR REPLACE FUNCTION public.insert_custom_catalog_item(
  p_name         text,
  p_category     text,
  p_household_id uuid,
  p_created_by   uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  existing_id uuid;
  norm        text;
BEGIN
  norm := lower(trim(regexp_replace(p_name, '\s+', ' ', 'g')));

  -- Reuse a live row whose NORMALIZED name matches, in scope
  -- (a global item, OR a custom item owned by THIS household).
  -- Prefer the global row; otherwise the oldest custom row.
  SELECT id INTO existing_id
  FROM catalog_items
  WHERE lower(trim(regexp_replace(name, '\s+', ' ', 'g'))) = norm
    AND deleted_at IS NULL
    AND (is_global = true OR household_id = p_household_id)
  ORDER BY is_global DESC, created_at ASC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  -- No match: mint a new custom row, storing the ORIGINAL casing.
  INSERT INTO catalog_items (name, category, is_global, household_id, created_by)
  VALUES (p_name, p_category, false, p_household_id, p_created_by)
  RETURNING id INTO existing_id;

  RETURN existing_id;
END;
$function$;

-- ------------------------------------------------------------
-- VERIFY (run in the Supabase SQL editor after applying)
-- ------------------------------------------------------------
-- 1. Confirm the saved definition is the plpgsql reuse version, not
--    the old blind INSERT (the editor has silently kept old versions):
--      select pg_get_functiondef(oid) from pg_proc
--      where proname = 'insert_custom_catalog_item';
--
-- 2. Idempotence smoke test (dev, inside one household). Second call
--    must return the SAME uuid as the first; the case/whitespace
--    variant must ALSO return that same uuid; a different name must
--    return a DIFFERENT uuid:
--      select public.insert_custom_catalog_item('Test Muffins','Bakery','<hh>','<user>'); -- id A
--      select public.insert_custom_catalog_item('test  muffins','Bakery','<hh>','<user>'); -- = id A
--      select public.insert_custom_catalog_item('Test Muffin','Bakery','<hh>','<user>');   -- ≠ id A
--    Then soft-delete the created row(s) to keep dev clean.
