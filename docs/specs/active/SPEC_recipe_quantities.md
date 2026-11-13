# SPEC — Recipe quantities, servings & units

**Scope:** OurProvisions
**Status:** Design settled in chat (2026-10-13), not built. Pre-build checks below come first.
**Author:** Design-chat Claude → for Claude Code (Cody)
**Supersedes:** the 2026-09-09 "three incompatible types" open item in ARCHITECTURE.md, and the
2026-10-09 "captured, not modelled" interim for `asWritten`.

---

## Why this exists

The product has three different quantities, and only one is modelled today:

| Quantity | Example | Today |
|---|---|---|
| **Shopping count** | Tilapia · 2 (lb) | ✅ `list_items.quantity` (integer) in `catalog_items.unit` |
| **Recipe amount + unit** | "1½ lb tilapia", "2¼ c. flour" | ❌ no unit on `meal_ingredients`; `quantity_per_serving` is a bare ratio |
| **Servings scaling** | serves 4 → cooking for 8 | ❌ `base_servings` exists, no planned-servings, no dial |

Every conversion between them is lossy today: `add_meal_to_list` flattens with
`GREATEST(1, round(...))`, the Galley validator `Math.ceil`s recipe amounts into shopping counts,
and `insert_custom_catalog_item` has no unit parameter, so a new item always reads `'each'`.
Recipe import captures each line verbatim (`asWritten`) but stores it only as an "As written"
text block inside `meals.instructions`.

**The model in one line:** the recipe stores what the cook needs, the list stores what the
shopper buys, and the app works out one from the other.

---

