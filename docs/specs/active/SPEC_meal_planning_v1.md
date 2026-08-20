# SPEC — Meal Planning v1 (Meals + This Week)

**Scope:** OurProvisions
**Status:** Design approved, ready for BUILD (spec pending a fresh-session final read)
**Session origin:** 2026-08-20 design chat — the long planning-model exploration
**Companion mockups (in `docs/mockups/`):** `mockup_catalog_vs_week.html`,
`mockup_meal_lifecycle.html`, `mockup_week_canvas.html`, `mockup_week_states.html`,
`mockup_week_days_unassigned.html`, `mockup_plan_list_divergence.html` — **note:**
these mockups explore the *full* model (days, no-shop types, batch shop, divergence
reconciliation). **v1 is a deliberate subset — see "Explicitly out of v1" below.**
When a mockup shows something in that list, the mockup is showing v2+, not v1.

---

## Why this exists

Create-meal shipped (`SPEC_create_meal_ui.md`, verified on dev). A household can now
build meals — but PLAN is still a flat catalog with a single "Add" that dumps a meal's
ingredients onto the shared list. There's no notion of "the meals we're doing this
week" as a thing you can see and arrange. v1 adds exactly that, and nothing more: a
second surface for the week, and the smallest possible planning concept on top of the
mechanics that already work.

The guiding decision, reached by talking *out* of the elaborate version: **for most
families, "planning" is "pick a few meals for the week and get the groceries," not
running a Mon–Sun logistics grid.** v1 serves that. The power-user calendar is real but
deferred — and, crucially, layers on top of v1 without a rebuild.

---

## The core simplification (why v1 has no state machine)

In v1, three facts that are *independent* in the full model are **collapsed into one**:

- **Planned** (the meal is part of this week)
- **Active** (the meal has ingredients on the shared list)
- **In This Week** (the meal shows in the This Week tab)

In v1 these are the same thing. **Adding a meal makes it planned = active = in This
Week, all at once.** There is no "planned but not shopped" state, no "shopped but not
planned" state. One button, one concept. This is what makes v1 shippable without the
divergence/reconciliation machinery.

**"Active" is derived, not stored** — a meal is active iff it has at least one live
`list_item_meals` row pointing at a *pending* (unbought) `list_items` row. Nothing sets
an `active` flag; it's computed. (This definition — active = has *unbought* items —
matters: a fully-bought meal reads as not-active, which is correct and is what makes
removal safe. See Removal below.)

---

## Decisions locked

| Decision | Choice | Rationale |
|---|---|---|
| Tab rename | Catalog → **Meals** | "Catalog" is cold; "Meals" is what a person actually thinks. |
| PLAN structure | Two sub-tabs: **Meals** \| **This Week** | Meals = the full reference list; This Week = the ones you've added, arrangeable. |
| The "Add" action | **Add = plan = shop, one tap.** Adding a meal folds its ingredients onto the list AND surfaces it in This Week. | One-click beats two-click. No separate "Plan" button, no split Add\|Plan control — because in v1 they're the same intention, not two. The Ive-passing move is noticing the two concepts are one in v1 and shipping one button. |
| This Week arrangement | Freeform, draggable, **shared** (per-household, not per-user) | The arrangement *is* the collaboration — Dan and Helen negotiating meatloaf's spot is the point. Shared, so everyone sees the same board. |
| Removal from This Week | **Zero out the meal's ingredients**, mirroring the catalog's add-then-zero. Reuses the existing per-item update path. | Direct parallel to how ingredients already work (add an item, remove it by zeroing the stepper). Un-planning a meal = zeroing its ingredients. No new quantity math. |
| Shared-ingredient removal | Unshared ingredients leave the list; shared ones **stay** (still needed by another meal) | This is the merge behavior already verified working tonight ("Multiple meals" badge), run in reverse. v1 does NOT solve the quantity-accounting version — it relies on the same honest behavior the app already has for manual items. |
| Days / calendar | **Out of v1.** This Week is freeform only. | The Mon–Sun grid is the power-user ceiling; most families don't want it. Deferred, layers on later as a view toggle. |

