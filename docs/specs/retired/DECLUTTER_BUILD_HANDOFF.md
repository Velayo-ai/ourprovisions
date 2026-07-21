# BUILD HANDOFF — Shared declutter cycle (Browse + Shop)

**Source spec:** `docs/SPEC_declutter_cycle.md` (designed + mock-approved). This handoff does not replace it — it adds the verified line anchors, the confirmed filter-reset bug, and the approved icon SVG the spec's prose only described.
**Scope:** Cross (OurProvisions feature + reusable cross-tab primitive).
**Sequence:** FOUR commits, not three. A filter-reset fix (commit 0) is a **correctness precondition** for phase 1, added after diagnosis this session. Each commit dev-verified before the next. Grep-before-edit — all line numbers below are from this session and will drift.

---

## Why four commits (the decision trail)

The spec staged three commits: (a) hide-checked on Shop, (b) flat on Browse, (c) unify.
Diagnosis this session found a fourth must come first:

`selectedCategories` and `stapleFilter` (App.js ~382–383) are plain `useState` with **no reset on `activeHouseholdId` change** — confirmed by grep (no reset effect; the only setters are per-category delete at ~824 and the toggles at ~1895/1914). Today this is a *latent* rough edge: after a household switch, stale category selections carry over, but the pills are visible so the user can see and clear them.

Phase 1 of the cycle **hides the pills while keeping filters applied.** The instant that ships, this becomes the exact "household-scoped state survives a switch" leak class the last two sessions closed (join banner, invite link) — in its worst form: switch household → pills hidden → a stale filter from the *previous* household silently shrinks the list, with the explaining control now invisible, and the descriptor line ("N filters active") computing against the wrong household's categories.

So the reset isn't optional cleanup — the cycle would *manufacture* the leak. It's commit 0, standalone and independently verifiable, so every later commit builds on a clean base. Touches the deferred household-scoped-state audit — this closes one more instance of that class.

---

## Commit 0 — Reset Browse filters on household switch (correctness precondition)

**Change:** add one effect near the other household-keyed effects in App.js.

```js
// Browse filters are household-scoped — clear them when the active household
// changes so a stale selection from the previous household can't silently
// shrink the list (critical once phase-1 hides the filter pills).
useEffect(() => {
  setSelectedCategories(new Set());
  setStapleFilter(false);
}, [activeHouseholdId]);
```

**Notes for build:**
- `activeHouseholdId` is already in scope (destructured ~272 from `useActiveHousehold()`).
- Fires on mount too — harmless, both filters already start empty.
- Grep-confirmed no persisted-filter-restore feature exists (no `op_selectedCategories` in localStorage), so this stomps nothing.
- ESLint: `activeHouseholdId` is the only dep; the two setters are stable. No exhaustive-deps disable needed.

