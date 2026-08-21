-- ============================================================
-- 040_meal_add_count.sql
--
-- Records HOW MANY TIMES a meal has been added to the list, so a
-- planned meal card can show "added 3x" and drive a real stepper.
--
-- THE GAP: list_item_meals rows were inserted ON CONFLICT DO NOTHING
-- before 039, and 039 changed that to increment quantity_contributed
-- only. Either way, nothing counted the ADDS. add_meal_to_list is
-- deliberately additive (025), so repeat-adding is normal and
-- expected — it just left no trace.
--
-- WHY NOT DERIVE IT: per-add contribution is
-- GREATEST(1, round(quantity_per_serving * servings)), so the floor
-- at 1 makes it a non-fixed divisor — dividing quantity_contributed
-- back out cannot recover the count. And list_items.quantity is
-- polluted by manual stepper edits and by other meals sharing the
-- ingredient. An explicit counter is required, not a convenience.
--
-- ⚠️ BUILT ON 039, NOT 025. The function below is 039's text with the
-- upsert EXTENDED, not replaced. SPEC_meal_add_count.md quotes the
-- pre-039 "DO NOTHING" clause and reads as though add_count is the
-- only SET; doing that literally would have dropped 039's
-- quantity_contributed increment and broken precise decrement in
-- deleteMeal, removeMealFromList and decrementMealBatch.
--
-- BACKFILL: none needed. Existing rows take the column default of 1,
-- which is the honest reading — a row that exists was added at least
-- once. This differs from 039, whose default of 0 was chosen to be
-- inert; here 1 is correct rather than merely safe.
--
-- ⚠️ DEV ONLY. Not to be applied to prod in this pass — 039 and 040
-- are being held to promote together in one later migration pass.
-- ============================================================


-- ------------------------------------------------------------
-- 1. The counter. NOT NULL DEFAULT 1: every existing provenance row
--    represents at least one add, so 1 is the truthful backfill.
-- ------------------------------------------------------------
alter table public.list_item_meals
  add column if not exists add_count integer not null default 1;