---

## Explicitly out of v1 (all deferred, none require a v1 rebuild)

- **Days toggle / calendar backdrop** — the freeform ⇄ days view switch. (mockups
  `mockup_week_canvas.html` screen 3, `mockup_week_days_unassigned.html`)
- **No-shop meal types** — "Leftovers" (empty-ingredient) and "Oakhouse" (restaurant /
  dining-out). In v1 these just work as empty or normal meals; they aren't *modeled* as
  distinct types. (mockup `mockup_week_states.html` screen 3)
- **All-week / unassigned section** — the home for recurring/undated meals when days are
  on. Only meaningful once days exist. (mockup `mockup_week_days_unassigned.html`)
- **Shop-the-week batch button** — folding all planned meals onto the list in one action.
  v1 keeps per-meal Add. (mockup `mockup_shop_the_week.html`)
- **Plan/list divergence reconciliation** — the "your list is out of sync" banner and
  orphaned-item flagging. **v1 doesn't need this** because add = active means there's no
  planned-but-unshopped state to diverge, and removal cleans up rather than orphaning.
  (mockup `mockup_plan_list_divergence.html`)
- **Shared-ingredient quantity accounting** — the genuinely hard `list_item_meals`-is-
  presence-not-quantity problem. Still deferred, still its own fresh-brain session, with
  the Dan/Helen bread scenario as its test case.

---

## Build scope

### Backend — `useProvisions.js`

**New: `removeMealFromList(mealId)`** — the counterpart to the existing `addMealToList`
(line ~1778, which calls the `add_meal_to_list` RPC). No such removal function exists
today; this is the one genuinely new piece.

Behavior: for each of the meal's ingredients, run the **same zeroing the per-item
stepper already does** (`updateQty(name, 0, ...)` path, line ~1114 / used throughout) —
so unshared ingredients leave the list, and shared ingredients that another live meal
still points at **stay** (their `list_item_meals` row for *this* meal goes, but the
`list_items` row survives because another meal references it). This must mirror the
existing merge/provenance behavior, run in reverse — do NOT write new quantity math.

Open implementation question for build: whether this is cleanest as a new
`remove_meal_from_list` RPC (symmetric with `add_meal_to_list`) or as a client-side loop
over the existing `updateQty` path. **Prefer the client-side loop if it correctly
reproduces the reverse-merge** (unshared leaves, shared stays), to avoid a new RPC with
untested edge behavior — but confirm against the live DB that zeroing one meal's
contribution to a shared item doesn't take a still-needed item to zero. This is the one
spot that touches the deferred shared-ingredient seam, so build it conservatively and
verify the shared case explicitly.

**Only zeros PENDING items** — never touches `bought` items. Falls out of using the
existing `updateQty` path, but state it as a requirement: removing a meal must never
un-buy something a household member already purchased. (This is why the derived-active
definition is "has *unbought* items" — bought items aren't "active," so they're never in
scope for removal.)

### Backend — delete a meal from the catalog

**New: `deleteMeal(mealId)`** — no delete path exists anywhere today. This removes the
*recipe itself* from the household's Meals list (distinct from `removeMealFromList`,
which only pulls a meal's ingredients off the shopping list but leaves the recipe intact).

**The landmine — must be handled, not discovered later:** `fetchMealProvenance` does NOT
filter `meals.deleted_at`. So a naive soft-delete leaves the Shop "from Taco Night"
provenance badge pointing at a meal that no longer exists — the same defect family as the
2026-07-30 phantom-meal-badge bug. Delete is therefore two coupled decisions, not one:

1. **Soft vs. hard delete.** Soft (`meals.deleted_at`) preserves history and is reversible,
   but REQUIRES fixing the read path first (`fetchMealProvenance` and any other reader must
   filter `deleted_at IS NULL`). Hard delete cascades `meal_ingredients` and
   `list_item_meals` away cleanly but destroys the record of which meal put an item on the
   list. **Recommend soft-delete + fix the read path** — consistent with the rest of the
   schema's `deleted_at` contract — but this is a real call to make at build.
