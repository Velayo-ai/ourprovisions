# SPEC — Ask setup polish (F1–F3 from the first real-world Ask)

**Status:** approved in design chat 2026-11-16 (Dan); F2 revised 22:52 after the phone walk (search view replaces scroll management). Build on dev; promote after Dan walks it on a phone.
**Source:** Dan set up "Ask Fia" for a friend on prod (2026-11-16, ~21:00 ET) and hit three snags.
**Scope:** `src/components/NewShelfSheet.js` (the form inside `AskScreen`), its wiring in `App.js`, and one new hook function in `useProvisions.js`. **Client only, no migration** (next is still 087). Not behind a new flag: Ask itself is already flagged.
**Grep before edit.** Line numbers drift; the strings quoted below are from dev `afe5a81`.

---

## F1 — Tapping a photo tile replaces the photo

**Today:** a tile with a photo does nothing when tapped. To swap a bad photo, you save the ask and go into Manage categories & asks (`ShelfPhotoStrip`, where a tap replaces).

**Change:** a photo tile becomes a button that runs the same `openPhoto(id)` flow as the empty tile: the phone's chooser, then `onPhoto(id, file)` → `setItemPhoto`. Label it `Change the photo of {name}`, the same wording as `ShelfPhotoStrip`. While it uploads, the tile shows the existing busy state; the old photo can stay visible under a dimmed "…".

**Decided:**
- **A tap replaces directly, with no Replace / Remove sheet.** That's the same behaviour as Manage's strip, so there's one rule everywhere. The phone's own chooser has Cancel, so an accidental tap costs nothing. No Remove anywhere yet; that stays out of scope.
- **The photo belongs to the household's item, not the ask (A23).** Replacing it here changes it on every ask and in Browse, exactly as it does from Manage. No new copy is needed: the existing hint already says it's the item's photo.
- Update the header comment block ("tapping a photo tile does nothing") to say a tap replaces.

## F2 — Search gets its own view (revised 2026-11-16 22:52, Dan)

