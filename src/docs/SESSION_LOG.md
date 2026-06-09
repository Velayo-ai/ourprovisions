# SESSION LOG — 2026-06-08

## Session 1 (morning) — Sync Bug Root Cause: Per-User Catalog Hides Leaking Into Shared List

**Goal:** Confirm the RPC/render sync fix on a cold cross-user test, isolate why Bakery items still rendered on only one client, and merge to main if solid.

**Completed:**
- Refactored `shoppingList` (App.js) to group directly from RPC rows via a new `listRows` state instead of rebuilding from `catalogMap` — `catalogMap` is now out of the SHOP list display path entirely.
- Added `listRows` state to useProvisions, populated in the `loadListItems` loop, exported to App.js; removed `addedByMap` from App's destructuring (now unused).
- Proved via Network Response inspection that both clients (DH, DT) receive byte-identical 9-row payloads — ruled out RLS / stale `auth.uid()` / RPC divergence.
- Compared bundle hashes to rule out stale JS — both clients confirmed on the same deployed bundle.
- Isolated the true root cause: per-user catalog hides (`user_hidden_items`, keyed by `clerk_id`) were leaking into `loadListItems` and suppressing shared active list rows that another household member had added.
- Fixed by removing the `hiddenIdsRef.current.has(...)` guard from the list-item load path — hides now apply only to catalog/browse rendering, not to the shared list.
- Verified fix on both clients: identical 0-of-9 lists, Bakery & Bread renders on DH despite his per-user hide.

**Unfinished:**
- Cold cross-user test (fresh tabs, cold sign-in) not yet run on the final fix.
- `dev` -> `main` merge pending cold test.

**Files updated:** src/App.js, src/hooks/useProvisions.js
**DB changes:** None (fix was client-side).

---

## Session 2 (evening) — Catalog Visibility Model: DECIDED

**Decision:** Resolved the Hide vs. Delete fork left open after the morning session.

**Canonical model (locked):**
- **Global seed list** — shared starting point every household inherits. Permanent infrastructure, undeletable household-wide. Exists to get households moving day one.
- **Custom items** — any household member can add or delete; add/delete is household-wide (affects everyone).
- **Hide** — per-user, browse-only, reversible by that user. Applies to any catalog item the user doesn't want in *their* view. Never touches the shared shopping list.
- **Global reset** — separate, confirmation-gated; returns catalog to factory seed and clears household customizations. Recovery-from-chaos tool, not an everyday undo.
- **Multi-item hide** — deferred until user feedback shows one-by-one hiding is a real pain.

**Two principles that fall out (and prevent the morning's bug class):**
1. The shared list is sacred — no per-user view preference ever suppresses it. Hide lives in the browse layer only.
2. Every removal has a proportionate undo: hide -> unhide (one tap, personal); custom delete -> soft-delete recovery window (household); reset -> deliberate and total.

**Implementation gap (code today vs. decided model):**
- Current `deleteItem` branches global-vs-custom and, for global items, writes a per-user hide — wrong under the new model. Global items should be Hide-only, not deletable.
- Next build: split the single "remove" gesture into two explicit verbs — **Hide** (seed items) and **Delete** (custom items); make Delete refuse on seed items; ensure custom Delete cascades to active list rows (= existing cascade-soft-delete item); add per-user unhide UI (`restoreHiddenByCategory` already partial).
- **No new tables** — `user_hidden_items` + `catalog_items.deleted_at` cover it.

---

## NEXT SESSION

SESSION START
Goal: Cold-test the per-user-hide sync fix, merge dev -> main, then build the Hide/Delete verb split per the decided catalog model.
State: Sync fix on dev (warm-tab confirmed, both clients match), pending cold test + merge. Catalog model locked (see Session 2). `deleteItem` currently mishandles global items (hides per-user instead of disallowing delete). No new tables needed for the Hide/Delete split.
Done when: (1) Cold test passes on both clients and dev merged to main; (2) seed items show Hide only (per-user, reversible, never affects the list); (3) custom items show Delete only (household-wide, cascades to list); (4) per-user unhide UI works.

**Sequencing note:** Cold-test + merge to main FIRST. Do not stack the Hide/Delete build on top of an unmerged fix.
