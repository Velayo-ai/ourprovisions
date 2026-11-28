Reported: 2026-11-28 02:39 ET · dev 36d197b · main e93b265 · re: adding a meal adds its ingredients; un-plan; progress feedback; offline; Review ingredients; Cooked it beside "Everything's in" · prompt: none (asked directly in Claude Code)

# Adding a meal now adds its ingredients, and all six items are built. Pushed to exp/one-add (head 24a6f7f). The preview has rebuilt, every harness check passes on it, and the test house is clean. dev and main are unchanged.

**Headline:** item 5 (Review ingredients) is built with one compromise. An exact version needs a small server change; see item 5.

**New head:** `exp/one-add` = `24a6f7f`
**Preview:** https://ourprovisions-git-exp-one-add-dan-valeyos-projects.vercel.app
- **Bundle:** `main.dd06d72a.js` (deployment `dpl_8ZdTwJaHLuzAHurnCeSNv9NhHuNd`, READY, built from `24a6f7f`)
- **Build tag on the alias:** "dev · 24a6f7f", with `op-one-add:on`.

## The items (flag on; flag off unchanged throughout)
1. **`d0b5713`: adding a meal adds its ingredients.**
   - **The doors:** the Meals feeder's +, the recipe view's "+ Add to This Week", and a meal saved from the feeder.
   - **The path:** all go through the existing `add_meal_to_list`. It puts the meal on This Week and adds every ingredient not marked on hand (on-hand ones skipped). With nothing left to buy, it reads "Everything's in".
   - A meal with no ingredients stays "Nothing to shop for". Client-only, no migration.
   - **Fix found by the harness: `d1137ad`.** A meal whose ingredients were all on hand, planned fresh, never reached "Everything's in". The server's ready stamp needs the meal already on This Week, and the add put it there afterwards. It is now placed first, then added.
2. **`2673856`: un-planning from the feeder** (the ✓ tapped again) takes the meal off This Week and takes off only what that meal added that is still unchecked.
   - **The list can reliably tell.** `add_meal_to_list` records each meal's share per item (migration 039, `list_item_meals.quantity_contributed`). The existing remove path (`takeMealOffList`, used by This Week's ⋯ Remove) subtracts exactly that share.
   - So an item another planned meal needs, or a person added, keeps the rest of its quantity and stays. Checked or in-cart items are never touched; only their link to the meal is released.
   - The ✓ now un-plans in every state. Before, it worked only while nothing was on the list, and with automatic adding that would leave no way back.
   - **Fix found by the harness: `65eaa1f`.** Deleting a meal from its recipe view, opened from the Meals feeder, left the feeder hidden, along with the bottom nav, until a reload. It came from my move onto the full-screen layer.
