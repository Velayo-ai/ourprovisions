# design_handoff.md

=== SESSION_LOG ===

### [2026-11-14] — [OurProvisions] — Phone walk of View & organize found two regressions (fixed); Ask launch path laid out
**Goal:** Check last night's View & organize / Ask work on a real iPhone and map what's left before Ask can launch. Design chat 2026-11-14 01:12 → 08:55 ET (after the `62da76b` SESSION END); Claude Code fixed on dev in the same window.
**Completed:**
- **Listed what's left for Ask to launch,** from ROADMAP on dev + last night's handoff (see ROADMAP_DECISIONS for the ordered path).
- **Found two regressions on iPhone, diagnosed them in chat, and had them fixed on dev:**
  - Delete confirmations (Ask and category) opened *beneath* View & organize; Done revealed them, and two taps stacked two confirms. Diagnosed from Dan's repro (both dialogs appeared on Done, so it was layering, not an iOS repaint): `cffbbc3` ("confirmations above Manage") had been lost in the sheet merge. Fixed `3750c62`: above the sheet, one at a time.
  - Edit/New ask couldn't scroll; the item list was unreachable. Cause partly my prompt ("list fills remaining height", leaving no room on a phone) plus the scroll lock. Fixed `314c7f0`: one scroller for the whole form, Save pinned; "Who's picking?" label restored in Edit.
- **Dan confirmed both fixes on his phone.**
**Unfinished:**
- **Butter's shelf photo shows a lake** on Ask Nina (dev). It could be a test photo; if not, a photo is being attached to the wrong item. Check.
- Carried from `62da76b` (still open): flag-off verification of View & organize, hand-back toast check, the shelf-header "+ New item" decision, first-run hint/filter-icon discoverability, custom category → aisle mapping (Phase 2).
**Next session:**
SESSION START
Goal: Clear the Ask launch blockers on dev: flag-off verification of tonight's surfaces, the hand-back toast check, the wagon polish (A14/A15), and the `updateQty` lost-update fix.
State: Dev `314c7f0` (Ask on): View & organize, turquoise Ask pills in C4.2 order, New/Edit ask (scrolls, one confirm at a time, above the sheet), search-first item creation, all walked on Dan's iPhone. Prod `83e05e2` unchanged, Ask off.
Done when: a flag-off build shows no Ask surfaces and categories still manageable; the hand-back lands as "Easton added N · See" with no approval step; the wagon reads as a beach wagon in the sunrise scene; a manual +1 can't overwrite a concurrent pick. Then Ask is ready for its launch session.
Files updated: None (design chat)
DB changes: None

=== ROADMAP_DECISIONS ===

| 2026-11-14 | **Ask launch path (ordered).** Before promoting: (1) phone walk + flag-off verification of View & organize / Ask surfaces (prod relies on categories still being manageable with Ask off, since "Manage categories" was removed); (2) hand-back toast check; (3) wagon polish (A14/A15, already marked "before the Ask promotion"); (4) **`updateQty` lost update fixed with a server-side increment, now treated as a launch blocker** (the race only exists once kids' picks land live). Then one launch session: 077 → 078 → 083 → 084 on prod with read-back → Dan sets `REACT_APP_FEATURE_ASK=on` for Production + redeploy → `meal-photo-sweep` only after `deno check` → prod walk + Verification 8 HAR ("Easton" ×0) → Ask specs to `built/`. Not blocking: `.op-name` member-name pass, bought-row +1 double count, re-add contributor line, Manage Categories redesign leftovers (re-read against View & organize first). |
| 2026-11-14 | **No nested scroll areas in sheets and full-screen screens.** One scroller per screen, footer pinned; a background scroll lock must never block touch scrolling inside the foreground container. |
| 2026-11-14 | **Layering rule:** a dialog opened from a sheet renders above it, and only one confirmation exists at a time; covered by tests. Merging sheets must carry their layering fixes. |
- Move `updateQty` lost update from NEXT to NOW (Ask launch blocker).
- Add to NOW: Ask launch blockers (flag-off check, hand-back toast, wagon polish, `updateQty`).

=== ARCHITECTURE ===

- **Sheet layering:** confirmations opened from View & organize render above the sheet; a new confirm replaces any open one (`3750c62`), with tests for topmost layer and no stacking.
- **Ask screen scrolling:** the whole New/Edit ask form is one scroll container with Save pinned (`314c7f0`); the background lock leaves the foreground container scrollable, with a test.

Carries no unmerged handoff (previous `62da76b` is merged in dev's SESSION_LOG, `b0e3a2b`).
