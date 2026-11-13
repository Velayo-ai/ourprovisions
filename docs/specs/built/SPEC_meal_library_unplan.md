# SPEC — Meal Library: un-plan from the library ("one step back")

**Scope:** OurProvisions
**Status:** Designed 2026-10-03 in the design chat, during the Meal Library v1 + v1.1 walk. Ready for BUILD, next session.
**Builds on:** `SPEC_meal_library_v1.md` (with v1.1 folded in, `982cc34`), the post-walk afterglow fix (`afterglowIds`).
**Replaces:** the "Undo on the Plan toast" option discussed and dropped in the same session.

---

## Why this exists

In the library, **✓ Planned** is inert. A mis-tapped Plan can only be undone by going to This Week → ⋯ → Remove, which is three steps to undo a five-second mistake. Browse has no such problem, because its − takes back its + on the card itself.

The library can't simply make ✓ Planned a toggle. A planned meal has a lifecycle (Planned → ingredients on Shop → Ready → Cooked), and un-planning is only a clean reverse at the first stage. After Add to Shop, removing the plan also clears that meal's unbought items from the list.

Dan's rule settles it:

> **One step back, never two.** Any action can be undone while it is still the latest thing that happened to that object, at the door where it was taken. Once a later step has happened, the earlier one is history; to change it, undo the later step first.

Plan is the library's step. So the library can undo Plan **until the next step (Add to Shop, or Cooked it for a meal with nothing to shop for) has happened**. After that, the pill tells you where the meal is and changes happen on This Week.

---

## Decisions locked

| # | Decision | Rationale |
|---|---|---|
| D1 | **✓ Planned is tappable, and un-plans the meal**, while Plan is the meal's latest step. | Matches Browse (the door that adds can take back) for exactly as long as taking back has no side effects. Discoverable, unlike a toast that disappears. |
| D2 | **After the next step, the library shows the stage as an inert label.** On Shop and Ready each get their own words; tapping does nothing. | Surfaces must self-identify state. An inert control that looks identical to a live one is a dead button; a label that says where the meal is reads as information. |
| D3 | **Pill = action, text = status.** Plan and ✓ Planned are pills (tappable). Stage labels are plain text with a ✓, no border and no fill, sitting where the pill sits. | The shape tells you whether it does something before you tap it. |
| D4 | **The pill reads its state from `boardCardState`**, the function This Week and Home already share. No new derivation. | The board, Home and the library can never disagree about where a meal stands. |
| D5 | **Stage words are the board's own words.** The builder reads them from `boardCardState` in Step 0. "On your list" and "Ready" below are placeholders. | One vocabulary across the app. |
| D6 | **Un-plan confirms with a quiet toast:** *"{Meal} removed from your week"*, no action, auto-dismiss, same style as the Plan toast. | Symmetric with planning. To redo, tap Plan again. |
| D7 | **No confirmation dialog.** | In the un-plannable window nothing downstream exists, so nothing can be lost except queue position (see Known and accepted). |
| D8 | **Un-plan is not a judgment about the meal.** Changing your mind must not be recorded as "skipped this meal" if anything reads a skip as a preference. Step 0 decides how (see Data). | Learning should never treat a mis-tap as a signal. |

---

## Truth table

Library pill for a `kind = 'meal'` row, derived from `boardCardState` + `afterglowIds`. First match wins.

| # | Meal's state | Library shows | Tap |
|---|---|---|---|
| 1 | No open placement (never planned, removed, or cooked and closed) | **Plan** (outline pill) | Plans it (as built) |
| 2 | Open placement, **Add to Shop not yet done** (board: PLANNED, "Not on the list yet") | **✓ Planned** (sand pill) | **Un-plans it** + toast D6 |
| 3 | Open placement, **nothing to shop for** (board: PLANNED, "Nothing to shop for") | **✓ Planned** (sand pill) | **Un-plans it** + toast D6. Its next step is Cooked it, so Plan stays its latest step until then. |
| 4 | Open placement, ingredients on Shop, not yet Ready | **✓ On your list** (text, inert) | Nothing |
| 5 | Open placement, Ready (shopped, wrapped up) | **✓ Ready** (text, inert) | Nothing |
| 6 | Cooked this load (afterglow on This Week) | **Plan** (outline pill) | Plans it again (as built; `afterglowIds` makes the board agree) |

**Edge for the builder:** if a meal was added to Shop and its ingredients were later removed from the list by hand, follow whatever `boardCardState` says. If the board calls it PLANNED again, the library shows row 2 and un-plan is allowed. The board is the authority; the library never second-guesses it.

