# ADDENDUM — SPEC_meal_card_stepper.md: `decrementMealBatch` data layer correction

**Scope:** OurProvisions
**Status:** Corrects a bug in the already-shipped `e9c1bf8` build — dev only
**Session decision date:** 2026-08-21
**Author:** Design-chat Claude → for Claude Code
**Corrects:** `SPEC_meal_card_stepper.md`'s "`useProvisions.js` — new `decrementMealBatch`"
section. That section is WRONG and should be replaced by this addendum, not built
as originally written.

---

## What's broken

`SPEC_meal_card_stepper.md`'s original design has `decrementMealBatch` write
directly to `list_item_meals` from the client:
```js
await db.from("list_item_meals")
  .update({ add_count: newAddCount, quantity_contributed: newContributed })
```
`list_item_meals` (migration 025) has SELECT/INSERT/DELETE RLS policies only —
**no UPDATE policy**, by original design (`025_meals.sql:13`: "a provenance
linkage row is delete-and-reinserted, never updated"). That design predates this
session's stepper feature, which is the first thing that ever needed to amend a
linkage row in place rather than insert or delete it.

**Effect, confirmed live on dev right now:** the client-side UPDATE silently
matches zero rows (RLS filters it out, no error thrown). `list_items.quantity`
DOES update (that table has a working UPDATE policy), so the list itself looks
correct while the meal card's count silently stops moving. This is why "−" from
3→2 appeared broken while 1→0 appeared to work — the floor-to-removal branch uses
`.delete()`, which IS covered by an existing policy.

## The fix

Move the ledger write into a SECURITY DEFINER RPC, mirroring `add_meal_to_list`'s
existing shape exactly — same trust model already established for this table's
writes, and it avoids opening a new client-writable UPDATE surface on a provenance
ledger, consistent with this project's standing position on server-trusts-client
writes.

### New migration (assign number at build time — `041` is the next open slot)

```sql
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

REVOKE EXECUTE ON FUNCTION public.decrement_meal_from_list(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.decrement_meal_from_list(uuid) TO authenticated;
```
The `UPDATE list_item_meals` and `DELETE FROM list_item_meals` statements inside
this function run under SECURITY DEFINER, so they bypass RLS the same way
`add_meal_to_list`'s own writes to this table already do — no policy change
needed anywhere.

### `useProvisions.js` — `decrementMealBatch` replaces its entire body

```js
const decrementMealBatch = useCallback(async (mealId) => {
  const db = supabaseRef.current;
  const hh = householdRef.current;
  if (!db || !hh || !mealId) return false;
  try {
    const { error } = await db.rpc("decrement_meal_from_list", { p_meal_id: mealId });
    if (error) throw error;
    await loadListItems(db, hh.id);
    reportSuccess();
    return true;
  } catch (err) {
    console.error("decrementMealBatch error:", err.message);
    setError(`Could not adjust meal: ${err.message}`);
    return false;
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [reportTransientFailure, reportSuccess]);
```
This replaces the entire function shipped in `e9c1bf8` — the manual per-ingredient
loop, the `meal_ingredients` read, and the direct `list_item_meals` write all move
server-side into the RPC above. The client function shrinks to a single `.rpc()`
call, matching `addMealToList`'s existing shape.

### `removeMealFromList` is NOT affected by this bug
It only issues `.delete()` against `list_item_meals`, and a DELETE policy already
exists (`list_item_meals_delete`, `025_meals.sql`). No change needed there — worth
confirming during its own checklist anyway, but this addendum does not touch it.

---

## Verification

1. `select pg_get_functiondef(oid) from pg_proc where proname = 'decrement_meal_from_list';` — confirm it saved as written above.
2. Add a meal twice ("+" twice, count reads 2). Tap "−" once — count must read 1, AND the underlying `list_item_meals` row's `add_count`/`quantity_contributed` must show 1 / (reduced amount), not just the card visually reading 1. Re-run the SQL check from this session:
   ```sql
   select lim.add_count, lim.quantity_contributed, li.quantity
   from list_item_meals lim join list_items li on li.id = lim.list_item_id
   where lim.meal_id = '<pizza-meal-id>';
   ```
3. Tap "−" again — should reach the delete branch (`add_count` was already at its floor), row removed, item removed from Shop if this was its only source.
4. Re-run `SPEC_meal_card_stepper.md`'s own checklist items 4–7 (the ones that exercise this exact path) — they were untestable until this lands.

**Done when:** all four pass on the deployed dev preview URL.
