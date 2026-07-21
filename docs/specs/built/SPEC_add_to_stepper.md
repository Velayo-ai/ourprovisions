# SPEC — Add → Stepper (Browse rows)

**Scope:** OurProvisions · Browse (catalog) rows
**Type:** Interaction change (conditional render). Not a pure restyle.
**File:** `App.js` — `CatalogItemRow` component only (~line 228–241)
**Risk:** Low. No new state, no handler changes, no DB changes. Two call sites (1854, 2026) unchanged.

---

## Decision

A browse row for an item **not on the list** shows a single **"Add"** pill.
Tapping it adds the item (qty 1) and the pill is replaced by the −/qty/+ stepper.
Tapping **−** at qty 1 removes the item and the row **snaps back to "Add."**

## Why (the invariant)

`updateQty` already treats `qty <= 0` as *removal* and `qty >= 1` as *on-list*
(`useProvisions.js`: `Math.max(0, qty)`, then `qty <= 0` branch removes). This spec
makes the UI honor that same boundary:

> **on the list ⇔ qty > 0 ⇔ stepper shown. Not on the list ⇔ qty 0 ⇔ "Add" shown.**

Because zero is never rendered, the ambiguous zero-state disappears entirely — there is
no "stepper showing 0" to interpret. A future session must preserve this: **never render
the stepper at qty 0, and never render "Add" at qty > 0.** The two are mutually exclusive
by design, not by accident.

## Rejected alternative

Keeping the stepper always visible and just showing `0`. Rejected: it asks every un-added
row a question no one answers, and reintroduces the zero-state ambiguity we just removed.

---

## Change

Inside `CatalogItemRow`, replace the always-rendered `.qty-controls` block with a conditional:

```jsx
{qty === 0 ? (
  <button
    className="add-btn"
    onClick={() => onUpdateQty(item.name, 1, rawCategory)}
  >
    Add
  </button>
) : (
  <div className="qty-controls">
    <button className="qty-btn" onClick={() => onUpdateQty(item.name, qty - 1, rawCategory)}>−</button>
    <span className="qty-display">{qty}</span>
    <button className="qty-btn" onClick={() => onUpdateQty(item.name, qty + 1, rawCategory)}>+</button>
  </div>
)}
```

Notes:
- The `qty-display` no longer needs its `zero` class or the `qty === 0 ? "—" : qty`
  ternary — zero is unreachable inside this branch. Drop both.
- `− at qty 1` calls `onUpdateQty(name, 0, ...)` → existing removal path → re-render →
  `qty === 0` → "Add" pill. The snap-back is automatic; no extra logic.

## CSS

Add `.add-btn`. Confirm `.qty-controls` matches the softened pill (see dependency below).

```css
.add-btn {
  border: 1px solid #C9A97A; background: transparent; color: #A0724A;
  font-family: 'Lato', sans-serif; font-weight: 700; font-size: 0.9rem; letter-spacing: 0.02em;
  padding: 9px 22px; border-radius: 999px; cursor: pointer; transition: all 0.14s;
}
.add-btn:hover, .add-btn:active { background: #A0724A; border-color: #A0724A; color: #fff; }
```

## ⚠ Dependency / drift flag

The file I speced against still shows the **pre-softened** stepper CSS
(`.qty-controls { display:flex; gap:5px }`, `.has-qty` border `#c8973a`). The unified-pill
+ softened-pill changes from this session's earlier instructions may not be merged into the
branch yet. Before applying this spec, confirm the softened `.qty-controls` (pill shape,
`#FBF7F0` fill, `#E8D5B7` border, `.qty-btn` 40×36 no-fill) is present. If not, apply that
first — this spec assumes it exists.

## Verify (deployed dev preview, not localhost)

1. Un-added row (e.g. Carrots) shows **"Add"**, no stepper.
2. Tap Add → row gets `has-qty` highlight, stepper appears showing **1**.
3. Tap **+** → 2. Tap **−** → 1. Tap **−** again → row returns to **"Add"** (item removed).
4. No row ever shows a stepper reading `0`.
5. Search-results add path (call site ~2026) behaves identically.
