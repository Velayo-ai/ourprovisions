# design_handoff.md — 2026-11-17 design chat

**Carries unmerged handoff `45969bf`** (and its earlier revision `9d1ad5c`). Both are the launch handoff `a34e86b`, **already merged** on dev in `7b244cb`, plus later additions. **Do not log the launch entry again.** The only unmerged content was the three real-world findings F1–F3; they are reproduced under "Carried from `45969bf`" below, and this session resolved all three. Mark `45969bf` and this handoff consumed.

=== SESSION_LOG ===

### [2026-11-17] — [OurProvisions] — Ask setup polish (F1–F3) from the first real-world Ask: replace a photo in setup, search in its own view, create an item inline; live on prod and walked
**Goal:** Fix the three snags Dan hit setting up "Ask Fia" for a friend on prod, hours after the Ask launch. Design chat 2026-11-16 21:04 → 2026-11-17 01:29 ET, same chat session as the launch (handoff `a34e86b`, merged in `7b244cb`). Claude Code built on dev `84a5bfe` → `dee45ae` (18 commits); a second chat session pushed three of them (below).

**Carried from `45969bf` (verbatim, the unmerged part):**
- **Real-world findings, prod, 2026-11-16 evening.** Dan set up "Ask Fia" for a friend. Captured, not designed or specced yet; the proposed direction is in brackets.
  - **F1: you can't replace a photo while creating an Ask.** Once a shelf photo is added during setup, the only way to swap it is to save and then go into Manage categories & asks. [Tapping a photo in setup opens Replace / Remove, the same as Manage.]
  - **F2: on a phone, the keyboard hides item search results while typing.** Confirmed by Dan's screenshot (IMG_6882, 21:03): it's the **New ask screen, "THE ASK · 0 ITEMS" search field**. It sits below What / How many / How it looks, so with the keyboard up only 2 results show, and iOS's form-assistant bar (˄ ˅ ✓, part of the installed app and not ours to remove) covers the third. Dan had to slide the view up. [On focus, scroll the field to the top of the visible area, just under the header, so the results get the space between it and the keyboard. Size the results to `visualViewport.height`, which already excludes the keyboard and that bar. Then check Browse and the helm "+" sheet for the same problem.]
  - **F3: you can't add a brand-new item while creating an Ask.** Dan had to close setup, add the item in Browse, then start the Ask over. [Bring Browse's search-first "no results → create item" card into the Ask shelf picker, so creation happens inline and setup keeps its state. This relates to the 11-14 note that the helm "+" sheet doesn't share the Browse no-results card: one shared component.]

