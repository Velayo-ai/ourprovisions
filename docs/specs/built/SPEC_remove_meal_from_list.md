# SPEC — `removeMealFromList`: un-plan a meal without deleting it

**Scope:** OurProvisions
**Status:** Design approved, sequence AFTER `deleteMeal` verification — do not build in parallel
**Session decision date:** 2026-08-21
**Author:** Design-chat Claude → for Claude Code
**Resolves:** ROADMAP's standing 2026-07-28 open question, "Design provenance-aware
meal removal" — governing test case (the Dan/Helen bread scenario) addressed below.

---

## Why this exists

Dan: "I add Pizza, then decide I want Taco Night instead." Today there is no way
to do that — the only removal path is `deleteMeal`, which soft-deletes the
*recipe*. Pizza shouldn't have to be destroyed just because it's not on the menu
tonight.

**Why this wasn't buildable before today:** the open question this ROADMAP item
carried since 07-28 was that `list_item_meals` recorded only *that* a meal
contributed to an item, never *how much* — so removal couldn't distinguish "this
item is only here because of Pizza" from "this item is here because of Pizza
AND Taco Night." Migration `039` (this week) closed exactly that gap: it added
`list_item_meals.quantity_contributed`, written additively by `add_meal_to_list`.
`deleteMeal` already consumes it to decrement precisely. **This spec extracts
that same mechanism into its own action, minus the last step (soft-deleting the
recipe).**

**Governing test case (must survive):** Dan and Helen, two meals (Pizza, Taco
Night) both use Cheese. Dan removes Pizza from the list. Taco Night's Cheese
need must survive untouched.
- Pizza's `list_item_meals` row for Cheese says `quantity_contributed = 2`.
- Cheese's live `list_items.quantity` is (say) 5 — 2 from Pizza, 3 from Taco Night.
- Removing Pizza decrements Cheese by exactly 2, leaving 3 — Taco Night's share,
  untouched, because its own `list_item_meals` row and `quantity_contributed`
  are separate and never read or written by this action.
- **Inherited caveat, not new:** if Helen manually stepper'd Cheese down to 1
  before Dan removes Pizza, the subtraction goes negative and Cheese is removed
  entirely (same branch `deleteMeal` already takes). This can under-serve Taco
  Night in that specific race. It is the accepted tradeoff already shipped and
  dev-verified for `deleteMeal` — not solved differently here, inherited as-is.

---

## Decisions locked this session

| Decision | Choice | Rationale |
|---|---|---|
| Build sequencing | AFTER `deleteMeal`'s 4 outstanding verifications pass, not in parallel | Same decrement math — a bug found once should be fixed once, not chased in two functions |
| Implementation shape | Extract `deleteMeal`'s list-reconciliation block (lines ~1884–1941 of `useProvisions.js`) into a new function, `removeMealFromList(mealId)`, called by both `deleteMeal` and the new remove action | One mechanism, two callers — not a copy-pasted second implementation that can drift |
| Does it touch `meals`? | No — the extracted function stops before the `meals.deleted_at` update. `deleteMeal` becomes: call `removeMealFromList(mealId)`, then soft-delete the meal row | Recipe survives; only its footprint on the current list is reversed |
| Bought items | Untouched — inherited unchanged from `deleteMeal`'s existing filter to `status === 'pending'` | Never un-buy what a member already purchased — the sacred-list guarantee, unchanged |
| `list_item_meals` link, per removed pending item | Deleted (same as `deleteMeal` today) | The meal's link to that specific list occurrence is gone; re-adding creates a fresh link — consistent with "resurrect clears provenance" elsewhere in this codebase |
| Post-removal "Planned" state | **Not fully suppressed if a bought item still carries the link** — a meal with one bought ingredient and the rest removed will still show "Planned" via that surviving bought-item link | Honest reflection of reality (partially fulfilled), not a bug — documented here so it isn't "discovered" later as unexpected |
| UI entry point | Second swipe action on the meal card, alongside the existing Edit action, visible **only when `isPlanned`** — label "Remove from list" | `SwipeToRemove` is already an N-action wrapper (built this week, sized by handlers passed); adding a second conditional handler is additive, not a new component. Keeps this off the Edit sheet — un-planning should be as fast as planning was (one tap on Add) |

---

## Changes, by file

### `useProvisions.js`

