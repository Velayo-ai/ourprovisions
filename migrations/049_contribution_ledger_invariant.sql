-- 049_contribution_ledger_invariant.sql
-- Amends 048 (SPEC_add_meal_bought_row.md). Two functions, one invariant.
--
-- THE INVARIANT (new, stated here and in both function comments):
--   For any live PENDING list_items row,
--       list_items.quantity = SUM(list_item_meals.quantity_contributed) over its links.
--   The row is what is still needed; the ledger says which meal owns how much of it.
--
-- WHAT quantity_contributed MEANS NOW — read this before "fixing" it back.
--   Since 039 the column was "how much this meal put here". After 049 it is
--   "how much of this row this meal STILL OWNS". That is the definition the
--   invariant needs, and it is the better one: a contribution that has already
--   been bought is not owed on the row any more, so it is 0 there. add_count is
--   untouched and stays HISTORY — how many times the meal was added — which is
--   what the library stepper shows. 039's wording is superseded; do not restore
--   it.
--
-- WHY (the 048 walk, 2026-09-13)
--   048 made a live bought row become the new need (quantity = the new meal's
--   contribution) instead of being un-bought and double-counted. That was right
--   for the row, but it made the row disagree with its ledger: the earlier
--   meal's link still said "contributed 1" on a row whose 1 now belonged to the
--   new meal. Then decrementing the EARLIER meal (whose unit was already in the
--   fridge) subtracted 1 from the row, hit 0, and removed the new meal's need
--   with it. Two causes, one fix each:
--
--   1. add_meal_to_list — on the live-bought branch, zero quantity_contributed
--      on every EXISTING link for that row (keep add_count), so the row and its
--      ledger agree before the adding meal's own link is upserted. The
--      conflicting row is read with FOR UPDATE first so the branch decision
--      and the ledger write see the same row under the household advisory
--      lock.
--   2. decrement_meal_from_list — since 041 the step was derived from the
--      RECIPE (meal_ingredients.quantity_per_serving), not the ledger. That was
--      always going to disagree with the ledger the moment they diverged, and
--      048 is what made them diverge. The step is now capped at what the link
--      still owns: LEAST(per-serving step, quantity_contributed). A link that
--      owns nothing subtracts nothing from the row — only the ledger moves
--      (add_count down, the link deleted at 0).
--
-- Everything else in both bodies is verbatim from the live dev definitions
-- (048 for add_meal_to_list, 041 for decrement_meal_from_list). Signatures
-- unchanged (037), SECURITY DEFINER and pinned search_path (034) carried over,
-- ACLs re-stated so a read-back proves them.
--
-- APPLY: dev first, by hand. The closing SELECT must show exactly TWO rows,
-- one per function, count 1 each, anon_can_execute false, both markers true.
-- Prod after the dev walk passes — migration only, no client change.

