Reported: 2026-11-27 22:42 ET · dev 36d197b · main e93b265 · re: the Meals feeder onto the List feeder's full-screen layer; "+ New meal" (section header + no-match row) · prompt: none (asked directly in Claude Code)

# The Meals feeder is now the List feeder's full-screen layer, and it has two "+ New meal" doors. Pushed to exp/one-add (5ca4733), and the preview has rebuilt. dev and main are unchanged.

**New head:** `exp/one-add` = `5ca4733`
**Preview:** https://ourprovisions-git-exp-one-add-dan-valeyos-projects.vercel.app
- **Bundle:** `main.d40b3ac7.js` (deployment `dpl_8yukchhgXD1dcD4AzqorxBewmvQG`, READY, built from `5ca4733`)
- **Build tag on the alias:** "dev · 5ca4733", with `op-one-add:on`.

## 1. `0387bed`: the Meals feeder on the List feeder's layer (flag on)
- **Full screen:** "Add to this week" is now ItemSearchView, the same layer as the List feeder. No household header and no Helm. On desktop it sits inside the frame.
- **Fixed top:** title bar + Done, the search field, grid/list · View & filter, and the rail. Only the cards scroll.
- **Keyboard:** every add-a-meal door opens the layer inside the tap (`show()`), so the keyboard rises on the first tap and the view follows the visible area. These are the layer's own iOS rules, not copies. The doors are: This Week's + Add, the empty week's welcome, the Helm's +, Home's deck, and the List guide's "Plan a meal".
- **Contents unchanged:** cards, filters, ✓ / This week, View & filter.
- **The move was not large.** MealsLens kept all its own state; nothing was lifted out. A `feeder` prop renders it on the layer.
  - Its sheets (Set type, View & filter) render beside the layer in the app's tree, and the layer steps aside while they're up, as the List feeder does. Inside the layer, iOS's no-drag guard would block their scrolling.
  - The layer also steps aside for a recipe, the new-meal sheet, a gift and the on-hand prompt.
- **Removed:** the in-page "Add to this week" bar and the Meals search-row CSS from `f656b54`. Both are dead code now that the layer replaces them.
- **Flag off is unchanged:** the library screen renders the same DOM.

## 2. `5ca4733`: "+ New meal" (flag on)
- **(a)** "＋ New meal" beside the first section header, like the List feeder's "＋ New item". The header reads "Our meals", or the rail's word while a chip is picked ("Dinner").
- **(b)** A search with no match shows "Create “{query}” as a new meal", and the new-meal sheet opens with that name filled in.
- **On save:** both open the existing new-meal sheet, and saving puts the meal on This Week. Its card shows the teal "This week" and the ✓.
- **Unchanged:** the "Something new?" coaching tile and View & filter → Manage → "+ New meal" still create without planning.
- **Flag off** keeps the library screen's "+ New".
- **No section header on an empty library.** With 0 meals, the empty state's "Something new? + New meal" tile is the door instead.

## Tests
- **Jest:** 1390/1390 with the flag off, and 1390/1390 with the flag on (ASK + ONE_ADD).
  - The existing Meals tests pass.
  - `ListGuide.test`'s pin on the `guidePlan` source line now states both builds. Its flag-off branch is the same `setPlanScreen("library"); goToDoor("plan")`.
  - `oneAdd.test` has new source checks for the layer, the doors, and both "+ New meal" entry points.
- **Harness against the preview (`5ca4733`, Cody Test, dev DB):**
  - **`local/feeder-rail.js` (new), 16/16.** On both feeders: full screen (the layer at the top, no Helm), the field focused on open, and a rail under the field. Scrolling the list to its end leaves the title bar, field and rail where they were, with the rail on screen. Both sit inside the phone frame on desktop.
    - Cody Test House has no meals, so the Meals half fakes the meals and placements reads in its own tab (14 meals) and aborts any write.
  - **`local/new-meal.js` (new), 9/9.** It checks both doors: (b) the prefilled name and (a) the empty sheet. After each save it checks the card's teal "This week" + ✓, and the DB (one live meal, an open placement). Then it deletes both meals through the app's own delete (recipe → Edit → Delete meal → Yes) and reads the DB back: no live meal and no open placement.
    - These are real writes by the test account, as normal app use.
  - `local/one-add.js` 35/35. The Meals steps now run on the layer, and the field is focused on open.
  - `local/picker-frame.js` 12/12.
  - The same set also passed on a local flag-on build, plus `local/results-titles.js` 9/9.
- **Cleanup read-back:** Cody Test House has 0 live meals and 0 open placements. The 4 harness meals from the two runs are soft-deleted with their placements closed as skipped.

## Pushed (exp/one-add only, f656b54 → 5ca4733)
- `0387bed` The Meals feeder moves onto the List feeder's full-screen layer (flag on)
- `5ca4733` "+ New meal": beside the first section header, and a search's no-match row (flag on)

The pre-push range was exactly these two commits.

## dev / main (git ls-remote)
- **Before:** dev `36d197b`, main `e93b265`
- **After:** dev `36d197b`, main `e93b265`. Both are unchanged.

## For your walk / open
- **iPhone:** the Meals feeder's keyboard on the first tap and the view following the keyboard (it is the List feeder's layer now). The desktop-frame fix `7921254` is still not on dev, pending this check.
- **New-meal flows:** should the coaching tile and Manage's "+ New meal" also put the new meal on This Week? Right now only the two new doors do.
