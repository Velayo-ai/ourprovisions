Reported: 2026-11-27 04:23 ET · dev 01593b3 · main 5098508 · re: BUILD Slice 3 of SPEC_one_list.md · prompt adefe15

# One list, Slice 3 is on dev: the row is the undo, the empty list is the guide, the welcome, and the dashboard's events. Every harness walk passes; your iPhone walk is next.

Built on dev and pushed with Dan's OK. Main and prod are untouched; no docs, migrations, dashboard or detector were written. Both specs (`SPEC_one_list.md`, `SPEC_one_list_dashboard.md`) were re-pulled into `handoff/`. The earlier version of this prompt (`3cbd9f7`) was never taken, so there was nothing in flight.

## The commits (dev, pushed)
| | Commit | What |
|---|---|---|
| R8 revised | `4f51fc3` | **The row is the confirmation and the undo.** |
| R10 | `6152c36` | **The guide.** |
| R12 + R13 | `013a402` | **The new member welcome.** |
| telemetry | `d6fd79a` | **The one-list spans for the dashboard.** |
| harness | `3d47099`, `01593b3` | `one-list-walk.js` for Slice 3, then V11's wait for the RUM export. |

**R8 revised in detail:**
- **Fresh rows:** a row added this visit reads ✓ "Added · tap to undo", and a tap takes it back off (−1, back to +), however far back.
- **Rows already on the list** when the visit began read "On the list" and are inert (`picker_tap_on_listed`). Done ends the visit.
- **No toast for a plain add or its undo.** The toast stays for:
  - off grid;
  - the renewal ("{Item} added again · it was in your cart"; its row then reads "On the list" and is never undoable);
  - errors ("That didn't save. Try again."; `adjustQty` gains `onError`, so a failed undo keeps the row fresh).
- **Undoable too:** a created row and a revealed-and-added row.
- **The query stays** after a tap, so the confirming row stays in sight.
- **A second tap** while a row's change is still out does nothing.

**R10 in detail:**
- "What do we need?", then three quiet rows with a ›:
  - **Add items** · "I know what we need." (teal; `openPicker("guide")` inside the tap);
  - **the Browse row** · "Remind me what we might need.":
    - no staples → "Browse the aisles", Browse on everything;
    - staples → "Browse our staples", Browse with Staples selected (carried through the door switch's filter reset);
  - **Plan a meal** · "I know what I want to cook." (the meal library).
- The footer as specified.
- **The empty header reads "Our list" alone, with no + Add, as on mockup screen 1;** the guide's Add items is the add. Say if you want the pill back.

**R12 + R13 in detail:**
- **The card:** a bottom card over the list dimmed at 55%, with the copy as on mockup screen 5. Got it (focused) or Escape dismisses it; the page behind is scroll-locked.
- **When it shows:** once per person per household (`op_list_welcome_seen:<clerk user id>:<household id>`), the first time they open a non-empty List, signed in and loaded. Never over the place's own welcome sheet; a household switch decides afresh.
- **Storage:** storage that throws counts as seen.
- **Privacy:** the household's name is heading text only, never in an attribute (the dialog is `aria-labelledby` its heading).

**Telemetry (`lib/listTelemetry`):**
- **workflow.name on every span**, set to its own name, so `rum.workflow.count` sees it:
  - `picker_opened {from}`;
  - `picker_closed {added, added_bucket 0|1|2-4|5+, open_s}`;
  - `picker_tap_on_listed`;
  - `list_guide_cta {choice, browse_kind on browse}`;
  - `first_item_added {after guide|welcome, s bucket}`;
  - `list_welcome_dismissed`.
- **Both `item_added_to_list` emitters** (manual, meal) gain `workflow.name`.
- **Attributes:** `household_id` stays a span attribute only; no ids or names as dimensions.
- **`first_item_added`** fires through a new hook callback (`onItemAddedRef`) that every manual add calls.
- **`CHROME_ALLOW_LIST`** gains `.list-guide-row` and `.list-welcome-ok` (now 86), never the welcome's heading.
- **Ask has no `item_added_to_list`** (it sends `ask_completed`), so the dashboard's chart 1 will show no `ask` series.

**Tests:**
- Jest: **87 suites / 1360 tests** pass; the `CI=true` build compiles.
- New: `ListGuide.test.js` (guide, welcome, its memory, V13 for both) and `lib/listTelemetry.test.js` (every attribute set pinned; the callers).
- Rewritten: `ListPicker.test.js` (12, for the revised rows).

## Pre-walk on the deployed preview (`3d47099`, Cody Test House)
| Walk | Result |
|---|---|
| `one-list-walk.js` | **81/81** |
| `offline-walk.js` | **60/60** |
| `ask-offline-walk.js` | **31/31** |
| `wagon-walk.js` | **ALL PASS** |
| `shop-burst.js` | **ALL PASS** |
| the Ask search probe | **PASS** |

**What one-list-walk now covers:**
- **Revised V6:**
  - a tap reads ✓ "Added · tap to undo", with no toast;
  - a row on the list before the visit is "On the list", and a tap adds nothing;
  - three fresh adds, then a tap on the first (two back) takes it off the server and back to +, while the other two stay;
  - the next visit reads them "On the list".
- **Revised V7:** the renewal toast; the row is "On the list", inert.
- **V8:** the created row is fresh.
- **V9:**
  - the guide's copy, rows and footer;
  - "Browse our staples" → Browse with Staples selected;
  - Plan a meal → Plan, Meals;
  - Add items → the picker with the focus in the tap;
  - the first add replaces the guide.
- **V11:**
  - the welcome on a non-empty List: "This is Cody Test House's list", aria-labelledby, no aria-label;
  - Got it sets the key, and after a reload it never shows again;
  - an empty List shows the guide, not the welcome.
- **The spans, off the wire (OTLP to `/v1/rumotlp`):**
  - every one-list event was sent at least once, each with `workflow.name` = its name;
  - `picker_closed` carries `added_bucket` and `open_s`;
  - `list_guide_cta` and `first_item_added` carry their labels;
  - no item or household name appears in any attribute.

**Before the push:** 77/80 on a local build. The 3 misses were the span checks, which need the deployed build's RUM token.

**What the harness couldn't drive:**
- **V9's "Browse the aisles" half:** Cody Test House already has 38 staples, so only the "Browse our staples" half ran. You declined deleting those test staples before, so the aisles half is covered by Jest only.
- **V11's "second account":** there is one test account. It ran as the same account with its welcome key cleared; Jest pins that the key is per person.

**Walk fix on the way:** the first dev run was 80/81. The walk reloaded right after Got it and dropped `list_welcome_dismissed` from the RUM batch. `01593b3` waits one export interval; then 81/81. (My push question named that commit "f8a3c8e" by mistake; the sha is `01593b3`, the only commit pushed.)

## Housekeeping
- `ask_landings` test rows from today's two ask-offline-walk runs: **11 deleted** on dev (Dan's OK), after the system-id check `7642734024280108049`, scoped to Cody Test House. **Read back 0.**

## For Dan's phone walk (installed iPhone, dev) — only what needs real iOS
- **The guide against screen 1 and the welcome against screen 5,** at XXL text too: row heights, the teal Add items, the dim behind the card, the card above the home indicator.
- **The fresh-✓ undo by thumb:** tap two or three items, then take one back from further up.
- **The dimmed list behind the welcome,** and that nothing scrolls under it.
- **Whether the empty header** should keep "Our list" alone (as the mockup) or get its + Add back.

Not built: the Splunk dashboard and the "Picker silent" detector (at the promotion, after the tags are indexed), and the Slices 1–3 promotion itself.