**Verify (dev preview):** In a 2-household account, select categories/Staples in household A → switch to B → filters are cleared (no highlighted chips, full list) → switch back to A → still cleared (confirms it doesn't restore stale state). Standalone bug fix; no cycle UI involved yet.

---

## Commit a — Hide checked items on Shop (phase-1 behavior, standalone)

The only commit adding a genuinely new feature, so it lands and gets verified on its own merits before any cycle wiring. Build it behind a temporary local boolean (e.g. a dev toggle or hardcoded `true`) so it's testable in isolation; commit (c) replaces that trigger with `phase >= 1`.

**Anchors (verified this session — spec's ~2003–2063 was stale):**
- Shop grouped branch: `App.js ~2244` (`{showCategories ? ( shoppingList.map(...) )`).
- Shop flat branch: `App.js ~2304` (`) : ( <div>{shoppingList.flatMap(...)...} )`).
- `checked` is a name-keyed map (`checked[item.name]`), from `useProvisions` (~276). `checkedCount` already exists (~964) — the descriptor's "N checked items hidden" number is free.

**Change:** when hiding is active, filter checked items out of the render in BOTH Shop branches — grouped (`cat.items.filter(i => !checked[i.name])`) and flat (add `.filter(i => !checked[i.name])` to the existing flatMap chain). Do NOT touch `toggleChecked`, `checkedCost`, `checkedCount`, or Wrap Up — this is view-only; checked state is unchanged, just not rendered.

**Verify (dev preview):** Shop with some items checked → hiding OFF: all items show, checked ones line-through (current behavior) → hiding ON: checked items disappear from the list, count/progress bar unchanged, Wrap Up still rolls unbought items. Toggle hiding off → checked items reappear.

---

## Commit b — Flat render on Browse (phase-2 behavior, standalone)

Browse has no flat mode today. Lift the proven pattern from Shop's flat branch (~2304). Build behind a temporary local boolean; commit (c) replaces it with `phase === 2`.

**Change:** in the Browse list render, add an alphabetical flat branch mirroring Shop's: `flatMap` the catalog items, `.sort((a,b) => a.name.localeCompare(b.name))`, render each row with the existing Browse row component (Add⇄stepper control intact — do not regress the stepper). Header treatment `A–Z · N items` (match Shop's flat header wording exactly for cross-tab consistency).

**Verify (dev preview):** Browse grouped (current) vs flat toggle → flat shows every catalog item A–Z under one `A–Z · N items` header, Add/stepper controls work in flat exactly as grouped, no category titles.

---

## Commit c — Unify into one 3-phase control + icon + descriptor

Now both tabs have all three view-states available; this wires them to one shared phase model and the approved icon. Biggest commit, least risky — every behavior it drives already exists and was verified in 0/a/b.

**Phase state:** one `phase` per tab (Browse phase, Shop phase — separate), `useState(0)`, **resets to 0 on tab switch AND household switch** (add to the same reset discipline as commit 0). Tap advances 0→1→2→0.

**Phase → behavior map:**
| phase | Browse | Shop | list |
|---|---|---|---|
| 0 | pills shown | checked shown | grouped |
| 1 | pills hidden (filters still applied) | checked hidden (commit a) | grouped |
| 2 | pills hidden | checked hidden | flat A–Z (commit b / existing Shop flat) |

Note phase 2 forces flat regardless of the persisted `op_showCategories` pref; the pref governs the *default* grouped/flat at phase 0/1 per existing Shop behavior — do not delete `op_showCategories`, the cycle reads through it, it isn't replaced by it.

**Icon — APPROVED (variant A, shrinking bars, brand-V-by-taper).** Fixed 48×48, identical on both tabs, icon-only. Encodes both axes: **bg light→dark = filters/checked shown→hidden**; **bars tapering→equal = grouped→flat**. The narrowing taper IS the Velayo V, implied not drawn (chosen over a literal chevron to avoid reading as an accordion caret). Embed these three states verbatim — do not re-derive from prose:

Phase 0 (light bg, tapering):
```html
<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-label="View: default">
  <rect x="0" y="0" width="48" height="48" rx="10" fill="#FAF4EC" stroke="#C9A97A" stroke-width="1.5"/>
  <line x1="14" y1="17" x2="34" y2="17" stroke="#A0724A" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="17" y1="24" x2="31" y2="24" stroke="#A0724A" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="20" y1="31" x2="28" y2="31" stroke="#A0724A" stroke-width="2.4" stroke-linecap="round"/>
</svg>
```

Phase 1 (dark bg, tapering):
```html
<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-label="View: filters hidden">
  <rect x="0" y="0" width="48" height="48" rx="10" fill="#2C1A0E"/>
  <line x1="14" y1="17" x2="34" y2="17" stroke="#FAF4EC" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="17" y1="24" x2="31" y2="24" stroke="#FAF4EC" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="20" y1="31" x2="28" y2="31" stroke="#FAF4EC" stroke-width="2.4" stroke-linecap="round"/>
</svg>
```

Phase 2 (dark bg, equal):
```html
<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-label="View: flat A to Z">
  <rect x="0" y="0" width="48" height="48" rx="10" fill="#2C1A0E"/>
  <line x1="15" y1="18" x2="33" y2="18" stroke="#FAF4EC" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="15" y1="24" x2="33" y2="24" stroke="#FAF4EC" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="15" y1="30" x2="33" y2="30" stroke="#FAF4EC" stroke-width="2.4" stroke-linecap="round"/>
</svg>
```

Colors are brand tokens: cream `#FAF4EC`, clay-lo `#C9A97A`, clay `#A0724A`, espresso `#2C1A0E`. Reference `cycle_dual_readout.html` for placement/final look.

**Icon build-time eye-test (NOT a blocker):** at true 48px the 3-bar taper delta is ~6px/side. If the dev preview reads mushy on a real phone, the fallback is *chunkier* (heavier stroke or wider taper delta), NOT more bars. Eye-test on device before promote.

**Placement:**
- Browse: search line, right of the field — `[🔍 Search your catalog…] [icon]`. Icon height = real search-field height, edges aligned, snug gap (tune against the live search component). Then pills, then list. **No item count on Browse.**
- Shop: no search bar. Top row `[N of M checked] [icon] [Wrap up]`. Count left; icon + Wrap up right. Wrap up slightly larger than the icon, espresso label, normal case — visually distinct from the view-toggle so trip-commit isn't mistaken for a view change. Wrap up logic untouched (~2208).

**Descriptor line:** quiet italic below the top row, shows plain-English consequence only when decluttered. Browse: "N filters active · filters hidden". Shop: "N checked items hidden". Blank in phase 0. User-facing copy says **"filters"**, never "pills". Numbers from existing counts (`checkedCount`; a `selectedCategories.size` + `stapleFilter` count for Browse).

**Retire at merge:** `SPEC_filter_cycle.md`, `SPEC_filter_show_hide.md`, and the separate "Browse grouped/flat toggle" NEXT item — all superseded. Do not leave stale filter specs in docs/.

**Verify (dev preview) — full spec test:**
- Browse: search + icon one line, no count → select Produce+Staples → tap: icon dark, pills hidden, descriptor "2 filters active · filters hidden", still grouped → tap: flat A–Z (equal bars) → tap: back to 0, selections intact.
- Shop: "N of M checked" + icon + Wrap up one line → check items → tap: icon dark, checked hidden, descriptor "N checked items hidden", grouped → tap: flat A–Z of unchecked → tap: back to 0.
- Both: icon identical 48×48, same behavior; phase resets to 0 on tab AND household switch; Wrap up unaffected; flat header "A–Z · N items".

---

## Build order recap
0 (filter reset) → verify → a (hide-checked Shop) → verify → b (flat Browse) → verify → c (unify + icon + descriptor) → verify → promote dev→main → prod-verify on `ourprovisions.velayo.ai`.
One tested change per commit. Grep before every str_replace.
