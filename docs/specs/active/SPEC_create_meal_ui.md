# SPEC — Create-Meal UI (create + edit, one parameterized sheet)

**Scope:** OurProvisions
**Status:** Ready for BUILD
**Companion:** `docs/mockups/mockup_create_meal.html` (5 screens, approved) — **the mockup wins on any visual disagreement with this doc.**
**Session origin:** 2026-08-19 design chat (mockup iteration) + 2026-08-20 design chat (edit/hide/delete scoping, spec authoring)

---

## Why this exists

PLAN is live on dev (`ea1c170`) but populated only by `dev_meals_seed.sql` — a
fixture only reachable through the SQL editor. `createMeal({name, baseServings,
ingredients})` already exists in `useProvisions.js`, unused. Nothing calls it.
**This is the demo's own named failure mode**: the Vegas demo's centrepiece tab
cannot currently be populated by a user, only by Dan with database access.
This spec closes that gap — and, since the edit-mode seam is far cheaper to
build in from the start than to retrofit, builds create and edit as one
parameterized sheet rather than two components.

**Not in this spec, on purpose:**
- **Hide** — deferred past v1. The clutter problem it solves scales with
  catalog size; a household's meal repertoire is expected to stay small
  (a dozen or so real recipes), unlike the 183-row ingredient catalog. Item
  unhide also rides entirely on Browse's search bar (a "hidden but live"
  reveal card surfaces on search) — PLAN has no search bar today, so meal
  hide would need a whole new recovery surface with nothing to piggyback on,
  not just a toggle. **Revisit trigger:** a household's live meal count
  passing ~15–20 with hide requested as a real complaint.
- **Delete** — deferred, own item, already filed in ROADMAP as P0. Not
  comparable in risk to hide or edit: `fetchMealProvenance` never filters
  `meals.deleted_at` today, so a naive soft-delete would leave the Shop
  "Multiple meals" badge naming a meal that no longer exists (same defect
  family as the 2026-07-30 phantom-meal-badge bug). Needs the read-path
  fixed, or an explicit hard-delete decision, before any UI ships.
- **`remove_meal_from_list`** (provenance-aware removal from the shared list)
  — deferred, own design session. `list_item_meals` is presence-only, never
  quantity; a concrete concurrent-edit case (two members, two meals, one
  shared ingredient, independent decrements) defeats both remediations
  `SPEC_meals_model.md`'s Open Question #1 has carried since 2026-07-28.

---

## Decisions locked

