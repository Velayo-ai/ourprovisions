# SPEC — One list, one screen (List, the quick picker, the first-time guide)

**Scope:** OurProvisions · client-first, no migration in v1
**Status:** Design final (design chat 2026-11-25 → 26, Dan). **Amended 2026-11-26** after Step 0 (relay `ab31291`, prompt `bef68d7`) and a second review; Direction updated for learned staples; R8 revised 2026-11-27 (the row is the undo). Step 0 is DONE; its findings are folded in below. Build-ready.
**Mockup of record:** Design canvas "Our List — one list, one screen" (https://claude.ai/artifact/43Zo5bJR1ivmDAj3SD5Nug), five phone screens: 1 empty list = the guide · 2 Helen at home · 3 + Add = the quick picker · 4 Dan mid-trip · 5 new member welcome.
**Supersedes for NOW 0:** offline quantity + manual add moves behind this. Its add half now rides the quick picker (Slice 4 below).

---

## Why

Helen (25 Nov, adding Thanksgiving items) and Elly before her could not tell Browse (build a list) from Shop (use it). Watching her showed what was really wrong:

- The app opens on **Shop** whenever anything is unbought, so a person at home opens a screen built for the store, which says "Leaving early? Wrap up →" with nothing in the cart.
- Shop never says **"list"**. "Browse" and "Shop" are near-synonyms in grocery talk.
- Adding from Shop's + is tagged **"added here"** and sends `added_in_store`, which opens a shopping session, so home adds pollute the trip data the learning roadmap depends on.
- The screens say the same thing three times (header count, progress bar, Wrap up bar), so there is too much to read to see "this is the list".

The flawed assumption underneath: **we treated someone building a list as someone already shopping.** The problem we are solving: **a new user building their first shopping list, and finding it in the store.** (Later: handing it to an agent. See Direction.)

## Principles (to DECISIONS LOG)

1. **One list, one screen.** The household keeps one list, on one screen, called **Our list**. It looks the same at home, in the store and over coffee. What you *do* changes it: the first check-off starts the trip and brings in the Wrap up bar.
2. **Two ways to pick.** Adding from the list, wherever you are (List's + Add, the Helm's +, the guide's Add), opens **one quick picker**: type or scroll, tap, ✓. Choosing slowly (categories, quantities, staples, filters, the Ask hand-off) is **Browse's** job, and only Browse's.
3. **Say it once.** Each fact appears in one place per screen. Trip progress lives only in the Wrap up bar; the list count from other doors lives only in the LIST badge.
4. **Meet people where they are** (Velayo design direction): offer several natural ways to contribute to one shared outcome rather than one workflow everyone must learn. Name them by the person's intention, not by a claim about effort.
5. **The shared intention is permanent. The means of contributing to it and fulfilling it can evolve.** The list is the product. Write it, Pick it, Plan it, Ask someone, Ask the Galley and Text it all feed it; "shop ourselves" and "shop for us" both fulfil it.

## Rulings

| # | Ruling |
|---|---|
| R1 | **Rename the Shop door to List, everywhere "Shop" means the door.** `nav.js:89` label `Shop` → `List`. Keep `key`, `view: "list"`, the hash `#/shop` (RUM page-view history depends on it) and `WRAP_UP_HASH`. Copy, all in Slice 1: the Ask hand-back toast action `Shop` → `List`; "Add to Shop" → **"Add to list"** (`.deck-primary`, `.board-lock`, `.rv-plan`, the modal confirm); "N meal(s) to add to Shop" → "… to add to the list"; "add to Shop →" / "add to Shop" → "add to the list"; "Remove (and take its items off Shop)" → "… off the list" (App.js and `lib/recipePlan.js`). Update the tests that pin them (RecipeViewActions, CookedItSurfaces, AllOnHand, ReplayLabels, recipePlan). **Leave** the tagline "Shop smarter. Shop faster." and the verbs "Let's shop →" / "Finish the trip →". Keep `Browse` as is. Nav: HOME · PLAN · BROWSE · LIST. |
| R2 | **The List header:** `Our list` (Playfair, as the mockup), then on the right Aisles \| A–Z and `+ Add`, then a 1.5 px sand hairline (`#d8bf94`, Browse's divider tone) under the row. **Not pinned:** it scrolls away with the list. The row keeps `controlRowRef`, so the Helm's compact + takes over as today (D9′). |
| R3 | **Remove the header count, the progress bar and the "N to find" eyebrow.** "In the cart" stays as the section header for checked items; the Aisles section headers stay. Dropping the header row leaves `activeCycle` unused in App (its only use was the hidden span in that row), so **drop it from the destructure** (or the `CI=true` build fails). |
| R4 | **The Wrap up bar appears with the first item in the cart.** `checkedCount = 0` → no bar (the dashed "Leaving early?" state is retired) **and no spacer** (key `.wrapbar-spacer` to `checkedCount > 0` too). `1+ not all` → as today. All checked → the All done card, as today. One Wrap up control per state is unchanged. It keys on the household's checked count, as the bar does today. Accepted: a session opened by a check and then fully unchecked has no Wrap up until the 8 h expiry (nothing to finish). |
| R5 | **"Added here" means added during your trip, and an add never starts one.** Add an **`adoptOnly`** option: `recordListEvent(…, { adoptOnly: true })` → `ensureSession({ adoptOnly: true })` returns the open session or null and **never calls `startSession`**. `noteAddedHere` drops its `view === "list"` gate, tags only when this user's session is open, and writes the `added_in_store` event only if a session was adopted. Why not a plain `activeSession` gate: this phone's `activeSession` can be stale (wrapped up on another phone, or past the 8 h expiry), and `ensureSession` would then open a new session from a home add. With `adoptOnly`, R5 holds by construction. |
| R6 | **Rows show quantity only when more than one:** `×N`, right side, read-only. **Already built** (`.li-qty` in both lenses); no code. Quantity is set in Browse, by a meal, or by Ask picks. |
| R7 | **The quick picker is a new component on an extracted search view, not a branch of the Ask form.** **Commit A** extracts `ItemSearchView` from `NewShelfSheet` with no behaviour change: the portal, visible-area follow + scroll-home, touch guard, a head with the input + Done, a slot for a count line, `children` for the list, and an `inputRef`. `NewShelfSheet.test.js` and the Ask harness walks stay green. **Commit B** builds the picker on it. It stays mounted, so App's openers (List's + Add, the Helm's + on List **and** Browse, the guide's Add) run `flushSync(open)` + `inputRef.focus()` inside the tap (the first-tap keyboard). Contents: title `Add to our list`, **Done**, a search field (`Type, or scroll and tap`), then the person's Browse catalog A–Z with letter headers (hidden items excluded, a browse-layer lens). No categories, pills, quantities or Ask. **The picker keeps its own query:** `addSearchedItem` takes the text as an argument (Browse passes its `searchQuery`), which also fixes today's bug where the Helm's + on Browse wipes Browse's search. The reveal card (F1b) and the no-match row reuse `SearchResultsList`. The old Add sheet, `AddSheetPanel` and its disabled mic retire. |
| R8 | **A tap in the picker adds one; the row is the confirmation and the undo** (revised 2026-11-27 after Dan's walk: an accidental tap two items back had no way back, and a toast's Undo is small, brief and away from the eye). ✓ comes from the shown list rows, overlay included (live, quantity > 0, not checked). Two kinds of ✓: **added this visit** reads **"Added · tap to undo"**, and a tap takes it back off (−1, the row returns to +; the same as today's Undo); **already on the list when the picker opened** reads **"On the list"** and is inert (no second add, no remove; fires `picker_tap_on_listed`). Done ends the visit; everything added becomes "On the list" next time. A tap is `adjustQty(name, +1, rawCategory)`. **No toast for a plain add or its undo:** the row says it. **The toast is kept only for what the row can't say:** off grid (R14); **an item checked off this trip**, which shows as + and whose tap is 085's renewal (a new need of 1), toasts "{Item} added again · it was in your cart" and its row reads "On the list" (inert: no undo, since a −1 would remove the row and the cart state can't be restored without a migration; to reverse it, check it off again); errors. The picker stays open; Done returns to exactly where you were. No match → `+ Add "{text}" as a new item` (D7: category `Other`; reveal-before-create, F1b); a row created this visit is undoable the same way. |
| R9 | **No quantity parsing in v1.** "2 avocados" is not parsed. |
| R10 | **Empty list = the guide** (Slice 3), quiet and named by intention. When the list has no live items (`totalItems === 0`, replacing today's "Your list is empty" block): `Our list`, the line **"What do we need?"**, then three rows with a › (not cards with buttons): **Add items** · "I know what we need." (teal, opens the picker) · **Browse** row · "Remind me what we might need." · **Plan a meal** · "I know what I want to cook." Then the footer: "One list for everyone in your household. At the store, check things off here." **The Browse row adapts:** if the household has no staples (new households have none), it reads **"Browse the aisles"** and opens Browse on everything; if it has staples, it reads **"Browse our staples"** and opens Browse with Staples selected. The first item replaces the guide, and it returns whenever the list is empty again. |
| R11 | **Home's "Nothing on your list · Start a list →" opens List** (the guide): `goToDoor("list")`, not `"input"`. The landing rule is unchanged (unbought ≥ 1 → List, else Home). |
| R12 | **New member welcome** (Slice 3). Shown once per person per household, the first time they open List and the list is **not** empty (an empty list shows the guide instead). It is a bottom card over the dimmed real list: "Welcome aboard · This is {Household}'s list", one line on the shared list, then three lines (**+ Add** when you know what you need · **Browse** when you want to choose · **Check off** in the store), and **Got it**. Existing members see it once too, on rollout. That's accepted as a "what's new". |
| R13 | **Welcome storage, v1:** localStorage keyed by user id + household id (`op_list_welcome_seen`). This is an experiment, so no migration. Accepted: it is once per phone, not once per member across devices. Upgrading to a per-member column is a later call. |
| R14 | **Off grid, every tap answers.** Until Slice 4: before `adjustQty`, check `offline` (or `navigator.onLine === false`); keep the picker open and toast **"Adding items needs signal for now."** at the tap. A transient failure that gets past the check takes the same toast. Never close the sheet and fail silently (today's behaviour). Slice 4 makes adds work off grid: the row lands now with the small dot and replays once. |

## Slices

1. **The List screen** (client only): R1–R6, R11. Small and walkable on its own.
2. **The quick picker:** R7 (Commit A, then Commit B), R8, R9, R14's interim.
3. **First-time:** R10 guide, R12–R13 welcome.
4. **Offline add through the picker** (was NOW 0): the Ask off grid machinery (queue, 089 run id / replay-once, overlay rows with the dot, tap-order flush). Offline quantity is Browse's stepper, so it rides here too.

Ship 1–3 together to prod (one promotion), so Helen and Elly meet the whole story. 4 can follow.

## Step 0 — DONE

Run 2026-11-26 on dev `4ef6f16` (relay `ab31291`). Findings now in the rulings: the picker is an extraction (R7); R5 needed `adoptOnly`; R8's Undo can't undo a renewal; `.op-name` is for people, not items (Telemetry); R1 reaches about ten more strings; R6 was already built; dropping the header row orphans `activeCycle` (R3); the Wrap up spacer needs the same rule as the bar (R4); and the Helm's + on Browse wipes Browse's search today (fixed by R7). `recordListEvent` → `ensureSession` → `startSession` is the only session opener (online check, `noteAddedHere`, the offline check flush), with no SQL inserts.

## Telemetry (the experiment has to be measurable)

All count-only, never names. **Privacy, corrected:** `.op-name` is for **people's** names (K3), not item names. Item names stay as they are everywhere, masked on prod by `maskAllText` and visible on dev by design (D4). The welcome's `{Household}` stays off the allow-list. **Joins `CHROME_ALLOW_LIST`** (fixed copy, leaf tap targets): the picker's Done, the guide's three row labels (one new class), the welcome's Got it. **Never listed:** picker rows, the no-match row, the toast text.

Events:
- `item_added_to_list` gains `source: 'picker'` and `door: 'list' | 'browse' | 'guide'`. `adjustQty` takes an options argument carried in its ctx; `emitItemAdded` stops hard-coding `'browse'`.
- `picker_opened` {`from`: `list_add` | `helm` | `guide`}.
- `picker_closed` {`added`: count, `open_s`: bucket}: covers "opened without adding", items per session and speed.
- `picker_tap_on_listed`: a tap on a ✓ row. **The quantity-friction signal:** do people try to add a second one?
- `first_item_added` {`after`: `guide` | `welcome`, `s`: bucket}: time from first seeing the guide or welcome to the first add.
- `list_guide_cta` {`choice`: `add` | `browse` | `plan`, `browse_kind`: `aisles` | `staples`}.
- `list_welcome_dismissed`.

What we look for in two weeks: do new members add through the picker? Does anyone still go to Browse to add one known item? Do people try to tap an item twice? But watching Helen and Elly again will tell us more than any of these at this stage.

## Verification (walk on dev, installed iPhone; harness first)

- V1 Nav reads HOME · PLAN · BROWSE · LIST. `#/shop` still opens List. Reload on `#/shop` lands on List. No "Shop" left where it means the door (R1's list). The `CI=true` build passes.
- V2 List header: `Our list`, Aisles \| A–Z, + Add, hairline. No count, no progress bar, no "N to find". Scrolling hides the header and the Helm's compact + appears.
- V3 With nothing checked there is no Wrap up bar and no spacer. Check one item and the bar appears ("1 of N · … carry forward"). All checked shows the All done card.
- V4 At home (no open session of yours), add from the List: no "Added here", no `added_in_store` row, **no session opened** (read `shopping_sessions` on dev). Repeat with a **stale** `activeSession` (wrap up on a second phone first): still no session opened. After a check-off, an add shows "Added here".
- V5 A row with quantity 3 shows `×3`; a quantity of 1 shows nothing (regression only).
- V6 The picker opens from List's + Add, the Helm's + on List and on Browse, and the guide: the same picker, keyboard up on the first tap. Type filters; scroll A–Z works with the keyboard down. Tap adds and the row reads ✓ "Added · tap to undo" with no toast; tapping it again takes it back off (also two items back). A row already on the list when the picker opened reads "On the list" and does nothing (fires `picker_tap_on_listed`). Done returns to the same scroll position. Browse's typed search survives the Helm's + on Browse.
- V7 Picker on an item checked this trip: shows +; tap adds a new need of 1; the toast says "added again · it was in your cart", and the row reads "On the list" (inert).
- V8 No match → "+ Add '{text}' as a new item" creates it in Other. A hidden item is revealed, not duplicated.
- V9 Empty list shows the guide. With no staples, the second row reads "Browse the aisles" and opens Browse on everything; after marking one staple and emptying the list, it reads "Browse our staples" and opens Browse on Staples. Each row goes where it says. The first add replaces the guide.
- V10 Home's "Start a list →" opens List (the guide).
- V11 A second account joining via invite sees the welcome once on a non-empty List. Got it dismisses it for good on that phone. An empty list shows the guide, not the welcome.
- V12 Off grid, a picker add keeps the picker open and answers "Adding items needs signal for now." at the tap; it never silently does nothing.
- V13 RUM: the events land with the attributes above. Privacy: a prod-config test (`rum.test.js` style) shows no new allow-listed selector sits on or above an item name, and a dev HAR shows no person's name outside `.op-name`. (Item names on dev are visible by design.)
- V14 **Three people, three places.** Dan shopping (his session open, checking off), Helen at home (adds from the picker), a third member at another store (her own session). Helen's adds reach both shoppers within the 2 s poll, tagged for neither and opening no session. Each shopper's "Added here" is their own. Record what the Wrap up bar shows each person and what happens to the other shopper's checked items when one of them wraps up (a known household-wide behaviour today; observe, don't fix).

## Direction (recorded, not built)

- **Write it (no AI), top of NEXT.** Several items, one per line. Each line goes through the catalog's existing exact-on-normalized match (`lower(trim(regexp_replace(name,'\s+',' ','g')))`): a hit goes on the list, a miss becomes a custom item in Other. Possible v1.5: pasting several lines into the picker's search adds each one. Ship the picker first and let usage size it.
- **Learned staples, NEXT** (replaces a fixed starter seed; Dan, 2026-11-26). Staples start at zero and the app earns them:
  - **Watch list:** a short list of likely staples (milk, eggs, bread, bananas, butter, coffee…). The first time one goes on the list, it becomes a staple, provisionally.
  - **Keep:** a watch-list staple stays while it is bought about **1× a month or more** (purchases = check-offs, `list_item_events` since 046); it drops quietly when it fades.
  - **Discover:** any item bought **2× a month or more** becomes a staple even if it was never on the watch list (Waffles). One-offs (Thanksgiving's cranberry sauce) never qualify.
  - **People win:** a staple marked by hand is never auto-removed; one removed by hand is never auto-added again (remember the "no thanks").
  - **Open design question:** auto-add with a visible "learned" mark and easy remove, or suggest ("You buy Waffles often. Make it a staple?") with one-tap accept.
  - **Cost:** a migration (each staple records its source: marked / watch / learned, plus the remembered dismissal) and a small calculation over purchase history (nightly or on read).
  - The guide's adaptive Browse row (R10) already covers the zero-staples days and switches by itself as staples are learned. The copy promises learning only once it ships.
- **Two simultaneous trips, NEXT.** Wrap up and the Wrap up bar are household-wide today. Decide what happens when two members shop at two stores at once (V14 records today's behaviour first).
- **Quantity in the picker, measured first.** If `picker_tap_on_listed` shows people trying to add a second one, revisit R8 (e.g. a second tap adds one more).
- **Write it with Claude:** natural language and quantities ("milk, eggs, two avocados, something for breakfast"), with gentle clarifying choices. It shares one parser with Text it.
- **Text it:** a household SMS number, add-only, matched to a member's verified phone, replying "Added … to {Household} ✓". It works on one bar when data won't. US A2P 10DLC registration (brand + campaign, privacy and terms URLs) takes weeks; start it early if we want it.
- **Ask picker adopts the list picker's look, follow-up after the Slices 1–3 promotion** (Dan, 2026-11-27). Principle: **one picker, one look; what it builds sets how a tap behaves.** Both already sit on `ItemSearchView` (Commit A). Converge: the title bar ("Add to the shelf") with the dark Done pill, A–Z with letter headers, the same ✓ / + marks ("On the shelf"). Keep the Ask's behaviour: a tap toggles on the draft shelf, the cap and its count line, save-at-the-end, and the create card's aisle pills (Ask items show photos, so the aisle matters). Kept out of this release because the Ask is live for kids and this release's measure is "is the list easier to build?". Walk with the Ask harness (ask-offline, wagon) plus the New ask search probe.
- **Hidden items in the picker's scroll, only if real use asks for it** (Dan, 2026-11-27). Today a hidden item is out of A–Z and found by typing its name (the reveal card, which works well). A two-account test made the gap look bigger than it is: people hide on purpose, don't compare pickers, and type what they know they need. If watching shows people hunting for something they hid, add a quiet "You've hidden N items · Show them" line at the end of A–Z.
- **"Shop for me":** the agent door sits beside + Add on the same List: one list, sent to someone else to buy. No new surface.
- **Fold Browse into List?** Only if Helen and Elly never reach for Browse. The picker already covers "I know what I need".
