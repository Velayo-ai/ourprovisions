## SESSION_LOG

### 2026-11-27 — OurProvisions — One list, one screen: from Helen's confusion to prod
**Goal:** Make it obvious to a new user how to build a shopping list, and where that list is when they're in the store, after Helen and Elly couldn't tell Browse from Shop.
**Completed:**
- Diagnosed it from watching Helen add Thanksgiving items. The app treated someone building a list as someone already shopping: it landed on Shop at home ("Leaving early?" at 0 in the cart), tagged home adds "added in store" (opening sessions), never said "list", and repeated its counts three times.
- Designed **one list, one screen** on a five-screen Design canvas (https://claude.ai/artifact/43Zo5bJR1ivmDAj3SD5Nug):
  - "Our list" (Shop → List);
  - the quick picker;
  - the empty-list guide named by intention (Add items · Browse · Plan a meal);
  - the one-time new-member welcome.
  - Explicit "building vs shopping" moods were considered and dropped: the first check-off starts the trip.
- Wrote `SPEC_one_list.md` (R1–R14). Amended it twice:
  - after Step 0 (relay `ab31291`): the picker became an extraction, R5 gained `adoptOnly`, `.op-name` was corrected to people only;
  - after a second review (ChatGPT): intention copy, the adaptive Browse row, V14, three count-only events.
- Then, from Dan's walks:
  - revised R8: the row is the confirmation and the undo, with no toast;
  - added R7a (hidden items in the scroll), then dropped it (search's reveal card already covers real use).
- Wrote `SPEC_one_list_dashboard.md`: 10 charts plus a "Picker silent" detector. Its code half (`workflow.name` on every one-list span, bucketed labels) rode Slice 3.
- Drove Step 0 and Slices 1–3 through Cody by handoff prompts (`bef68d7` → `0150f2a` → `e01b58b` → `adefe15`). Dan walked each on dev, the last with two accounts: "works really well".
- **Promoted to prod** (prompt `2b541c4`, relay `ba8e1ce`):
  - main **`e93b265`** (tree = dev `01593b3`), `dpl_4w4EHbkyGryjpzcQF1T8JaW34V7j`, `main.ab743abc.js`;
  - carries `c783bea`, Cody's fix for offline-started trips recording their start at the reconnect (on prod since 11-24);
  - client-only: prod's functions and grants read back equal to dev, with no migration.
- Recorded the principles (see ROADMAP_DECISIONS) and the follow-ups: learned staples with a household switch, Write it, the toast audit, the Ask picker's new look, two simultaneous trips.

**Unfinished:**
- **Dan's signed-in prod walk** in his own household: the List header, + Add → picker with the keyboard up, the fresh-✓ undo, the welcome once per member. Cody can't sign in on prod. The guide waits for a naturally empty list (don't empty the real one).
- **Splunk:** index the tags (`source`, `door`, `from`, `added_bucket`, `open_s`, `choice`, `browse_kind`, `after`, `s`), then build the dashboard and the "Picker silent" detector on prod data.
- **The real test:** Helen (and Elly) using it unprompted. Two-week dashboard read.
- **Harness gaps (Jest-only):** "Browse the aisles" (the test house has 38 staples), and the welcome for a truly separate second account.
- **Slice 4, offline add through the picker:** this is what was NOW 0 (offline quantity + manual add). Not started.
- **Known, not addressed:** Wrap up and the Wrap up bar are household-wide. Two members shopping two stores at once is undesigned (V14 records today's behaviour).

**Next session:**
SESSION START
Goal: Read one list's first signals on prod. Dan's prod walk; Helen adds a few items unprompted (observed); index the Splunk tags; build the dashboard and the "Picker silent" detector.
State: One list is live on prod (main `e93b265`, `main.ab743abc.js`); dev `01593b3` has the same tree. Rollback: Instant Rollback to `dpl_3niRSygTFv6vT9RTQPhPz8Mrjpzc` (main `5098508`), never a redeploy; it would also remove the trip-start fix. The Ask is unchanged and on.
Done when: Dan's prod walk passes; Helen builds a short list without help (noted what she did); the tags are indexed and the dashboard shows `picker_opened` split by `from` in production; the detector is live.
**Files updated:** `handoff/SPEC_one_list.md`, `handoff/SPEC_one_list_dashboard.md` (design chat). Code per relay reports `2ecbfd4` (Slice 1), `61c7202` (Slice 2), `e2a7e22` (Slice 3) and `ba8e1ce` (promotion); Claude Code merges the implementation detail.
**DB changes:** None on prod or dev schema. Test `ask_landings` rows were deleted on dev only (read back 0).

## ROADMAP_DECISIONS

| date | decision + rationale |
|---|---|
| 2026-11-26 | **One list, one screen.** The household keeps one list on one screen, "Our list", the same at home, in the store and over coffee. What you *do* changes it: the first check-off starts the trip and brings in the Wrap up bar. Why: we had treated someone building a list as someone already shopping. Explicit moods ("Start shopping") were designed and dropped as one more concept for new users. |
| 2026-11-26 | **Two ways to pick.** Adding from the list, wherever you are (List's + Add, the Helm's +, the guide), opens one quick picker: type or scroll, tap. Choosing slowly (categories, quantities, staples, the Ask hand-off) is Browse's job, and only Browse's. Quantity lives in Browse; the picker adds one; no quantity parsing in v1. |
| 2026-11-26 | **Say it once.** Each fact appears in one place per screen. Trip progress lives only in the Wrap up bar; the list count from other doors only in the LIST badge. The header count, progress bar and "N to find" went. |
| 2026-11-26 | **Meet people where they are, named by intention:** Add items ("I know what we need"), Browse ("Remind me what we might need"), Plan a meal ("I know what I want to cook"). Not effort claims. |
| 2026-11-26 | **The shared intention is permanent; the means of contributing and fulfilling can evolve.** The list is the product. Write it, Pick it, Plan it, Ask someone, Text it feed it; shop ourselves or "shop for us" fulfil it. |
| 2026-11-26 | **An add never starts a trip (R5, `adoptOnly`).** "Added here" means added during the adder's own open session. The plain `activeSession` gate was rejected because this phone's view can be stale (wrapped up elsewhere, or past 8 h). |
| 2026-11-26 | **Shop door renamed List**; the `#/shop` hash, view key and `WRAP_UP_HASH` kept (RUM page-view history). Browse keeps its name. Verbs ("Let's shop →") and the tagline stay. |
| 2026-11-27 | **Feedback lives where the eye already is.** If the thing you touched can show the result (✓, a row, a count), nothing else speaks. A toast earns its place only for something that didn't happen (off grid, errors), happened out of sight, or for an object that moved away from your thumb. Applied to the picker (R8 revised); an app-wide toast audit is NEXT. |
| 2026-11-27 | **In the picker, the row is the undo.** Added this visit → ✓ "Added · tap to undo". Already on the list → "On the list", inert. A tap that adds can be undone; a tap that removes only happens on a draft. Why: the shared list is live for everyone, so one stray tap mustn't remove Helen's item mid-trip. An inert ✓-tap is also the quantity signal. |
| 2026-11-27 | **One picker, one look; what it builds sets how a tap behaves.** The list picker adds now; the Ask picker toggles on a private draft with a cap. Both sit on the shared `ItemSearchView`. |
| 2026-11-27 | **Hidden items stay out of the picker's scroll, found by search's reveal card.** A "Show them" line was designed and dropped: two-account testing made the gap look bigger than real use will. |
| 2026-11-26 | **The welcome is remembered per phone (localStorage)** for this experiment, so no migration. A per-member column is a later call. |
| 2026-11-26 | **Learned staples, with a household switch "Learn staples", default on.** Staples start at zero and are earned. A watch-list item becomes a staple on its first add; it stays while bought about 1×/month; anything bought 2×/month is discovered. Hand-marked staples are never auto-removed and removed ones never re-added. Learned ones are tagged. Turning the switch off keeps what's learned. Replaces a fixed starter seed. |

**Roadmap moves:**
- **Move to DONE (2026-11-27):** "One list, one screen" — Slices 1–3 (Shop → List, the List header, the Wrap up bar after the first check-off, `adoptOnly`; the quick picker on `ItemSearchView` replacing the Add sheet; the row-as-undo, the guide, the welcome, the one-list telemetry). Also the offline trip-start fix (`c783bea`). Live at main `e93b265`.
- **NOW:**
  - Read one list on prod: Dan's prod walk, watch Helen and Elly, index the Splunk tags, build the dashboard and the "Picker silent" detector (`SPEC_one_list_dashboard.md`).
  - Then **Slice 4: offline add through the picker** (replaces the old NOW 0 "offline quantity + manual add"): the Ask off grid machinery (queue, 089 replay-once, overlay rows with the dot, tap-order flush).
- **NEXT:**
  - **Write it (no AI):** several items, one per line, through the catalog's exact-on-normalized match; a miss becomes a custom item in Other. Possibly v1.5 as paste-into-the-picker.
  - **Learned staples + the "Learn staples" switch** (decision above; needs a migration).
  - **Toast audit:** every toast in the app against "feedback lives where the eye is".
  - **Ask picker adopts the list picker's look:** title bar, A–Z with letter headers, the same ✓ / + marks; keeps the toggle, cap, count line and aisle pills.
  - **Two simultaneous trips:** Wrap up is household-wide today.
  - **Quantity in the picker:** only if `picker_tap_on_listed` says people want a second one.
- **LATER:**
  - Write it with Claude (natural language and quantities).
  - **Text it:** household SMS, add-only, from verified numbers. Start the US A2P 10DLC registration early if wanted.
  - **"Shop for me":** an agent door beside + Add.
  - Fold Browse into List, only if Helen and Elly never reach for Browse.
  - The hidden-items "Show them" line, only if observed.

## ARCHITECTURE

- **`ItemSearchView` + `useItemSearch`** (`src/components/ItemSearchView.js`): the shared portaled search view.
  - Holds the visible-area follow and scroll-home, the touch guard, the head (input + Done), a count slot, and the same-tap open (`flushSync(open)` → `focus()` → `flushSync(viewBox)`).
  - `NewShelfSheet` (Ask) and the list's quick picker (`ListPicker`) both sit on it.
  - Principle: one picker, one look; what it builds sets how a tap behaves.
  - `AddSheetPanel` and the old Add sheet are retired.
- **Trip sessions** (`src/lib/tripSession.js`, `ensureTripSession`):
  - `recordListEvent` → `ensureSession` → `startSession` is the only session opener.
  - **`adoptOnly`** returns this person's open session or null; it never starts one and never holds the start lock.
  - Adds log `added_in_store` only through `adoptOnly`, so an add never opens a session (R5).
  - The List view no longer means "in the store": "added here" keys on the adder's own open session.
- **The Wrap up bar** renders only at `checkedCount > 0` (not all), and its spacer keys the same way. The 0-checked dashed state is retired.
- **Picker semantics (R8):**
  - ✓ derives from the shown list rows, overlay included.
  - Rows added this visit are undoable (−1); rows already on the list are inert.
  - A renewal (an item checked this trip) is 085's new need of 1, with no undo.
  - `addSearchedItem` takes its text as an argument, so the picker and Browse keep separate queries.
- **Telemetry** (`lib/listTelemetry`):
  - Every one-list span carries `workflow.name` = its event name, so `rum.workflow.count` charts it.
  - Labels are bucketed (`added_bucket`, `open_s`, `s`). `household_id` is a span attribute only, never a dimension.
  - `item_added_to_list` gains `source: 'picker'` and `door`.
  - **Correction:** `.op-name` masks **people's** names. Item names are masked on prod by `maskAllText` and visible on dev by design.
  - `CHROME_ALLOW_LIST` is 86 entries (adds `.item-search-done`, `.list-guide-row`, `.list-welcome-ok`).
- **Client storage:** `op_list_welcome_seen:<clerk user id>:<household id>` (the welcome, per phone).

## DROPPED_FILES

- `SPEC_one_list.md` → `docs/specs/active/`. Slices 1–3 shipped; it stays active for Slice 4 (offline add through the picker) and its Direction items.
- `SPEC_one_list_dashboard.md` → `docs/specs/active/`. The dashboard and detector are not built yet.