| Decision | Choice | Rationale |
|---|---|---|
| Create + edit are ONE component | `mode: 'create' \| 'edit'`, parameterized from the start | Building edit as a retrofit onto a create-only sheet is expensive; building it in from day one is nearly free. Decided explicitly rather than left to accident. |
| Entry point — create | Dashed `+ Create new meal` ghost row terminating the meal list | Matches the household "+ Create new place" convention exactly (same border weight, same terminal-row position). A header button was rejected — it would stand up a second, competing "create new X" convention next to one that already exists. |
| Entry point — edit | Bare pencil icon, right edge of each meal card, no container | Reuses the already-formalized row-action pattern (`ARCHITECTURE.md`: "bare glyph, right edge, no container" — the household row's Edit pencil). One action per row in v1 (hide/delete both deferred) doesn't justify a swipe-reveal, which exists for *stacked* multi-action rows. |
| Sheet header/footer | Plain title ("New Meal" / "Edit Meal"), no icon buttons in the header. Bottom Cancel + primary button pair. | Matches the real "Add New Item" modal's convention — no surface in the app currently splits actions between a header `×`/`Save` pair; the bottom pair does. |
| Field labels | Small-caps eyebrow labels ("MEAL NAME," "INGREDIENTS") | Matches "ITEM NAME" in the Add New Item modal, not sentence-case "Name." |
| Ingredient search | Empty until a query is typed; nothing pre-populated | The placeholder ("Search your catalog…") already implies typing; showing results against an empty box contradicts its own copy. |
| New-ingredient-not-in-catalog flow | Inline panel matching Browse's live no-results pattern exactly: label above, bordered box, tap-a-category commits create-and-add in one motion, **no separate confirm button** | Screenshot-verified against the real, shipped Browse no-results panel. Routes through the existing `insert_custom_catalog_item` RPC (idempotent, normalized-name reuse, migration 018) — not a bespoke second creation flow. Keeps "a meal ingredient is a catalog item" (2026-07-29 FK decision) true at the UI layer, not just the schema. |
| Meal-card action button copy | Plain **"Add"** (not "Add all," not "Add to Shop") | Matches Browse's existing verb. The destination-naming problem ("Add" to *where*, exactly, from a Plan-context screen?) is structural, not lexical — it only exists because PLAN has no Day/Time/Occasion frame yet. Once that frame exists the verb resolves for free ("Add to Tuesday"). Inventing a verb now would paper over a real gap rather than fix it. |
| Meal-card action button style | Light outlined pill (border + text in clay, white fill) — same treatment as the ingredient-search "+ Add" pill | The shipped `MealsLens` "Add all" button is solid-fill, inherited from the original 2026-07-30 build. Same verb, two unreconciled looks. **This spec ships the fix** — see Build Scope. |
| Editing a meal's effect on the shared list | **None, and this is now explicit, not accidental.** `add_meal_to_list` folds quantities into `list_items` at add time; editing a meal afterward never retroactively touches anything already on the list. | Matches the standing "the recipe is stable; only the shopping instance changes" principle. Was true by accident before this spec; stating it here makes it a decision. **The Edit sheet must say this in the UI** (see Screens → Edit mode), not leave the person to infer it. |
| `updateMeal` write shape | Plain client-side writes (two calls: update `meals` row, then soft-delete-all + reinsert `meal_ingredients`), mirroring `createMeal`'s existing shape — **not** a new RPC | `createMeal` is already plain writes, not `add_meal_to_list`'s SECURITY DEFINER RPC shape. Edit is structurally identical (household-owned rows, RLS-protected, no cross-cutting concern like advisory locks or cycle resolution). Matching the existing pattern avoids introducing a second mechanism for the same class of operation. `meal_ingredients` rows are referenced by nothing else (`list_item_meals` keys on `meal_id` directly, not `meal_ingredient_id`), so blanket soft-delete-then-reinsert on edit is safe — no id-matching/diffing needed. |

---

## Backend changes

### `useProvisions.js` — new `updateMeal`

No existing function to reuse; `useProvisions.js` exports `fetchMeals`,
`createMeal`, `addMealToList`, `fetchMealProvenance` — **no `updateMeal`**.
This spec adds it, mirroring `createMeal`'s shape:

```js
const updateMeal = useCallback(async (mealId, { name, baseServings = 1, ingredients = [] }) => {
  const db = supabaseRef.current;
  const hh = householdRef.current;
  if (!db || !hh || !mealId) return false;
  const trimmed = (name || "").trim();
  if (!trimmed) { setError("A meal needs a name."); return false; }
  try {
    const { error: mErr } = await db
      .from("meals")
      .update({ name: trimmed, base_servings: baseServings })
      .eq("id", mealId)
      .eq("household_id", hh.id); // belt-and-suspenders; RLS already scopes this
    if (mErr) throw mErr;

    // Blanket replace: soft-delete every live ingredient row, then insert
    // the current draft fresh. Safe — meal_ingredients.id is referenced by
    // nothing else in the schema.
    const { error: dErr } = await db
      .from("meal_ingredients")
      .update({ deleted_at: new Date().toISOString() })
      .eq("meal_id", mealId)
      .is("deleted_at", null);
    if (dErr) throw dErr;

    const rows = (ingredients || [])
      .filter((i) => i.catalog_item_id && Number(i.quantity_per_serving) > 0)
      .map((i) => ({
        meal_id: mealId,
        catalog_item_id: i.catalog_item_id,
        quantity_per_serving: Number(i.quantity_per_serving),
      }));
    if (rows.length > 0) {
      const { error: iErr } = await db.from("meal_ingredients").insert(rows);
      if (iErr) throw iErr;
    }
    reportSuccess();
    return true;
  } catch (err) {
    console.error("updateMeal error:", err.message);
    setError(`Could not update meal: ${err.message}`);
    return false;
  }
}, [reportSuccess]);
```

Add `updateMeal` to the hook's return object alongside the existing meal
functions.

**No migration, no schema change.** `meal_ingredients.deleted_at` already
exists and `fetchMeals` already filters on it — confirmed by reading the
live `fetchMeals` query before writing this.

### `App.js` — wire up create, and reconcile the Add button styling

1. Add the create-meal sheet component (built from the mockup, see Screens
   below), gated by `MEALS_ENABLED` (already `true`), mounted from the
   dashed ghost row's tap handler on PLAN and the pencil icon's tap handler
   on each meal card.
2. **Reconcile `MealsLens`'s "Add" button** from its current solid-fill style
   to the light outlined pill (see Decisions table). This is a style-only
   change to existing JSX — find the `add-all`-equivalent button styling in
   `MealsLens` and match it to the mockup's `.add-all` treatment (white fill,
   1.5px clay border, clay text, no drop shadow).
