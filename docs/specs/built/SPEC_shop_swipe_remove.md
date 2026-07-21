# SPEC — SHOP swipe-to-remove (ownership-aware)

## Problem

In the SHOP tab, swiping a list item left currently calls `hideItem(item.name)`.
That is a **catalog-layer** action (per-user, browse-only) leaking into the
**shopping layer**. Two things are wrong:

1. Wrong verb. In the store, "swipe to remove" should mean *take this off this
   list*, not *hide this item from my catalog forever*.
2. No social awareness. If someone else added the item, removing it silently
   deletes their request from the shared list.

## Mental model (the rule)

- **Hide** = catalog layer. Per-user, browse-only. Lives in BROWSE. Untouched by
  this change.
- **Swipe-to-remove in SHOP** = list layer. Removes the `list_item` from the
  shared list (soft-delete / quantity → 0). Affects everyone.
- **Not buying it this trip** needs no gesture — just leave it unchecked. Inaction
  already means "still pending, someone else can shop it."

So the swipe has exactly one destructive meaning: **remove from the shared list.**

## Ownership branching

When the user swipes a SHOP item:

- **Sole contributor is me** → remove immediately. No confirm. (It's my item;
  no one else is affected.)
- **Anyone other than me is a contributor** → show a confirm modal first:
  > **"Orange Juice"** was added by **Elly**.
  > Remove it from the list?
  > [ Cancel ]  [ Remove ]
  - **Remove** → soft-delete the `list_item`.
  - **Cancel** → leave it on the list (this is the "keep it for someone else"
    path — no separate action needed).

"Added by" name resolution and the is-mine check already exist in App.js
(`isOwnItem`, `addedByName` in the `shoppingList` useMemo, lines ~618–622).
Contributor data is in `contributorsMap`. **Rule: treat as shared if any
contributor's cler_id !== current user.** Only skip the confirm when I am the
sole contributor.

## Gesture-timing constraint (important)

`SwipeToRemove` in the SHOP branch (no `onEdit`) is **full-swipe-commits**:
crossing the threshold animates the row off-screen (`setOffsetX(-400)`), then
fires `onRemove()` 400ms later. The row is visually gone *before* `onRemove`
runs.

This is fine for the **own-item** path (commit = gone, correct).
It is awkward for the **shared-item** path: if we open a modal in `onRemove` and
the user cancels, the row has already animated away and must spring back.

### Resolution

Move the ownership decision **up to the swipe site**, into the `onRemove`
callback passed from App.js — not inside `SwipeToRemove`. The component stays
dumb; it just calls `onRemove()` after the animation as it does today.

`onRemove` in App.js does:

```
onRemove={() => handleSwipeRemove(item)}
```

and `handleSwipeRemove(item)`:

- If item is mine (sole contributor) → call `removeFromList(...)` directly.
- If shared → open a confirm modal carrying { name, catalogItemId, addedByName }.
  - On Remove → `removeFromList(...)`.
  - On Cancel → call `refreshListRows()` / re-add optimistically so the row that
    animated off-screen comes back. (Simplest: the row is driven by `listRows`,
    which we did NOT mutate — so a re-render restores it. Verify the animated-out
    row remounts cleanly; if `key={item.name}` is stable it should.)

> Note: because the row's presence is driven by `listRows` and we only mutate
> `listRows` on actual removal, a Cancel needs no rollback of data — only the
> visual offset resets when the component remounts. Confirm this in cold-test.

## New hook function: `removeFromList`

In `useProvisions.js`. Mirrors the `clearAll` mechanism but scoped to one
`catalog_item_id`.

```js
const removeFromList = useCallback(async (itemName, catalogItemId) => {
  const db = supabaseRef.current;
  const hh = householdRef.current;
  if (!hh || !db) return;

  const resolvedId = catalogItemId ?? catalogRef.current[itemName]?.id;
  if (!resolvedId) { setError(`"${itemName}" not in catalog`); return; }

  // Optimistic: drop from listRows immediately so the UI reflects removal.
  const prevRows = listRows;
  setListRows((rows) => rows.filter(r => r.catalogItemId !== resolvedId));

  try {
    const { error: rmErr } = await db
      .from("list_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("household_id", hh.id)
      .eq("catalog_item_id", resolvedId)
      .is("deleted_at", null);
    if (rmErr) throw rmErr;
  } catch (err) {
    console.error("removeFromList error:", err.message);
    setError(`Could not remove item: ${err.message}`);
    setListRows(prevRows); // rollback
  }
}, [listRows]);
```

Export it from the hook return object alongside `hideItem`, `deleteItem`.

> Design note: this is a **list_item** soft-delete, NOT a catalog action. The
> catalog row is untouched — the item still exists to be re-added next trip.
> This is the deliberate contrast with `hideItem` (catalog, per-user) and
> `deleteItem` (catalog, household-wide, custom-only).

## App.js changes

1. **`handleSwipeRemove(item)`** — new handler. Decides own vs shared, calls
   `removeFromList` or opens the confirm modal.
2. **Confirm modal state** — `removeConfirmItem` ({ name, catalogItemId,
   addedByName } | null). Render a modal when non-null.
3. **Swap the two SHOP `SwipeToRemove` onRemove props** (lines ~1642 and ~1703)
   from `hideItem(item.name)` → `handleSwipeRemove(item)`.
   - **Leave line 1510 (BROWSE) on `hideItem` — that one is correct.**
4. Ensure each `item` carries `catalogItemId` (added in the toggleChecked fix —
   confirm it's present, else add it to the shoppingList push).

## Copy

- Modal title: **Remove from list?**
- Body: **"{name}"** was added by **{addedByName}**. Removing it takes it off the
  shared list for everyone.
- Buttons: **Cancel** (secondary) / **Remove** (primary, taupe `#8A7968` or a
  warning tone — NOT teal; this is destructive).

## Out of scope (this SPEC)

- "Fabric Softemer" data cleanup (separate — bad catalog row).
- Hide/Delete BROWSE verb split (separate, already in flight).
- Undo-toast pattern (considered and rejected in favor of the confirm modal for
  shared items, per product decision).

## Done when

- Swiping my own item in SHOP removes it instantly, no modal, off the shared
  list (verified gone on second client).
- Swiping an item added by another household member opens the confirm modal
  naming them; Remove deletes it for everyone, Cancel leaves it visible and on
  the list.
- BROWSE swipe still hides (catalog), unchanged.
- No "not in catalog" toast on any rolled-forward or shared item.
