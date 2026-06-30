# SPEC — Swipe parity in search rows

**Scope:** OurProvisions
**Type:** Frontend (App.js) — single logical change, one commit
**Principle:** One shared row behaves identically everywhere. A catalog item found via search is the same item as in Browse, so it exposes the same swipe actions.

---

## Problem

The Browse call site wraps the shared `CatalogItemRow` in `SwipeToRemove`; the **search** call site renders a bare `CatalogItemRow` with no wrapper. Result: search-filtered rows have no swipe actions (no Hide / Edit / Staple), while the identical item in Browse does. This is the structural follow-on noted when `CatalogItemRow` was extracted.

## Fix

At the **search call site only**, wrap `CatalogItemRow` in the same `SwipeToRemove` Browse uses, computing the same three locals. Browse and `CatalogItemRow` are **untouched**.

> ⚠️ **Grep-before-edit.** Line numbers below are from a possibly-stale copy; HEAD has moved since the last log. Grep for the exact current strings before authoring `str_replace`. Do not trust these line numbers.

### Locate
- Search `.map` over `searchResults` (was ~App.js:1775). It computes `qty`, `rawFallback`, `price`, `isEditing`, then returns a bare `<CatalogItemRow .../>` (was ~1781–1795).
- Browse call site (was ~1952) is the reference: `<SwipeToRemove ...><CatalogItemRow .../></SwipeToRemove>` with locals `isStaple`, `isCustom`, `canEdit` computed just above it (was ~1947–1950).

### Change

1. In the search `.map`, after the existing `isEditing` local, add the three Browse locals:
```js
const isStaple = catalogMap[item.name]?.is_staple;
const isCustom = catalogMap[item.name]?.is_global === false;
const canEdit = isCustom || showPrices;
```
(`catalogMap` is component-scope from the hook ~line 268 — in scope here.)

2. Wrap the existing `<CatalogItemRow .../>` in the identical `SwipeToRemove`, moving `key` to the wrapper (matching Browse):
```jsx
<SwipeToRemove key={item.name} onRemove={() => hideItem(item.name)} onEdit={() => openEditModal(item.name)} onStaple={() => toggleStaple(item.name)} isStaple={isStaple} canEdit={canEdit}>
  <CatalogItemRow
    item={item}
    qty={qty}
    rawCategory={item.rawCategory}
    showPrices={showPrices}
    price={price}
    isEditing={isEditing}
    priceInput={priceInput}
    centsToDisplay={centsToDisplay}
    onUpdateQty={updateQty}
    onPriceInput={handlePriceInput}
    onCommitPrice={commitPrice}
    onCancelEditPrice={() => setEditingPrice(null)}
  />
</SwipeToRemove>
```

**Do NOT change** `CatalogItemRow`'s props. Keep `rawCategory={item.rawCategory}` (search items carry their own `rawCategory`; `cat.rawName` from Browse does not exist in this scope).

## Edit-visibility truth table (already enforced by `canEdit`; stated for test)

| item type | showPrices OFF | showPrices ON |
|---|---|---|
| global (catalog) | Staple \| Hide | Edit \| Staple \| Hide |
| non-global (custom) | Edit \| Staple \| Hide | Edit \| Staple \| Hide |

`canEdit = isCustom || showPrices` produces exactly this. In `SwipeToRemove`, Edit is gated by `canEdit`; Staple and Hide always render. When Edit is suppressed, the two remaining buttons flex to fill the reveal width (matches existing Browse behavior).

## Test (deployed dev preview, not localhost)

1. Search an item → swipe the result left → Hide / Edit / Staple appear and behave identically to the same item in Browse.
2. Toggle prices OFF, search a **global** item → reveal shows **Staple | Hide** (no Edit).
3. Toggle prices OFF, search a **custom** item → reveal shows **Edit | Staple | Hide**.
4. Hide from a search row removes it from the user's browse layer exactly as Browse Hide does.

## Out of scope (separate commit / session)

- **Close-gestures** (issue #2): the wrapped search row will latch open with no dismiss path, identical to Browse today. Fixing tap-away / swipe-back / single-open-at-a-time is a component-internals change touching all three call sites — its own design + commit. Not here.