3. Copy: the meal-card button reads "Add," not "Add all."

---

## Screens (build from `mockup_create_meal.html`)

### 1 — PLAN entry point
Meal list, each row: name + ingredient count + light-pill "Add" button +
bare pencil icon (right edge, no container) → opens the sheet in `edit`
mode, pre-filled. Dashed `+ Create new meal` ghost row terminates the list
→ opens the sheet in `create` mode, empty.

### 2 / 2b — Ingredient search (empty and active states)
"MEAL NAME" field, "INGREDIENTS" search box. Empty query → empty panel, a
hint to start typing. Typed query → filtered results from `catalog_items`,
each with a light-pill "+ Add" that stages the ingredient into local state
(nothing writes to the DB yet).

### 2c — New ingredient not in catalog
Query with no (or partial) match → inline panel: "NO RESULTS FOR '{query}'"
label, bordered box, "Add '{query}' to {meal name}," category pills with
none pre-selected, tapping a pill calls `insert_custom_catalog_item` and
stages the returned item into the draft in one motion. No separate confirm
button.

### 3 — Ready to save
Staged ingredients list, each with a flat quantity stepper (no servings
dial — matches the standing "Option 3 first" decision) and a remove control.
Bottom footer: Cancel + "Save Meal" (disabled until name is non-empty and
at least one ingredient is staged).

### Edit mode — what's different from create
- Sheet opens pre-filled: name field populated, staged-ingredients list
  populated from the meal's current live `meal_ingredients` (via
  `fetchMeals`'s existing embed).
- Title reads "Edit Meal," not "New Meal." Save button reads "Save Meal" in
  both modes (the title above it already disambiguates — no need for a
  second differing label).
- Save calls `updateMeal(mealId, {...})` instead of `createMeal({...})`.
- **New copy, edit mode only:** a short note near the ingredient list —
  *"Changes here won't update items already on your list."* States the
  locked decision above plainly rather than leaving it to be inferred.
- Save button is enabled immediately on open (existing meal is already
  valid) rather than starting disabled the way create's does.

---

## Verification (deployed dev preview, not localhost)

1. **Create:** tap the ghost row, build a meal (name + 2+ ingredients,
   including one created fresh via the no-results panel), Save. Confirm it
   appears on PLAN immediately with the correct ingredient count.
2. **Edit:** tap the pencil on an existing meal, confirm the sheet opens
   pre-filled correctly, change the name and add/remove an ingredient, Save.
   Confirm PLAN reflects the new name/count, and confirm via the Supabase
   dashboard (or a fresh `fetchMeals`) that the old `meal_ingredients` rows
   are soft-deleted, not orphaned.
3. **Edit does not touch existing list items:** add a meal's ingredients to
   Shop, then edit that meal to remove one of those ingredients. Confirm the
   already-added item is untouched on Shop.
4. **Add button:** confirm `MealsLens`'s meal-card "Add" now renders as the
   light pill, matching the ingredient-search "+ Add" pill — no solid-fill
   button left anywhere on PLAN.
5. **Console clean** — no errors from the new `updateMeal` path or the
   pencil-icon addition.

**Done when:** all five pass on the deployed dev preview, under real Clerk
auth, against real data — not the fixture.
