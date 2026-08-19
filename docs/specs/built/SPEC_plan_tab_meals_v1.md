# SPEC — Plan tab v1: Meals lens relocated from Browse

**Scope:** OurProvisions
**Status:** Design approved, ready to build
**Session decision date:** 2026-08-18
**Author:** Design-chat Claude → for Claude Code

---

## Why this exists

The 2026-08-17 IA decision confirmed PLAN as a standing nav tab and moved the Meals lens
out of Browse so Browse stays pure items+categories. ARCHITECTURE.md flagged this
explicitly: *"must be relocated to a new PLAN view case at build time — not merely
flag-flipped."* This spec is that relocation. `025`/`026` are live on prod as of last
night, so the `MEALS_ENABLED` gate that existed because the tables didn't exist yet can
come off tonight — that gate's original reason is gone.

**Not in scope tonight:** create-meal UI (`createMeal` exists in the hook, nothing calls
it — tomorrow's item), seeding demo meals (also tomorrow), a HOME tab, any PLAN content
beyond meals (week-shaper/budget/events stay future).

---

## Decisions locked this session

| Decision | Choice | Rationale |
|---|---|---|
| Where does `MealsLens` render? | Inside `view === "plan"`, replacing the "Plan coming soon" placeholder | Direct swap — Plan's stub already exists, no new view case needed |
| Does Browse keep the Ingredients⇄Meals toggle? | No — remove it entirely | Meals lens has a new home; Browse always shows ingredients now, per the 08-17 decision |
| Does Plan need its own lens toggle? | No, not v1 | Plan is meals-only for now; a toggle would be UI for a choice that doesn't exist yet |
| `MEALS_ENABLED` flag | Flip `false` → `true` | Its reason for existing (tables not on prod) is resolved — `025`/`026` shipped 2026-08-18 |
| `browseLens` state | Remove entirely | Only referenced in the toggle and two effects, both being repointed to `view === "plan"` below — nothing else reads it |

---

## Changes, by file

### `src/App.js`

**1. Flip the flag** (currently line 711):
```js
const MEALS_ENABLED = false;
```
→
```js
const MEALS_ENABLED = true;
```

**2. Drop `browseLens` state** (currently line 838):
```js
const [browseLens, setBrowseLens] = useState("ingredients");
```
Delete this line.

**3. Repoint the `loadMeals` effect** (currently lines 880–882):
```js
useEffect(() => {
  if (MEALS_ENABLED && browseLens === "meals" && household?.id) loadMeals();
}, [browseLens, household?.id, loadMeals]);
```
→
```js
useEffect(() => {
  if (MEALS_ENABLED && view === "plan" && household?.id) loadMeals();
}, [view, household?.id, loadMeals]);
```

**4. Repoint the `fetchMealProvenance` effect** (currently lines 888–892):
```js
useEffect(() => {
  if (MEALS_ENABLED && household?.id && (view === "list" || (view === "input" && browseLens === "meals"))) {
    refreshProvenance();
  }
}, [household?.id, view, browseLens, refreshProvenance]);
```
→
```js
useEffect(() => {
  if (MEALS_ENABLED && household?.id && (view === "list" || view === "plan")) {
    refreshProvenance();
  }
}, [household?.id, view, refreshProvenance]);
```
(Provenance still needs to be fresh on Shop — badges render there — and now on Plan
instead of Browse-with-meals-lens-active.)

**5. Replace the Plan placeholder** (currently lines 2842–2851):
```jsx
{view === "plan" && (
  <div style={{ padding: "40px 20px", textAlign: "center", minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
    <p style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: "1.3rem", color: "#8a7a60" }}>
      Plan coming soon.
    </p>
    <p style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.8rem", color: "#C9A97A", marginTop: "8px", letterSpacing: "1px" }}>
      Meal planning &amp; AI list builder
    </p>
  </div>
)}
```
→
```jsx
{view === "plan" && (
  <MealsLens
    meals={meals}
    loading={mealsLoading}
    onAddAll={handleAddMealToList}
    addingMealId={addingMealId}
  />
)}
```

**6. Remove the Browse lens toggle + meals conditional** (currently lines 2855–2884):
Delete the entire commented toggle block:
```jsx
{/* ── Browse lens toggle — Ingredients ⇄ Meals (add-path, migration 025).
     Hidden while MEALS_ENABLED is false (RELEASE-2026-08 B6): no entry point
     to the Meals lens, so ingredients render directly below. ── */}
{MEALS_ENABLED && (
<div style={{ display: "flex", gap: "5px", background: "#E8D5B7", borderRadius: "11px", padding: "4px", margin: "12px 0 4px" }}>
  {["ingredients", "meals"].map((L) => ( ... ))}
</div>
)}

{MEALS_ENABLED && browseLens === "meals" ? (
  <MealsLens ... />
) : (
<>
{/* ── Search bar ── */}
...
```
Keep everything from the `<>` (the ingredients search/browse UI) onward, unconditionally —
Browse always renders ingredients now. Remove the closing `)}` that paired with the
deleted ternary; the ingredients block's own closing `</>` stays.

### No DB changes, no migration, no RLS/RPC surface touched.

---

## Verification (deployed dev preview, not localhost)

1. Nav shows Plan / Browse / Shop. Tap **Plan** → meals list renders (empty state "No
   meals yet" is expected and correct tonight — seeding is tomorrow).
2. Tap **Browse** → ingredients render directly, no toggle, no flash of the old chrome.
3. Confirm `MealsLens`'s "Add all" still works if any meal exists (dev seed, if present) —
   item lands on Shop, provenance badge shows.
4. Confirm no console errors from the removed `browseLens` references (a stray reference
   left behind would throw `browseLens is not defined`).

**Done when:** all four pass on the deployed dev preview URL.
