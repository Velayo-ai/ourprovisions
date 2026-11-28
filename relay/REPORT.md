Reported: 2026-11-27 23:54 ET · dev 36d197b · main e93b265 · re: Dan's household test with Helen and Elly — the consolidated list (titles, Meals layer, creating new things, rail rule, Home card, Helm +, empty List copy, landscape tip) · prompt: none (asked directly in Claude Code)

# Every item on the list is built or confirmed on exp/one-add, pushed to 4bd03e1. The preview has rebuilt, and every harness check passes on it. dev and main are unchanged.

**New head:** `exp/one-add` = `4bd03e1`
**Preview:** https://ourprovisions-git-exp-one-add-dan-valeyos-projects.vercel.app
- **Bundle:** `main.bb252333.js` (deployment `dpl_fuRjV2eFd2xYM5vGEvrV1EFFWCse`, READY, built from `4bd03e1`)
- **Build tag on the alias:** "dev · 4bd03e1", with `op-one-add:on`.

## The list, item by item (flag on; flag off unchanged throughout)
1. **Results titles: confirmed, no change** (`2a78f70`). "This Week" and "Our list" share Playfair regular, no rule, the same top spacing, and the status line below.
2. **Meals feeder = List feeder: done** (`0387bed`, pushed earlier).
   - It is the same full-screen ItemSearchView layer: no header or nav, a fixed top (title bar + dark Done + thin rule, search, toolbar, rail), and only the cards scroll.
   - The keyboard rises on the first tap, and the layer sits inside the frame on desktop. The search field and the 46px tools are the List feeder's own.
   - **The move was not large:** MealsLens kept its state; nothing was lifted out.
3. **Creating new things** (`5c8cf25`).
   - **List search:** the placeholder is "Type anything, or scroll and tap".
     - With no exact match, the first row is a teal "+ Add “{query}”". It creates the item and puts it on the list in a **guessed aisle**, shown as an editable pill. Tapping the pill shows every aisle as the Ask create card's pills.
     - The guess comes from the household's own catalog: the most shared words win, then the item whose whole name the query covers ("cherry tomatoes" → Produce, not Pantry's "Canned Tomatoes"). With no shared word, it falls back to Other.
     - The return key does the same; with an exact match it adds that item. The field then empties and keeps the focus.
   - **Section links** read "+ New {aisle} item" with that aisle prefilled, or "+ New item" when the long form would wrap (measured live). At 390 and 320 wide, every link in the test place fits its long form.
   - **Meals:** the placeholder is "Type a meal, or scroll and tap".
     - The first two cards are "+ New meal" and "✨ Ask the Galley" ("Not sure what to cook? Get ideas."). The Galley card opens the existing new-meal sheet scrolled to its Galley composer, so the Galley is reachable.
     - The no-match row reads "Create “{query}” as a new meal" and prefills the name.
     - There's no section-scoped link (the earlier "Our meals + New meal" header is gone).
     - A meal saved from any of these goes on This Week with the "This week" mark.
4. **Rail rule, both feeders** (`f3fc3ef`).
   - ★ Staples toggles, and combines with one category as the **intersection**. Before, Staples + an aisle with no staples quietly showed every staple.
   - The empty intersection reads "No {aisle} staples yet. Star one to keep it up front." with "Show all {aisle}", which clears Staples.
   - Category chips are single-select: another switches, the selected one clears. Several categories only through View & filter.
   - The Ask pill never shows selected. The Meals rail already followed this rule.
5. **Home list card: done** (`1162ce0`). Near the top, in the meal card's style.
   - Empty: "Our list is empty" + "+ Add items", which opens the List feeder.
   - With items: "N things to get" + "Open list".
6. **Helm +: confirmed, no change.** On This Week, its + opens the Meals feeder; on List, it opens the List feeder. The Helm is hidden under both feeders, so there's no floating + inside them. It still appears once the screen's own + Add has scrolled off, as before. If you want it shown all the time on the results screens, say so.
7. **Empty List copy** (`62f6c7c`). "Plan a meal" now reads "Build or choose a meal, and we'll add what it needs."
8. **Landscape tip** (`4bd03e1`).
   - The empty List shows "Tip: turn your phone sideways to add our staples." with a rotating-phone icon.
   - Home's empty list card shows "+ Add items · or turn your phone sideways for our staples".
   - Who sees it: phones only (coarse pointer, short screen side ≤ 500px, landscape staples' own measure), with 8+ staples and no Ask run.
   - One localStorage record per device, shared by both places, with every access guarded. It is gone for good after 3 shows or the first real landscape use, and in the second case it goes at once.
- Harness only: `330df03` (one-add.js reads the new placeholders).

## Tests
- **Jest:** 1400/1400 with the flag off, and 1400/1400 with the flag on (ASK + ONE_ADD), at the head.
  - Each commit was also run in both builds.
  - The `guessAisle`, `railCategoryTap` and landscape-tip rules have unit tests.
- **Harness against the preview (`4bd03e1`, Cody Test, dev DB):**

| Check | Result |
|---|---|
| Rail stays visible after scrolling, both feeders (`feeder-rail`) | 16/16 |
| Return-to-add (`return-add`) | 14/14 |
| Home card (`home-card`) | 7/7 |
| Both "+ New meal" entry points + "✨ Ask the Galley" (`new-meal`) | 11/11 |
| Landscape tip gate (`landscape-tip`) | 11/11 |
| Rail rule (`rail-rule`) | 11/11 |
| `one-add` | 35/35 |
| `picker-frame` | 12/12 |
| `results-titles` | 9/9 |

  - **Faked in the browser tab only, never written to dev:**
    - Meals in the rail check: the test place has none.
    - Staples in the empty-intersection and "fewer than 8" checks: every aisle here has a staple.
  - **Real writes, as normal app use:**
    - new-meal created meals and deleted them through the app's own Delete.
    - return-add created items and deleted them through the app's own RPCs (`remove_list_item`, `delete_custom_catalog_item`).
  - The Ask-run term of the tip is covered by Jest only.
- **Cleanup read-back:** Cody Test House has 0 live list rows, 0 live meals, 0 open placements, 0 harness catalog items and 0 open trips. The landscape-tip record was removed from the harness browser.

## Pushed (exp/one-add only, 5ca4733 → 4bd03e1)
- `1162ce0` Home's list card
- `5c8cf25` Creating new things
- `62f6c7c` Empty List copy
- `f3fc3ef` The rail rule
- `330df03` harness: the new placeholders
- `4bd03e1` The landscape tip

The pre-push range was exactly these six commits.

## dev / main (git ls-remote)
- **Before:** dev `36d197b`, main `e93b265`
- **After:** dev `36d197b`, main `e93b265`. Both are unchanged.

## Not done, by instruction
- **`7921254` is not on dev.** It waits for your iPhone check of the keyboard and the viewport follow. The Meals feeder now uses the same layer, so the check covers both feeders.

## For your walk
- The guessed-aisle pill on real names, the "+ New {aisle} item" links, the two Meals cards and the Galley opening.
- Staples + an aisle.
- The tip on a phone, if your household has 8+ staples. The 3-show limit counts per device.
