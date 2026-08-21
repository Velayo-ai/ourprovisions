# SPEC — Meal card Add⇄stepper (increment/decrement)

**Scope:** OurProvisions
**Status:** Design approved, ready to build
**Session decision date:** 2026-08-21
**Author:** Design-chat Claude → for Claude Code
**Depends on:** `SPEC_meal_add_count.md` (the `add_count` column — hard prerequisite,
NOT superseded) and `SPEC_remove_meal_from_list.md` (the `removeMealFromList`
extraction — reused unchanged as the swipe action). If neither has been built yet,
build all three together — they share the same tables and the same card component,
and splitting them into separate passes means re-touching the same code twice.
**Sequencing:** build AFTER `deleteMeal`'s verification (✅ now passed, per this session).

---

## Why this exists

Dan: "I want to be able to replace Pizza with Tacos... add the increment and
decrement capability." The card currently shows a static "Add" button plus a
"Planned" text badge — one-way only. Every catalog item on Browse already follows
a stated invariant: **"never a stepper at qty 0, only Add"** (established
2026-07-10). A meal card should follow the identical rule, just counting "how many
times has this meal been added" instead of a single item's quantity.

**Why not derive the count from `quantity_contributed` alone** (the column
`SPEC_meal_add_count.md`'s alternative would have skipped): `add_meal_to_list`
computes each add's contribution as `GREATEST(1, round(quantity_per_serving))`.
That floor-at-1 means the per-add amount is not a fixed divisor — two ingredients
with `quantity_per_serving` 0.5 and 2 both round differently, and dividing
`quantity_contributed` back out to recover "how many times" is not reliable. An
explicit counter is genuinely required, not a convenience.

---

## Decisions locked this session

| Decision | Choice | Rationale |
|---|---|---|
| What does "−" do? | Undoes exactly ONE add — same per-ingredient amount as one `add_meal_to_list` call would add, computed fresh from the CURRENT recipe | Symmetric with "+", which is just `add_meal_to_list` called again unchanged |
| Does "−" touch `quantity_contributed`? | Yes — decrements it by the same amount it subtracts from `list_items.quantity`, keeping the two numbers in sync | Unlike the generic Browse stepper (which never touches this column), a purpose-built decrement CAN keep the ledger honest — this is the one write path that has enough information to do so correctly |
| Card states | `add_count === 0` → plain "Add" button (today's style). `add_count > 0` → "− N +" stepper, mirroring `CatalogItemRow` | Same invariant already governing every catalog item — no new pattern invented |
| Swipe-to-remove ("Remove from list", from the prior spec) | Kept, unchanged, alongside the new face stepper | Fast full-clear for "I don't want this meal at all" vs. fine-grained "one fewer batch" — same relationship as Shop's swipe-remove vs. Browse's stepper for individual items |
| Bought-item protection | Identical to `removeMealFromList` — filter to `status = 'pending'` only, bought items never touched by "−" | Same sacred-list guarantee, same inherited edge case (a manual Browse edit can still desync `quantity_contributed` before this runs) |
| `add_count` reaches 0 | `list_item_meals` row for that ingredient is deleted, matching "resurrect clears provenance" convention elsewhere | A meal with `add_count = 0` should look exactly like a meal never added — no stale link surviving at zero |
| Ingredient added/removed from the recipe between adds (edit mid-cycle) | Same accepted approximate-signal edge case as the other two specs — not solved differently here | Consistency — one documented tradeoff, not three slightly different ones |

---

## Changes, by file

### Migration + `add_meal_to_list` — unchanged from `SPEC_meal_add_count.md`
Build that spec's migration and RPC change as written. Nothing new here.

### `useProvisions.js` — new `decrementMealBatch(mealId)`

```js
const decrementMealBatch = useCallback(async (mealId) => {
  const db = supabaseRef.current;
  const hh = householdRef.current;
  if (!db || !hh || !mealId) return false;
  try {
    // Same shape as removeMealFromList's read, plus meal_ingredients for the
    // current per-serving amount (needed to compute one add's worth fresh).
    const { data: links, error: lErr } = await db
      .from("list_item_meals")
      .select("list_item_id, add_count, quantity_contributed, list_items!inner(id, catalog_item_id, quantity, status, household_id, deleted_at)")
      .eq("meal_id", mealId)
      .eq("list_items.household_id", hh.id)
      .is("list_items.deleted_at", null);
    if (lErr) throw lErr;

    const { data: ingredients, error: iErr } = await db
      .from("meal_ingredients")
      .select("catalog_item_id, quantity_per_serving")
      .eq("meal_id", mealId)
      .is("deleted_at", null);
    if (iErr) throw iErr;
    const perServingByItem = {};
    (ingredients || []).forEach((ing) => { perServingByItem[ing.catalog_item_id] = Number(ing.quantity_per_serving) || 1; });

    const pending = (links || []).filter((r) => r.list_items?.status === "pending" && (r.add_count || 0) > 0);

    for (const row of pending) {
      const li = row.list_items;
      const perServing = perServingByItem[li.catalog_item_id] || 1;
      const oneAdd = Math.max(1, Math.round(perServing)); // mirrors add_meal_to_list's own floor

      const remaining = Number(li.quantity) - oneAdd;
      if (remaining > 0) {
        const { error: qErr } = await db
          .from("list_items")
          .update({ quantity: remaining, updated_at: new Date().toISOString() })
          .eq("id", li.id)
          .eq("household_id", hh.id);
        if (qErr) throw qErr;

        const newAddCount = Math.max(0, (row.add_count || 0) - 1);
        const newContributed = Math.max(0, Number(row.quantity_contributed) - oneAdd);
        if (newAddCount === 0) {
          const { error: dErr } = await db.from("list_item_meals").delete()
            .eq("meal_id", mealId).eq("list_item_id", row.list_item_id);
          if (dErr) throw dErr;
        } else {
          const { error: uErr } = await db.from("list_item_meals")
            .update({ add_count: newAddCount, quantity_contributed: newContributed })
            .eq("meal_id", mealId).eq("list_item_id", row.list_item_id);
          if (uErr) throw uErr;
        }
      } else {
        // Same floor-to-removal branch as removeMealFromList.
        const { error: rErr } = await db.rpc("remove_list_item", {
          p_household_id: hh.id,
          p_catalog_item_id: li.catalog_item_id,
        });
        if (rErr) throw rErr;
        const { error: dErr } = await db.from("list_item_meals").delete()
          .eq("meal_id", mealId).eq("list_item_id", row.list_item_id);
        if (dErr) throw dErr;
      }
    }

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
Export alongside `removeMealFromList`.

### `App.js` — meal-level `add_count`, mirroring `plannedMealCounts`

Extend `fetchMealProvenance`'s select (already planned in `SPEC_meal_add_count.md`)
to include `add_count`, and derive per-meal counts the same way `plannedMealCounts`
was derived (max across the meal's live rows — same conservative tradeoff already
documented).

New handler:
```js
const [decrementingMealId, setDecrementingMealId] = useState(null);
const handleDecrementMeal = useCallback(async (mealId) => {
  setDecrementingMealId(mealId);
  try {
    await decrementMealBatch(mealId);
    await refreshProvenance();
  } finally {
    setDecrementingMealId(null);
  }
}, [decrementMealBatch, refreshProvenance]);
```
Pass `onDecrement={handleDecrementMeal}` and `decrementingMealId` into `MealsLens`
alongside the existing `plannedMealCounts`.

### `MealsLens` — the actual Add⇄stepper swap

Where the card currently renders the Add button unconditionally, branch on count:
```jsx
{addCount === 0 ? (
  <button className="add-btn" onClick={() => onAddAll(m.id)} disabled={busy}>
    {busy ? "Adding…" : "Add"}
  </button>
) : (
  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
    <button
      onClick={() => { if (!decrementBusy) onDecrement(m.id); }}
      disabled={decrementBusy}
      style={{ /* same qty-btn treatment CatalogItemRow already uses */ }}
    >−</button>
    <span style={{ fontFamily: "'Lato', sans-serif", fontWeight: 700, minWidth: "18px", textAlign: "center" }}>{addCount}</span>
    <button
      onClick={() => { if (!busy) onAddAll(m.id); }}
      disabled={busy}
      style={{ /* same qty-btn treatment */ }}
    >+</button>
  </div>
)}
```
Reuse `.qty-btn` styling from `index.css` rather than inventing new button chrome —
this is the identical control Browse already renders at `qty > 0`, just relocated.
The teal "Planned" text label is now redundant with the stepper's mere presence
(the stepper existing IS the planned signal, same logic as "teal border is the
signal" from earlier this session) — drop the separate label, keep the teal border.

### No new migration beyond `SPEC_meal_add_count.md`'s. No RLS change — same
already-granted tables.

---

## Verification (deployed dev preview, not localhost)

1. Fresh meal, never added: card shows plain "Add," no stepper.
2. Tap Add: card flips to "− 1 +." Ingredients land on Shop at one batch's worth.
3. Tap "+" twice more: stepper reads 3, ingredients scale accordingly (additive, as today).
4. Tap "−" once: stepper reads 2, each ingredient drops by exactly one add's worth — confirm via Shop quantities, not just the stepper number.
5. Tap "−" down to 0: card reverts to plain "Add," all ingredients fully removed from Shop (assuming no other meal shares them).
6. **Shared-ingredient case:** two meals sharing Cheese, decrement one to 0 — confirm the other meal's Cheese contribution is completely unaffected (the governing test case from the removal spec, now via the stepper instead of full removeMealFromList).
7. **Bought-item guarantee:** mark an ingredient bought, then tap "−" on its meal — bought item untouched; confirm via Shop. Stepper count may look inconsistent with reality in this case (documented, not fixed — same honesty tradeoff as the removal spec).
8. Two-client check: DT taps "+" on a meal, DH's Plan tab shows the stepper count update within the existing poll, no action needed on DH's end.
9. Swipe-to-remove (from the prior spec) still fully clears regardless of the current stepper count, in one action — confirm it still works unchanged alongside the new face control.

**Done when:** all nine pass on the deployed dev preview URL.
