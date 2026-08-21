-- ============================================================
-- 039_meal_contribution_quantity.sql
--
-- Closes the quantity half of the two-ledger seam between
-- list_item_meals (meal provenance) and list_item_contributors
-- (user provenance).
--
-- THE GAP: list_item_meals recorded THAT a meal contributed to a
-- list item, never HOW MUCH. Surfaced concretely during deleteMeal
-- verification 2026-08-20 — Test1 (1x "test") and Test2 (1x "test")
-- merged to one list_items row at quantity 2; deleting Test1 dropped
-- its provenance link correctly but left the quantity at 2, because
-- no data existed saying Test1's share was 1.
--
-- THE FIX: give list_item_meals the same shape list_item_contributors
-- has carried since the baseline — one row per (item, contributor)
-- carrying that contributor's amount.
--
-- Two parts:
--   1. add list_item_meals.quantity_contributed
--   2. CREATE OR REPLACE add_meal_to_list to write it additively
--
-- BACKFILL: deliberately none. Pre-existing rows keep
-- quantity_contributed = 0, which is INERT, not wrong: deleteMeal
-- treats 0 as "no recorded basis to subtract" and drops only the
-- provenance link, exactly matching today's shipped behavior. Rows
-- become precise as soon as their meal is re-added. For the dev seed
-- set, re-add the seeded meals after this ships so the dry-run
-- exercises real numbers rather than legacy zeros.
--
-- PROD SAFETY: add_meal_to_list is already live in prod (025/026) but
-- nothing calls it there — the meals UI was never promoted. An additive
-- column plus a same-signature CREATE OR REPLACE is safe to ship ahead
-- of UI promotion, same as the RLS/RPC hardening series.
-- ============================================================


-- ------------------------------------------------------------
-- 1. The column. numeric (not integer) to match
--    meal_ingredients.quantity_per_serving's type rather than force
--    a round; add_meal_to_list writes an already-rounded v_qty.
--    NOT NULL DEFAULT 0 so existing rows land inert, never null.
-- ------------------------------------------------------------
alter table public.list_item_meals
  add column if not exists quantity_contributed numeric not null default 0;


-- ------------------------------------------------------------
-- 2. add_meal_to_list — reproduced from 025_meals.sql with exactly
--    ONE change (the list_item_meals upsert at the end of the loop).
--    Everything else — the cycle resolution, the advisory lock, the
--    tombstone-resurrect branch — is byte-identical to what is live.
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
    INSERT INTO list_item_meals (list_item_id, meal_id, quantity_contributed)
      VALUES (v_list_item_id, p_meal_id, v_qty)
    ON CONFLICT (list_item_id, meal_id) DO UPDATE
      SET quantity_contributed = list_item_meals.quantity_contributed + EXCLUDED.quantity_contributed;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- SECURITY DEFINER + writes to the shared list: RLS does NOT apply, so the
-- in-function is_member_of() guard is the ONLY gate. CREATE OR REPLACE
-- preserves existing privileges; these are re-asserted per house convention
-- so the migration is self-contained if ever replayed onto a fresh database.
REVOKE EXECUTE ON FUNCTION public.add_meal_to_list(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.add_meal_to_list(uuid, integer, uuid) TO authenticated;


-- ------------------------------------------------------------
-- VERIFY (run after applying; the SQL editor has silently kept old
-- versions before — check the CONTENT, not that it returned):
--
--   select column_name, data_type, column_default, is_nullable
--     from information_schema.columns
--    where table_name = 'list_item_meals'
--      and column_name = 'quantity_contributed';
--
--   select pg_get_functiondef(oid) from pg_proc
--    where proname = 'add_meal_to_list';
--   -- expect: quantity_contributed in the INSERT, DO UPDATE not DO NOTHING
-- ------------------------------------------------------------
