# SPEC — Blank catalog after deleting a filtered category

**Scope:** OurProvisions
**Touches prod:** Eventually (dev-first). Client-state only — no DB, no schema.
**File:** `App.js`
**Type:** Two-part fix (one-line eviction + defensive predicate guard). Single commit.

---

## Symptom

After deleting a category, the entire Browse catalog renders blank (no items,
no categories — see repro). Reload restores everything. Toggling the filter
also restores everything.

## Repro (found via session replay, DH on dev)

1. Login as DH.
2. Create a test item in a test category.
3. Add quantities to the test item.
4. Shop mode → hide the item.
5. Delete the item.
6. Delete the category.
7. → Catalog renders blank.
8. Reload → everything returns.

Key tell: items reappear on **filter toggle** or **reload** — so this is
client filter-state, NOT data loss. Server data is intact.

## Root cause

`selectedCategories` (a `Set` of category `rawName`s, `App.js:376`) drives the
Layer-2 filter predicate (`App.js:489-490`):

```javascript
if (selectedCategories.size > 0) {
  result = result.filter(cat => selectedCategories.has(cat.rawName));
}
```

`deleteCategory` (`App.js:752-778`) removes the category from
`householdCategories` (line 775) but **never removes its `rawName` from
`selectedCategories`**. If the deleted category was selected/filtered, its
`rawName` stays in the set. The predicate then narrows to a category that no
longer exists → `result` is `[]` → blank screen.

- "Filter toggle fixes it" = mutating/clearing `selectedCategories` drops the
  dangling name, so `size > 0` guard passes empty.
- "Reload fixes it" = `selectedCategories` re-inits to an empty `Set` on mount.

## Fix (two parts — do both)

**Part 1 — Evict on delete (fixes this repro).** In `deleteCategory`, right
after the existing `setHouseholdCategories` eviction (~line 775), add the
matching eviction for `selectedCategories`:

```javascript
setSelectedCategories(prev => { const s = new Set(prev); s.delete(rawName); return s; });
```

**Grep-before-edit anchor:** grep `App.js` for
`setHouseholdCategories(prev => { const s = new Set(prev); s.delete(rawName)`
— insert the new line immediately after it.

**Part 2 — Self-healing predicate (insurance against other paths).** In the
filter memo (~line 489), narrow only by categories that still exist, so a
stale id can never blank the view:

```javascript
// Layer 2 — only narrow by categories that still exist
const liveNames = new Set(result.map(cat => cat.rawName));
const activeSelected = [...selectedCategories].filter(n => liveNames.has(n));
if (activeSelected.length > 0) {
  result = result.filter(cat => activeSelected.includes(cat.rawName));
}
```

## Why both

Part 1 fixes the direct repro at the correct place and matches the existing
eviction pattern one line above. Part 2 covers the paths Part 1 doesn't:
- the move-to-category branch of `deleteCategory`,
- **a realtime category delete from another device** — Helen deletes a
  category on her client while DH has it filtered. This is a real multi-user
  vector in a shared-list app with realtime, not gold-plating.

The predicate guard means *no* future code path can strand the view on a
dangling filter id.

## Verification

Dev-first:
1. Run the repro exactly (steps 1-7). Confirm catalog does NOT go blank after
   category delete — items remain visible, no reload needed.
2. Regression: select a real category filter, confirm normal filtering still
   works (only that category shows).
3. Regression: select a category, delete a DIFFERENT category, confirm the
   still-selected filter is unaffected.
4. If a second device is handy: DH filters category X, Helen deletes X on her
   client → DH's view should self-heal to all-categories, not blank.
5. Stop at dev. Promote after verification.

## Not this bug

This is the "blank catalog" bug. The false-removal-banner P0 is separate
(loss-resolver firing during churn) and remains open — do not conflate.
