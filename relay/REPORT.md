Reported: 2026-11-26 13:44 ET · dev f62dd27 · main 5098508 · re: BUILD Slice 1 of SPEC_one_list.md · prompt 0150f2a

# One list, Slice 1 is on dev: List, "Our list", the bar after the first check-off, adds never start a trip. The pre-walk passes, and a separate prod bug found on the way is fixed on dev.

Built on dev with Dan's OK to push: five scoped commits, then one fix and one harness commit, all pushed. Main and prod are untouched, and no docs or migrations were written. The spec was re-pulled (amended) into `handoff/`, where it stays for SESSION END.

## The commits (dev, pushed)
| | Commit | What |
|---|---|---|
| R1 | `590ec35` | **Shop → List**, everywhere it means the door. |
| R2 + R3 | `ebe695e` | **The List header.** |
| R4 | `e522940` | **No Wrap up bar and no spacer at 0 checked.** |
| R5 | `1ae1303` | **`adoptOnly`**: an add never starts a trip. |
| R11 | `80d4e5d` | **Home's "Start a list →" opens List** (`goToDoor("list")`). |
| fix | `c783bea` | **Offline-flush trip start** (a prod bug, not part of Slice 1; below). |
| harness | `f62dd27` | `tools/harness/one-list-walk.js`. |

**R1 in detail:**
- `nav.js` label → List; key, view, `#/shop` and `WRAP_UP_HASH` unchanged.
- "Add to Shop" → "Add to list" (deck, board, recipe view, the on-hand confirm).
- "1 meal to add to the list"; "add to the list →" / "add to the list"; "Remove (and take its items off the list)" (App + `recipePlan.js`).
- The add-all toast's action → List.
- **One more than the spec's list:** the board subtitle's "Everything's in Shop ✓" → "Everything's on the list ✓" (it means the door).
- Left alone: the tagline and the verbs.
- Tests updated: AllOnHand, CookedItSurfaces, RecipeViewActions, mealLinks, recipePlan. ReplayLabels pins no door copy.

**R2 + R3 in detail:**
- "Our list" in Playfair 400 at 28, the lens and + Add on the right, a 1.5px `#d8bf94` hairline 12px under the row, `controlRowRef` kept.
- The empty list's header row reads "Our list" too (the guide replaces the block under it in Slice 3).
- Gone: the count, the progress bar and A–Z's "N to find", with their CSS.
- `activeCycle` dropped from App's destructure.

**R4 in detail:**
- `WrapUpBar` renders only at 1+ checked and not all; the dashed state and `.wrapbar.p0` are gone.
- The spacer keys on `checkedCount > 0` too.
- ReplayLabels pins 0 → none, 1 → "Wrap up 1 of 11 · 10 carry forward", 100% → none.

**R5 in detail:**
- **`ensureSession`'s core moved to `src/lib/tripSession.js`** (`ensureTripSession`). Checks, unchecks and the offline flush behave as before.
- **`adoptOnly`** re-reads the open sessions and returns this person's or null. It never calls `startSession` and never holds the start lock, so a check during its read still starts the trip. It does join a start already in flight.
- **`recordListEvent(…, { adoptOnly })`** writes no event without an adopted session, and now resolves to the session it logged under (or null).
- **`noteAddedHere`** no longer checks the door. It tags only while this phone's `activeSession` is set, and logs through `adoptOnly`. If the re-read finds the trip over, the tag comes off again.
- **Jest:** `tripSession.test.js`, 12 tests:
  - the stale-`activeSession` case, with and without `adoptOnly`;
  - an open session adopted;
  - an add joining the first check-off's start;
  - the lock never held by an add;
  - two taps → one session;
  - the callers on the source.

**R6:** already built; checked as a regression only (V5).

**Tests and build:** 85 suites / 1326 tests pass; `CI=true` build compiles at `1ae1303` and again with the fix.

