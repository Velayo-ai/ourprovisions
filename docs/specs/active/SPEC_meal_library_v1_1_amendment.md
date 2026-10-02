# SPEC AMENDMENT — Meal Library v1 → v1.1: "What sounds good?" header, Plan label, quieter toast

**Scope:** OurProvisions
**Status:** Design approved 2026-10-02 in the design chat. Folds into `SPEC_meal_library_v1.md` before that spec is built. Build stays sequenced behind the meal-planning v2 go/no-go (unchanged).
**Amends:** `SPEC_meal_library_v1.md` decisions 2, 7, 11, 14, 15, the head row, the toast, and verification steps 1, 7, 8, 11.
**Mockup of record for the grid screen:** design canvas "Plan: Meals vs New" (one artboard, interactive). It supersedes screen 1 of `mockup_meal_library_v1.html` for the **head row, card action, toast and week line only**. Screens 2–4 of the v1 mockup (Day one, Filter sheet, Edit meal) stand, with the head-row changes below applied to screen 2.

---

## Why

Dan's real-phone review of the current library ("Add a meal": twin Find / Create cards above a list with an `Add →` button per row) found it unclear where to go next. A design pass on 2026-10-02 confirmed the v1 spec's direction and settled what was still ambiguous in it: **the round + meant two different things on one screen** (header = new meal, card = plan it). An advisor review of the resulting mockup then tuned copy and navigation.

The model this protects — three states of one activity, planning:

| Surface | Job | Verb |
|---|---|---|
| **This Week** (the board) | Arrange the meals I've chosen | (board's own verbs, unchanged) |
| **What sounds good?** (library) | Choose meals | **Plan** |
| **Create** (New Meal sheet) | Make a meal that doesn't exist yet | **Save Meal** |

---

## Decisions (amended or new)

| # | Decision | Rationale |
|---|---|---|
| A1 | **Card action is a labeled pill: `Plan`** (espresso outline, 34 px high, 700 weight) **→ `✓ Planned`** (sand `#EFE6D6` fill, espresso check + text, disabled). Replaces the round + / ✓ in v1 decisions 2 and 11. | Every meal's state reads without learning a symbol. Removes the + collision with Create. |
| A2 | **A planned card is not inert.** The pill is disabled, but the card body (coloured top) still opens the meal, planned or not. | v1 decision 14 already says card body → meal; this makes explicit that ✓ Planned never disables the card. Routine users revisit planned meals. |
| A3 | **Header action is a labeled `+ Create`** (espresso fill pill), opening the existing **New Meal sheet unchanged** (manual fields + "Ask AI to build it" Galley section). Replaces the head-row round +. The Helm's compact + on this screen also opens it (v1 rule kept). | "Create" names the experience, not a database record. Exactly one door, so no choice screen in front of the sheet — the sheet already holds both paths and shows the meal before saving. |
| A4 | **No back arrow on the library.** Location is set by the Helm (PLAN lit). The way back to This Week is the **week line** (A5) or tapping **PLAN** in the Helm. | The arrow raised "back to where?" This is still Plan, not a subpage. |
| A5 | **Week line under the title: `{N} meals planned this week ›`** — one tappable line that opens This Week. Copy: 0 → `Nothing planned yet this week ›`; 1 → `1 meal planned this week ›`; N → `{N} meals planned this week ›`. Styled quieter than the title: 12.5 px, weight 500, muted `#6E5A4A`, ≥28 px tap height. Replaces v1 decision 15's subtitle "Pick something for this week." | One thought, not two bits of metadata. Every Plan tap visibly changes it, and it doubles as the route to the board. Kept light so *What sounds good?* stays unquestionably dominant. |
| A9 | **Grid row gap 16 px** (column gap stays 12 px). Amends v1 screen spec item 6. | A little more vertical breathing room between rows; polish, not redesign. |
| A10 | **No food photography on this surface — reaffirmed** (v1 decision 4). | Seen on the real mockup: colour blocks make meals scannable without turning OP into a recipe website. It reads as a household tool. |
| A6 | **Title stays `What sounds good?`** (v1 decision 15, reaffirmed). | It keeps the user inside the act of planning; it is not a "Meal Library". |
| A7 | **Toast on Plan: `{Meal} added to your week ✓`** — no action button, auto-dismisses (~2.5 s), dark brown, centred pill above the Helm. Replaces v1's `"{Meal} is on the board."` + BOARD action, and the earlier `Added to your week ✓ · VIEW WEEK`. | "Board" is internal vocabulary. The week line (A5) is the persistent route to the week, so the toast needs no action. |
| A8 | **Occasion rail kept as v1** (All · Dinner · Breakfast · Lunch · …); Made before / Ours stay in the Filter sheet. | Reaffirmed: occasions answer "what sounds good?"; history filters don't. |

Unchanged: two-column grid, card anatomy (occasion word + 20 px serif name in the tone block, ingredient count in the strip), no photos by default, tone keyed by `mealTone`, zero teal, search, filter sheet, Good-for chips, migration `058_meals_occasion.sql`, every RPC.

---

## Implementation notes (App.js)

- Head row: delete the back chevron; title + week line left, `+ Create` right. The head row stays the Helm's compact sentinel (`controlRowRef`) as v1 wired it.
- Week line: count = this household's current `meal_placements` for the open cycle with `kind = 'meal'` (same set that drives `onBoardIds`). **Builder to confirm** whether no-shop placements (leftovers / eating out) should count — design lean: **no**, the line counts meals chosen here. Tapping it sets the Plan view to the board.
- Card: the coloured top is a real `<button>` with `aria-label="Open {meal}"`; the pill is a separate `<button>` (`aria-label="Plan {meal}"` / disabled `"Planned for this week"`). Do not nest buttons.
- Toast: reuse the existing toast system with no action; ensure a second Plan within the window replaces, not stacks.
- RUM allow-list (`src/rum.js`): add `Plan`, `Planned`, `Create`, `meals planned this week`; remove `BOARD`. Meal names stay masked.

---

## Verification changes (replace the matching v1 steps)

1. **Entry / location.** + Meals on the board opens *What sounds good?*; there is **no back arrow**; PLAN stays lit. Tapping the week line returns to This Week; tapping PLAN in the Helm also returns.
7. **Plan.** `Plan` on a meal → pill becomes `✓ Planned` immediately; toast `{Meal} added to your week ✓` appears with no action and dismisses itself; the week line count goes up by one. Plan two more without leaving. Back on This Week, all three are there in queue order. Nothing lands on Shop.
8. **Planned card.** A placed meal shows `✓ Planned` (disabled). Tapping the **card body** still opens the meal. Tapping the pill does nothing.
11. **Create.** `+ Create` and the Helm's compact + both open the existing New Meal sheet with no intermediate screen; the Galley section works inside it.
15. **(new) Copy check.** The word "board" appears nowhere on the library screen or its toast; "Meal Library" and "Discover. Save. Plan for your week." are gone.

**Done when:** v1's fourteen steps pass with the replacements above, plus step 15, on dev with two accounts.

---

## Open (not blocking)

- New Meal sheet title stays **"New Meal"** while the button says **Create**. Advisor-acceptable; revisit only if it reads as a mismatch in use.
- Sheet section label "Ask AI to build it" vs button "Ask the Galley" — two names for one thing. Parked; not part of this amendment.