**1. Extract the reconciliation block into its own function:**
```js
const removeMealFromList = useCallback(async (mealId) => {
  const db = supabaseRef.current;
  const hh = householdRef.current;
  if (!db || !hh || !mealId) return false;
  try {
    const { data: links, error: lErr } = await db
      .from("list_item_meals")
      .select("list_item_id, quantity_contributed, list_items!inner(id, catalog_item_id, quantity, status, household_id, deleted_at)")
      .eq("meal_id", mealId)
      .eq("list_items.household_id", hh.id)
      .is("list_items.deleted_at", null);
    if (lErr) throw lErr;

    const pending = (links || []).filter((r) => r.list_items?.status === "pending");

    for (const row of pending) {
      const li = row.list_items;
      const contributed = Number(row.quantity_contributed) || 0;

      if (contributed > 0) {
        const remaining = Number(li.quantity) - contributed;
        if (remaining > 0) {
          const { error: qErr } = await db
            .from("list_items")
            .update({ quantity: remaining, updated_at: new Date().toISOString() })
            .eq("id", li.id)
            .eq("household_id", hh.id);
          if (qErr) throw qErr;
        } else {
          const { error: rErr } = await db.rpc("remove_list_item", {
            p_household_id: hh.id,
            p_catalog_item_id: li.catalog_item_id,
          });
          if (rErr) throw rErr;
        }
      }

      const { error: uErr } = await db
        .from("list_item_meals")
        .delete()
        .eq("meal_id", mealId)
        .eq("list_item_id", row.list_item_id);
      if (uErr) throw uErr;
    }

    await loadListItems(db, hh.id);
    reportSuccess();
    return true;
  } catch (err) {
    console.error("removeMealFromList error:", err.message);
    setError(`Could not remove meal from list: ${err.message}`);
    return false;
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [reportTransientFailure, reportSuccess]);
```

**2. `deleteMeal` shrinks to:**
```js
const deleteMeal = useCallback(async (mealId) => {
  const removed = await removeMealFromList(mealId);
  if (!removed) return false;
  const db = supabaseRef.current;
  const hh = householdRef.current;
  try {
    const { error: mErr } = await db
      .from("meals")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", mealId)
      .eq("household_id", hh.id)
      .is("deleted_at", null);
    if (mErr) throw mErr;
    return true;
  } catch (err) {
    console.error("deleteMeal error:", err.message);
    setError(`Could not delete meal: ${err.message}`);
    return false;
  }
}, [removeMealFromList]);
```
Note: `removeMealFromList` already calls `loadListItems` + `reportSuccess`; `deleteMeal` no longer needs its own.

**3. Export `removeMealFromList`** from the hook's return object alongside the existing exports.

### `App.js`

**1. New handler, mirroring `handleAddMealToList`:**
```js
const [removingMealId, setRemovingMealId] = useState(null);
const handleRemoveMealFromList = useCallback(async (mealId) => {
  setRemovingMealId(mealId);
  try {
    await removeMealFromList(mealId);
    await refreshProvenance();
  } finally {
    setRemovingMealId(null);
  }
}, [removeMealFromList, refreshProvenance]);
```

**2. Pass into `MealsLens`:**
```jsx
<MealsLens
  meals={meals}
  loading={mealsLoading}
  onAddAll={handleAddMealToList}
  addingMealId={addingMealId}
  onCreate={...}
  onEdit={...}
  plannedMealCounts={plannedMealCounts}
  onRemoveFromList={handleRemoveMealFromList}
  removingMealId={removingMealId}
/>
```

### `MealsLens`

Accept `onRemoveFromList` and `removingMealId`. On the `SwipeToRemove` wrapper,
add the second handler **conditionally**:
```jsx
<SwipeToRemove
  key={m.id}
  onEdit={() => onEdit && onEdit(m)}
  onRemove={isPlanned ? () => onRemoveFromList(m.id) : undefined}
  removeLabel="Remove from list"
  style={{ borderRadius: "12px", marginBottom: "9px" }}
>
```
(Exact prop names depend on `SwipeToRemove`'s current N-action signature — Cody
built the generalization this week and should match its existing convention
rather than this spec inventing a new one.)

### No migration. `quantity_contributed` already exists (039). No RLS change —
`list_items` and `list_item_meals` write access is already granted to
`authenticated` and already RLS-scoped.

---

## Verification (deployed dev preview, not localhost — AFTER `deleteMeal`'s own 4 verifications pass)

1. **Governing test case:** two meals sharing an ingredient (e.g. Pizza + Taco
   Night, both using Cheese). Add both. Remove Pizza from the list. Confirm
   Cheese's quantity drops by exactly Pizza's contributed amount, Taco Night's
   share remains, and Pizza the *recipe* still appears on Plan, unplanned.
2. Remove a meal with no shared ingredients — its unique ingredients disappear
   from Shop entirely (via `remove_list_item`), and the meal card returns to
   the unplanned (non-teal) state.
3. Bought-item guarantee: mark one of a meal's ingredients as bought, then
   remove the meal — the bought item is untouched; confirm via Shop.
4. Re-add the same meal after removing it — confirm it plans cleanly (fresh
   `list_item_meals` link, no stale `quantity_contributed` leaking from the
   prior add/remove cycle).
5. Two-client check (DH + DT): DT removes a meal DH can see planned — DH's
   client reflects it un-planning within the existing provenance poll.
6. Confirm `deleteMeal` still behaves identically end-to-end after the
   extraction (regression check on the refactor itself, not new behavior).

**Done when:** all six pass on the deployed dev preview URL, AND `deleteMeal`'s
own four pending verifications have separately passed first.