## Decisions (Dan, 2026-10-13)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | Store recipe amounts per serving or per recipe? | **Per recipe** (the amount as the recipe states it, for `base_servings`) | "2¼ cups, serves 4" stays what the cook sees. Per-serving makes 0.5625 cups — ugly to show, lossy to round. Scaling is one multiply either way. |
| D1b | Where do servings get chosen? | **On the planned meal, never on the recipe.** The library recipe stays as written. | "Tacos for 8 Saturday" is a fact about this week's plan, not the recipe. |
| D1c | Default planned servings | **max(household member count, recipe's `base_servings`)**, overridable per planned meal | Never scales **down** by default, only up. Solo/couple households cook the recipe as written (leftovers for free, no ¼ eggs). A recipe written "serves 2" floors at 2 — a library of meals for two cooks for two. Explicit override may go lower. |
| D2 | Scale what? | **Ingredients only. Steps are never scaled.** | Bake times, pan sizes, "a pinch" don't scale linearly. Card says so quietly: "amounts scaled · steps as written". |
| D3 | Unit classes | **Buying / Kitchen / Package** (table below) | Drives the buy rule. |
| D4 | Crossing unit types (cups vs a lb bag) | **No density conversion. Ever.** Buy 1, note shows the need as written. | Density per ingredient is wrong often enough (packed/sifted, chopped/whole) to break trust in the list. "Is there enough left in the bag?" is the on-hand feature's job, not arithmetic. |
| D5 | Buying-unit amounts that fall between whole numbers | **Round up**, and show the true need as a note on the list row **only when need ≠ buy** | Too much is an annoyance; too little is a ruined dinner. The rounded number signals "look closer"; the note gives precision for counters that sell by exact weight. Notes appear only when they mean something, so they stay read. |
| D6 | Keep the verbatim source line? | **Yes — `meal_ingredients.as_written`**, on the **recipe card only**. Never on the list. | Grandma's "4 teas. B.P." is the personality of the recipe; it also exposes misreads ("flag, don't guess") and holds what numbers can't ("Juice of 1 lime", "85/15 preferred"). The list is a working tool: plain need, no abbreviations to decode in the aisle. Distinct from the column rejected 2026-10-09 — that was a half-model inside import; this sits beside the real model as its source. |
| D7 | Interim "As written" blocks in `meals.instructions` | **Leave in place. Stop writing new ones.** | Import live on prod only since 2026-10-13, so few exist; they render cleanly as a preamble. Merge-on-landing combined duplicates, so block lines don't map 1:1 to rows — moving them would be guessing. Re-import if one bothers. |

---

## Unit classes (D3)

| Class | Units | Buy rule |
|---|---|---|
| **Buying** | each, lb, oz (weight), kg, g, dozen, bunch, head | Convert within the same dimension to the catalog unit, then **round up** to a whole number |
| **Kitchen** | tsp, tbsp, cup, fl oz, ml, l, pinch, dash, clove | **Buy 1** (of the catalog unit) + note |
| **Package** | can, jar, bottle, bag, box | **Buy 1**, never convert, + note when the recipe asks for more than one |

**One hardcoded exception:** clove → head of garlic, ~10 cloves per head, round up
(3 cloves → 1 head, note "need 3 cloves"; 14 cloves → 2 heads).

`oz` means weight. Volume is always `fl oz`. Settle the final vocabulary against the live
`catalog_items.unit` values and the Edge Functions' `ALLOWED_UNITS` (pre-build check P3).

---

## The buy rule — truth table

Recipe need = `recipe_amount × planned_servings ÷ base_servings`, in `recipe_unit`.

| Recipe need | Catalog unit | Same dimension? | Buy | Note |
|---|---|---|---|---|
| 1½ lb tilapia (serves 4, for 4) | lb | ✅ | **2** | need 1½ lb |
| 1½ lb tilapia (for 8 → 3 lb) | lb | ✅ | **3** | — (need = buy) |
| 1½ lb tilapia (for 6 → 2¼ lb) | lb | ✅ | **3** | need 2¼ lb |
| 24 oz chicken | lb | ✅ (oz→lb) | **2** | need 24 oz |
| 2 limes | each | ✅ | **2** | — |
| 1 egg × 1.5 | each | ✅ | **2** | — (a whole-count ceiling is not a rounding the shopper needs to see) |
| 2¼ cups flour | lb (bag) | ❌ volume vs weight | **1** | need 2¼ cups |
| 2 tsp onion powder | jar | ❌ | **1** | need 2 tsp |
| 3 cloves garlic | head | exception | **1** | need 3 cloves |
| no amount read (`null`) | any | — | **1** | none — the recipe card's Check this chip owns it |

**"Need ≠ buy"** means: the number differs, **or** the unit differs. Bare counts whose need is
already whole (8 tortillas → 8) never get a note.

---

## Merging across meals

One list row per catalog item still holds (`uq_live_list_item` does not bend; links via
`list_item_meals`). For a row linked to several planned meals:

- **Same dimension:** convert and sum, then apply the buy rule once to the total.
  (1 tbsp + 1 tsp cumin → need 4 tsp → buy 1 jar.)
- **Mixed dimensions:** buy rule per dimension, take the larger buy; the note lists each:
  "need 2¼ cups + 200 g".
- **Note names meals when >1:** "need 1½ lb Tacos + 1 lb Chowder".

This replaces merge-on-landing's line-count adding (2026-10-11 walk: right for limes, wrong for
olive oil) — merging is now unit-aware.

---

## Schema (proposed — confirm against pre-build checks)

Next free migration number: **063**.

**`meal_ingredients`** — add:
- `recipe_amount numeric NULL` — the amount for the recipe's `base_servings`. NULL = unread / no amount.
- `recipe_unit text NULL` — constrained to the unit vocabulary (CHECK or lookup; settle at build).
- `as_written text NULL` — verbatim source line; NULL for hand-built and Galley meals.

**`quantity_per_serving`** — backfill then retire:
`recipe_amount = quantity_per_serving × meals.base_servings`, `recipe_unit = catalog_items.unit`
of the linked item. Keep the old column read-only through one prod cycle; drop in its own later
migration after the VERIFY passes on both environments.

**Planned servings** — a `planned_servings integer NULL` on whatever row represents "this meal on
this week's board". NULL = use the D1c default. **Which table is open — pre-build check P1.**

**`insert_custom_catalog_item`** — gains `p_unit text DEFAULT 'each'`. This is the deferred
2026-09-09 fix; it lands here, inside the model, as decided.

**No new list column.** `list_items.quantity` stays the integer buy count; the stepper is
untouched. The note is **computed live** from `list_item_meals` → `meal_ingredients` + planned
servings, so it stays correct when servings change or a meal is dropped. Never stored.

