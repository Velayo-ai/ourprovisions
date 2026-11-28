Reported: 2026-11-27 22:01 ET · dev 36d197b · main e93b265 · re: three requests in Claude Code on exp/one-add (one results title; the Meals feeder matches the List feeder; the picker inside the desktop frame) · prompt: none (asked directly in Claude Code)

# Three commits on exp/one-add, all local. Not pushed yet, so the preview doesn't have them. dev and main are untouched.

## 1. One results title: `2a78f70` (flag on only)
"This Week" and "Our list" now share one style: Playfair 400 at 28 (the page-title size), no rule under the title or its row, the same 6px top on both, and the status line 4px under the title. The List row drops its sand hairline and is top-aligned like Plan's, so + Add sits level with the title. Flag off is unchanged.

## 2. The Meals feeder matches the List feeder's chrome: `60b4c4c` (flag on only)
- **Title bar:** "Add to this week" in Playfair 400 at 22, the List feeder's size. The dark Done pill, and a thin rule under the bar running edge to edge.
- **Status line under the title on both feeders:** "What sounds good? · N meals" and "What do we need? · N items". N is the whole library or catalog, not the filtered count.
- **Toolbar:** search · grid/list · filter, the List feeder's order.
- **Rail:** the List rail's chips, with no "All". No chip selected means all; tapping the selected chip again clears it.
- **Add control:** the outlined + circle (36px) on meal cards and rows.
- **On-list mark:** a teal line under the name ("This week" / "On the list"). The control on the right is the ✓ for meals and the stepper for items, never both, so the item row loses its ✓.
  - Readiness now follows "This week" in quiet ink ("This week · To buy"). The spec keeps readiness as information, and this keeps it on the one line.
- Meals stays on its current screen, with the header and Helm showing. Flag off is unchanged.
- **Not changed:** the Meals search field's look and its 44px tool buttons (the List's are 46px). They weren't in the list. Say if you want them matched too.

## 3. The item search layer inside the desktop frame: `7921254` (not flagged; it's a bug fix)
**This bug has been on prod since the one-list promotion.** In the desktop frame, List's + Add picker (and the Ask's item search) covered the whole window, because the layer portals to `document.body` for iOS.
- **The fix is CSS only.** It's still a body child, and nothing in the tree moves.
- **Desktop only** (past 700px, with a mouse or trackpad that can hover): the layer takes the frame's box (top and bottom 24px, 430px wide, radius 22, no scrollbar).
- **Phones never match**, portrait or sideways. A sideways phone is past 700px with the frame live, which is why the rule also needs a mouse or trackpad. The iOS keyboard and viewport code has no changes.
- **To do:** your iPhone check on the preview (keyboard on the first tap, the view following the keyboard), then this fix on dev **separately from the experiment**: a cherry-pick of `7921254`, which doesn't depend on one-add.

## Tests
- **Jest:** 1388/1388 with the flag off and 1388/1388 with it on, after each commit.
- **Local flag-on build** (Cody Test, dev DB):
  - `local/results-titles.js` 9/9: all three results rows share one font, colour, top and status gap, and the Meals feeder bar matches the List feeder bar.
  - `local/one-add.js` 35/35. The Meals step is skipped because the house has no meals.
  - `local/picker-frame.js` 12/12: desktop gets the frame's box; phone portrait and sideways get the whole screen as before; every case is a body child.
- **Meal cards:** I checked them by faking the meals and placements reads in the harness tab only. No meals were written to dev.
  - "This week" sits under a planned meal, with the teal ✓ on the right and outlined + elsewhere.
  - Dinner gives 2 of 4 cards, and Dinner again gives 4.
- After the walks, I read the test place's list back: it's empty. The harness Chrome and the local server are stopped.

## Waiting on you
- **Push `exp/one-add`:** 4 commits (`9f3098d` harness helper, `2a78f70`, `60b4c4c`, `7921254`). The preview rebuilds, and then the iPhone check.
- **The dev fix for the frame bug,** after the iPhone check.
