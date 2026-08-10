# SPEC — Browse category filter rail

**Scope:** OurProvisions · Browse tab
**Status:** Active — ready for build
**Supersedes:** nothing. **Touches:** the existing declutter cycle descriptor.
**Mockup (source of truth):** `docs/mockups/mockup_filters_emoji_descriptor.html`

---

## Problem

The category filters render as a wrapped grid of ten emoji pills occupying four
rows — roughly a third of the viewport above the fold. The emoji are the main
source of visual noise: each is a different width and a different rendering
weight, so the rows read as ragged rather than as a set. Nothing in the control
communicates what the current filter selection is actually doing to the list.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Single horizontal scrolling row, no visible scrollbar | Reclaims three rows of vertical space. Filters stay one gesture away. |
| 2 | Keep the pill shape; do **not** adopt tab/underline styling | Pills read as toggles. Tabs read as one-of-N navigation, which would misrepresent a multi-select control. |
| 3 | Keep emoji icons; fix the geometry instead | Emoji are already the product's visual language for category. The raggedness was a layout problem, not an emoji problem — a fixed-width glyph box solves it. |
| 4 | No checkmark swap on the active pill | With multi-select, a row of identical ticks flattens the actives into each other. The espresso fill carries the state; the emoji keeps each pill identifiable. |
| 5 | Icon map is a lookup with a generic fallback | Category values are not a closed set today (`Mexican Asian`, `Bread & Desserts` are evidence). An exhaustive map would break on the next user-invented category. |
| 6 | One descriptor line, shared with the declutter cycle; filter text wins | Two italic lines saying overlapping things is worse than one. |

---

## Build

### The rail

- Replace the wrapped pill container with a single flex row: `overflow-x: auto`,
  `flex: 0 0 auto` + `white-space: nowrap` on each pill.
- Hide the scrollbar: `scrollbar-width: none` plus the `::-webkit-scrollbar`
  pseudo-element.
- `scroll-snap-type: x proximity` on the rail, `scroll-snap-align: start` on each
  pill, so a drag settles cleanly instead of drifting.
- Cream gradient masks (~24px) pinned left and right, `pointer-events: none`.
  The row must **fade** at the edges, not clip — a hard cut at the viewport edge
  reads as a rendering bug rather than an affordance.
- Horizontal padding on the rail so a pill never sits flush to the screen edge.
- On mount, scroll the first active pill into view.

### The pills

- Emoji lives in a **fixed-width box** (17px, centred, `flex: 0 0 auto`). This is
  the load-bearing detail: it makes a wide emoji and a narrow one produce
  identical pill geometry.
- Resting: `#F5EADA` fill, `--hairline` border, `--clay` text.
- Active: `--espresso` fill and border, `--cream` text, bold.
- Label shortening for the rail only: **"Bakery & Bread" displays as "Bakery."**
  Display string only — the stored category value does not change.

### Icon map + fallback

Keyed on the category value, normalised (trim + lowercase). Reuse the existing
emoji source if one already exists rather than introducing a second map.

| Category | Glyph |
|---|---|
| Staples | ⭐ |
| Produce | 🥦 |
| Meat & Seafood | 🥩 |
| Dairy | 🥛 |
| Pantry | 🥫 |
| Beverages | 🧃 |
| Bakery & Bread | 🍞 |
| Household | 🧹 |
| *anything unmapped* | 📦 |

**The fallback is required, not defensive padding.** Any category not in the map
— today's strays, tomorrow's user-created "Boat Snacks" — renders 📦 and behaves
as a normal filter. No blank glyph box, no crash, no special-casing.

### Clear chip

- Renders at the **head** of the rail when `selectedCategories.length > 0`;
  absent otherwise.
- Dashed `--clay` border, transparent fill — deliberately unlike a category pill,
  because it isn't one.
- Label: `✕ Clear {n}`. Tapping empties `selectedCategories`.

### Descriptor

One slot beneath the rail. Copy pattern, filters active:

```
Showing <b>Produce</b> — 14 items
Showing <b>Produce</b> and <b>Dairy</b> — 25 items
Showing <b>Produce</b>, <b>Dairy</b> and 2 more — 57 items
```

- 1 name → the name. 2 names → `A and B`. 3+ → `A, B and {n-2} more`.
  Names are bolded in `--clay`; the surrounding text is muted italic, matching the
  existing cycle descriptor's voice.
- Item count is the number of catalog items in the union of selected categories.
  Singular/plural on `item`.
- No filters active → the filter line contributes nothing and the slot collapses.

---

## Descriptor precedence — truth table

The declutter cycle already writes to this slot. Resolution:

| Cycle phase | Filters active | Descriptor shows |
|---|---|---|
| 0 — grouped | none | *(existing phase-0 behaviour: blank)* |
| 0 — grouped | ≥ 1 | `Showing … — N items` |
| 1 — rail hidden | none | *(existing phase-1 cycle text, unchanged)* |
| 1 — rail hidden | ≥ 1 | `Showing … — N items` |
| 2 — flat A–Z | none | *(existing phase-2 cycle text, unchanged)* |
| 2 — flat A–Z | ≥ 1 | `Showing … — N items` |

