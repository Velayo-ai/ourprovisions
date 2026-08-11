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
| 1 | Single horizontal scrolling row *(amended 2026-08-10: **with** a styled scrollbar — see "Scroll affordance")* | Reclaims three rows of vertical space. Filters stay one gesture away. |
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
- ~~Hide the scrollbar: `scrollbar-width: none` plus the `::-webkit-scrollbar`
  pseudo-element.~~ **Reversed 2026-08-10 — see "Scroll affordance" below.**
- `scroll-snap-type: x proximity` on the rail, `scroll-snap-align: start` on each
  pill, so a drag settles cleanly instead of drifting.
- Cream gradient masks (~24px) pinned left and right, `pointer-events: none`.
  The row must **fade** at the edges, not clip — a hard cut at the viewport edge
  reads as a rendering bug rather than an affordance.
- Horizontal padding on the rail so a pill never sits flush to the screen edge.
- On mount, scroll the first active pill into view.

### Scroll affordance *(added 2026-08-10 — supersedes "no visible scrollbar")*

The original spec hid the scrollbar for cleanliness. That created a rail with no
signal that it scrolls, and the next two sessions each tried to buy that signal
back with a new part. Both were removed. **The scrollbar is the affordance:** it
shows position *and* affords dragging, which neither replacement did.

Current build:

- Styled `::-webkit-scrollbar`, 4px high, `#E8D5B7` thumb on a transparent track,
  2px radius. No arrows, no chip, no shadow.
- **Not gated on a pointer media query.** Device-confirmed on a Surface: with a
  touchscreen *and* an attached mouse, `hover`, `pointer`, `any-hover` and
  `any-pointer` **all report false**. A pointer query would therefore hide the
  scrollbar from exactly the mice that need it. No gate is needed anyway — mobile
  browsers use transient overlay scrollbars, so this renders on desktop and
  effectively nothing on touch. If a permanent track ever does appear on a
  touchscreen, gate by **viewport width** — a size question, which media queries
  answer honestly.
- **Chromium finding, load-bearing:** `::-webkit-scrollbar` is ignored **entirely**
  if `scrollbar-width` or `scrollbar-color` is set on the same element. That is why
  the Firefox fallback sits behind `@supports not selector(::-webkit-scrollbar)`
  rather than being declared alongside the webkit rules. A future tidy-up that
  flattens the two into a plain `scrollbar-width: thin` will **silently kill the
  styled track in Chrome** — the CSS still parses, the scrollbar just reverts.

#### Rejected: pager buttons *(built 2026-08-10, removed same day)*

Chevron buttons at each rail edge, gated on measured overflow. They existed only
to compensate for hiding the scrollbar, and they were strictly worse than the
thing they replaced: they showed no position and afforded no dragging. Removing a
part beat adding one.

#### Rejected: first-run scroll nudge *(built 2026-08-10, removed same day)*

On cold start, if the rail overflowed, it scrolled ~40px right and back over
~400ms, capped to a user's first few sessions. **Do not rebuild it.** Three
reasons, in order of weight:

1. **Its job is already done.** The nudge existed to advertise that the rail
   scrolls, back when the scrollbar was hidden and there was no visual cue. The
   styled scrollbar now carries that job permanently and without motion. The
   nudge is a solution to a problem that no longer exists.
2. **Device-observed, it read as a layout glitch, not an invitation.** Content
   moving on its own with no user input is what a rendering bug looks like.
3. **It fired ~400ms after the splash resolve**, undercutting an entry animation
   that was deliberately tuned to be calm.

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

### Clear chip — ~~built~~ **REMOVED 2026-08-10**

> Built as specced, then cut. Deselecting is tapping an active pill; a second
> control for the same job did not earn its place at the head of the rail.
> Retained here only so a future session doesn't reintroduce it from this spec.

- ~~Renders at the **head** of the rail when `selectedCategories.length > 0`.~~
- ~~Dashed `--clay` border, transparent fill. Label `✕ Clear {n}`.~~

### The rail carries TWO kinds of filter *(amended 2026-08-10)*

This is the correction a future session most needs, because the names look alike:

- **Category values** — `catalog_items.category`, held in `selectedCategories`.
  An **open set**: users create their own, so any category-keyed code needs the
  📦 fallback.
- **Staples** — **NOT a category.** It is per-household **row-presence in
  `household_staples`** (migration 016), held in the separate `stapleFilter`
  boolean and applied as a **predicate** in `displayCategories` Layer 1, before
  categories narrow. `catalog_items.is_staple` is a **dormant column** that
  migration 016 retired; no read path should consult it.

Consequence: **any consumer that keys off `selectedCategories` alone is blind to
Staples.** That is exactly how the descriptor shipped a line whose count included
the staple narrowing while its names did not mention it.

### Descriptor

One slot beneath the rail. It names the **active filter set** — not the active
categories. Copy pattern:

*(verb amended 2026-08-10 — `Showing` → `Showing only`, all phases)*

