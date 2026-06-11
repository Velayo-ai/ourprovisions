# SPEC — Hide / Delete Verb Split

*OurProvisions · drafted June 8, 2026 · ready to implement*
*Carry this into a fresh build session.*

---

## Purpose

Replace the single ambiguous "remove" gesture with two distinct, correctly-scoped verbs:
- **Hide** — a personal view preference. "I don't want to see this in my catalog." Per-user, reversible, never affects the shared list or other users.
- **Delete** — a household action. "This item shouldn't exist for anyone." Custom items only, household-wide, cascades to the active list.

This fixes the current bug where `deleteItem` writes a per-user hide for global items (wrong: makes Hide and Delete behave identically for seed items) and where deleting custom items lacks proper reference handling.

---

## The model (DECIDED)

| Item type | Hide | Delete |
|---|---|---|
| **Seed / global** (`is_global = true`, system-owned) | ✅ swipe | ❌ never (system-owned; cannot be deleted by members) |
| **Custom** (`is_global = false`, household-owned) | ✅ swipe | ✅ in edit view, confirmed |

- **Hide** is universal (any item) because it's about *your view*, not the item's nature.
- **Delete** is custom-only because seed items are system infrastructure.
- Item type is read from **`catalog_items.is_global`** (confirmed: boolean column; seed = true, custom = false).

### Two governing principles
1. **The shared list is sacred** — no per-user view preference (Hide) ever suppresses what the household has put on the list. Hide lives in the browse layer only.
2. **Every removal has a proportionate undo** — Hide → one-tap unhide (personal); Delete → household-wide, confirmed, soft-deleted (recoverable); reset → deliberate and total.

---

## The five decisions

**D1 — Item type discriminator:** `catalog_items.is_global`. (Seed items are system-owned; only Velayo creates/edits/deletes them via code or future admin UI. Members never mutate the seed set — they can only hide seed items for themselves.)

**D2 — Other user's experience on delete:** A confirmation/reminder at the moment of deleting ("removes for everyone, including the current list") is the intent gate. A minimal, quiet fade-signal on other clients when an item vanishes (so it doesn't read as a sync bug) — attribution not required in the signal. **Audit log is NOT in scope** for this build (see Roadmap note — needs use-case definition; must stay distinct from the behavioral/analytics event stream).

**D3 — Who can delete a custom item:** Anyone in the household. (Soft-delete + confirmation are the safety net. Future: roles/approval flows and accessibility/accident-resistance are separate deferred concerns — do not conflate.)

**D4 — Gesture:**
- **Hide** = swipe-to-reveal on the list surface. Universal (seed + custom). Easy, reversible.
- **Delete** = lives in the existing **Edit Item** dialog, custom items only. Deliberate context. Explicit confirmation. Friction matches blast radius.
- Seed edit view stays price-only with its existing "only the price can be edited" note, no Delete.

**D5 — Unhide:** A dedicated **"Hidden Items"** view in the profile/settings sheet (same home as "Show prices & budget" — both are personal view preferences). Grouped by category, one-tap restore per item. Builds on existing `restoreHiddenByCategory`.

---

## Data model

**No new tables.** Uses what exists:
- `user_hidden_items` (per-user hides, keyed by `clerk_id` via the users table) — already exists, already correctly excluded from the list-load path (June 8 fix).
- `catalog_items.deleted_at` (soft-delete for custom items) — confirm column exists; add if not.

---

## CRITICAL CONSTRAINT — all FKs are `NO ACTION`

Verified June 8. Every foreign key referencing `catalog_items` is `NO ACTION`:
- `list_items.catalog_item_id` → NO ACTION
- `waste_events.catalog_item_id` → NO ACTION
- `user_hidden_items.catalog_item_id` → NO ACTION

**Implication:** the database will *block* deletion of a `catalog_items` row that is still referenced. It will not cascade and will not set-null. Therefore **Delete cannot be a simple `delete`** — it must be a multi-step RPC that clears/handles references first.

This also means there is no risk of a delete silently wiping list data (the DB protects you) — but the RPC must do the unwind explicitly.

---

## Delete: the RPC (SECURITY DEFINER)

`delete_custom_catalog_item(p_catalog_item_id, p_household_id, p_actor_clerk_id)`

Steps, in a transaction:
1. **Guard:** verify the item is `is_global = false` AND belongs to `p_household_id`. If `is_global = true`, RAISE — seed items are not deletable. (Defense in depth; UI already hides Delete for seed.)
2. **Cascade to the active list (D4 decision: Delete removes from current list too):** delete `list_items` rows for this `catalog_item_id` in this household. Also delete their `list_item_contributors` rows first (FK order).
3. **Clear other references:** delete `user_hidden_items` rows for this `catalog_item_id` (any user — the item is going away entirely). Handle `waste_events` per retention preference (likely keep history → see open question below).
4. **Delete (or soft-delete) the catalog row:** set `deleted_at = now()` (preferred — recoverable) OR hard-delete. Decision: **soft-delete** to honor "proportionate undo."
5. Return success; client refreshes.