**Rule: when `selectedCategories.length > 0`, the filter line replaces the cycle
line entirely. Otherwise the cycle line is untouched.**

Why full replacement rather than concatenation: phase 1's existing
`N filters active · filters hidden` exists to tell the user filters are on when
the pills aren't visible. The new line does that job better — by name — so
keeping both would be redundant, and concatenating them produces a line too long
for one row on a phone.

**Do not modify the cycle's own copy.** Only its precedence changes.

### The phase-1 reachability question

At cycle phase 1 the rail is hidden, so the Clear chip is unreachable while
filters are active. This is **not** a trap and needs no new affordance: cycling
the icon back to phase 0 restores the rail, and phase already resets to 0 on tab
and household switch. Adding a second clear control to cover a two-tap path
would be complexity bought for nothing.

---

---

## The add-item category picker

**Mockup:** `docs/mockups/mockup_add_item_category_picker.html`

The same pills, the opposite layout — and the reason is worth stating plainly,
because a future session will otherwise "unify" these two surfaces and regress
one of them.

> **Principle: scroll where you're grazing, show everything where you're
> choosing.**
>
> The Browse rail scrolls because the user is browsing, may select several, and
> can afford to swipe. The add-item picker wraps and shows every category at once
> because the user is completing a task, must select exactly one, and a category
> hidden off-screen is a category they won't file under. Misfiling is not a
> cosmetic cost — it degrades the catalog permanently, and the catalog is the
> asset.

### Build

- Wrapped grid, **all** categories rendered, no scroll. Same pill component and
  same icon map as the rail, so there is one visual vocabulary for "category"
  across the app.
- **Single-select.** Tapping a category selects it and completes the step — one
  tap, no separate confirm button.
- Full labels here: **"Bakery & Bread" spells out in the picker.** The rail's
  "Bakery" is a display shortening for a space-constrained row; the picker has
  vertical space and accuracy matters more at filing time.
- A dashed **`+ New category`** tile sits last in the grid. This is the surface
  that produced today's strays, so it stays — but it now reads as a deliberate
  option rather than the only escape from a list that didn't have the right
  answer.
- Unmapped categories render 📦 here too, same fallback rule.

### Pre-selection from context

When the add flow is entered from a section header's **`+ Add item`**, the
category is already known — the user answered the question by choosing where they
tapped. The picker opens with that category **on** and the subtitle reads
`Filed under {Category}. Tap another to move it.`

The step becomes a confirmation rather than a question, and the flow completes
without a second decision. Entering from a global add control (no section
context) opens with nothing selected and the subtitle
`Pick a category and we'll file it for next time.`

This is the one-click completion Dan asked for: from a section header, naming the
item is the only real decision left.

---

## Out of scope

- **Sticky rail.** Deliberately deferred. Pinning the rail beneath the search bar
  is a genuine improvement, but it interacts with the photo header's scroll
  behaviour and with phase 1's hidden state. Ship the row first, verify, then
  consider it as its own change.
- **Category data cleanup.** `Bakery & Bread` / `Bread & Desserts` merging and
  `Mexican Asian` retirement is a `catalog_items` data migration across two
  environments with live user rows. It gets its own spec and must not land during
  the Clerk cutover. The rail works at ten categories; it works better at eight.
- **Per-category item counts on the pills.** Considered and cut — nine pills each
  carrying glyph + word + number is too many parts. The descriptor carries the
  count instead.

---

## Verification (dev, before promote)

1. Rail scrolls horizontally with no visible scrollbar; edges fade, never clip.
2. Pills of varying emoji width are the same height with consistent internal
   spacing — the fixed glyph box is doing its job.
3. Multi-select still works: two or more filters on simultaneously, list shows the
   union.
4. Descriptor matches the truth table at all six rows. Specifically confirm phase
   1 + filters active shows the filter line, not the cycle line.
5. A category with no map entry renders 📦 and filters normally. Test by pointing
   a pill at `Mexican Asian`.
6. Clear chip appears only with filters active, count is correct, tap empties the
   selection and collapses the descriptor.
7. Filters still reset on household switch and tab switch (existing behaviour from
   `dbb57f2` — confirm no regression).
8. Two-household account: switching households does not leak a stale filter into
   the new household's rail.
9. Add-item picker shows every category with no scroll, including any
   user-created ones, and a single tap completes the step.
10. Entering the add flow from a section header pre-selects that section's
    category; entering it globally pre-selects nothing.
11. `+ New category` still creates a category, and the new category appears in
    both the picker grid and the Browse rail with the 📦 fallback glyph.

## Risk

Low. No schema change, no RPC change, no auth-path change. The one non-obvious
coupling is the shared descriptor slot — a careless implementation could leave
the cycle line and the filter line both rendering, which the truth table exists
to prevent.
