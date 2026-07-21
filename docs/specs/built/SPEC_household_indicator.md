# SPEC — Phase I Active-Household Indicator

**Scope:** OurProvisions only. Show which household the user is editing, in the outer chrome banner. Pure ExD; no schema changes, no new tables.

## Decision summary
- **Placement:** outer banner (the top near-black chrome strip holding the user avatar + global menu), centered between them.
- **Form:** anchor icon + plain household name. No "managing" tag, no chevron.
- **Affordance:** tappable; opens the existing manage-house modal (`setShowHouseholdModal(true)`).
- **Source:** `household?.name` via `ActiveHouseholdContext` (already in scope).
- **Guard:** render only when `isSignedIn` and a household is resolved.

## Build steps
1. **Add the indicator to the outer banner.** Center a flex child between the avatar (left) and the kebab menu (right). Use the existing brand anchor styling: Sand `#C9A97A`, Lato, ~13px, uppercase, letter-spacing ~0.6px. Anchor icon to the left of the name, same sand stroke.
   - onClick: `isSignedIn ? setShowHouseholdModal(true) : undefined`.
   - Render guard: `{isSignedIn && household?.name && ( … )}`.
2. **Remove the people glyph from the title bar.** Delete the inline `<svg>` at App.js ~989–994 (the two-circle/two-arc figure rendered in the `householdMembers.length > 1` branch). The wordmark button stays; only the glyph goes.
3. **Remove the "TAP TO MANAGE HOUSEHOLD" subline** beneath the wordmark (the Lato uppercase block starting ~App.js 1005) — the affordance now lives on the banner indicator. Confirm exact lines before editing (grep first).
4. **Keep the wordmark's own onClick** (`setShowHouseholdModal`) as-is, or remove it if the banner is now the single manage entry point — Dan's call during build.

## Notes
- Grep exact line numbers before any `str_replace`; the line refs above are from the 2026-06-28 read and may drift.
- Solo vs shared: name still renders when solo (a solo user may own several households). Wordmark contraction (Provisions vs OurProvisions) is unchanged and independent of this.
- Phase II forward-compat: the indicator's data source is the only thing that changes later; markup/placement stay. Keep the read isolated so re-pointing to a harbour-level source is a one-line change.
