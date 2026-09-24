-- 048_add_meal_to_list_bought_row.sql
-- SPEC_add_meal_bought_row.md — a live bought row must not be un-bought by an add.
--
-- WHAT
--   CREATE OR REPLACE on the existing four-arg add_meal_to_list (the 045 form).
--   SAME signature — a new argument would create a SECOND function, not replace
--   this one (the 037 lesson), so nothing about the parameter list moves.
--   SECURITY DEFINER and the pinned search_path (034) are carried over; the ACL
--   is re-stated at the bottom so a read-back proves it.
--
-- THE BUG (repro of record: 2026-09-13, MADBURY, Mozzarella Cheese 1155788d)
--   The ON CONFLICT DO UPDATE branch set status = 'pending' UNCONDITIONALLY. Right
--   for a tombstone and for a live pending row; for a live row that is already
--   BOUGHT it un-bought the household's purchase and double-counted it
--   (quantity 1 -> 2, Shop went "1 of 2 in cart" -> "0 of 3"). Attribution: the
--   026 resurrect trigger could not have fired (its WHEN needs deleted_at set;
--   it was null, and the first meal's link survived), the client never writes
--   list_items on the add path, and the row's updated_at matched the second
--   meal's link created_at to the microsecond — one server transaction.
--
-- THE FIX — three-way branch on the conflicting row
--   tombstoned          quantity = EXCLUDED.quantity            pending   (as before; 026 clears stale links)
--   live, pending       quantity = old + EXCLUDED.quantity      pending   (as before)
--   live, BOUGHT        quantity = EXCLUDED.quantity            pending, checked_by = NULL   (NEW)
--   The bought row becomes the NEW NEED, not the old purchase plus the new need.
--   The purchase is not lost: it is a 'checked' event in list_item_events (046),
--   which is where ground truth lives. Prefer a visible over-ask (the shopper
--   can correct it) to a silent under-buy.
--
-- THE KNOWN COST — ledger vs row (walked, not assumed; see the commit body)
--   After the bought branch the row's quantity (1) sits below the sum of its
--   links' quantity_contributed (2). decrement_meal_from_list and
--   removeMealFromList both subtract a link's contribution from the row and
--   route <= 0 to remove_list_item, so the row can reach 0 and leave but can
--   never go negative — no clamp change is needed here. What that means for
--   the already-bought meal's link is reported in the commit, not decided here.
--
-- EVERYTHING ELSE IS VERBATIM from the live dev definition: membership check,
-- the advisory lock, cycle resolution, the 044/045 on_hand predicate, the
-- tombstone link reset, the two-counter list_item_meals upsert.
--
-- APPLY: dev first, by hand. Read back pg_get_functiondef and confirm EXACTLY
-- ONE add_meal_to_list in pg_proc (the closing SELECT does both). Prod after
-- the dev verification passes — migration only; the signature and return are
-- unchanged so the deployed bundle keeps working.

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
  v_count         integer := 0;
BEGIN
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

    SELECT (deleted_at IS NOT NULL) INTO v_was_tombstoned
      FROM list_items
      WHERE household_id = v_household_id
        AND catalog_item_id = v_ingredient.catalog_item_id;

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
      DELETE FROM list_item_meals WHERE list_item_id = v_list_item_id;
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

-- ACL re-stated (the 045 lesson: CREATE grants EXECUTE to PUBLIC by default and
-- Supabase's defaults add anon; revoke both by name, then grant). CREATE OR
-- REPLACE keeps the existing ACL, so these are belt-and-braces — the read-back
-- below is what proves it.
revoke all on function public.add_meal_to_list(uuid, integer, uuid, uuid[]) from public;
revoke all on function public.add_meal_to_list(uuid, integer, uuid, uuid[]) from anon;
grant execute on function public.add_meal_to_list(uuid, integer, uuid, uuid[]) to authenticated;
grant execute on function public.add_meal_to_list(uuid, integer, uuid, uuid[]) to service_role;

-- =====================================================================
-- VERIFY — row-returning. Expect EXACTLY ONE row: signature
-- (p_meal_id uuid, p_servings integer, p_cycle_id uuid, p_include_on_hand_ids uuid[]),
-- secdef = true, search_path = {search_path=public, extensions},
-- acl = {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres},
-- anon_can_execute = false, bought_branch_present = true.
-- =====================================================================
select
  count(*) over ()                                                     as functions_named_add_meal_to_list,
  oid::regprocedure::text                                              as signature,
  prosecdef                                                            as secdef,
  proconfig::text                                                      as search_path,
  proacl::text                                                         as acl,
  has_function_privilege('anon', oid, 'execute')                       as anon_can_execute,
  has_function_privilege('authenticated', oid, 'execute')              as authenticated_can_execute,
  pg_get_functiondef(oid) like '%WHEN list_items.status = ''bought''      THEN EXCLUDED.quantity%' as bought_branch_present
from pg_proc
where proname = 'add_meal_to_list' and pronamespace = 'public'::regnamespace;
