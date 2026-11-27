Reported: 2026-11-27 02:52 ET · dev f6a9ce2 · main 5098508 · re: BUILD Slice 2 of SPEC_one_list.md · prompt e01b58b

# One list, Slice 2 is on dev: the quick picker replaces the Add sheet, built on a search view shared with the Ask. Every harness walk passes; your iPhone walk is next.

Built on dev and pushed with Dan's OK (Commit A first, then B plus the walk). Main and prod are untouched, and no docs or migrations were written. The spec stays in `handoff/`.

## The commits (dev, pushed)
| | Commit | What |
|---|---|---|
| A (R7) | `d40b1f6` | **`ItemSearchView` extracted from `NewShelfSheet`, no behaviour change.** |
| B (R7–R9, R14, telemetry) | `7b53390` | **The quick picker** (`ListPicker` in App.js), replacing the Add sheet. |
| harness | `f6a9ce2` | `one-list-walk.js` gains V6, V7, V8 and V12. |

**Commit A in detail:**
- `src/components/ItemSearchView.js` holds the portal (z 2100), the visible-area follow and scroll-home, the touch guard, the head (input + Done), a count-line slot, the list `children` and `keepFocus`.
- `useItemSearch()` holds open / viewBox / the input ref; its `show()` is the same-tap sequence: `flushSync(open)` → `focus()` → `flushSync(viewBox)`.
- The CSS moved unchanged and the `.ask-search*` class names are kept. A title-bar variant is added for the picker.
- The one test change: NewShelfSheet's "held on the source" test now reads the open sequence in `ItemSearchView.js`, with the same assertions.

**Commit B, opening and layout:**
- **Always mounted.** `openPicker(from)` calls `picker.show()` inside the tap, from List's + Add (both header forms), the Helm's + on List and on Browse, and `"guide"` for Slice 3.
- **Layout (mockup screen 3):** "Add to our list" with a dark Done pill, a field reading "Type, or scroll and tap", then the person's Browse catalog A–Z with letter headers (`lib/listPicker`).
- **Scroll:** the page's scroll is noted on open and put back on close.

**Commit B, adding:**
- **R8, the list state:** ✓ "On the list" comes from the shown rows, overlay included. A ✓ row is inert and fires `picker_tap_on_listed`.
- **R8, a tap:** a tap = `adjustQty(name, +1, rawCategory)` and the picker stays open. Its toast sits inside the view, above the keyboard: "{Item} is on the list · Undo" (Undo = −1).
- **R8, a renewal:** an item checked this trip toasts "{Item} added again · it was in your cart", with no Undo.
- **With a query:** results go through `SearchResultsList`: the reveal card for a hidden exact match (F1b), else "+ Add "{text}" as a new item" (Other). "Added here" follows R5. **R9:** no quantity parsing.
- **Browse's search:** `addSearchedItem(rawCategory, text, opts)` now takes the text as an argument. Browse passes `searchQuery` and clears it itself, so the Helm's + on Browse no longer wipes Browse's search.

**R14, off grid:** with `offline` or `navigator.onLine === false`, nothing is sent and the picker answers "Adding items needs signal for now." A transient failure past that check gives the same answer, through the new `onTransient` in `adjustQty`. A real error is the usual error toast.

**Telemetry:**
- `adjustQty(name, delta, cat, price, opts)` carries `{ source, door, onTransient }`. `emitItemAdded` stops hard-coding `'browse'`: picker adds send `source: 'picker'` with `door: list | browse | guide`.
- New events, counts only: `picker_opened {from}`, `picker_closed {added, open_s bucket}`, `picker_tap_on_listed`.
- `CHROME_ALLOW_LIST` gains `.item-search-done` only, so 84 entries. The Ask's Done is `.ask-search-done` alone and stays off the list.

**Retired:** the Add sheet block, `AddSheetPanel` and its disabled mic + LATER badge, the `.add-sheet*` / `.add-result*` / `.op-later-badge` CSS, `AddSheetPanel.test.js` and `AddSheetClip.test.js`. `useKeyboardInset` is now unused by App; the hook and its test stay.

