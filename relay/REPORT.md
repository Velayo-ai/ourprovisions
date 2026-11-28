Reported: 2026-11-28 01:18 ET · dev 36d197b · main e93b265 · re: Done · N; This Week cards; Home ON DECK (2b) and highlight (2c); the untyped placeholder; the meal → ingredients question · prompt: none (asked directly in Claude Code)

# Six commits pushed to exp/one-add (head 94ce65f). The preview has rebuilt, and every harness check passes on it. dev and main are unchanged. Your meal → ingredients question is answered at the end: "we'll add what it needs" is not true today.

**New head:** `exp/one-add` = `94ce65f`
**Preview:** https://ourprovisions-git-exp-one-add-dan-valeyos-projects.vercel.app
- **Bundle:** `main.d6366b46.js` (deployment `dpl_75niBoRUexNZ8q1DRK5U2kuVL9es`, READY, built from `94ce65f`)
- **Build tag on the alias:** "dev · 94ce65f", with `op-one-add:on`.

## Commits (flag on; flag off unchanged throughout)
1. **`546c5d2`: live count on Done, both feeders.**
   - The pill reads "Done · N" after the first add and plain "Done" at 0.
   - **List:** N is adds this visit minus undos; a row taken back off with − no longer counts.
   - **Meals:** N is the meals on This Week now that weren't when the feeder opened; un-planning one takes it back off the count.
   - The "N added" toast on close stays.
2. **`4fca49f`: This Week cards.** The "Planned" chip and the "Not on the list yet" line are gone.
   - Ingredients not on the list: only "Add to list".
   - Once added: the teal mark "✓ On the list", or "✓ Everything's in" (all on hand via 064's stamp, or wrapped up), and **no button**.
   - "See on list", "Wrap up →" and "Cooked it" leave the card at rest. **"Cooked it" moves into ⋯ for an "Everything's in" card,** so cooking stays reachable from This Week; a planned card already had it there.
   - **Side effect:** when everything is in the cart, the card no longer shows "Wrap up →". The recipe view keeps that nudge, and the Wrap up bar on List is unchanged.
   - A planned meal with no ingredients keeps "Nothing to shop for". No bulk "Add ingredients" card.
3. **`8179e1a`: a fix the harness found.** The Meals feeder's Done now empties its search, as the List feeder's always has. It was left behind in the move onto the full-screen layer: the next open showed the old search. Filters, view and By type / A–Z still stay across opens.
4. **`6526e5b` (2b): Home's ON DECK card, same rule.**
   - No "Not on the list yet". Not on the list: "Add to list" + Switch.
   - Once added: the teal mark "On the list" / "Everything's in" + Switch, and no "Cooked it" at rest. On Home, "Cooked it" for a meal whose ingredients are all in is now on This Week's ⋯ and in the recipe view.
   - A planned meal with no ingredients keeps "Nothing to shop for" + Cooked it.
   - The LIST and ON DECK labels stay. Switch shows only with 2+ meals on This Week, as before.
5. **`b100cde` (2c): Home's highlight.**
   - **Empty list:** the LIST card takes the empty List's "Add items" treatment: light teal fill (#E3F1EE), a 2px teal border, and a teal "+ Add items" button. The padding is 2px less, so the card keeps its size.
   - **With items:** sand, like ON DECK.
   - ON DECK is never highlighted, so Home has at most one highlighted card.
6. **`94ce65f`: untyped meal placeholder.** A plain tile: the same grey band and size, with no glyph or drawing, so it can't pass for Dinner's 🍽️. Typed cards keep their type emoji.
   - **Screenshots** in Claude Code's working tree (untracked, not committed): `qa/one-add/plates-dinner-vs-untyped-2026-11-28.png` (before) and `qa/one-add/plates-after-plain-tile-2026-11-28.png` (after).

## Report only, no change: meal → ingredients
**Today: no, it is not automatic.** Putting a meal on This Week only writes its placement; nothing touches the list.

- **The path:** every "put it on This Week" door ends in `handlePlanMeal` → `planMeal` → `appendPlacement`, which writes one `meal_placements` row and no list rows. The doors are:
  - the Meals feeder's + on a card;
  - the recipe view's "+ Add to This Week";
  - a meal saved from the feeder's new-meal doors (`planOnSave`).
- **What the user sees:** the card shows "This week" in the feeder, and on This Week the card shows "Add to list" (Home's ON DECK the same, if it's first). The ingredients are not on the list.
- **What actually adds them:** only an explicit "Add to list", on the This Week card, Home's ON DECK, the recipe view's add, or "add to the list →" in This Week's subtitle (all of the week's planned meals). All of these use `handleAddMealToList` → the `add_meal_to_list` RPC.
  - If any ingredient is flagged on hand, the on-hand prompt asks first ("Buy it" / "I have it").
  - "I have everything" makes the RPC stamp the placement ready (064), shown as "Everything's in".