**The problem (Dan's IMG_6882):** "Find an item" sits low on a long form. With the keyboard and iOS's form-assistant bar up, only about 2 results show.

**What we tried, and why it's retired.** First version (`d001df0` → `0cef6cd`): scroll the field to the top on focus, track `visualViewport` to resize and move the fixed screen, hold a min-height under the list, defer the release on a press, pin the field while tiles grow, and settle on keyboard close. Each round passed headless and still jumped on Dan's iPhone (22:50: "scroll up → tap Find → ✓ jumps around"; "scroll → tap Find scrolled around a lot"). **The cause is structural.** iOS runs its own focus scroll for a field in the middle of a page, and our code moved the same page at the same time. A headless browser can't reproduce iOS's half, so the checks can't catch it. **Decided: stop moving the page.** Roll back that machinery and give search a screen where the field starts at the top.

**The design:**
1. **In the form**, "Find an item" becomes a **button styled like the field** (same box, a magnifier, the placeholder "Find or add an item"). It is not an input, so iOS has nothing to focus or scroll on the form.
2. **Tapping it opens the search view**, a full-screen layer over the Ask screen (above `.ask-editor`'s z-index). From the top:
   - a row with the **search input** (left, flexible) and **Done** (right, text button)
   - **the count line**, the same as the form's header: "The ask · N items", or "N of M" in the error colour when over Explorer's cap, plus "Added: Apples, Bananas, Bread" (names via `nameById`, so a hidden tile in edit still names; clipped to 2 lines with "…")
   - **the results**: the same rows as today (+ / ✓, tap toggles, the full catalog A–Z when the query is empty), scrolling inside this view. The one-scroller rule holds per screen: this screen's one scroller is its list.
3. **THE KEYBOARD MUST RISE ON THE FIRST TAP.** iOS only opens the keyboard when `focus()` runs synchronously inside the user's tap. So the input must exist and be focused **within the same tap handler** that opens the view. Either keep the view mounted while the Ask screen is open (hidden with `visibility`, not unmounted), or `flushSync` the open and then `focus()`. Do NOT focus in a `useEffect` or after a timeout.
4. **Tapping a result keeps focus** (`preventDefault` on the row's `mousedown`, from `8846874`): the keyboard stays up, so you can add item after item. The return key / ✓ only dismisses the keyboard and you stay in the view; Done is the way out.
5. **No results → the F3 create card**, here. After a create, clear the query and **keep focus**, so the next name can be typed straight away (this settles the open "should the keyboard stay up after a create" question).
6. **Done** blurs and closes. The form is exactly where you left it (it never scrolled), and the new tiles are in the grid (fade-in from `52a205d` kept) for F1's photos.
7. **Nothing repositions anything.** No `visualViewport`-driven moves, resizes or scroll pins anywhere. The view is `position: fixed; inset: 0` with the input at the top, which is already visible above any keyboard. Reading `visualViewport.height` only to pad the list's bottom, so the last row can scroll clear of the keyboard, is fine.
8. Edit Ask uses the same view. Respect reduced motion (open/close with no slide).

**Rollback, first and as its own commit:** remove the F2 machinery: viewport tracking and the screen resize/move (`5239846`), the deferred release (`cb9dc1c`), the field scroll and min-height (`d001df0`), the field pin (half of `52a205d`), and the settle logic (`0cef6cd`). **Keep:** F1; F3's create logic and `createCatalogItemNow`; the tile fade-in; the keep-focus row behaviour (it moves into the view); the search input attributes (`name="ask-item-search"`, `enterKeyHint`, `autoCorrect="off"`, `autoComplete="off"`). Revert or remove by hand, whichever is cleaner given how the commits interleave; report which. After the rollback, dev behaves like `afe5a81` for search, plus F1/F3.

**Logged in NEXT:** Browse search and the helm "+" sheet on a phone (same symptom possible); extracting Browse's no-results card into a shared component (it didn't lift cleanly in this build).

## F3 — Create a new item without leaving the ask

**Today:** a search with no match says "Nothing in your catalog matches that." To add something new, you close the ask, add the item in Browse, and start the ask over.

**Change:** replace that line with the same create card Browse shows for no results: **the typed name plus the category pills, where tapping a category creates the item in one motion**. The new item:
- is **added to the shelf** (appended, the same as tapping a row; subject to `ASK_SHELF_MAX`)
- clears the search
- shows as a tile straight away, so F1/the empty-tile flow can photograph it at once.

**Decided (Dan, 2026-11-16): save right away.** The catalog row is written the moment the category is tapped, not when the ask is saved. That's what lets the new tile take a photo straight away (a photo needs a real `catalog_items` id), and photos are what Explorer asks are built on. If you cancel the ask, the item stays in Browse as a normal custom item you can delete. This **deliberately differs from the meal builder's deferred write** (`SPEC_defer_catalog_write`): there, an orphan was a stray category tap nobody wanted. Here, the person typed the name and chose an aisle on purpose.

**How:**
- **New hook function:** `createCatalogItemNow(name, category)` in `useProvisions.js`. It goes match-first (`findCatalogMatch`, so a typed name matching a hidden or existing item returns that row, never a duplicate). If there's no match, it calls `insert_custom_catalog_item` (051: membership enforced; dedups by name), exactly as `materializePendingIngredients` does. It then adds the row to the catalog state Browse reads, so it appears there and in `shelfCatalogItems`. It **writes no `list_items` row**: an ask's shelf is a set of choices, not the shopping list. Don't reuse `createCatalogItem` (it returns a pending placeholder) or Browse's add path (it puts the item on the list).
- **A hidden match:** add the returned row to the shelf. Its tile shows by S4-9's rule, the same as an existing hidden tile in edit.
- **Wiring:** pass `onCreateItem` and the category list from `App.js` into `AskScreen` → `NewShelfSheet`. When `onCreateItem` is absent, fall back to today's line.
- **Reuse, don't fork:** if Browse's no-results card lifts cleanly into a shared component, use it here and swap Browse over in the same commit. That also closes the 11-14 note that the helm "+" sheet doesn't share Browse's card. If the lift isn't clean, build the card in the Ask form to match Browse's look, and log the extraction in NEXT. Claude Code's call; report which.
- Errors: if the insert fails, say "Couldn't add that item. Try again." under the card and keep the typed name. Pills are disabled while busy.

---

## Verify (dev, on a phone — Dan)

- **V1 (F1):** in a new ask, add an item with a photo, tap its tile, pick another photo. The tile updates. Open Browse or Manage: the same new photo shows there.
- **V2 (F1):** tap a photo tile, then Cancel the chooser. Nothing changes.
- **V3 (F2, revised):** scroll the form anywhere, tap "Find or add an item". The search view opens with the keyboard already up **on the first tap**, the input at the top, and at least 5 results visible. Nothing behind it moves.
- **V3b:** add 4–5 items in a row: the keyboard stays up and the "Added:" line grows. Tap one again to take it off.
- **V3c:** type until 1 result remains, then press ✓: the keyboard drops and you stay in the view, with no jump. Tap the input again: the keyboard returns with no jump.
- **V3d:** Done: back on the form exactly where you were, the new tiles fading into the grid. Repeat after scrolling up among the tiles first: still no movement.
- **V3e:** note whether "AutoFill Contact" still shows above the keyboard.
- **V4 (F3):** in the search view, search a name that doesn't exist (e.g. "Fia's crackers"). The create card shows; tap an aisle. The "Added:" line gains it, the search clears with the keyboard still up; after Done a tile is on the shelf, and the empty tile takes a photo. Save the ask: it runs with that item. The item is in Browse under that aisle and is **not** on the shopping list.
- **V5 (F3):** search a name that already exists but is hidden in your Browse. It joins the shelf with no duplicate created.
- **V6 (F3):** create an item, then close the ask without saving. The item is in Browse (expected, by decision) and nothing is on the list.
- **Regression:** Edit Ask works the same; Explorer's "Remove k." and photo nudge still behave; jest green; `CI=true` build clean.

---

> **As built (2026-11-17).** F2 item 7 was amended twice from phone measurements: the view may size itself to `visualViewport.height` (`0d1816b`) and follow `visualViewport.offsetTop` (`dee45ae`); nothing else on the page moves. Also added after the walk: the portal to `document.body` (`3b0395f`), the cream backfill for the translucent iOS 26 keyboard bar (`c6685dd`), and the dev-only readout (`6f89934`). "AutoFill Contact" (V3e) still shows and is accepted. The shared Browse create card was not extracted (NEXT). Live on prod as `c840d76` / `main.c11f1f80.js`.