## Pre-walk on the deployed preview (Cody Test House, the dev test account)
**`one-list-walk.js` (new), 38/38** on `f62dd27` (`main.b0888dc6.js`, build tag "dev · f62dd27"). Also 38/38 on `80d4e5d` before the fix.
- **V1:**
  - the Helm reads Home · Plan · Browse · List;
  - `#/shop` opens List, and a reload on `#/shop` lands there;
  - no "Shop" door copy in the bundle, and the new copy is in it.
- **V2:**
  - "Our list", Aisles | A–Z, + Add, with no count, bar or "N to find" in either lens;
  - the header scrolls away and the Helm's compact + appears;
  - **the hairline:** the authored rule is `1.5px solid #d8bf94` and it computes solid sand. Headless Chrome snaps any 1.5px border to 1px (a bare test element does the same), so **the 1.5px look is for the iPhone.**
- **V3:**
  - 0 checked → no bar, no spacer;
  - 1 checked → "1 of 15 · 14 carry forward Wrap up";
  - all checked → All done, no bar, no spacer.
- **V4, read from `shopping_sessions` and `list_item_events` on dev:**
  - **(a) At home:** the add is plain. No tag, no session, no `added_in_store`.
  - **(b) Stale:** a check-off opened the trip, then the "second phone" ended it (`ended_at`) without this phone hearing. The next add opened **no session** and wrote **no `added_in_store`**, and the tag came off.
  - **(c) During a trip:** after another check-off opened a new trip, an add shows "added here". Exactly one `added_in_store` was logged, under that session, and no second session opened.
- **V5:** ×3 on a quantity-3 row, nothing on a quantity-1 row.
- **V10:** Home's "Nothing on your list · Start a list →" → `#/shop`, "Our list", no bar.
- **Cleanup:** the list was read back empty and no session was left open.

**Regression runs on `f62dd27`:**
- `offline-walk.js` **60/60**;
- `ask-offline-walk.js` **31/31**;
- `shop-burst.js` **ALL PASS** (run on `80d4e5d`; nothing it covers changed after).

## Found on the way: an offline trip started at the reconnect (on prod since 11-25), now fixed on dev
- **How it showed:** `offline-walk.js` V8·V10 failed twice on `80d4e5d`. A trip opened by the offline flush started 22 s after the first queued tap, at the reconnect.
- **Not Slice 1.** It came in with **`7538d1d`** (Ask off grid slice 2's tap-order flush, 2026-11-24) and is on prod in main `5098508`.
- **The cause:** with no Wrap up queued, `wrapLanded` starts true and the flush passed `tripAfter`, the first tap of the empty after-the-Wrap-up set (null).
- **The fix** (`c783bea`, one line): `tripAfter` only after a queued Wrap up has landed, else `tripBefore`.
- **Proof:**
  - a local build with the fix: 60/60 against dev data, `started_at` equal to the tap to the millisecond;
  - the deployed `f62dd27`: 60/60, `18:38:31.017` against a tap at `18:38:31.017`.
- **Why it got through:** I didn't rerun `offline-walk.js` after the 11-24 flush rewrite; that slice's pre-walk ran the Ask, wagon and burst walks.
- **On prod:** until a promotion, an offline-started trip on prod records its start as the reconnect. Only trip-duration data is affected; no list data.

## For Dan's phone walk (installed iPhone, dev)
- **V2 by eye:** "Our list" against the mockup (screens 2 and 4); the hairline's weight; how the header wraps at XXL text.
- **The rename on screen:**
  - the LIST door and its badge;
  - "Add to list" on the Plan board, the Home deck and the recipe view;
  - "add to the list →" on the board subtitle.
- **V3's feel:** the bar arriving with your first check-off, and no bar at home.
- **V4 on two real phones:** wrap up on one, then add on the other (the harness did this through the API).

## Left on dev
- **`ask_landings` rows** from `ask-offline-walk.js` (run id `aca87255…` and the replays). They have no client grant, so they're removed by SQL. The Supabase MCP is still timing out; I can delete them through the CLI on your word.
- Walk-made sessions are ended and the house's list is empty.

Slice 2 waits for your go.