-- ------------------------------------------------------------
-- 2. add_meal_to_list — reproduced from 039 (the current live text)
--    with exactly ONE clause extended. Everything else — cycle
--    resolution, the advisory lock, the tombstone-resurrect branch —
--    is byte-identical to what is deployed.
--
--    RESURRECT IS ALREADY CORRECT AND NEEDS NO CHANGE: the branch
--    above still DELETEs this item's list_item_meals rows before the
--    upsert, so a revived item inserts fresh at add_count = 1. The
--    count resets for free, exactly as the spec predicted.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_meal_to_list(
  p_meal_id  uuid,
  p_servings integer DEFAULT 1,
  p_cycle_id uuid    DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_household_id  uuid;
  v_user_id       uuid;
  v_cycle_id      uuid;
  v_ingredient    record;
  v_qty           integer;
  v_list_item_id  uuid;
  v_was_tombstoned boolean;
  v_count         integer := 0;
BEGIN
  -- Resolve the meal + its owning household (live meals only).
  SELECT household_id INTO v_household_id
    FROM meals
    WHERE id = p_meal_id
      AND deleted_at IS NULL;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Meal % not found or deleted', p_meal_id;
  END IF;

  -- Authorize: caller must belong to the meal's household.
  IF NOT is_member_of(v_household_id) THEN
    RAISE EXCEPTION 'Not authorized for household %', v_household_id;
  END IF;

  v_user_id := get_current_user_id();

  -- Serialize concurrent adds for THIS household so the resolve-and-open
  -- block below can't let two callers open two cycles at once. Transaction-
  -- scoped (auto-released at function end), household-scoped (does not
  -- serialize unrelated households). Backstop until the partial unique index
  -- on provision_cycles(household_id) WHERE closed_at IS NULL lands (027),
  -- after which it may be redundant.
  PERFORM pg_advisory_xact_lock(hashtext(v_household_id::text));

  -- Resolve the cycle to stamp SERVER-SIDE — do not trust the client's
  -- p_cycle_id, which can be a stale/closed cycle (the race that stranded
  -- prod rows). p_cycle_id is a HINT: honor it only if it is genuinely open
  -- for this household; otherwise the household's newest open cycle; otherwise
  -- open a fresh planned one (per design decision — items are always
  -- cycle-attributed). "Open" = closed_at IS NULL AND deleted_at IS NULL:
  -- delete_household (migration 013) soft-deletes cycles WITHOUT setting
  -- closed_at, so a deleted cycle can look open unless deleted_at is checked.
  IF p_cycle_id IS NOT NULL THEN
    SELECT id INTO v_cycle_id
      FROM provision_cycles
      WHERE id = p_cycle_id
        AND household_id = v_household_id
        AND closed_at IS NULL
        AND deleted_at IS NULL;
  END IF;

  IF v_cycle_id IS NULL THEN
    SELECT id INTO v_cycle_id
      FROM provision_cycles
      WHERE household_id = v_household_id
        AND closed_at IS NULL
        AND deleted_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1;
  END IF;

  IF v_cycle_id IS NULL THEN
    -- started_at / created_at / updated_at all DEFAULT now() (baseline +
    -- archive/005); existing cycle-inserts (openCycle, wrapUpTrip) omit them
    -- and rely on the defaults, so no explicit set is needed here.
    INSERT INTO provision_cycles (household_id, cycle_type, created_by)
      VALUES (v_household_id, 'planned', v_user_id)
      RETURNING id INTO v_cycle_id;
  END IF;

  FOR v_ingredient IN
    SELECT catalog_item_id, quantity_per_serving
      FROM meal_ingredients
      WHERE meal_id = p_meal_id
        AND deleted_at IS NULL
  LOOP
    v_qty := GREATEST(1, round(v_ingredient.quantity_per_serving * p_servings)::integer);

    -- Detect a RESURRECT before the upsert: is the existing row (at most one,
    -- per the full unique constraint) currently a soft-deleted tombstone?
    -- Zero rows → SELECT INTO assigns NULL, which the IF below treats as false.
    SELECT (deleted_at IS NOT NULL) INTO v_was_tombstoned
      FROM list_items
      WHERE household_id = v_household_id
        AND catalog_item_id = v_ingredient.catalog_item_id;

    INSERT INTO list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id)
      VALUES (v_household_id, v_ingredient.catalog_item_id, v_qty, 'pending', v_user_id, v_cycle_id)
    ON CONFLICT (household_id, catalog_item_id) DO UPDATE
      SET quantity   = CASE
                         WHEN list_items.deleted_at IS NOT NULL THEN EXCLUDED.quantity   -- resurrected tombstone: reset
                         ELSE list_items.quantity + EXCLUDED.quantity                    -- live row: increment
                       END,
          status     = 'pending',
          deleted_at = NULL,
          -- Stamp the SERVER-RESOLVED open cycle unconditionally (v_cycle_id is
          -- guaranteed open, or freshly opened). Fresh, live, and resurrected
          -- rows all join the cycle we're acting in — a row touched now belongs
          -- to NOW, same as close_cycle's roll-forward. This also HEALS any live
          -- row still pointing at a closed cycle, and cannot re-strand.
          -- (insert_list_item, migration 008, still has the stale-cycle
          -- COALESCE bug that stranded prod rows — fixed identically in 026.)
          cycle_id   = v_cycle_id,
          updated_at = now()
    RETURNING id INTO v_list_item_id;

    -- A resurrected tombstone carries STALE provenance from before it was
    -- removed. Clear it so the revived item starts fresh — only this add's
    -- meal(s) own it. RESURRECT BRANCH ONLY: a live row keeps accruing
    -- provenance (adding meal B to a live item is additive, by design).
    IF v_was_tombstoned THEN
      DELETE FROM list_item_meals WHERE list_item_id = v_list_item_id;
    END IF;

    -- Record the AMOUNT this meal contributed, not merely that it did.
    -- Additive on conflict, mirroring the list_items.quantity increment
    -- above so the two numbers can never drift apart: add the same meal
    -- twice and both its footprint and the item's quantity grow by v_qty.
    -- (DO NOTHING here was the quantity gap — a second add silently
    -- recorded nothing, leaving deleteMeal with no amount to subtract.)
    -- Two counters on one conflict, deliberately in the same statement:
    -- quantity_contributed (039) records HOW MUCH this meal put here, add_count
    -- (040) records HOW MANY TIMES it was added. They must move together or
    -- they drift, which is exactly why this is one upsert and not two.
    --
    -- NOTE FOR ANYONE FOLLOWING THE SPEC: SPEC_meal_add_count.md quotes this
    -- clause as "ON CONFLICT ... DO NOTHING" and says to replace it. That text
    -- predates 039. Replacing rather than extending would have dropped the
    -- quantity_contributed increment and broken deleteMeal/removeMealFromList.
    INSERT INTO list_item_meals (list_item_id, meal_id, quantity_contributed, add_count)
      VALUES (v_list_item_id, p_meal_id, v_qty, 1)
    ON CONFLICT (list_item_id, meal_id) DO UPDATE
      SET quantity_contributed = list_item_meals.quantity_contributed + EXCLUDED.quantity_contributed,
          add_count            = list_item_meals.add_count + 1;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- CREATE OR REPLACE preserves privileges; re-asserted per house convention so
-- this migration is self-contained if replayed onto a fresh database.
REVOKE EXECUTE ON FUNCTION public.add_meal_to_list(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.add_meal_to_list(uuid, integer, uuid) TO authenticated;


-- ------------------------------------------------------------
-- VERIFY (check CONTENT, not that it returned — the SQL editor has
-- silently kept old versions before):
--
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'list_item_meals' and column_name = 'add_count';
--   -- expect: add_count | integer | NO | 1
--
--   select pg_get_functiondef(oid) from pg_proc
--    where proname = 'add_meal_to_list';
--   -- expect BOTH assignments in the DO UPDATE:
--   --   quantity_contributed = ... + EXCLUDED.quantity_contributed
--   --   add_count            = list_item_meals.add_count + 1
--   -- If only one is present, the wrong version saved.
-- ------------------------------------------------------------