-- ─────────────────────────────────────────────────────────────────────
-- 1. add_meal_to_list
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.add_meal_to_list(
  p_meal_id uuid,
  p_servings integer default 1,
  p_cycle_id uuid default null,
  p_include_on_hand_ids uuid[] default '{}'::uuid[]
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
DECLARE
  v_household_id  uuid;
  v_user_id       uuid;
  v_cycle_id      uuid;
  v_ingredient    record;
  v_qty           integer;
  v_list_item_id  uuid;
  v_was_tombstoned boolean;
  v_existing_status text;
  v_count         integer := 0;
BEGIN
  -- INVARIANT (049): for any live pending list_items row,
  --   quantity = SUM(list_item_meals.quantity_contributed) over its links.
  -- quantity_contributed = how much of the row this meal STILL OWNS (049),
  -- no longer "how much it put here" (039). add_count is history and never
  -- moves except +1 per add.
  SELECT household_id INTO v_household_id
    FROM meals
    WHERE id = p_meal_id
      AND deleted_at IS NULL;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Meal % not found or deleted', p_meal_id;
  END IF;

  IF NOT is_member_of(v_household_id) THEN
    RAISE EXCEPTION 'Not authorized for household %', v_household_id;
  END IF;

  v_user_id := get_current_user_id();

  PERFORM pg_advisory_xact_lock(hashtext(v_household_id::text));

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
    INSERT INTO provision_cycles (household_id, cycle_type, created_by)
      VALUES (v_household_id, 'planned', v_user_id)
      RETURNING id INTO v_cycle_id;
  END IF;

  -- on_hand (044) three cases as one predicate:
  --   on_hand = false                      -> include (unchanged)
  --   on_hand = true, NOT in include list  -> skip entirely
  --   on_hand = true, IS  in include list  -> include at real quantity
  -- The include list carries CATALOG_ITEM_IDs. This function never writes
  -- meal_ingredients.on_hand: the override is one-time, scoped to this call.
  -- COALESCE guards an explicit NULL, since x = ANY(NULL) is NULL, not false.
  FOR v_ingredient IN
    SELECT catalog_item_id, quantity_per_serving
      FROM meal_ingredients
      WHERE meal_id = p_meal_id
        AND deleted_at IS NULL
        AND (
          on_hand = false
          OR catalog_item_id = ANY (COALESCE(p_include_on_hand_ids, '{}'::uuid[]))
        )
  LOOP
    v_qty := GREATEST(1, round(v_ingredient.quantity_per_serving * p_servings)::integer);

    -- 049: read the conflicting row's state under a row lock BEFORE the upsert,
    -- so the branch decision below and the ledger write see the same row.
    -- Both are NULL when no row exists yet.
    v_was_tombstoned  := NULL;
    v_existing_status := NULL;
    SELECT (deleted_at IS NOT NULL), status INTO v_was_tombstoned, v_existing_status
      FROM list_items
      WHERE household_id = v_household_id
        AND catalog_item_id = v_ingredient.catalog_item_id
      FOR UPDATE;

    -- 048: three-way branch on the conflicting row.
    --   tombstone      -> reset to this add's quantity (026 clears the stale links)
    --   live, pending  -> increment
    --   live, bought   -> the NEW NEED: this add's quantity, back to pending,
    --                     checked_by cleared. Never old + new — the household
    --                     already has the old unit; the purchase lives on as
    --                     a 'checked' event in list_item_events.
    INSERT INTO list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id)
      VALUES (v_household_id, v_ingredient.catalog_item_id, v_qty, 'pending', v_user_id, v_cycle_id)
    ON CONFLICT (household_id, catalog_item_id) DO UPDATE
      SET quantity   = CASE
                         WHEN list_items.deleted_at IS NOT NULL THEN EXCLUDED.quantity
                         WHEN list_items.status = 'bought'      THEN EXCLUDED.quantity
                         ELSE list_items.quantity + EXCLUDED.quantity
                       END,
          status     = 'pending',
          checked_by = CASE
                         WHEN list_items.deleted_at IS NULL AND list_items.status = 'bought' THEN NULL
                         ELSE list_items.checked_by
                       END,
          deleted_at = NULL,
          cycle_id   = v_cycle_id,
          updated_at = now()
    RETURNING id INTO v_list_item_id;

    IF v_was_tombstoned THEN
      -- Provenance dies with the row (026 does this too on the UPDATE path).
      DELETE FROM list_item_meals WHERE list_item_id = v_list_item_id;
    ELSIF v_existing_status = 'bought' THEN
      -- 049: the earlier meals' units are bought — they own nothing on the row
      -- any more. Zero what they own, keep their add_count (history). The
      -- adding meal's link below then owns exactly the row's new quantity,
      -- and the invariant holds.
      UPDATE list_item_meals
         SET quantity_contributed = 0
       WHERE list_item_id = v_list_item_id;
    END IF;

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

