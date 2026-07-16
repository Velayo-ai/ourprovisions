# SPEC — Hide→search-re-add stomps shared quantity (F1b, reproduced)

**Scope:** OurProvisions · client (`App.js` + `useProvisions.js`) · no DB change
**Status:** ready to build · dev-verifiable · **Parent:** `docs/specs/active/SPEC_shared_list_integrity.md`
**Severity:** violates "shared list is sacred" — a per-user view action mutates a household-wide row.

## Reproduction (dev, one household, two users DH + DT)
1. Apples live on shared list at qty 10, two contributors (DH, DT both see ×10).
2. DH hides Apples. DT still correctly sees Apples ×10 — hide is per-user, shared row untouched. ✓
3. DH searches "Apples" → gets **"No results"** → taps **"Add 'Apples' to your list."**
4. Result: shared Apples row is **overwritten to ×1 for BOTH users.** Badges survive (same row reused). ✗

## Root cause
`searchResults` (App.js ~563) is built from the catalog map, which **excludes hidden items** (`hideItem` evicts from `catalogRef` at useProvisions ~1171; the catalog rebuild re-excludes at ~512/515). So a hidden-but-live item is **invisible to search** — the UI reports "No results" and offers "add as new."

"Add as new" calls `updateQty(name, 1, category)` (App.js ~2118/2148/2166). Inside `updateQty`:
- `catalogRef.current[name]` is absent (evicted) → takes the `if (!catalogItem)` branch → RPC 018 re-resolves the **existing** catalog id (no fork — correct, and why the catalog census shows one Apples + badges survive).
- The UPDATE (useProvisions ~604) then writes `{ quantity: 1, deleted_at: null }` on `(household_id, catalog_item_id)` → **finds the live shared row and stomps 10 → 1.**

Two faults: (1) search lies — says "no Apples" when Apples is on the household list; (2) the "add" verb writes quantity across the person boundary for what should be a view-only un-hide.

## Decision (Dan, locked)
**Hide is a lens, not an edit.** Un-hiding reveals the shared row *exactly as the household set it* (10, 13, whatever) and changes **nothing**. Re-adding a hidden-but-live item = **un-hide only**. No quantity write. No increment. (Option A of three; increment/set rejected — no one changed the quantity, so the quantity must not change.)

## Fix — two layers

### Layer 1 — search must see hidden-but-live items (fixes the visible bug)
State needed is already at the call site: `hiddenCatalogItems` (App.js ~331) + `listRows` (~320).

At the search "add" decision (the "No results → Add to your list" branch, ~2070–2170), before calling `updateQty`:
- Resolve the typed name against `hiddenCatalogItems` (exact-normalized: lowercase + collapse whitespace + trim — **never fuzzy**).
- If a hidden item matches **and** has a live `listRows` row (`catalogItemId === hidden.id`, not deleted):
  → call **un-hide only** (see below). Do **not** call `updateQty`.
- If a hidden item matches but has **no** live list row (hidden while at qty 0):
  → un-hide, then normal add at typed qty (routing through the now-resolvable `updateQty` is fine).
- No hidden match → today's behavior unchanged.

Better still: surface hidden-but-live matches **in `searchResults` itself** so the user sees "Apples ×10 (hidden — tap to reveal)" instead of a false "No results." Preferred if low-cost; the branch-level guard above is the floor.

**Un-hide-only primitive:** `restoreHiddenByCategory` (useProvisions ~1242) already does the correct thing (deletes `user_hidden_items` row, clears `hiddenIdsRef`, restores `catalogRef`, never touches `list_items`). Factor a single-item `unhideItem(name|id)` from it, or reuse it. That's the whole correct un-hide.

### Layer 2 — `updateQty` resolver must not treat hidden as nonexistent (hardening)
Independent of the search path, `updateQty`'s `if (!catalogItem)` create branch is unsafe for hidden items. Before treating a name as new, check `hiddenCatalogItemsRef`/`hiddenIdsRef` for an exact-normalized match and resolve to the existing id. Prevents any other entry point tripping the same wire. This is the "resolver eviction" fix the parent spec (F1b) always meant.

## Verify (dev, two-account, one household)
1. Apples ×10, DH + DT both see it.
2. DH hides → DT still ×10; DH Browse no longer shows Apples. ✓
3. DH searches "Apples" → sees it as hidden-but-live (or the add routes to un-hide).
4. DH re-adds/reveals → **both users see Apples ×10, unchanged; two badges intact.** ✗→✓
5. Regression: hide an item at qty 0 (not on list) → re-add → normal add at typed qty.
6. Regression: normal add of a truly-new item → unchanged.

## Grep-before-edit
Live line numbers drift. Anchor on strings, not numbers:
- App.js: `Add ` + `to your list`, `updateQty(searchQuery.trim()`, `searchResults`, `hiddenCatalogItems`.
- useProvisions.js: `const updateQty =`, `if (!catalogItem)`, `restoreHiddenByCategory`, `hiddenCatalogItemsRef`.

## Notes
- No DB change. 018/019/020 already prevent the catalog fork and the two-live-row state; this is purely the client verb-routing + resolver.
- On completion, graduate `SPEC_shared_list_integrity.md` → `built/` (F1b was its last open item).
