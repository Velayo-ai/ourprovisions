Reported: 2026-11-26 12:23 ET · dev 4ef6f16 · main 5098508 · re: Step 0 for SPEC_one_list.md · prompt bef68d7

# Step 0 for one list, one screen: built as the spec says, except the picker. It needs an extracted search view (a branch isn't small), and four rulings need a word from Dan first.

Read only. No code, migration or docs changed and nothing pushed. The spec was pulled into `handoff/SPEC_one_list.md` (Step 0.5's branch rule); it stays there for SESSION END. Line numbers are from dev `4ef6f16`.

## Needs Dan before Slice 1 / 2
1. **The picker is an extraction, not a prop branch** (item 1). One commit moves the search view out of `NewShelfSheet` into a shared component, with no change in behaviour; the picker is then its second user.
2. **R5's gate on `activeSession` leaks** (item 3). A stale or ended session still in this phone's state lets a home add open a new session. The fix is a small hook option: the add only joins an open session and never starts one.
3. **R8's Undo on an item checked this trip.** 085 makes the tap a "renewed" row: quantity reset to 1, checked_by cleared, meal links zeroed. Undoing that with −1 *removes the row*, so the purchase leaves the cart. Nothing can restore it without a migration. Options:
   - (a) no Undo on a renewal toast;
   - (b) Undo re-checks the row (quantity stays 1, meal links lost);
   - (c) a server undo, which means a migration and breaks "no migration in v1".
4. **`.op-name` on item names would break that rule** (item 6). `.op-name` is for *people's* names. Item names are already masked on prod by `maskAllText` and left visible on dev on purpose (D4). V13's "0 item names" can't hold on dev by design.
5. **R1's reach.** "Shop" means the door in about ten more places than the one toast the spec cites, e.g. "Add to Shop" (list in item 2). Do they become "Add to list" in Slice 1?

## 1. The picker to reuse
- **The component.** The New Ask search view isn't a component. It's about 150 lines inlined in `NewShelfSheet` (`src/components/NewShelfSheet.js`):
  - state and effects at 228–331: `openSearch` with flushSync + a synchronous `focus()` at 240, the visible-area follow at 262–295, the touchmove guard at 300–328, `keepFocus` at 331;
  - the portal at 519–577;
  - CSS at 601–623.
  - `AskScreen` only hosts the form.
- **Its selection model.** A toggle over a draft that saves at the end:
  - create: `createIds` (101); edit: `pending` over `serverIds` (102–104);
  - `toggle` at 192;
  - a cap of `ASK_SHELF_MAX` (`shelfFull`, 212);
  - the count line "The ask · N items" (531–538);
  - its create card writes catalog only, through `onCreateItem` → `createCatalogItemNow`, with aisle pills (540–559).
- **Why a branch won't stay small.** The picker shares the shell only. Its rows, ✓ state, letter headers, reveal card and create-as-Other all differ. The opener also lives in App (List's + Add, the Helm's +, the guide), and the first-tap keyboard needs the input already mounted and `focus()` run inside that tap. A branch on `NewShelfSheet` would mean mounting a 650-line ask form with the form hidden.
- **Proposed.**
  - **Commit A** extracts `ItemSearchView` (portal, follow + scroll-home, touch guard, head with input + Done, a slot for the count line, `children` for the list, an `inputRef`). `NewShelfSheet` uses it unchanged; `NewShelfSheet.test.js` and the Ask harness walks must stay green.
  - **Commit B** builds the picker on it:
    - mounted always, so App's opener runs `flushSync(open)` + `inputRef.focus()` in the tap;
    - rows are the person's Browse catalog A–Z with letter headers;
    - ✓ comes from the shown list rows (overlay included): live, quantity > 0, not checked;
    - a tap → `adjustQty(name, +1, rawCategory)`;
    - the reveal card and the no-match row reuse `SearchResultsList` (App.js:797).
  - This is "extend a primitive", not a fork.

## 2. Every `view === "list"` that means "in the store"
- **`noteAddedHere`.** App.js:8277–8281, gate `view !== "list"` at 8278. It tags `addedHereIds` (6882) and calls `recordListEvent("added_in_store")`. Callers: `handleShopAddResult` 8284 and `handleShopAddNew` 8292 (which the reveal card's add also takes, 13174). The tag renders at 12338 and 12366.
- **`WrapUpBar`.** It keys on counts, not the view or a session: `src/components/WrapUpBar.js:38` returns nothing when `!total || checked >= total`, and draws the dashed state at `checked === 0` (39–56). The call is at App.js:12409 and its spacer at 12408 (`checkedCount < totalItems`); **R4 must key the spacer to `checkedCount > 0` too.**
- **`doorAdd`.** App.js:8266–8274: `list` and `input` both → `openAddSheet` (8251). The Helm takes `doorAdd[view]` at 9180.
- **Landing rule.** App.js:8887–8895: unbought > 0 → `setView("list")`. Unchanged by the spec.
- **Home's `onStartList`.** App.js:11752 → `goToDoor("input")`; the line itself is `HomeListLine` at 1126–1141. R11 → `goToDoor("list")`.
- **Others:**
  - the store prompt (8353, also session-gated);
  - `refreshSessions` on arriving at List (8359, a read);
  - the check-undo fold (9143);
  - the provenance refreshes (5885, 5941);
  - the List screen block (12219).
- **The empty state the guide replaces.** App.js:12241–12266: "Your list is empty" with "add to Shop →" or "Browse items →". Gate `totalItems === 0` (8870), which already means "no live items", as R10 needs.
- **For R1:**
  - `nav.js:89` `label: "Shop"` → `List`; key, view and `#/shop` stay (`WRAP_UP_HASH` 95 is nested under it).
  - **Door copy beyond App.js:7127**, which the spec doesn't list:
    - "Add to Shop": 1074 `.deck-primary`, 1756 `.board-lock`, 3048 `.rv-plan`, 5191 modal confirm;
    - "1 meal to add to Shop": 5788;
    - "add to Shop →" / "add to Shop": 11788, 11790, 12262;
    - "Remove (and take its items off Shop)": 1793 and `src/lib/recipePlan.js:58`.
  - Tests pin several of these: RecipeViewActions, CookedItSurfaces, AllOnHand, ReplayLabels, recipePlan.
  - Left alone: the tagline "Shop smarter. Shop faster." (705), and "Let's shop →" / "Finish the trip →", which are verbs.
- **For R3:** the header row is 12272–12285 and the progress bar 12286–12288. "N to find" is 12359 (A–Z only). **`activeCycle`'s only use in App is the hidden span at 12274 inside that row**, so dropping the row leaves `activeCycle` (destructured at 5346) unused and the `CI=true` build fails. I'm reporting it rather than deleting it: the choice is to keep a use or drop the name from the destructure.
- **For R2:** both header forms carry `controlRowRef` (12248, 12272). D9′'s compact + depends on it, so the new header must keep it.

## 3. What opens a session
- **Confirmed: one opener on the client, none in SQL.** `startSession` (useProvisions.js:2355, the only `shopping_sessions` insert, 2383) is called only from `ensureSession` (2497). `ensureSession` is called only from `recordListEvent` (2566). `recordListEvent`'s three callers:
  - an online check / uncheck, App.js:8170;
  - `noteAddedHere`, App.js:8280;
  - the offline check flush, useProvisions.js:2279.
  - No migration inserts into `shopping_sessions` (only the `sessions_insert_own` policies). `wrapUpTrip` (2723–2731) and the stale sweep (2637) only end sessions.
- **R5 on `activeSession` stops the common case, not every case.** `activeSession` is this phone's copy, refreshed at household load (1235), on arriving at List (8359) and inside each `ensureSession`. If the session was wrapped up on another phone, or passed 8 h since the last read, `activeSession` is still set here. The add then passes the gate, `ensureSession` re-reads, finds none (or ends the stale one in `loadSessions`, 2442), and **`startSession` opens a new session from a home add.**
- **Fix (small, hook only):** an `adoptOnly` option. `recordListEvent(..., { adoptOnly: true })` → `ensureSession({ adoptOnly: true })` returns the open session or null and never calls `startSession`. `noteAddedHere` gates on `activeSession` for the tag, and the event writes only if a session was adopted. R5 then holds by construction.

## 4. `AddSheetPanel`'s duties
- **`AddSheetPanel` itself is only the container:** pull-down-to-close via `useSheetDrag` (`src/components/AddSheetPanel.js:25–44`). Its one user is App.js:13130, and `AddSheetPanel.test.js` and `AddSheetClip.test.js` pin it. Nothing else needs it, so it can retire with the sheet.
- **The duties live in App's sheet block (13126–13202):**
  - **Search:** `CatalogSearchBox`, plus `SearchResultsList` (797, shared with Browse at 12061). It carries the **reveal card** for a hidden exact match (F1b: live → `unhideItem` only, not live → unhide + add), **exact-match-wins** before offering create, and "No results".
  - **Create:** `handleShopAddNew()` → `addSearchedItem("Other")` (7462) → `adjustQty` (D7).
  - **The hint:** "Added items land in their aisle, unchecked[, and are remembered as picked up at {store}]" (13196–13199).
  - **The mic** with a LATER badge, disabled. Does it go with the sheet?
  - **Sizing:** `useKeyboardInset` (8375) and `useScrollLock` (8381).
- **`createCatalogItemNow` (useProvisions.js:4478) is not an Add-sheet duty.** It's the Ask's catalog-only create. The picker puts items on the list, so it creates through `addSearchedItem` / `adjustQty` as Shop does today.
- **Two snags for the picker:**
  - `addSearchedItem` reads Browse's shared `searchQuery` (7463), and `openAddSheet` clears it (8252). So **today the Helm's + on Browse wipes Browse's typed search.** The picker should keep its own query, and `addSearchedItem` should take the text as an argument (Browse passes `searchQuery`).
  - The Add sheet focuses its input in an effect (8370), which on iOS doesn't raise the keyboard on the first tap. The picker must use the Ask view's same-tap focus.

## 5. Row quantity
- **Already built.** Both lenses render `×N` when quantity > 1, right side, read-only: Aisles App.js:12341 (`.li-qty`), A–Z 12368. R6 needs no code. With prices on, Aisles also shows "@ $x" in a second `.li-qty` (12345).

## 6. RUM
- **Masking today:** `maskAllText: isProd` (rum.js ~312), with `CHROME_ALLOW_LIST` (rum.js:21) unmasked on prod only. `.op-name` is excluded in both environments and both pipelines.
- **No item name carries `.op-name` anywhere** (Shop rows `.li-name`, Ask search rows 565–573, Add sheet `.ar-name`). By the K3 rule (ARCHITECTURE "Privacy: .op-name") it is for people's names.
- **Proposed:** item names in the picker stay as they are (masked on prod by default, visible on dev by design). The `.op-name` cases are the welcome's `{Household}`, which is household text and simply stays off the allow-list, and anything with a person's name.
- **Joins `CHROME_ALLOW_LIST` (fixed copy, leaf tap targets):**
  - the picker's Done;
  - the guide's three CTAs (one new class);
  - the welcome's Got it.
- **Already listed:** List's `+ Add` (`.hdr-action`), Aisles | A–Z (`.shop-seg`), the doors (`.helm-door`; the label changes, the class doesn't).
- **Never listed:**
  - picker rows (item names);
  - the no-match row (typed text);
  - the toast's "{Item} is on the list" (the Undo can be a leaf, but the toast action has no allow-listed class today);
  - "Our list" is a heading, not a tap target, so it doesn't matter.
- **V13 on dev:** "0 item names" can't hold there by design. Proposed: a prod-config check that no new selector sits on or above an item name (`rum.test.js` style), plus the HAR on dev for `.op-name` content only.
- **Telemetry hook:** `emitItemAdded` hard-codes `source: "browse"` (useProvisions.js:1376–1393), and `adjustQty` takes no source. `source: 'picker'` + `door` needs an options argument on `adjustQty` carried in its ctx (1562). Small.

## 7. Off grid today
- **`handleShopAddResult` closes the sheet first** (8285), then `adjustQty` shows the row optimistically (1501). The write fails as transient, the row **rolls back** (1551 / the queue's 1470) and `quietTransient("add")` sets `needsSignal`.
- **"Adding items needs signal for now."** (`src/lib/offlineMode.js:72`) appears **only inside the Velayo menu** (`OfflineLines`, App.js:10846). A brand-new name fails earlier, at `insert_custom_catalog_item` (1530), the same way.
- **So at the tap nothing answers:** the sheet closes, the row may flicker. That's the prod-walk finding.
- **R14's interim:** check `offline` (or `navigator.onLine === false`) before `adjustQty`, keep the picker open, and toast the calm line at the tap. A transient failure that gets past the check takes the same toast.

## 8. Against ARCHITECTURE's invariants
- **One Wrap Up per state:** R4 keeps it (0 checked → no control). But the D3 constraint "a trip can always be finished from Shop" (ARCHITECTURE ~2101) loses its 0-checked case. A session opened by a check, then unchecked, has no Wrap up until the 8 h expiry. That seems harmless (nothing to finish); accept?
- **The shared list is sacred:** no conflict. The picker shows the person's Browse catalog (hidden excluded, a browse-layer lens). A hidden item on the list is reached by its exact name through the reveal card, "On your list — hidden from your view" → un-hide only.
- **`.op-name`:** conflicts as written (item 6).
- **085 Q4:** R8's tap matches `renewed` exactly; R8's Undo doesn't (needs Dan, point 3).
- **Also noted:** the trip qualification's S1 reads `added_in_store` (ARCHITECTURE ~1238). R5 makes those events trip-only, which improves S1's signal; no conflict.

## Unexpected
- The spec lists `createCatalogItemNow` as an Add-sheet duty; it isn't one (item 4).
- R6 is already built.
- R1 reaches about ten more strings than the spec names.
- Dropping the header row breaks the CI build through `activeCycle`.
- Today the Helm's + on Browse clears Browse's search.

Slice 1 waits for Dan's go.