```
Showing only <b>Produce</b> — 14 items
Showing only <b>Produce</b> and <b>Dairy</b> — 25 items
Showing only <b>Produce</b>, <b>Dairy</b> and 2 more — 57 items
Showing only <b>Staples</b> — 12 items
Showing only <b>Staples</b> and <b>Produce</b> — 5 items
```

- 1 name → the name. 2 names → `A and B`. 3+ → `A, B and {n-2} more`.
  Names are bolded in `--clay`; the surrounding text is muted italic, matching the
  existing cycle descriptor's voice.
- **Staples leads the name list when active** — it is the broader predicate, and
  it is not a category.
- **The count is the rows the list is actually rendering** (post-Layer-1,
  post-Layer-2), so the number and the names can never disagree. Singular/plural
  on `item`.
- No filters active → the filter line contributes nothing and the slot collapses.
- A category selection that has gone **stale** (deleted here or on another
  device) does not count as active: it must neither name every category nor
  suppress a Staples-only line.

---

## Descriptor precedence — truth table

The declutter cycle already writes to this slot. Resolution:

"Filters active" below means **any** active filter — one or more categories, or
Staples, or both.

| Cycle phase | Filters active | Descriptor shows |
|---|---|---|
| 0 — grouped | none | *(existing phase-0 behaviour: blank)* |
| 0 — grouped | ≥ 1 | `Showing only … — N items` |
| 1 — rail hidden | none | *(existing phase-1 cycle text, unchanged)* |
| 1 — rail hidden | ≥ 1 | `Showing only … — N items` |
| 2 — flat A–Z | none | *(existing phase-2 cycle text, unchanged)* |
| 2 — flat A–Z | ≥ 1 | `Showing only … — N items` |

**Rule *(amended 2026-08-10 — supersedes the original
`selectedCategories.length > 0` condition, which was blind to Staples)*: when
ANY filter is active — `stapleFilter || selectedCategories.length > 0` — the
filter line replaces the cycle line entirely. Otherwise the cycle line is
untouched.**

**One verb in every phase: `Showing only`** *(amended 2026-08-10 — supersedes the
original phase-1 `Filtering` special case, now deleted from the code).* Two
reasons a future session needs, because it will otherwise re-derive `Filtering` as
the more precise word:

- **`Filtering Produce` is semantically backwards.** Produce is not what's being
  filtered *out* — it's what survives.
- **The user's question is never "are filters on."** It's *"where did Bacon go."*
  Someone scanning A–Z with the rail hidden needs to know something was withheld.
  The sentence's *presence* already signals that filters are on; **`only` states
  the exclusion in one word**, with no second clause.

Joining rule, bolding, and count are identical across phases.

### The phase-2 eyebrow drops its count *(added 2026-08-10)*

At phase 2 the flat-view eyebrow read `A–Z · 12 ITEMS` roughly 40px beneath a
descriptor ending `— 12 items`. Same number twice. **When any filter is active the
eyebrow shows `A–Z` alone**; with no filter active it keeps its count, because
then nothing else states it.

Checked and clean: the phase-0 section headers carry no count, so the doubling
does not occur there. The Shop tab's phase-2 eyebrow is untouched — it has no
filter descriptor above it.

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

1. *(amended 2026-08-10 — **verified on device; result recorded**)* Rail scrolls
   horizontally; edges fade, never clip. Styled 4px scrollbar **present in desktop
   Chrome**, **absent on iOS Safari**, and a **permanent track IS present on a
   Windows touchscreen (Surface) in Chrome**.
   > **The permanent track was tested and ACCEPTED — no viewport gate was built.**
   > An earlier draft of this step said to gate by viewport width if a track
   > appeared. It appeared, and that contingency was **overruled deliberately**:
   > both touch and mouse scroll via the track, and a thin clay hairline that shows
   > position is not a defect on a device where a mouse may appear at any moment.
   > Do not "fix" this by adding the gate. **Android remains untested.**
1a. **Nothing animates the rail on cold start.** The first-run nudge was removed;
    a rail that moves on its own is a regression, not a hint.
2. Pills of varying emoji width are the same height with consistent internal
   spacing — the fixed glyph box is doing its job.
3. Multi-select still works: two or more filters on simultaneously, list shows the
   union.
4. Descriptor matches the truth table at all six rows. Specifically confirm phase
   1 + filters active shows the filter line, not the cycle line.
5. A category with no map entry renders 📦 and filters normally. Test by pointing
   a pill at `Mexican Asian`.
6. *(amended 2026-08-10 — the Clear chip was removed)* Tapping an **active pill
   deselects it** and the descriptor updates; clearing the last filter collapses
   the slot.
6a. **Staples names and counts correctly** — Staples alone reads
    `Showing Staples — N items`; Staples + Produce reads
    `Showing Staples and Produce — N items` with **Staples first**, and N matches
    the rows actually rendered. This is the regression that shipped 2026-08-09:
    the count included the staple narrowing while the names did not.
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