3. **`b9a41c9`: feedback.** Done is plain again.
   - **The subtitle** arrives as "What do we need?" / "What sounds good?" (no counts). After adds this visit it becomes, in teal after a small outlined check-circle, "N item(s) added" / "N meal(s) added" (singular at 1). Undos count down to the arrival line at 0.
   - **The toasts on close:** "N added" for items; "N meals added · M items on the list" for meals, where M is the items those meals actually put on the list (an un-plan takes its meal's items out of M). With M = 0 (all on hand) it reads "N meals added" alone.
   - **The "Option 3" mockup** was neither in the repo nor on `origin/handoff`, so the line follows your description.
4. **`fdc511f`: offline.** If the app is offline when a meal is planned (its connectivity hold, or the browser reports offline), the meal goes on This Week with nothing added, and its card shows the existing "Add to list" button. That's the only case for the button, besides meals planned before this change.
   - **Caveat:** with no network at all, the plan itself fails, as it always has; nothing about planning is queued offline.
5. **`ecebf87`: Review ingredients**, under the This Week card's ⋯ for a meal with on-hand ingredients.
   - It opens the existing on-hand sheet. "Buy it" items go on the list through the **list's own add**, not `add_meal_to_list`, because that adds every other ingredient again.
   - **The compromise:** recording one item's link to the meal needs a server change. The app can't write that link itself (the security rules deliberately block that update, migration 041), and the server function has no "only these items" mode.
   - **So a reviewed item behaves like one a person added:** un-planning leaves it, and its row carries no meal tag. Also, a meal at "Everything's in" stays at that mark after a Review add.
   - **The exact version:** a small migration (an "only these ingredient ids" mode on `add_meal_to_list`). Your call.
6. **`125d68e`: "Cooked it" back beside "✓ Everything's in",** on This Week and on Home's ON DECK (with Switch). It no longer lives only in ⋯; ⋯ keeps Cooked it for a planned meal, as before. "On the list" still has no button.
- **Harness only: `24a6f7f`.** `week-card.js` now expects the mark straight away; the "Add to list" → mark sequence is the offline case.

## Tests
- **Jest:** 1412/1412 with the flag off, and 1412/1412 with the flag on (ASK + ONE_ADD), at the head. Each commit was also run in both builds.
- **Harness against the preview (`24a6f7f`, Cody Test, dev DB):**

| Check | Result |
|---|---|
| `meal-auto-add` (new, see below) | 24/24 |
| `done-count` (updated: Done plain; "What do we need?" → "3 items added" → undo → "2 items added"; "2 added"; a new visit's arrival; 1 → back) | 7/7 |
| `week-card` (updated) | 4/4 |
| `new-meal` (the meal progress line; the feeder back after a delete) | 14/14 |
| `feeder-rail` | 17/17 |
| `return-add` | 14/14 |
| `home-card` | 10/10 |
| `meal-sections` | 15/15 |
| `landscape-tip` | 11/11 |
| `rail-rule` | 12/12 |
| `picker-frame` | 12/12 |
| `results-titles` | 9/9 |
| `one-add` | 35/35 |

- **`meal-auto-add` steps** (real meals made through the app):
  1. **All on hand:** nothing added; "✓ Everything's in" with Cooked it on This Week and Home's ON DECK.
  2. **Plan:** Apples goes on the list; the card shows "✓ On the list"; the line reads "1 meal added".
  3. **Un-plan:** its own Apples leaves; the line goes back to the arrival line; no toast.
  4. **Shared and person-added, in one visit:** a person adds Carrots, then B (Bananas), then C (Apples, Bananas, Carrots). The line reads "1 meal added" → "2 meals added". Un-plan C → Apples leaves; Bananas (B's) and Carrots (the person's) stay at 1; the line reads "1 meal added". Re-plan C → "2 meals added" and its items are back. The toast reads "2 meals added · 4 items on the list".
  5. **Offline** (the tab's browser reports offline): planned, nothing added, "Add to list"; back online the tap adds it and the mark shows.
  6. **Review:** Garlic + Lemons with Lemons on hand → Garlic added, Lemons skipped. ⋯ "Review ingredients" → the sheet lists Lemons → Buy it → Lemons on the list, Garlic not added twice.
  - Everything was tidied through the app's own Remove and Delete.
  - **Not covered by the harness:** the "checked items stay" rule is covered by the existing remove path's tests, and the recipe view door is covered by Jest's source check, as it uses the same handler.
- **Cleanup read-back:** Cody Test House has 0 live list rows, 0 live meals, 0 open placements, 0 harness catalog items and 0 open trips.
  - Two failed local runs had left test meals with nothing on the list ("Auto Shared/Three omkh", "Auto All In wk5f").
  - I closed their placements and soft-deleted them as the test account (the same writes the app's Remove and Delete make) and read them back as gone.

## Pushed (exp/one-add only, 94ce65f → 24a6f7f)
- `d0b5713` add ingredients
- `2673856` un-plan
- `65eaa1f` feeder back after a delete
- `b9a41c9` feedback
- `fdc511f` offline
- `ecebf87` Review ingredients
- `125d68e` Cooked it
- `d1137ad` all-on-hand fix
- `24a6f7f` harness

The pre-push range was exactly these nine commits.

## dev / main (git ls-remote)
- **Before:** dev `36d197b`, main `e93b265`
- **After:** dev `36d197b`, main `e93b265`. Both are unchanged.

## Not done, by instruction
- **`7921254` is not on dev.** It waits for your iPhone check.