**Why SECURITY DEFINER:** cross-user reference cleanup (other users' hides, household list rows) bypasses per-user RLS — same pattern as `get_list_items_for_household`.

### Open question for build (waste_events)
`waste_events` references `catalog_item_id` and is historical analytics data. Deleting the catalog item shouldn't necessarily erase waste history. Options: (a) keep waste_events, null the FK — but FK is NO ACTION so can't null without schema change; (b) keep a soft-deleted catalog row so the FK stays valid (argues for soft-delete, not hard-delete); (c) reassign. **Recommendation: soft-delete the catalog row (`deleted_at`), which keeps all FKs valid and history intact, and filter `deleted_at IS NULL` everywhere the catalog is read.** This is the cleanest — nothing is orphaned, history survives, and "undo" is just nulling `deleted_at`.

> Note: soft-delete means the catalog read paths (`get_list_items_for_household`, catalog/browse load, `catalogMap` build) must all filter `where deleted_at is null`. Audit these on build.

---

## Hide: behavior

Hide already works at the data layer (`user_hidden_items`) and is already correctly excluded from the list-load path (June 8 fix — `hiddenIdsRef` no longer filters `loadListItems`). This build:
1. Makes **swipe → Hide** the gesture on the list surface for ALL items (seed + custom).
2. Confirms Hide writes a `user_hidden_items` row for the acting user only.
3. Confirms Hide affects only the browse/catalog view (the `cMap` build), never the shared list — already true post-June-8.

No RPC change needed for Hide beyond ensuring the gesture writes the per-user hide row.

---

## UI surfaces

### 1. List-surface swipe (`SwipeToRemove`)
- Reveals **Hide** for every item. Label: "Hide".
- No Delete on the swipe (Delete moved to edit view).
- Same component, single action.

### 2. Edit Item dialog (already branches by item type)
- **Seed item:** price-only + existing "This is a catalog item — only the price can be edited." note. **No Delete.** (Unchanged.)
- **Custom item:** editable name + price (as today). **Add a Delete button**, visually separated from Save/Cancel — bottom-left or below a divider, destructive styling — so Save and Delete are never adjacent/confusable.
  - Note near the button: "Deleting removes this item for the whole household, including the current list."
  - Tap → explicit confirm dialog → calls `delete_custom_catalog_item` RPC.

### 3. Hidden Items view (new, in profile/settings sheet)
- Entry point alongside "Show prices & budget".
- Lists the acting user's hidden items, grouped by category.
- One-tap **Restore** per item (removes the `user_hidden_items` row). Builds on `restoreHiddenByCategory`.

---

## Build sequence (in the fresh session)

**Prerequisite (separate, FIRST):** cold-test the June 8 sync fix and merge `dev` → `main`. Do NOT build Hide/Delete on an unverified, unmerged baseline. (Roadmap NOW #1.)

Then, on the verified baseline:
1. Confirm/add `catalog_items.deleted_at`; add `deleted_at IS NULL` filters to all catalog read paths.
2. Write `delete_custom_catalog_item` SECURITY DEFINER RPC (steps above). Verify with `pg_get_functiondef`.
3. Wire **swipe → Hide** for all items; confirm seed items show Hide, customs show Hide.
4. Add **Delete** button to the custom branch of the Edit Item dialog + confirm dialog + RPC call.
5. Build the **Hidden Items** view in settings with category grouping + restore.
6. **Re-test adds/deletes** against the verified baseline — any regression is now cleanly attributable to this build.

---

## Acceptance tests

- Seed item: swipe shows **Hide** only; edit view is price-only, no Delete.
- Custom item: swipe shows **Hide**; edit view shows **Delete** with confirmation.
- Hiding an item removes it from *my* browse only; it still appears on the shared list if it's there, and other users are unaffected.
- Deleting a custom item: confirmation fires; item leaves the current list and catalog for everyone; soft-deleted (`deleted_at` set); other clients see it vanish with the quiet fade-signal (not a glitch).
- Deleting a custom item that's referenced does NOT error (RPC handles references; FK NO ACTION never blocks because soft-delete keeps the row).
- Hidden Items view lists my hides by category; restore returns the item to my browse in one tap.
- **Real-data validation:** the 10 both-referenced duplicate seed items (Flour, Sugar, Bananas, Broccoli, Carrots, Garlic, Lemons, Potatoes, Spinach, Tomatoes) are the merge test fixture — though note these are *seed* dupes; the merge logic (re-point references, merge-on-collision) is a related but distinct task from custom Delete. Flag whether seed-dedupe-merge ships with this or as a fast-follow.

---

## Out of scope (captured for roadmap)

- **Audit log** — concept wanted, use cases undefined. Must stay distinct from behavioral/analytics event stream. NEXT, needs spec.
- **Household roles / approval flows** (child requests route to parent, admin vs. member) — Later.
- **Accessibility / accident-resistance** (stronger confirms, generous undo, simple mode) — design principle now, feature later.
- **Seed-dedupe merge** for the 10 both-referenced duplicates — needs the re-point + merge-on-collision logic (overlaps custom Delete's reference handling). Decide if it rides with this build or follows.
- **Multi-item / category-level Hide** — only if user demand emerges.
- **Bread-in-Pantry vs Bakery** — cosmetic categorization call.
- **Regional seed lists** — future; `is_global` ownership model already leaves the door open (add region dimension, households inherit, seed query filters).
