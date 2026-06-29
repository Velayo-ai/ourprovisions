# SPEC — Search-row stepper parity + price-gated Edit Item

**Scope:** OurProvisions
**Type:** Two consistency bugs. Shared root cause: UI that should come from one
source is rendered in a second, divergent place and drifts.
**File:** `src/App.js` (single file; grep anchors below — line numbers WILL drift, grep live)

---

## Bug 1 — Search results only allow +1; no quantity stepper

### Symptom
In BROWSE, typing in the catalog search box shows results with a single round
`+` button that flips to `✓` at qty 1. You cannot increment past 1 or decrement.
Normal (unfiltered) Browse rows use the full `−  qty  +` stepper.

### Root cause
Search renders a **separate, hand-rolled row** instead of reusing the Browse
row. Search is meant to be a free-text *filter over the dataset* — it must not
change how a row *behaves*. A filtered row is the same row.

### Anchors
- SEARCH MODE block opens at the comment `/* ── SEARCH MODE ── */`
  (`grep -n "SEARCH MODE" src/App.js`), inside `searchResults.map(item => {`.
- The offending button is the one rendering `{qty > 0 ? "✓" : "+"}` with the
  green/`#4a9e4a` background.
- NORMAL BROWSE MODE block opens at `/* ── NORMAL BROWSE MODE ── */`. The row to
  match is `.item-row` with `.qty-controls` containing three controls:
  `<button className="qty-btn">−</button>`, `.qty-display`, `<button className="qty-btn">+</button>`.

### Required behavior
A search-result row must present the **identical quantity affordance** as a
Browse row: `−  qty  +`, with the same zero-state (`qty === 0` shows `—`,
`.qty-display.zero`), same `updateQty(item.name, qty ± 1, item.rawCategory)`
wiring, same `has-qty` styling on the row.

### Recommended implementation (in priority order)
**Preferred — extract a shared row component.** The Browse `.item-row` markup
(the inner content, not the `SwipeToRemove` wrapper) should become a small
component, e.g. `CatalogItemRow`, taking `item`, `qty`, `rawCategory`,
`showPrices`, `price`, and the qty/price handlers as props. Both NORMAL BROWSE
and SEARCH MODE render it. This is the real fix — it makes future drift
structurally impossible. **This is the design intent: one row component, two
call sites.**

**Acceptable interim — copy the `.qty-controls` block** into the search row,
replacing the single `✓`/`+` button, wired to `item.rawCategory`. Faster, but
leaves two copies that can drift again; only do this if extracting the component
is too large a change for one commit. If taken, leave a `// TODO: unify with
Browse row` marker.

### Decisions left to Dan (eye-test, on dev)
- **Price in search rows?** Browse rows show price (when `showPrices` on); the
  current search row never does. If you extract the shared component, search
  rows will start showing price too — which is *consistent* and probably right.
  Confirm by eye on dev. If you want search to stay price-free, pass a
  `showPrices={false}` override from the search call site — but that reintroduces
  a divergence, so prefer letting it match.
- **SwipeToRemove in search?** Browse rows are swipe-to-hide/edit/staple. Out of
  scope for this fix — do NOT add swipe to search rows in this commit unless you
  decide it's wanted; flag separately if so.

### Done when
Searching the catalog yields rows whose quantity behaves identically to Browse —
increment, decrement, and zero-state all work and look the same — verified on a
deployed dev preview, not localhost.

---

## Bug 2 — Edit Item shows Price field when pricing is OFF

### Symptom
With the pricing feature toggled off, the Edit Item modal still renders the
`PRICE / $ 0.00` field. User can set a value that surfaces nowhere — confusing,
stranded control.

### Root cause
The price `modal-field` in the Edit Item modal is rendered **unconditionally** —
it does not read the same `showPrices` setting the rest of the app gates on.

### Anchors
- `grep -n "Edit Item Modal" src/App.js` → block opens at `{editModalItem && (`.
- The price field is the second `<div className="modal-field">`, the one whose
  `<label>` reads `Price` and contains the `centsToDisplay(editModalPrice)` input.
- The settings flag is `showPrices` (already used as the gate in NORMAL BROWSE
  row, e.g. `{showPrices && (<div className="price-row">…`).

### Required behavior
Wrap the entire price `modal-field` in `{showPrices && ( … )}`. When pricing is
off, the modal shows Item Name (for custom items) + actions only.

### ⚠️ Edge case to handle in the same commit — empty modal for catalog items
The Item Name field already renders only when `editModalItem.isCustom` is true.
So for a **catalog (non-custom) item with pricing OFF**, gating the price field
leaves the modal body completely empty except the italic note
*"This is a catalog item — only the price can be edited."* — which now points at
a field that isn't there. Nonsensical.

Handle it:
- The "only the price can be edited" note should also be gated on `showPrices`
  (it's only true *because* of price). With pricing off and a catalog item,
  there is nothing editable.
- Decide the catalog-item-pricing-off case (Dan's call):
  - **(a)** Don't open the modal at all for catalog items when `showPrices` is
    off — i.e. `openEditModal` early-returns or the swipe "edit" action is
    suppressed for non-custom items when pricing is off. Cleanest: no empty modal
    can ever appear.
  - **(b)** Open it but show a short explanatory line (e.g. "Nothing to edit
    here yet") plus Cancel only. Weaker — an actionless modal.

  Recommend **(a)** — if there's nothing to edit, don't offer Edit.

### Done when
With pricing off: editing a **custom** item shows Item Name + Delete/Cancel/Save,
no price field; a **catalog** item offers no stranded/empty Edit modal (per the
chosen path). With pricing on: modal is unchanged. Verified on dev preview.

---

## Out of scope — flagged, do NOT fix here (don't stack)
- The Delete path in this same modal uses `window.confirm(...)` (~`grep -n
  "window.confirm" src/App.js` inside the Edit Item block) — an unbranded native
  dialog, one of the known landmines. Leave it for the dedicated branded-confirm
  pass; touching it here mixes concerns.

## Commit discipline
Two logical changes → at least two commits (Bug 1, Bug 2). If Bug 1 is done via
component extraction, that extraction may be its own commit ahead of wiring the
search call site. One tested change before the next. Local-only until Dan reviews.