---

## Data — Step 0 decides, before any code

Un-plan closes an open placement that has no list links. The board's ⋯ → Remove already does this through `skipMeal`, which stamps `skipped_at`.

**Step 0 (read-only, report before building):**
1. Every reader of `meal_placements.skipped_at` in `src/`, every RPC and view (`prosrc`, `pg_get_viewdef`, case-insensitive), and `aisle_order_sessions` / `trip_reality`, if relevant.
2. Whether any reader treats `skipped_at` as a **preference signal** ("this household passes on X") rather than as "closed without cooking".
3. Because the placement PK is (household, meal) and re-planning reopens the same row, whether a `skipped_at` stamp even survives the next re-plan.

**Then:**
- **(A) No reader treats a skip as preference** → un-plan reuses the board's Remove path (`skipMeal`) unchanged. Record in ARCHITECTURE that `skipped_at` means *closed without cooking*, not a judgment, and that any future learning must not read it as one.
- **(B) Something does read it as preference** → **stop** and bring it back to the design chat. No schema change is designed here, and none is assumed.

No migration is expected under (A).

---

## Client

- **`LibraryCard` pill:** switch on rows 1–6. ✓ Planned becomes enabled; its handler is the same closing path as This Week's Remove (per Step 0), followed by toast D6.
- **Rows 4–5:** render a text label (✓ + stage word) in the pill's slot, the same height so the strip doesn't jump. No `button`, no hover state, no focus ring.
- **Optimistic:** the pill flips to Plan, the week line decrements and the queue renumbers in the same render as the tap; reconcile on the next poll as Plan does today.
- **Busy:** while the write is in flight, the pill is disabled (the Plan pattern).
- **Accessibility:** ✓ Planned's aria-label is fixed copy, **"Remove from this week"**, never the meal name. Stage labels are plain text.

### RUM

- `.lib-plan` is already on the allow-list and carries only "Plan" / "Planned". A tap on ✓ Planned now means un-plan; that's a semantic change in the same signal, so note it in ARCHITECTURE beside the allow-list.
- Stage labels are not buttons; **do not** add them to the allow-list.
- The un-plan toast carries the meal name and stays masked (no class, as the Plan toast).
- **Expected allow-list change: none.** Report by name if one turns out to be needed.

---

## Known and accepted

- **Un-plan then re-plan loses queue position.** A re-planned meal appends to the end of This Week. For a mis-tap that's harmless; for a deliberate "move it later", drag on This Week is the tool.
- **The library can't undo Add to Shop or Cooked it.** By design: those are This Week's steps. Whether This Week itself offers those undos is a separate read-only audit (requested 2026-10-03), not this spec.

---

## Out of scope

- Undo of Add to Shop and undo of Cooked it on This Week (pending the audit).
- Any change to This Week's ⋯ → Remove.
- New stage words beyond what `boardCardState` already produces.

---

## Verification (deployed dev preview, two accounts)

1. **Un-plan, row 2.** Plan PB & J in the library → ✓ Planned → tap it → Plan; toast *"PB & J removed from your week"*; week line −1; This Week no longer shows it and the rest renumber. No reload.
2. **Un-plan, row 3.** The same with Test Meal C (nothing to shop for).
3. **Inert after Add to Shop, row 4.** Plan Ground Beef Tacos → This Week → Add to Shop → library shows **✓ {board's word}** as text; tapping does nothing; Shop is untouched.
4. **Inert when Ready, row 5.** Wrap up a trip with a meal's items bought → library shows **✓ {board's Ready word}**; tapping does nothing.
5. **Row 6.** Cooked it → library shows Plan → Plan re-plans (regression of 8b with the afterglow fix in).
6. **Shape tells state.** At a glance on one screen: Plan and ✓ Planned look tappable; stage labels don't.
7. **Two accounts.** DT un-plans → DH's library flips to Plan and the week line drops within a poll; no toast on DH.
8. **Data read-back.** After step 1, the placement's columns match the Step 0 decision (A), and nothing else in the household changed (list rows, events, `meal_cooks`).
9. **RUM.** The allow-list is unchanged (30), proven in the deployed bundle; the toast and stage labels are masked.
10. **Widths.** 430 and 390 px: stage labels fit in the pill's slot without wrapping the ingredient count.

**Done when:** all ten pass on dev with two accounts, the Step 0 decision is recorded in ARCHITECTURE, and prod is held for its own fresh-eyes promotion together with (or after) Meal Library v1.
