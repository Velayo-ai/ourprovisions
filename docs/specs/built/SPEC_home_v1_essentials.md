# SPEC — Home v1 essentials: the on-deck card, the list line, the budget line

**Status:** Approved in the design chat on 2026-10-01. Ready for a Claude Code build on dev.
**Scope:** OurProvisions, client only. **No migration.**
**Supersedes:** Home v1's two cards (`TonightCard`, `ListCard`), live on prod as the interim since `5a7a255`.
**Visual reference:** `docs/mockups/mockup_home_essentials_crew_news.html` (09-27). Use it for the essentials zone only. Where it disagrees with this spec, the spec wins on three points:
- copy ("On deck", not "Tonight");
- teal (only Cooked it);
- crew news (out of scope).

**Sequencing:** build after trip qualification v2 is on prod. This build adds RUM allow-list selectors, and the v2 promotion proves the allow-list at exactly 23. One allow-list change at a time.

---

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Home's essentials are four things, top to bottom: greeting + date, the **on-deck card**, the **list line**, the **budget line**. Nothing else. | The 09-27 reduction pass. Home is a front door: calm and actionable. |
| D2 | The card shows **position 1 of the open queue** (`boardMeals[0]`) under the eyebrow **On deck**. It is never "Tonight". | Plan has no dates until Days v2 (decision 09-29). Position decides, not kind. |
| D3 | The card's states **mirror the board card's states exactly**, with the same derivation (`placements[id].readyAt`, `mealRowCounts`, `isNoShop`). | Home and Plan must never describe the same meal differently. Any state change lands in one place. |
| D4 | **To buy has no button on the card.** Its status line says what's left, and the list line directly underneath carries **Let's shop →**. | One door, one button on the screen. Two links to Shop stacked 40 px apart is noise. |
| D5 | **Teal appears only on Cooked it** (and its ✓ Cooked afterglow). Add to Shop, Add a meal, Switch and Let's shop are espresso/outline. | Teal = the household finished something (09-21, re-affirmed 09-29). |
| D6 | **After Cooked it, the card mutes to ✓ Cooked** and stays until the next Home load. Then the next card is on deck. Reuse `cookedHere`. | One afterglow rule for the board and Home. |
| D7 | **The budget bar measures exactly what Shop's Trip Total measures:** `totalCost` vs `budgetNum`, with the `~` when `hasEstimatedPrices`. It renders **only when Shop would show it**: `showPrices` on, `budget_goal` set, list non-empty. | Home must never show a number Shop doesn't, or a different one for the same list. |
| D8 | **Switch swaps cards 1 and 2** through the existing `reorderBoard` (the hook renumbers 0..n-1). It renders only with 2+ open cards. | Reuses Plan's reorder. No new write path. |
| D9 | A **held night** on deck shows **×** (it leaves by ×, 09-29) and Switch. It has no primary. | Held nights don't auto-complete without dates. × is a no-shop card's one action, same as the board. |
| D10 | **Nothing renders under the date until Home's data is complete** for this household: board, list **and meal provenance** (see Data). | Without provenance, a To-buy meal reads as Planned for a beat. Never show state the data doesn't support. |

---

## The on-deck card — truth table

Evaluate the rows top to bottom; the first match wins. `m = boardMeals[0]`. The cooked afterglow is checked first, using the rendered list (`boardCards[0]` with `cookedHere.has(id)`).

