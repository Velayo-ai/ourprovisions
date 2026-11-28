Reported: 2026-11-28 00:41 ET · dev 36d197b · main e93b265 · re: meal-type sections + icons (878bb82, c2b42d6); Home list card empty state; Home meal card copy; plates watch item · prompt: none (asked directly in Claude Code)

# Four commits since the last report, all pushed to exp/one-add (head 45d8d29). The preview has rebuilt, and every harness check passes on it. dev and main are unchanged.

**New head:** `exp/one-add` = `45d8d29`
**Preview:** https://ourprovisions-git-exp-one-add-dan-valeyos-projects.vercel.app
- **Bundle:** `main.7e607508.js` (deployment `dpl_7xFggzir5YYzdheEeK2BGjaZMUAq`, READY, built from `45d8d29`)
- **Build tag on the alias:** "dev · 45d8d29", with `op-one-add:on`.
- **Two pushes this round:** `4bd03e1 → c2b42d6` (sections + icons; preview `main.7039acc6.js`, where the full harness also passed), then `c2b42d6 → 45d8d29` (the two Home items).

## Commits (flag on; flag off unchanged throughout)
1. **`878bb82`: the Meals feeder in sections.**
   - **By type** is the default: one section per meal type in the app's order, with "No type yet" last, in the List feeder's header style.
   - **Section links:** "+ New {type} meal" opens the new-meal sheet with that type picked; "No type yet" gets "+ New meal". The long form falls back to "+ New meal" if it would wrap.
   - **Placement:** a meal sits under its first type, the one its card names. With a rail chip picked, everything shown sits under that one section.
   - **View & filter → View** offers "By type" / "A–Z". A–Z shows letter headers with one "+ New meal" at the top. A search stays one flat set.
   - **Cards:** the "+ New meal" card is gone. "✨ Ask the Galley" is the first card, full width above the sections.
2. **`c2b42d6`: icons.**
   - **Rail chips:** on both feeders they are text only, except ★ Staples and ✋ Ask…. Section headers keep their icons.
   - **Meal types** get emoji in the aisle icons' family, on the section headers and as a photo-less card's placeholder: Dinner 🍽️, Lunch 🥪, Dessert 🍰, Drinks 🍹 (🥛 is already Dairy's).
   - **The other types are draft picks,** so no header is bare: Breakfast 🍳, Snacks 🥨, Sides 🥗, Appetizers 🍢.
   - **Untyped:** "No type yet" has no icon, and its cards keep the neutral line-drawn plate.
3. **`66c5c79`: Home list card, empty state.** It reads LIST / "Let's build our list." in the deck's title style, the same as "What sounds good?" (Playfair 700 24px, measured). The button is "+ Add items" and opens the List feeder. With items it's unchanged ("N things to get" + "Open list"), and the landscape tip line is as built.
4. **`45d8d29`: Home meal card, nothing on deck.** The button reads "+ Add a meal", and the line reads "Build or choose a meal, and we'll add what it needs." (the empty List's "Plan a meal" line).

## Watch item, no change: the two plates
- **The setup:** side by side in A–Z (faked meals, preview build), "Bean Soup" (untyped) next to "Beef Stew" (Dinner).
- **Same subject:** both are a plate with fork and knife.
- **Different look:**
  - The untyped card has a brown line drawing on the grey "untagged" band, with "+ Set type" under its name.
  - The Dinner card has the coloured 🍽️ emoji on Dinner's sand band, with "Dinner · 0 items".
- **Verdict:** at a glance they read as the same picture, told apart by colour, band and meta line. Left as built, as asked.
- **The screenshot** is in Claude Code's working tree at `qa/one-add/plates-dinner-vs-untyped-2026-11-28.png` (untracked, not committed). The relay branch holds only this file.
- **Caveat:** the harness renders Windows' emoji. On an iPhone, 🍽️ is Apple's emoji, which is also a plate with fork and knife.

## Tests
- **Jest:** 1403/1403 with the flag off, and 1403/1403 with the flag on (ASK + ONE_ADD), at the head. Each commit was also run in both builds.
  - `LibraryCards.test`'s two placeholder tests now state both builds.
  - A new test renders the meal card's empty state in both builds.
- **Harness against the preview (`45d8d29`, Cody Test, dev DB):**

| Check | Result |
|---|---|
| `feeder-rail` | 16/16 |
| `return-add` | 14/14 |
| `home-card` (updated: the new heading in the deck's title style, LIST, the meal card's "+ Add a meal" and line) | 8/8 |
| `new-meal` ("✨ Ask the Galley" first, "No type yet" → "+ New meal") | 11/11 |
| `meal-sections` (new: order, header style and icons, links at 390 and 320 wide, "+ New Dinner meal" → Dinner picked, a chip's one section, By type / A–Z, card placeholders, text-only chips) | 14/14 |
| `landscape-tip` | 11/11 |
| `rail-rule` (adds text-only chips) | 12/12 |
| `picker-frame` | 12/12 |
| `results-titles` | 9/9 |
| `one-add` | 35/35 |

  - The meals in `meal-sections` and the plates shot are faked in that browser tab only.
  - `new-meal` and `return-add` wrote to dev as normal app use and deleted what they made through the app's own delete paths.
- **Cleanup read-back:** Cody Test House has 0 live list rows, 0 live meals, 0 open placements, 0 harness catalog items and 0 open trips.

## dev / main (git ls-remote)
- **Before the first push:** dev `36d197b`, main `e93b265`. **After the second:** dev `36d197b`, main `e93b265`. Both are unchanged.
- **Pre-push ranges:** exactly `878bb82`, `c2b42d6`, then exactly `66c5c79`, `45d8d29`.

## Not done, by instruction
- **`7921254` is not on dev.** It waits for your iPhone check.
