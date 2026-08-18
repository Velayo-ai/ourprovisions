-- ============================================================
-- Migration 026 — Resurrect integrity (trigger) + insert_list_item
--
-- ✅ APPLIED TO PROD 2026-08-18 (with 025 + 038, one batch). Post-apply checks:
-- trg_list_items_resurrect present; insert_list_item replaced at EXACTLY ONE
-- overload (no bootstrap_new_user-style signature collision); search_path
-- pinned; census still 0 multi-open households and 16 stranded close-orphans
-- (unchanged by design — 026 fixes the insert path forward, it does not
-- retroactively repair rows).
--
-- ⚠️ NOTE: 026 does NOT close insert_list_item's anon exposure. CREATE OR
-- REPLACE preserves the existing ACL, and the body has no is_member_of guard
-- either before or after. Tracked as its own NEXT item, opened 2026-08-18.
--                 server-side cycle resolution
-- ============================================================
-- Ships in the SAME dev-verify + prod batch as 025. Two jobs:
--
--   1. A BEFORE UPDATE trigger on list_items that fires on the
--      RESURRECT transition (deleted_at: non-null → null) and, for
--      the resurrected row: (a) clears its provenance links, and
--      (b) re-resolves its cycle to the household's open cycle.
--   2. insert_list_item: resolve the open cycle SERVER-SIDE (same as
--      025's add_meal_to_list) + advisory lock + deleted_at guard.
--
-- WHY A TRIGGER, NOT PER-RPC FIXES — the resurrect paths:
--   list_items.deleted_at flips non-null → null on FIVE paths, and
--   THREE are client-direct writes that bypass every RPC, so a
--   per-RPC clear is structurally incomplete:
--     1. updateQty       — client .update({deleted_at:null})   [CLIENT-DIRECT]
--                          (no deleted_at filter → matches the tombstone,
--                           resurrects it, never calls insert_list_item)
--     2. updatePrice     — client .upsert({deleted_at:null})   [CLIENT-DIRECT]
--     3. insert_list_item— RPC ON CONFLICT … deleted_at = NULL
--     4. add_meal_to_list— RPC ON CONFLICT … deleted_at = NULL (025)
--     5. close_cycle     — RPC ON CONFLICT … deleted_at = null (roll-forward)
--   A trigger on list_items is the only thing that covers all five
--   (present and future) without rewriting the client-direct writes.
--
-- PRINCIPLE (→ docs/ARCHITECTURE.md): provenance dies with the row it
-- describes. Any path that resurrects a tombstoned list_item clears
-- its provenance — resurrect means the row's history ended, so nothing
-- from before it can still claim it. Table-general: it applies to any
-- future provenance table hanging off list_items, not just
-- list_item_meals. And a resurrected row belongs to the CURRENT cycle,
-- never the (possibly closed) one it carried into the tombstone.
--
-- ⚠️ NUMBER: 026. 025 = meals add-path (pending dev-green). 026 = this,
-- shipped with 025.
--
-- APPLY: manual SQL-editor paste. DEV FIRST → verify (bottom) → PROD,
-- in the 025 batch. SAFE TO RE-RUN (CREATE OR REPLACE + DROP/CREATE).
-- ============================================================


-- ------------------------------------------------------------
-- 1. Resurrect trigger.
--
-- BEFORE UPDATE (it mutates NEW.cycle_id), FOR EACH ROW, gated by a
-- WHEN clause so it is inert on every normal update and only runs on
-- the rare resurrect transition. SECURITY DEFINER so it reads
-- provision_cycles and deletes list_item_meals regardless of the
-- caller's RLS (a client-direct UPDATE runs as the member).
--
-- CYCLE RULE: ALWAYS resolve the household's open cycle; do NOT defer
-- to the inherited NEW.cycle_id — on the client-direct paths that
-- value is just the tombstone's stale carry-over, not a deliberate
-- choice. NULL if the household has no open cycle: a resurrect must
-- never leave a row on a closed cycle, and a trigger must never
-- auto-open one (inserting into provision_cycles from a list_items
-- trigger is an unpredictable side effect — auto-open is a write-path
-- job). "Open" = closed_at IS NULL AND deleted_at IS NULL, because
-- delete_household (migration 013) soft-deletes cycles WITHOUT setting
-- closed_at.
--
-- NOTE for 027: null cycle_id is now a LEGITIMATE state — the
-- cycle-integrity detector must alert on live-item-in-CLOSED-cycle,
-- never on null.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_items_resurrect_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- (a) Provenance dies with the row: clear stale meal links.
  DELETE FROM list_item_meals WHERE list_item_id = NEW.id;

  -- (b) Re-home the row on the current open cycle (NULL if none).
  --     SELECT INTO with zero rows assigns NULL — the intended state.
  SELECT id INTO NEW.cycle_id
    FROM provision_cycles
    WHERE household_id = NEW.household_id
      AND closed_at IS NULL
      AND deleted_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_list_items_resurrect ON public.list_items;
CREATE TRIGGER trg_list_items_resurrect
  BEFORE UPDATE ON public.list_items
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.list_items_resurrect_cleanup();


-- ------------------------------------------------------------
-- 2. insert_list_item — server-side cycle resolution.
--
-- Converts the migration-008 body from LANGUAGE sql to plpgsql to add
-- the advisory lock + open-cycle resolution (identical to 025's
-- add_meal_to_list). p_cycle_id becomes a HINT only (honored solely if
-- genuinely open); otherwise the household's newest open cycle;
-- otherwise a fresh planned one is opened. Every write stamps the
-- resolved cycle — no more COALESCE(list_items.cycle_id, …) keeping a
-- stale/closed value.
--
-- MERGE SEMANTICS otherwise UNCHANGED from 008: quantity last-write-
-- wins, status forced 'pending', deleted_at cleared (resurrect),
-- price only overwritten when supplied. Signature, return (uuid), and
-- SECURITY DEFINER unchanged — client contract stable; CREATE OR
-- REPLACE preserves the existing EXECUTE grant.
--
-- On a conflict that RESURRECTS (deleted_at non-null → null), the
-- trigger above ALSO fires and re-resolves cycle_id to the same open
-- cycle + clears provenance — redundant with this body's cycle_id
-- stamp, consistent by construction.
-- ------------------------------------------------------------
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_cycle_id uuid;
  v_id       uuid;
BEGIN
  -- Serialize per-household so two concurrent adds can't open two cycles.
  PERFORM pg_advisory_xact_lock(hashtext(p_household_id::text));

  -- Resolve the open cycle server-side (p_cycle_id = hint only).
  IF p_cycle_id IS NOT NULL THEN
    SELECT id INTO v_cycle_id FROM provision_cycles
      WHERE id = p_cycle_id AND household_id = p_household_id
        AND closed_at IS NULL AND deleted_at IS NULL;
  END IF;
  IF v_cycle_id IS NULL THEN
    SELECT id INTO v_cycle_id FROM provision_cycles
      WHERE household_id = p_household_id
        AND closed_at IS NULL AND deleted_at IS NULL
      ORDER BY started_at DESC LIMIT 1;
  END IF;
  IF v_cycle_id IS NULL THEN
    INSERT INTO provision_cycles (household_id, cycle_type, created_by)
      VALUES (p_household_id, 'planned', p_added_by)
      RETURNING id INTO v_cycle_id;
  END IF;

  INSERT INTO list_items (
    household_id, catalog_item_id, quantity, status,
    added_by, cycle_id, price_per_unit
  )
  VALUES (
    p_household_id, p_catalog_item_id, p_quantity, p_status,
    p_added_by, v_cycle_id, p_price_per_unit
  )
  ON CONFLICT (household_id, catalog_item_id)
  DO UPDATE SET
    quantity       = EXCLUDED.quantity,
    status         = 'pending',
    deleted_at     = NULL,
    cycle_id       = v_cycle_id,
    price_per_unit = COALESCE(EXCLUDED.price_per_unit, list_items.price_per_unit),
    updated_at     = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- CREATE OR REPLACE preserves the existing grant; restated for a clean apply.
GRANT EXECUTE ON FUNCTION public.insert_list_item(uuid, uuid, integer, text, uuid, uuid, numeric) TO authenticated;


-- ============================================================
-- DEV VERIFICATION (by hand — NOT part of the migration body).
-- The SQL editor runs as postgres; the trigger is SECURITY DEFINER so
-- it fires regardless. This deliberately exercises the CLIENT-DIRECT
-- resurrect path (a plain UPDATE that only flips deleted_at) — the one
-- the meal-path checklist missed (it tested tombstone→meal-add, never
-- tombstone→manual-add).
--
--   -- a. Trigger installed:
--   --   select tgname, tgenabled from pg_trigger
--   --   where tgrelid = 'list_items'::regclass and not tgisinternal;
--
--   -- b. insert_list_item is now plpgsql with the resolution body:
--   --   select prolang::regnamespace, pg_get_functiondef(oid)
--   --   from pg_proc where proname = 'insert_list_item';
--
--   -- c. THE COUNTERFACTUAL (client-direct path). Pick a household with
--   --    exactly one OPEN cycle AND at least one CLOSED cycle. Take a
--   --    list_item that add_meal_to_list has NOT touched this session,
--   --    force it into the stranded shape, then mimic updateQty:
--   --
--   --    -- pre-state: tombstoned, on the CLOSED cycle, with a stale link
--   --    update list_items set deleted_at = now(),
--   --           cycle_id = '<closed cycle id>' where id = '<row>';
--   --    insert into list_item_meals (list_item_id, meal_id)
--   --      values ('<row>', '<any meal id>') on conflict do nothing;
--   --
--   --    -- resurrect exactly as the client does (only flips deleted_at):
--   --    update list_items
--   --      set deleted_at = null, status = 'pending', quantity = 1
--   --      where id = '<row>';
--   --
--   --    -- POST-state (the trigger fired):
--   --    --   * select count(*) from list_item_meals where list_item_id='<row>';
--   --    --       → 0   (provenance cleared)
--   --    --   * select cycle_id from list_items where id='<row>';
--   --    --       → the household's OPEN cycle id, NOT the closed one
--   --    --       (→ NULL only if the household has no open cycle)
--
--   -- d. BROWSER (the real missed path): tombstone a meal-touched item
--   --    via SHOP clear/swipe, hard-refresh, then MANUALLY add it from the
--   --    Ingredients lens. Badge shows NO phantom meal; it lands on the
--   --    open cycle.
--
--   -- e. Fresh insert still cycle-correct: on a household with an open
--   --    cycle, a brand-new item added via updateQty (→ insert_list_item)
--   --    lands on the open cycle; with NO open cycle, insert_list_item
--   --    opens one (auto-open is a write-path job, unlike the trigger).
-- ============================================================