- **So "Build or choose a meal, and we'll add what it needs."** on Home and the empty List **overstates today's behaviour.** The app adds what it needs only after the "Add to list" tap.

**What automatic adding would take: client-only, no migration.** The RPC already does what's needed.
- **What the RPC already does:**
  - `add_meal_to_list(p_meal_id, p_servings, p_cycle_id, p_include_on_hand_ids)` adds the meal's ingredients.
  - It **skips on-hand ingredients by default**, the same as the prompt's default "I have it".
  - With nothing left to add, it stamps the placement ready (064).
  - `addMealToList` in the client also places the meal if it isn't on This Week yet.
- **Plan = add (client):** in the plan handler, a meal with ingredients goes through `addMealToList(mealId, 1, [])` with no prompt. That adds the non-on-hand items, or reads "Everything's in" when all are on hand. A meal with no ingredients keeps `planMeal`, so it doesn't read "Everything's in". The card then lands as "✓ On the list" straight away.
- **"Review ingredients" under ⋯ (client):** a ⋯ item on the This Week card (and in the recipe view) that opens a review sheet.
  - The existing `OnHandPrompt` covers adding the skipped on-hand items: "Buy it" re-runs `addMealToList` with those `includeIds`, and the RPC adds only those.
  - For taking off an item that went on, the sheet would list the meal's live rows with the List's own −. Both writes exist today.
- **Things that would need deciding (all client-side):**
  - **Un-planning from the feeder:** the ✓ only un-plans a meal in the "planned" state; it is inert once its items are on the list. With automatic add, every planned meal would be "on the list" at once. Un-plan would need to become "Remove (and take its items off the list)", the existing `skipMeal(id, { zeroList: true })` that This Week's ⋯ Remove uses.
  - **The toast:** one per plan ("Tacos added · N to get"), or folded into Done's "N added".
  - **Offline:** the RPC needs a connection. An offline plan would need the off-grid message the feeders already use, or a queue, which doesn't exist for meals today.

## Tests
- **Jest:** 1409/1409 with the flag off, and 1409/1409 with the flag on (ASK + ONE_ADD), at the head. Each commit was also run in both builds.
  - `AllOnHand`, `CookedItSurfaces` and `ReplayLabels` now state both builds. With the flag off they still expect the chip, the line, See on list, Wrap up → and Cooked it.
  - New tests render the This Week card and Home's ON DECK in every state, and the untyped placeholder.
- **Harness against the preview (`94ce65f`, Cody Test, dev DB):**

| Check | Result |
|---|---|
| `done-count` (new: plain Done, add 3 → "Done · 3", undo 1 → "Done · 2", the "2 added" toast) | 5/5 |
| `week-card` (new, see below) | 6/6 |
| `home-card` (adds the highlight, and sand with items) | 10/10 |
| `meal-sections` (adds: the untyped slot is empty and the same size as a Dinner card's) | 15/15 |
| `feeder-rail` (adds: Done empties the Meals search) | 17/17 |
| `new-meal` (adds the Meals feeder's "Done · 1" → "Done · 2") | 13/13 |
| `return-add` | 14/14 |
| `landscape-tip` | 11/11 |
| `rail-rule` | 12/12 |
| `picker-frame` | 12/12 |
| `results-titles` | 9/9 |
| `one-add` | 35/35 |

  - **`week-card` steps:** a real meal made in the Meals feeder with one ingredient. On This Week: "Add to list" alone. Home's ON DECK: the same. After the tap: "✓ On the list", no button, on both. The DB read back. Tidied through ⋯ Remove and the app's Delete.
  - The "Everything's in" state is covered by Jest.
- **Cleanup read-back:** Cody Test House has 0 live list rows, 0 live meals, 0 open placements, 0 harness catalog items and 0 open trips.
  - One local `week-card` run (before the search fix) left one test meal ("Week Card zz81q"), with its placement already closed and nothing on the list.
  - I soft-deleted it as the test account (`meals.deleted_at`, the write the app's own Delete makes) and read it back as gone.

## Pushed (exp/one-add only, 45d8d29 → 94ce65f)
- `546c5d2` Done · N
- `4fca49f` This Week cards
- `8179e1a` Meals Done empties its search
- `6526e5b` Home ON DECK
- `b100cde` Home highlight
- `94ce65f` untyped placeholder

The pre-push range was exactly these six commits.

## dev / main (git ls-remote)
- **Before:** dev `36d197b`, main `e93b265`
- **After:** dev `36d197b`, main `e93b265`. Both are unchanged.

## Not done, by instruction
- **`7921254` is not on dev.** It waits for your iPhone check.
