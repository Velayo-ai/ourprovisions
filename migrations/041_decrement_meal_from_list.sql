-- ============================================================
-- 041_decrement_meal_from_list.sql
--
-- Corrects a bug shipped live to dev in `e9c1bf8`.
--
-- THE BUG: decrementMealBatch (SPEC_meal_card_stepper.md, as
-- originally written) amended the provenance ledger from the CLIENT:
--
--     await db.from("list_item_meals")
--       .update({ add_count: ..., quantity_contributed: ... })
--
-- list_item_meals has SELECT/INSERT/DELETE policies only — there is
-- no UPDATE policy and no UPDATE grant. That is deliberate and
-- predates the stepper; 025_meals.sql:13 states it outright: "a
-- provenance linkage row is delete-and-reinserted, never updated."
-- The stepper is the first feature that ever needed to amend such a
-- row in place.
--
-- WHY IT LOOKED HALF-WORKING: the UPDATE matches zero rows and raises
-- NO error — RLS filters it out silently. list_items.quantity DOES
-- update (that table has a working UPDATE policy), so the shopping
-- list moved correctly while the card's count stayed frozen. And
-- "−" from 1→0 appeared fine because that path takes the
-- floor-to-removal branch, which uses DELETE — already covered by
-- list_item_meals_delete.
--
-- THE FIX: move the ledger write server-side, mirroring
-- add_meal_to_list's existing shape. Its writes to this same table
-- already run SECURITY DEFINER, so this uses the trust model the
-- table was designed around rather than opening a new client-writable
-- UPDATE surface on a provenance ledger.
--
-- NO POLICY CHANGE ANYWHERE. The UPDATE and DELETE below bypass RLS
-- by virtue of SECURITY DEFINER, exactly as add_meal_to_list does.
--
-- ⚠️ DEV ONLY. 039, 040 and 041 are being held to promote to prod
-- together in one later pass.
-- ============================================================


CREATE OR REPLACE FUNCTION public.decrement_meal_from_list(
  p_meal_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_household_id  uuid;
  v_link          record;
  v_per_serving   numeric;
  v_one_add       integer;
  v_remaining     integer;
  v_count         integer := 0;
BEGIN
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
    v_remaining := v_link.quantity - v_one_add;

    IF v_remaining > 0 THEN
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

-- SECURITY DEFINER + writes to the shared list: RLS does NOT apply, so the
-- in-function is_member_of() guard is the ONLY gate. Postgres grants EXECUTE
-- to PUBLIC by default — lock it down. Revoking PUBLIC also strips the grant
-- authenticated inherits through it, hence the explicit re-grant.
REVOKE EXECUTE ON FUNCTION public.decrement_meal_from_list(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.decrement_meal_from_list(uuid) TO authenticated;


-- ------------------------------------------------------------
-- VERIFY (check CONTENT, not that it returned — the SQL editor has
-- silently kept old versions before):
--
--   select pg_get_functiondef(oid) from pg_proc
--    where proname = 'decrement_meal_from_list';
--
--   -- and confirm the lockdown actually took:
--   select proname, proacl from pg_proc
--    where proname = 'decrement_meal_from_list';
--   -- expect authenticated=X/... and NO anon, NO PUBLIC entry
--
-- Then, from the app (not the SQL editor): add a meal twice, tap "−"
-- once, and confirm the LEDGER moved, not just the card:
--
--   select lim.add_count, lim.quantity_contributed, li.quantity
--     from list_item_meals lim
--     join list_items li on li.id = lim.list_item_id
--    where lim.meal_id = '<meal-id>';
--
-- Before this migration the card froze while li.quantity kept moving.
-- add_count staying put while quantity drops is the signature of the
-- old bug still being live.
-- ------------------------------------------------------------