**Completed:**
- **Specced all three** in `SPEC_ask_setup_polish.md` (client only, no migration; next is still 087).
- **F1, decided and shipped (`84a5bfe`, `5af68fb`):** tapping a photo tile replaces the photo directly, the same as Manage's strip. No Replace / Remove sheet; the phone's chooser has Cancel. The photo is the household item's (A23), so it changes everywhere.
- **F3, decided and shipped (`0d73364`):** no results → the create card (typed name + aisle buttons, one tap creates). **Dan ruled: save right away**, so the new tile can take a photo at once. New hook `createCatalogItemNow` (match-first, then `insert_custom_catalog_item`); it writes no `list_items` row. This deliberately differs from the meal builder's deferred write.
- **F2, first approach retired after four phone rounds** (`d001df0`, `5239846`, `cb9dc1c`, `8846874`, `52a205d`, `0cef6cd`): scroll the field up, track the viewport, hold a min-height, pin the field, settle on close. Each round passed headless and jumped on Dan's iPhone. Cause: iOS runs its own focus scroll for a field mid-page, and our code moved the same page. Rolled back in `39ccf22` (kept F1, F3, the tile fade-in, keep-focus rows).
- **F2 redesigned as a full-screen search view (`d0c7f6d`):** the form's field is a button; the view has the input and Done at the top, the count line and "Added: …", then the results. Focus is set synchronously in the opening tap (`flushSync` + `focus()`, enforced by a source test), so the keyboard rises on the first tap. Result taps and the create card keep focus; return / ✓ only drops the keyboard; Done closes.
- **Fixed three iPhone-only defects in the view, the last two from measurements.** (1) Its top was hidden behind the Ask header: an iOS scrolling container clips fixed children → portaled to `document.body` (`3b0395f`). (2) The form showed under the list: the iOS 26 keyboard bar is translucent and floats below `visualViewport.height` → a cream backfill under the view (`c6685dd`). (3) With the keyboard already up from "Who's picking?", the focus hand-off panned the visual viewport 198px and left the view above it (readout: `offTop 198.3`, `view top -198`, `last drag: none`) → the view follows the visible area (top = `offsetTop`, height = `height`), then `window.scrollTo(0, 0)` (`dee45ae`). A dev-only on-phone readout (`6f89934`) supplied the numbers.
- **Promoted and walked.** Dev `dee45ae` walked by Dan (Parts 1–3: search view, create, replace, edit, cancel, Explorer). Main `c840d76` (parents `085c9d2` + `dee45ae`, tree `b1028398…` = dev's, fast-forward of 20 commits), `dpl_5hVyU4VrsNcs1UZRzu4td4aJibuM`, bundle `main.c11f1f80.js`: carries `op-ask:on`, no readout code (7 strings counted 0 in a production-flavoured build and in the live bundle). 1175 tests, `CI=true` clean. **Prod walk passed (Dan, 01:29).** Rollback: Instant Rollback to `dpl_B4H7zMMrEXf1Amk78SJoBp9YJPTS` (`085c9d2`).

**Unfinished:**
- **A second chat session pushed straight to dev** at Dan's request while this one was open: `c6685dd` (cream backfill, pushed without the test suite; covered later by the 1175-pass run on `dee45ae`), `e025694` and its revert `d0cd557`. That breaks the "chat never writes to dev" rule. Dan to rule whether the rule stands or gets an exception [Velayo OS]. Leftover branches to delete on GitHub: `fix/ask-search-backfill`, `fix/ask-search-no-contact-autofill`.
- **"AutoFill Contact" still shows** above the keyboard on the search field. Two attempts failed (input attributes; drawing the placeholder, `e025694`, reverted). Accepted as cosmetic. Untested idea from the other session: check whether the bar also shows on "Who's picking?"; if so, the page can't remove it.
- **The touchmove guard from `0d1816b` is still in the view.** It didn't stop the pan it was built for; whether it's still needed after `dee45ae` is unknown. Leave it until someone tests without it.
- **The body scroll lock doesn't hold on iPhone** (readout: `body overflow hidden, position static`; the visual viewport still pans with the keyboard up). Other full-screen layers with inputs may have the same problem: check Browse search and the helm "+" sheet on a phone.
- **Browse's no-results card did not lift into a shared component;** the Ask view has its own. Extraction is NEXT.
- The dismiss-keyboard-on-drag idea was written but never built; not needed now.
- "Harness test crackers" was created in Cody Test House (dev) by a headless check. Dan cleaned up dev; confirm it's gone.
- Carried from the launch entry, unchanged: Ask shelf edits don't reach a second phone without a restart; `SWEEP_LIVE` on prod undecided; dev's `meal-photo-sweep` v9 vs prod v2; Browse shows a bought item's stepper as still to buy; check the two stale CLAUDE.md lines ("Ask is OFF on prod", "do not deploy meal-photo-sweep") were corrected in `7b244cb`.

**Next session:**
SESSION START
Goal: Diagnose and fix Ask shelf edits not reaching a second phone (a live prod bug). First read the prod `meal-photo-sweep` dry-run log and have Dan rule on `SWEEP_LIVE`.
State: Prod main `c840d76` = dev `dee45ae` tree, `dpl_5hVyU4VrsNcs1UZRzu4td4aJibuM` / `main.c11f1f80.js`. Ask ON with setup polish F1–F3, walked on prod. Rollback `dpl_B4H7zMMrEXf1Amk78SJoBp9YJPTS`. Dev serves `main.5a1cfb0a.js` with the dev-only readout available (hold "The ask · N items" 1s in the search view). Next migration 087.
Done when: a shelf edit on phone A shows on phone B without a restart (walked by Dan on dev, then promoted), and `SWEEP_LIVE` has a recorded decision.
**Files updated:** From chat: `SPEC_ask_setup_polish.md` (airlock + Project). Claude Code: `src/components/NewShelfSheet.js` (+test), `src/components/AskScreen.js` (+test), `src/hooks/useProvisions.js`, `src/App.js`, the search view and readout files, harness scripts; docs at SESSION END.
**DB changes:** None. (Test catalog items created while walking were deleted by Dan.)

=== ROADMAP_DECISIONS ===

| 2026-11-16 | **Search inside a long form gets its own full-screen view, never a field we scroll into place.** iOS runs its own focus scroll for a mid-page field; code that also moves the page fights it, and headless can't see the fight. Four rounds of scroll management were rolled back (`39ccf22`). |
| 2026-11-17 | **A full-screen layer with an input follows the visible area** (top = `visualViewport.offsetTop`, height = `visualViewport.height`), is portaled to `document.body`, and carries a backfill below it. With the keyboard up, iOS pans the visual viewport regardless of the body scroll lock, and the iOS 26 keyboard bar is translucent below the reported height. |
| 2026-11-17 | **iPhone keyboard behaviour is proven on the phone, not headless. After two failed phone rounds, stop and measure:** use the dev-only readout and fix from its numbers. Tonight, five guesses failed; two measured fixes worked first time. |
| 2026-11-16 | **A new item created inside an Ask is written to the catalog at once** (Dan), not deferred to Save like a meal ingredient, so its tile can take a photo immediately. A cancelled ask leaves the item in Browse. It never touches the shopping list. |
| 2026-11-16 | **Tapping a photo tile replaces the photo, everywhere** (Ask setup now matches Manage). No Remove yet. |
| 2026-11-17 | **"AutoFill Contact" on the Ask search field is accepted** as iOS's own bar after two failed attempts. |

- Move **Ask setup polish (F1–F3)** to DONE (prod, 2026-11-17).
- NOW 0 unchanged: Ask shelf edits not reaching a second phone, with the `SWEEP_LIVE` ruling as a pre-check.
- Add to NEXT: extract Browse's no-results create card into a shared component (Browse, the Ask search view, the helm "+" sheet); check Browse search and the helm "+" sheet on an iPhone with the keyboard up; test whether the search view's touchmove guard is still needed.
- Add to WATCH: the dev-only search readout stays in the source (stripped from production builds); remove it once the keyboard checks above are done.

=== ARCHITECTURE ===

- **New hook function `createCatalogItemNow(name, category)`** (`useProvisions.js`): match-first via `findCatalogMatch` (a hidden or existing name returns that row), else `insert_custom_catalog_item`; adds the row to catalog state; writes no `list_items` row. Distinct from `createCatalogItem`, which returns a pending placeholder for the meal builder's deferred write.
- **New pattern, the Ask search view:** rendered with `createPortal` into `document.body` (z-index 2100, above `.ask-editor` at 2000); kept mounted but hidden so the opening tap can `flushSync` it visible and `focus()` the input in the same handler (a source test enforces no effect / timeout focus); flex column with the list as its only scroller; follows `visualViewport` (top and height, at most once per frame, and synchronously on open), then `window.scrollTo(0, 0)` up to three tries per pan; cream backfill below its bottom edge; result rows and aisle buttons `preventDefault` on `mousedown` to keep focus.
- **New finding, iOS:** `body { overflow: hidden }` does not stop the visual viewport panning while the keyboard is up; a fixed child of an overflow-scrolling container is clipped by it; the iOS 26 keyboard accessory bar is translucent and sits below `visualViewport.height`.
- **New dev-only tool:** the search readout, gated on `REACT_APP_DEPLOY_ENV !== "production"` as a direct comparison the minifier removes; toggled by a 1s hold on the count line, remembered in `localStorage`.

=== DROPPED_FILES ===

- `handoff/SPEC_ask_setup_polish.md` → `docs/specs/built/` (shipped to prod 2026-11-17). **Before filing, append this block to the spec** (Dan approves the content edit):

  > **As built (2026-11-17).** F2 item 7 was amended twice from phone measurements: the view may size itself to `visualViewport.height` (`0d1816b`) and follow `visualViewport.offsetTop` (`dee45ae`); nothing else on the page moves. Also added after the walk: the portal to `document.body` (`3b0395f`), the cream backfill for the translucent iOS 26 keyboard bar (`c6685dd`), and the dev-only readout (`6f89934`). "AutoFill Contact" (V3e) still shows and is accepted. The shared Browse create card was not extracted (NEXT). Live on prod as `c840d76` / `main.c11f1f80.js`.
