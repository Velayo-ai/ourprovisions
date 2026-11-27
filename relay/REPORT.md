Reported: 2026-11-27 15:06 ET · dev 36d197b · main e93b265 · re: Build the "one add" experiment on a preview branch · prompt: local download handoff/PROMPT.md (the push to origin/handoff was blocked; no prompt sha)

# One add is built on its own preview, A–E, behind its flag. Step 0 passed. dev and main are untouched. The harness passes everything it can drive. Your phone walk is next.

**Preview:** https://ourprovisions-git-exp-one-add-dan-valeyos-projects.vercel.app (branch `exp/one-add`; bundle `main.0d4e6bdc.js`, built from `0e84a89`; build tag "dev · 0e84a89").

## Step 0: PASS
- **Loads:** the branch alias serves HTTP 200. No deployment protection on the project.
- **Dev Supabase, by ref:** the bundle's only Supabase URL is `zxwtxjjmssykhqrghouf.supabase.co`.
- **Clerk:** the Preview key is the development instance (`many-puma-34.clerk.accounts.dev`). Cody Test signs in on the alias (device code 424242), loads Cody Test House, and keeps the session across a reload and a Chrome restart. **I changed nothing in Clerk.**
- **Flag:** the bundle has `op-one-add:on` and `op-ask:on`. The dev bundle has no `op-one-add:on`, and neither does a flag-off build.

## Settings I changed (both with your OK in Claude Code)
1. **A Vercel env var, scoped to the branch:** `REACT_APP_FEATURE_ONE_ADD=on` (id `x08tEfcVPK2VH3Yc`), target Preview, gitBranch `exp/one-add` only. Not set for Production or for the dev branch. Delete it if the branch is killed.
2. **The Ignored Build Step now builds `exp/*` as well,** permanently, as you ruled. The old step built only main and dev, so the first push was cancelled. The new step is `if [ "$VERCEL_GIT_COMMIT_REF" = "main" ] || [ "$VERCEL_GIT_COMMIT_REF" = "dev" ]; then exit 1; fi; case "$VERCEL_GIT_COMMIT_REF" in exp/*) exit 1;; esac; exit 0`. I tested it in sh: main, dev and exp/* build; handoff, relay and every other branch are still skipped. The A–E push built on its own (`dpl_E1d3kUZHNvQh2igyDrdxzpxrLyJp`).

## Commits on exp/one-add (each flag-gated; with the flag off it is today's app)
- `5b97826` Step 0: the flag, its bundle marker, and `OP_BASE_URL` for the harness
- `d2ef9f4` **A (R1)**: HOME · PLAN · LIST; `#/browse` lands on List with the picker closed; Plan is This Week only; + Add opens the Meals feeder, "Add to this week" + Done, and Done says "N added"; Our list gets a status line; the empty List shows Add items and Plan a meal
- `510071c` **B (R2)**: the List picker becomes the feeder: aisle sections or A–Z, a grid/list toggle, ＋ New item per aisle and at the end, "Search our provisions…". The first-tap keyboard rules are untouched. Sheets the feeder opens sit below its portal, so the feeder steps aside while they are up and comes back when they close.
- `3806ef4` **C (R3)**: the rail is ★ Staples · one Ask pill | aisles. 0 asks: no pill. 1: "Ask {name}". 2+: "Ask…", a chooser of every ask with "+ New ask". The staples hint shows on the first 3 visits per device while the household has no staples. Feeder rows take Browse's swipe (Hide / Edit / ★ Staple) and show ★ on staples.
- `9f71dc1` **D (R4)**: one "View & filter" sheet per feeder, View → Filter → Manage → Clear / Show N (items or meals)
- `6208a45` **E (R5)**: one add control and one mark. The circle + adds; once on the list, the teal ✓ shows with one line ("On the list" / "This week"), and the stepper appears after the ✓. On meals, readiness ("To buy" / "Ready") sits on a second line.
- Harness: `90afae9`, `72d1d58`, `a14ff5f`, `0e84a89` are pushed. **`9f3098d` is local, not pushed:** a fix to the walk helper (dismiss the new-member welcome, DOM clicks). Pushing it changes nothing in the app.

## Tests
- **Jest:** 1388/1388 with the flag off, and 1388/1388 with ASK and ONE_ADD on. The Ask, ListPicker and LandscapeStaples tests pass with the flag off. Two Ask source tests pin literals, and the code keeps them (a flag-off branch and an aria-label spread), so those tests are unedited. `ListGuide.test` now states both builds; its flag-off expectations are unchanged.
- **Flag-off production build:** compiles, with no `op-one-add:on`.
- **Harness against the preview** (Cody Test, dev DB):
  - `local/one-add.js remote` (the Verify list): **35/35**, plus 1 skip. Cody Test House has 0 meals, so the Meals feeder's search, sheet, rail and ✓ can't be walked; Jest renders the Meals sheet instead, and the Meals look is yours to judge.
  - **shop-burst 9/9 ALL PASS. wagon 28/28 ALL PASS**, with the hand-back landing on List ("Wagon added 4 · See"). **ask-offline 31/31.**
  - All three walks now open runs and add items through + Add on a build without Browse, and still use Browse everywhere else.
- **First run on the preview, for honesty:** the new-member welcome (R12) showed on this new origin, covered + Add, and stopped my helper. During that run, shop-burst's Undo all put back 5 of 6. It passed (1 → 7) on a clean re-run, so I'm treating it as a one-off. The helper now taps Got it.
- **Cleanup:** after every walk the house was read back with 0 live rows and 0 open trips. I removed the leftovers from the stopped runs and ended one trip.

## Stopped, or left out, by the guardrails
- **Starred meals: not built.** There is no starred-meal flag (`household_staples` and Ask shelves both key on `catalog_item_id`), so it would need a column. The Meals rail has no ★.
- **Ask on Meals: left out.** Asks hold catalog items only, not meal shelves.
- **The Meals feeder is the library screen, not ItemSearchView.** It is titled "Add to this week" with Done, and has its own search ("Search our meals…"), rail, sheet and ✓. Its search does not raise the keyboard on the first tap the way the List feeder's does. Moving it onto ItemSearchView would mean rewriting the library.
- **Filter on items has no "who" or history.** Catalog items carry neither, so items filter on Staples and aisles only.
- **No migrations.** The only Supabase writes were normal app use by the test account, plus walk cleanup.

## Open questions for you
1. **Status line copy (draft):** "4 items · 2 aisles". Once something is in the cart: "3 to get · 1 in the cart".
2. **Where "+ New ask" lives:** I put it in the chooser and in View & filter → Manage, as proposed. Does that hold on your walk?
3. **Starred meals:** do you want a column for it (a migration on dev first)?
4. **The fresh-row undo (one list R8 revised) is replaced in the feeder by the stepper's −.** Tapping an on-list row does nothing, and − at 1 takes the item off. Is that the right way back?
5. **Two lines of new copy (draft):** the guide's Add items line, "Search, or pick from our aisles and staples.", and the welcome's Browse line, which now reads "Ask when someone else should choose".

## dev / main heads
Before: dev `36d197b`, main `e93b265`. After: dev `36d197b`, main `e93b265`, both unchanged. `exp/one-add` is at `0e84a89` on origin.

Next: walk the preview on your phone (keyboard on the first tap, the rail and the chooser, both View & filter sheets, the ✓ and the stepper, the Meals feeder with your meals). Then decide: promote or kill.