revoke all on function public.add_meal_to_list(uuid, integer, uuid, uuid[]) from public;
revoke all on function public.add_meal_to_list(uuid, integer, uuid, uuid[]) from anon;
grant execute on function public.add_meal_to_list(uuid, integer, uuid, uuid[]) to authenticated;
grant execute on function public.add_meal_to_list(uuid, integer, uuid, uuid[]) to service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 2. decrement_meal_from_list
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.decrement_meal_from_list(p_meal_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
DECLARE
  v_household_id  uuid;
  v_link          record;
  v_per_serving   numeric;
  v_one_add       integer;
  v_remaining     integer;
  v_count         integer := 0;
BEGIN
  -- INVARIANT (049): for any live pending list_items row,
  --   quantity = SUM(list_item_meals.quantity_contributed) over its links.
  -- This function keeps it by moving the row and the link by the SAME amount:
  -- the step is capped at what the link still owns (quantity_contributed =
  -- "how much of this row this meal still owns" since 049, not 039's "how much
  -- it put here"). A link that owns nothing moves only the ledger. The step
  -- was recipe-derived since 041; that disagreed with the ledger the moment
  -- 048 let the two diverge.
  SELECT household_id INTO v_household_id
    FROM meals WHERE id = p_meal_id AND deleted_at IS NULL;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Meal % not found or deleted', p_meal_id;
  END IF;

  IF NOT is_member_of(v_household_id) THEN
    RAISE EXCEPTION 'Not authorized for household %', v_household_id;
  END IF;

  FOR v_link IN
    SELECT lim.list_item_id, lim.add_count, lim.quantity_contributed,
           li.catalog_item_id, li.quantity
      FROM list_item_meals lim
      JOIN list_items li ON li.id = lim.list_item_id
      WHERE lim.meal_id = p_meal_id
        AND li.household_id = v_household_id
        AND li.deleted_at IS NULL
        AND li.status = 'pending'
        AND lim.add_count > 0
  LOOP
    SELECT quantity_per_serving INTO v_per_serving
      FROM meal_ingredients
      WHERE meal_id = p_meal_id AND catalog_item_id = v_link.catalog_item_id AND deleted_at IS NULL;

    -- Recipe edited since this was added: fall back to 1 rather than fail
    -- the whole decrement (same accepted edge case named in the parent spec).
    v_one_add := GREATEST(1, round(COALESCE(v_per_serving, 1))::integer);
    -- 049: never take more off the row than this link still owns.
    v_one_add := LEAST(v_one_add, GREATEST(0, floor(v_link.quantity_contributed))::integer);
    v_remaining := v_link.quantity - v_one_add;

    IF v_one_add = 0 THEN
      -- Owns nothing on this row (its unit was bought before another meal
      -- re-opened the row): the row is untouched, only the ledger moves.
      IF v_link.add_count - 1 <= 0 THEN
        DELETE FROM list_item_meals WHERE list_item_id = v_link.list_item_id AND meal_id = p_meal_id;
      ELSE
        UPDATE list_item_meals
          SET add_count = v_link.add_count - 1
          WHERE list_item_id = v_link.list_item_id AND meal_id = p_meal_id;
      END IF;
    ELSIF v_remaining > 0 THEN
      UPDATE list_items SET quantity = v_remaining, updated_at = now()
        WHERE id = v_link.list_item_id AND household_id = v_household_id;

      IF v_link.add_count - 1 <= 0 THEN
        DELETE FROM list_item_meals WHERE list_item_id = v_link.list_item_id AND meal_id = p_meal_id;
      ELSE
        UPDATE list_item_meals
          SET add_count = v_link.add_count - 1,
              quantity_contributed = GREATEST(0, v_link.quantity_contributed - v_one_add)
          WHERE list_item_id = v_link.list_item_id AND meal_id = p_meal_id;
      END IF;
    ELSE
      PERFORM remove_list_item(p_household_id := v_household_id, p_catalog_item_id := v_link.catalog_item_id);
      DELETE FROM list_item_meals WHERE list_item_id = v_link.list_item_id AND meal_id = p_meal_id;
    END IF;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

revoke all on function public.decrement_meal_from_list(uuid) from public;
revoke all on function public.decrement_meal_from_list(uuid) from anon;
grant execute on function public.decrement_meal_from_list(uuid) to authenticated;
grant execute on function public.decrement_meal_from_list(uuid) to service_role;

-- =====================================================================
-- VERIFY — row-returning. Expect EXACTLY TWO rows, functions_with_this_name = 1
-- on each, secdef true, search_path pinned, anon_can_execute false, marker true:
--   add_meal_to_list          acl {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   decrement_meal_from_list  acl {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- =====================================================================
select
  proname,
  count(*) over (partition by proname)                                   as functions_with_this_name,
  oid::regprocedure::text                                                as signature,
  prosecdef                                                              as secdef,
  proconfig::text                                                        as search_path,
  proacl::text                                                           as acl,
  has_function_privilege('anon', oid, 'execute')                         as anon_can_execute,
  has_function_privilege('authenticated', oid, 'execute')                as authenticated_can_execute,
  case proname
    when 'add_meal_to_list'         then pg_get_functiondef(oid) like '%ELSIF v_existing_status = ''bought'' THEN%'
    when 'decrement_meal_from_list' then pg_get_functiondef(oid) like '%LEAST(v_one_add, GREATEST(0, floor(v_link.quantity_contributed))::integer)%'
  end                                                                    as marker_049_present
from pg_proc
where proname in ('add_meal_to_list', 'decrement_meal_from_list')
  and pronamespace = 'public'::regnamespace
order by proname;