Lean: the buy rule lives in **one SQL function** (e.g. `buy_quantity(need, need_unit, catalog_unit)`)
used by `add_meal_to_list` and by whatever reads the note, so there is one truth. Settle at build.

---

## Producers that change

- **`add_meal_to_list`** — replace `GREATEST(1, round(...))` with the buy rule over the scaled need.
- **`recipe-import`** — writes `recipe_amount`, `recipe_unit`, `as_written` per ingredient.
  **Stops writing the "As written" block** into `instructions`. Duplicate source lines: keep
  both `as_written` lines on the merged row (newline-joined), merge amounts by the merge rules above.
- **`meal-suggestion` (Galley)** — emits recipe amount + unit; the validator stops `Math.ceil`ing
  recipe amounts (buy rounding is the list's job now). `as_written` stays NULL.
- **Hand-built meals** — the meal sheet's ingredient row gains an amount + unit input. Design of
  that control is out of this spec; ship the model first, the hand-entry UI can follow.

---

## Display

**Recipe / cook card**
- At the recipe's own servings: show `as_written` where present (the author's words); otherwise
  amount + unit.
- Scaled: show the scaled amount ("4½ cups flour") with "doubled from serves 4" (or "× 1½") and
  the original a tap away. Footer: "amounts scaled · steps as written".
- Friendly rounding of **displayed** scaled amounts (lean, settle at build): kitchen measures to
  the nearest ⅛; weights to ¼ lb / 25 g; counts always whole, rounded up.

**Shopping list row**
- Buy count unchanged in meaning. Its size/contrast fix ships separately now (plain instruction,
  2026-10-13); **the row layout — count position and the note line under the name — is designed
  once, here**, at build. Note copy: "need 1½ lb" / "need 1½ lb Tacos + 1 lb Chowder".
- Never shows `as_written`.

---

## Pre-build checks (Cody, read-only, both environments)

- **P1.** Which table/row represents a meal placed on the board for a week? Does it have a
  servings column? Report name and shape; this decides where `planned_servings` lives.
- **P2.** Count meals whose `instructions` contain an "As written" block, dev and prod.
  If surprisingly large, D7 is revisited before build.
- **P3.** Distinct `catalog_items.unit` values (with counts) and the `ALLOWED_UNITS` list in both
  Edge Functions — to fix the unit vocabulary and the class table.
- **P4.** Any `meal_ingredients.quantity_per_serving` × `base_servings` that is non-integer today
  (would surface backfill surprises).

---

## Verification (Done when)

1. Backfill VERIFY: every pre-existing ingredient's `recipe_amount × planned ÷ base` reproduces
   its old list quantity at default servings (no regression for existing meals).
2. Tilapia 1½ lb serves 4 → list **2**, note "need 1½ lb"; set planned 8 → **3**, no note;
   planned 6 → **3**, note "need 2¼ lb".
3. Solo household + serves-4 recipe → planned servings defaults to **4**, not 1.
4. 2¼ cups flour vs a lb-unit flour item → buy **1**, note "need 2¼ cups".
5. 3 cloves garlic → **1** head, note "need 3 cloves".
6. Two meals both using cumin (1 tbsp + 1 tsp) → one row, buy **1**, note "need 4 tsp" naming both.
7. Imported Grandma card: cook card shows "4 teas. B.P." verbatim at own servings; scaled shows
   the worked amount with the original a tap away; the list shows neither.
8. New import writes no "As written" block; old blocks still render as a preamble.
9. New custom item from the Galley keeps its suggested unit (`p_unit`), not `'each'`.
10. Dropping a meal from the plan updates the remaining rows' notes with no reload.

---

## Out of scope

Density/volume↔weight conversion; scaling steps or times; package-size rounding beyond
"buy 1" (e.g. "you need 3 cans, they come in 4-packs"); the hand-entry amount control's design;
partial on-hand quantities (parked separately); price-per-unit (Phase 3).

## Open

- P1–P4 above.
- Final unit vocabulary and the display-rounding steps (settle at build, from P3).
- Whether the note reads from a SQL view or client-side assembly (one truth either way).