| # | Condition | Eyebrow | Title | Status line | Primary | Secondary |
|---|---|---|---|---|---|---|
| 0 | `boardCards[0]` is in `cookedHere` | On deck | meal name | — | **✓ Cooked** (teal outline, disabled) | none |
| 1 | No open card | On deck | "What sounds good?" | "Plan a meal and we'll turn it into your list." | **Add a meal** (deep sand `--op-add`; opens the library on Plan) | Hold-a-night buttons (`HoldANightButtons label="OR HOLD A NIGHT"`) |
| 2 | `isNoShop(m)` | On deck | the no-shop title rule from `PlanBoard` | the no-shop context line (`leftoversLine`, place name, or none) | none | **×** (skip; same as the board's ×), **Switch** |
| 3 | `readyAt` set | On deck | meal name | "Everything's in — go cook" | **Cooked it** (teal) | **Switch** |
| 4 | Not ready, `rows.total > 0` (To buy) | On deck | meal name | "4 to buy" / "2 of 4 in cart" (the board's line) | none (D4) | **Switch** |
| 5 | Not ready, no rows, has ingredients (Planned) | On deck | meal name | "Not on the list yet" | **Add to Shop** (outline; same handler as the board, so on-hand meals still get the on-hand prompt) | **Switch** |
| 6 | Not ready, no rows, no ingredients | On deck | meal name | "Nothing to shop for" | **Cooked it** (teal) | **Switch** |

Behaviour that applies to every row:
- **Switch** renders only when `boardMeals.length >= 2`.
- **The card body:** tapping a meal card (rows 3–6) opens the meal, exactly as v1's "View meal →" does today (`onView`). Rows 1 and 2 have no body tap.
- **No destructive control at rest on a meal card** (09-21). Remove stays on the board's ⋯.
- **Busy state:** while a write is in flight, the card dims (the board's `busyMealId` pattern) and its buttons are disabled.

## The list line

`openCount` = the Helm's Shop badge number (live rows minus checked). The first item is the first unchecked row in **Shop's Aisles order** (`CATEGORY_ORDER`, then name), i.e. what you'd reach first.

| Condition | Line |
|---|---|
| `openCount === 0` | "Nothing on your list · **Start a list →**" (Browse) |
| This user has an open session (`activeSession`) | "N left to find · **Let's shop →**" |
| Otherwise | "N thing(s) to get · {first item} · **Let's shop →**" |

Singular: "1 thing to get", "1 left to find". Let's shop → goes to Shop (`goToDoor("list")`).

## The budget line

Renders only when `showPrices && budgetNum !== null && totalItems > 0` (D7):
- A thin bar with width `budgetPct`. Colour: `#A0724A`, `#C9A97A` above 85 %, `#e05c5c` over budget. These are the budget banner's thresholds.
- The label reads `{~}$X of $Y`. When over budget it reads "$Z over $Y" in the over colour.
- **No new arithmetic.** Read the existing `totalCost`, `budgetNum`, `budgetPct`, `overBudget` and `hasEstimatedPrices`.
- Not tappable in v1.

## Copy renames (from Home v1)

| v1 | v1 essentials |
|---|---|
| Eyebrow "Tonight" (empty) / "Up next" (populated) | "On deck" in every state |
| "+ Add tonight's meal" | "Add a meal" |
| "View meal →" / "View plan →" | gone (card body tap; no-shop has no tap) |
| "Need anything?" / "Your list" card | the list line |
| "Build your grocery list" / "Start a list →" | "Nothing on your list · Start a list →" |

## Data and gating

- **Provenance on Home (new).** `mealRowCounts` derives from `mealProvenance`, which today loads only on `list` / `plan`. Add `home` to:
  - the provenance navigation effect;
  - `onListChangedRef`'s view check.
- **Gate.** Track `provenanceLoadedFor` (household id, same pattern as `mealsLoadedFor`) and gate with `homeReady = boardReady && householdReady && provenanceLoadedFor === household.id`.
- **No new queries** beyond that, no schema, and no hook changes beyond what this needs.
- **Afterglow.** `cookedHere` is App-level and cleared by the meals load effect on view entry, so D6's "next Home load" is the existing behaviour. Do not add a timer.

## RUM

- **New interactive classes:** `.deck-primary` (Add to Shop / Cooked it / Add a meal), `.deck-switch`, `.deck-x`, `.home-line-link` (Let's shop → / Start a list →).
  - Each carries fixed copy only.
  - Meal names, item names and amounts render in non-allow-listed classes (`.deck-title`, `.deck-status`, `.home-line-text`, `.home-budget`). This is the 09-28 rule.
- **Remove** `.tonight-link` and `.list-card-link` from `CHROME_ALLOW_LIST` in the same commit, because their elements are gone.
- **Report the allow-list diff exactly:** the removals and additions by name.
- No spans.

## Home-only banner (ships in the same build; plain instruction, not this spec)

Build per ARCHITECTURE "Home v2 — forward model":
- The OurBanner block renders only when `view === "home"`.
- Plan, Browse and Shop get Row 1 alone on `#1a0e06`.

## Out of scope

- Crew news and the seam line.
- Recipe giving.
- The week's record.
- Who's cooking / attribution.
- The board-card recipe sheet.
- Tapping the budget line.
- Any change to the board itself.

---

## Verification (dev preview, deployed, signed in; two accounts where marked)

1. **Empty board** (a fresh household):
   - On deck shows "What sounds good?", Add a meal and the three hold buttons; no Switch.
   - Add a meal lands on Plan's library.
2. **Planned:** plan one meal → Home reads "Not on the list yet" with Add to Shop.
   - Tap it: the card becomes To buy with no button, and the list line reads "N things to get · … · Let's shop →".
   - A meal with an on-hand ingredient gets the on-hand prompt.
3. **No flash:** on a hard reload of row 2's To-buy state (throttled network), the card never renders as Planned first (D10).
4. **Switch:** with two meals, Switch swaps them.
   - Plan shows the same order.
   - DT's Home shows the same order within one poll.
5. **Ready:**
   - Shop and Wrap up → Home reads "Everything's in — go cook" with teal Cooked it.
   - Tap Cooked it → ✓ Cooked (muted).
   - Leave and return to Home → the next card is on deck.
   - `meal_cooks` gains exactly one row (read back).
6. **Held night first:** drag Leftovers to position 1 on Plan → Home shows Leftovers with its source line, × and Switch, and no primary.
   - × removes it (`skipped_at` + `deleted_at` read back), and the next card is on deck.
7. **Nothing to shop for:** a meal with no ingredients on deck shows "Nothing to shop for" and teal Cooked it.
8. **List line:**
   - Empty list → "Nothing on your list · Start a list →" (Browse).
   - Start a trip (check one item) → "N left to find".
   - First-item name matches the top unchecked row of Shop's Aisles view.
9. **Budget line:**
   - Prices on, budget set → the bar and amount equal Shop's Trip Total exactly, including `~`.
   - Prices off, or budget null, or empty list → no line.
   - Over budget → over colour and "$Z over $Y".
10. **Teal audit:** grep the Home render; teal appears only on Cooked it / ✓ Cooked.
11. **Banner:**
   - Home → Plan collapses to Row 1 with no photo flash.
   - Plan → Home restores it without a layout jump.
   - The household sheet is reachable from every tab.
12. **RUM:** the allow-list diff is exactly the removals and additions named above. `.deck-title` and `.deck-status` are not in it.

## Why a spec

It carries:
- a seven-row truth table;
- one non-obvious data dependency (provenance on Home, and the flash it prevents);
- a RUM allow-list change that must be sequenced against the v2 promotion;
- copy renames a future session would otherwise re-litigate.