2. **What happens to an active meal's list items on delete?** If you delete a meal whose
   ingredients are currently on the shopping list, its items should be zeroed first (same
   as `removeMealFromList`), THEN the recipe deleted. Deleting shouldn't strand active
   items with dangling provenance. Sequence: zero ingredients → soft-delete meal.

**UI:** delete lives behind the meal's edit affordance (in the edit sheet, or as a second
swipe action on the Meals-tab row) with a **confirm step** — destructive, not reversible
via a lens toggle the way Hide would be. Not a bare one-tap.

### Frontend — `App.js`

1. **Rename the PLAN sub-tab** Catalog → **Meals** wherever it's labelled.
2. **Add a "This Week" sub-tab** alongside Meals.
3. **Meals tab:** essentially today's `MealsLens`. The per-meal "Add" now (a) folds
   ingredients onto the list via `addMealToList` (already does this) AND (b) the meal
   appears in This Week. Show derived active-state on each meal (some indicator that it's
   currently on the list) — visible in BOTH tabs.
4. **This Week tab:** renders the meals that are currently active (derived — have
   ingredients on the list this cycle), as freeform draggable cards. Drag order is
   shared/persisted (needs a `sort_order` or position — see Architecture). Each card has
   a **remove** action → calls `removeMealFromList(mealId)`.
5. Removal from This Week zeros the meal's ingredients (per Backend above) — the meal
   leaves This Week because it's no longer active.

---

## Architecture notes / open items for build

- **This Week membership is derived, not a table.** A meal is "in This Week" iff it's
  active (has live pending list items). No new "planned" table in v1 — This Week is a
  *query* (active meals), not a stored set. This is the biggest simplification and the
  thing that makes v1 small. (v2's days/divergence work will likely need a real
  `plan_occasions`-style table; v1 deliberately doesn't.)
- **Arrangement persistence needs a home.** Freeform drag order is shared, so it must
  persist — likely a `sort_order` (or x/y) column somewhere. Open question: does it live
  on `meals` (simplest, but "order" is really per-cycle not per-meal) or on a lightweight
  new table? Decide at build; lean toward the simplest thing that persists a shared order.
- **The derived-active query** is the load-bearing read: `meals` join `list_item_meals`
  join `list_items where status = 'pending' and deleted_at is null`. Confirm this is
  efficient and matches how `fetchMealProvenance` already reads.

---

## Verification (deployed dev preview)

1. **Add = plan:** on Meals tab, Add a meal → its ingredients land on Shop AND it appears
   in This Week. One tap, both effects.
2. **Active shows in both tabs:** the added meal reads as active in Meals and This Week.
3. **Arrange:** drag meals around in This Week; reload; order persists; confirm a second
   account sees the same order (shared).
4. **Remove (unshared):** remove a meal whose ingredients are unique to it → its items
   leave Shop, it leaves This Week.
5. **Remove (shared) — the important one:** two meals share an ingredient (the Bread ×N
   case). Remove one → the shared item STAYS on Shop (still needed by the other meal),
   the removed meal's *unshared* items leave. No item goes to zero that another meal needs.
6. **Remove never un-buys:** mark a meal's item as bought, then remove the meal → the
   bought item is untouched.
7. **"Tacos → Pizza" flow:** remove Tacos (items zero out), Add Pizza (items go on) →
   clean swap, no orphans, no divergence banner (correct — v1 removal cleans up).
8. **Delete from catalog:** delete a meal → it's gone from the Meals tab. If it was active,
   its list items are zeroed first (no stranded items). **Critically:** confirm no Shop
   provenance badge points at the deleted meal afterward (this is the phantom-badge
   landmine — if `fetchMealProvenance` wasn't fixed to filter `deleted_at`, a stale "from
   [deleted meal]" badge will appear). Confirm delete requires a confirm step.
9. Console clean.

**Done when:** all nine pass on the deployed dev preview, under real auth, real data —
with special attention to #5 (shared-ingredient removal), #6 (never un-buy), and #8 (the
phantom-badge landmine on delete). These three touch the deferred shared-ingredient seam,
the sacred-list guarantee, and the provenance read-path respectively.
