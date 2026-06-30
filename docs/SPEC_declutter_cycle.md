# SPEC — Shared declutter cycle (Browse + Shop)

**Scope:** Cross (OurProvisions feature + reusable cross-tab UI primitive)
**Type:** Frontend (App.js) — a 3-phase "declutter" control shared by Browse and Shop, plus a new flat render on Browse and a new "hide checked" feature on Shop. Substantial; own focused session. Strong agent-build candidate.
**Status:** Designed + mocked-approved this session. Visual reference: `cycle_dual_readout.html` (both tabs, final). Build to match it.
**Supersedes:** `SPEC_filter_cycle.md`, `SPEC_filter_show_hide.md`, and the separate "Browse grouped/flat toggle" NEXT item. RETIRE all three at merge — do not leave stale filter specs in docs/.

---

## Core idea
One control, one gesture, on BOTH Browse and Shop. Each tap advances a 3-phase cycle that progressively declutters: strip the noise, then flatten. Gesture + progression are identical across tabs; phase-1's "hide" is tab-specific because each tab's noise differs. User learns it once; it works everywhere. Filters/checked-state are NEVER cleared by the cycle — it changes VIEW only.

### Three phases
| phase | Browse | Shop | list | icon |
|---|---|---|---|---|
| 0 default | filter pills shown | checked items shown | grouped | tapering ∨ lines, **light** bg |
| 1 tidied | pills hidden (filters still applied) | checked items hidden | grouped | tapering ∨ lines, **dark** bg |
| 2 flat | pills hidden | checked hidden | **flat A–Z** | **equal** lines, dark bg |
Tap on phase 2 → back to 0.

## The icon (the key element — encodes BOTH axes)
A single icon button, fixed **48×48**, identical on both tabs.
- **Background light → dark = Filter Off → Filter On.** This is what distinguishes phase 0 from phase 1 (both grouped) — the earlier "two identical GROUPED labels" confusion is solved by the bg state, not by a label.
- **Line shape tapering (∨, funnel) → equal length = Grouped → Flat.** The funnel taper literally means "filtering/narrowing"; resolving to equal lines = flattened.
- Icon-only (no text label) so it fits the search line. Decided after trying a two-part text label — too bulky for the search row.

## Placement
- **Browse:** on the search line, right of the search field: `[🔍 Search your catalog…] [icon]`. The icon should sit snug to the search field AND match its height exactly (icon height = real search-field height; edges aligned, reads as a paired unit). Tune gap small at build time against the real search component. Then filter pills, then list. **No item count** on Browse (removed — not actionable while browsing).
- **Shop:** no search bar. Top row: `[N of M checked] [icon] [Wrap up]`. Count anchors left; icon (view toggle) + Wrap up (trip-commit) on the right.
- **Wrap up** is preserved, slightly larger than the icon, espresso label, normal case — visually distinct from the view-toggle so the trip-ending action isn't mistaken for a view change. (Wrap up = end trip + roll unbought items forward; existing feature, App.js ~2674/2766.)

## Descriptor line
A quiet italic line below the top row shows the plain-English consequence when decluttered: Browse "N filters active · filters hidden"; Shop "N checked items hidden". Blank in phase 0 (nothing hidden). This is the safety signal answering "why is my list short" — the icon shows state, the descriptor explains it in words/numbers.

## Flat view (both tabs)
Phase 2 flat list is alphabetical A–Z with a header treatment `A–Z · N items` (consistent across both tabs). Browse's flat render is NEW — lift the proven pattern from Shop's existing `showCategories` flat branch (App.js ~2003–2063, persisted `op_showCategories`).

## New build work
1. **Hide checked items on Shop** — Shop phase 1. A real, wanted feature on its own merits (clean list mid-shop). Build as a genuine feature.
2. **Flat render on Browse** — Browse phase 2 (lift Shop's pattern).
3. **Unify** Browse + Shop onto one 3-phase component with tab-specific phase-1 behavior injected.

## State scoping
| state | scope | on switch |
|---|---|---|
| Browse selectedCategories / stapleFilter | household | reset |
| Shop checked-items / (future) store filter | trip | per existing Shop behavior |
| cycle phase (per tab) | UI | reset to 0 |
| grouped/flat pref | UI pref | persists (Shop already does via op_showCategories) |
Touches the deferred household-scoped state audit — confirm Browse filters reset on switch during build.

## Future-facing (do NOT build; design must not preclude)
Shop's filter axis will GROW: **filter by who-added** (Elly / Helen / DH) and **per-store filtering** (split a trip across Store A / Store B; while in Store A, hide Store B's items). These are independent, stackable filters — NOT cycle phases. Implication: Shop will likely need its own **filter-pill bar** (like Browse's) for these, with the declutter cycle handling the view axis (grouped/flat + hide). Keep phase-1's "filter" notion extensible, not hardcoded to "checked only." The cycle handles HOW you view; pills handle WHAT you show — same two-mechanism split as Browse.

## Terminology
- **"pills"** = the row of rounded chip controls (Staples + category chips). Internal/spec term only.
- **User-facing copy never says "pills."** Use **"filters"** in any string shown to users (e.g. the descriptor line: "2 filters active", "filters hidden"). "pills" is the implementation term; "filters" is the user term — same split as `is_staple` (code) vs. "Staple" (UI).

## Build / handoff notes
- Reference mockup: `cycle_dual_readout.html`. Build phase behavior, icon encoding, placement, and descriptor to match.
- Strong agent-build candidate; stage commits: (a) hide-checked on Shop, (b) flat render on Browse, (c) unify into shared control. One tested change before the next.
- Grep-before-edit; line numbers may be stale.

## Test (deployed dev preview)
**Browse:** search + icon on one line, no item count → select Produce+Staples → tap: phase1 icon dark, pills hidden, descriptor "2 filters active · filters hidden", still grouped → tap: phase2 flat A–Z (equal lines) → tap: back to 0, selections intact.
**Shop:** "N of M checked" + icon + Wrap up on one line → check items → tap: phase1 icon dark, checked hidden, descriptor "N checked items hidden", grouped → tap: phase2 flat A–Z of unchecked → tap: back to 0.
**Both:** icon identical 48×48 and behaves the same; phase resets to 0 on tab/household switch; Wrap up unaffected by the cycle; flat header reads "A–Z · N items".