**Tests:**
- New: `ListPicker.test.js` (9, including V13's prod-config masking check) and `lib/listPicker.test.js`.
- Updated pins: `qtyCallers`, `tripSession`, `rum` (84).
- Jest: **85 suites / 1332 tests** pass; the `CI=true` build compiles (at A, and at B).

## The gate before Commit B (on the deployed `d40b1f6`)
- `ask-offline-walk.js` **31/31**; `wagon-walk.js` **ALL PASS**.
- Neither walk drives the New ask search view, so a one-off probe drove it on dev. It passed:
  - closed: hidden and on the body;
  - one tap: open with the focus in the field;
  - the same DOM (head · count · list);
  - typing filters;
  - a tap adds with the focus kept, and the count reads "The ask · 1 item";
  - Done closes, and one tile is on the shelf.

## Pre-walk on the deployed preview (`f6a9ce2`, Cody Test House)
| Walk | Result |
|---|---|
| `one-list-walk.js` | **62/62** (61 + the build check). Before the push, 61/61 on a local build of `7b53390` against dev data. |
| `offline-walk.js` | **60/60** |
| `ask-offline-walk.js` | **31/31** |
| `wagon-walk.js` | **ALL PASS** |
| `shop-burst.js` | **ALL PASS** |
| the Ask search probe | **PASS** |

**What one-list-walk now covers:**
- **V6:**
  - **Openers:** List's + Add, the Helm's + on List and on Browse all open the same single picker, with the focus in its field inside the tap (a real CDP click).
  - **Layout:** the title, A–Z letter headers, "On the list" on ✓ rows; typing filters.
  - **A tap:** puts the item on the list once (quantity 1) and the picker stays open, with "{Item} is on the list" + Undo. The row then reads ✓.
  - **Second tap and Undo:** a tap on a ✓ row adds nothing; Undo takes a fresh add off again; Done closes.
  - **Browse's search:** text typed there survives the Helm's +.
- **V7:** an item checked this trip shows +, and a tap makes it pending at quantity 1, toasting "added again · it was in your cart" with no Undo.
- **V8:**
  - **New item:** no match offers "+ Add "…" as a new item", which creates a custom item in Other at quantity 1.
  - **Hidden item:** hidden for this account, it's absent from A–Z. Typed exactly, it shows the reveal card (no create row), and a tap reveals and adds it: one catalog row, hide removed.
- **V12:** off grid, a tap answers "Adding items needs signal for now.", the picker stays open, and nothing is written.
- **Cleanup:** the custom item is deleted (`delete_custom_catalog_item`), the hide is removed, the list reads back empty, and no session is left open.

**Walk fixes on the way** (bugs in the walk, not the app):
- Browse's test search first matched nothing, so the page couldn't scroll for the compact +; it now types "a".
- The probe's bare `.ask-search` selector hit the always-mounted picker; it's now scoped to the Ask view.
- App code only queries a view through its own ref, so this doesn't affect the app.

## Housekeeping: `ask_landings` test rows (Dan said yes)
- **Deleted on dev only**, through the CLI after a system-id check (`7642734024280108049`), scoped to Cody Test House:
  - first the 9 older rows;
  - then 22 written by today's two ask-offline-walk runs.
- **Read back 0.** Prod is untouched.

## For Dan's phone walk (installed iPhone, dev) — only what needs real iOS
- **Keyboard on the first tap** from each opener: List's + Add, the Helm's + on List, the Helm's + on Browse.
- **Scrolling A–Z with the keyboard down,** and the list ending at the keyboard's top.
- **Done returns you to the same scroll position,** on List and on Browse. It's put back on close, and needs your eyes.
- **The toast's placement:** inside the picker, above the keyboard; and the Undo tap.
- **The look against mockup screen 3:** the title bar, the field with its glass, the ✓ and + marks, at XXL text too.

## Notes
- **R14 and the telemetry are in Commit B, not their own commits:** they run through the same few lines of the picker's handlers.
- **"Write it" (pasting several lines) is not built.** That's Direction.

Slice 3 (the guide and the welcome) waits for your go.
