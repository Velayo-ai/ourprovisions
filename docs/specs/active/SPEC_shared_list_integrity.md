# SPEC — Shared-list data-integrity fixes (bugs 1, 2, 3)

**Scope:** OurProvisions · `src/useProvisions.js` (+ one prod migration)
**Status:** Diagnosis complete from code read + prod query (2026-07-12). Query (c) run — Bug 1 confirmed **catalog-layer fork**, not list-layer only. Original spec's list-layer hypothesis was corrected by the query.
**Origin:** Field-test capture 2026-07-11 (Helen + Aidan, English Muffins incident).

## Prod query result (query (c), 2026-07-12) — the correction

Three list rows for "English [Mm]uffins" pointed at **three distinct `catalog_item_id`s**:
- `8a63b88…` "English muffins" (lowercase) — soft-deleted 2026-05-10
- `b9a3b1d…` "English Muffins" — live, bought (2026-07-11)
- `c10562d…` "English Muffins" — live, pending (2026-07-11)

Distinct catalog ids per list row ⇒ **the catalog is forking**, not just the list. This is the (a)-branch of the diagnostic gate. Bug 1's fix moves from "scope the list re-add" to "stop the catalog fork." Note also case-variance ("muffins" vs "Muffins") forks independently of hide/re-add — a normalization gap.
**Why a full spec:** touches prod (schema constraint), carries a shared root-cause decision, has a truth table + a diagnostic gate a future session must not skip.

---

## Root cause (one disease, three symptoms)

The entire list-item state model is **keyed by `itemName`**, and list-item DB writes **target `catalog_item_id` without scoping to a single `list_items.id`**. Nothing at the DB level forbids two live `list_items` rows for the same `(household_id, catalog_item_id)`. When a duplicate row exists, every name-keyed assumption breaks.

| Bug | Symptom | Mechanism (confirmed in code) |
|---|---|---|
| **2** | Check one item, both check | `checked` state is `{ [name]: bool }` (one key per name → can't represent two rows). `toggleChecked` update at ~L705 is `.eq("catalog_item_id", resolvedId)` with **no `.eq("id", …)`** → flips *every* live row with that catalog id. |
| **3** | Toggle bounces / takes ~3 taps to stick | `loadListItems` runs `setChecked(newChecked)` **unconditionally every 2s poll** (L186). Unlike `setQuantities` (L178–185, guarded by `pendingQtyRef`), `checked` has **no optimistic-write guard**. A poll landing before the async update commits reads the still-`pending` row and slams the optimistic value back. |
| **1** | Re-adding a hidden/removed item spawns a duplicate | **CATALOG-LAYER FORK (confirmed by query).** Three layers stack: (i) no unique constraint on `catalog_items` name-in-scope; (ii) `insert_custom_catalog_item` is a **blind INSERT** — no existence check, no case-fold (000_baseline L804); (iii) client evicts hidden names from its resolver (`hiddenIdsRef`, L500/503) so `catalogRef.current[itemName]` at L574 returns `undefined` for a just-hidden name → `updateQty` falls into the insert path (L577–590) → **new catalog id minted** even though a live/hidden same-name row exists. The list-layer `.update` scoping (original hypothesis) is a real secondary issue but NOT the primary fork mechanism. |

**Decision:** treat these as one root cause with a shared fix backbone. 2 and 3 are the same session; 1 shares the DB constraint but needs the diagnostic query first to confirm catalog-layer vs list-layer.

---

## Diagnostic gate (RUN FIRST — read-only, prod `parpauldmbetptkmdwbd`)

```sql
-- (a) catalog-layer fork: same name duplicated in catalog_items?
select name, household_id, count(*) n, array_agg(id) ids, array_agg(deleted_at) dels
from catalog_items group by name, household_id having count(*) > 1 order by n desc;

-- (b) list-layer dup: >1 LIVE list_items row for same catalog item in a household?
select household_id, catalog_item_id, count(*) live_rows,
       array_agg(id) ids, array_agg(status) statuses
from list_items where deleted_at is null
group by household_id, catalog_item_id having count(*) > 1 order by live_rows desc;

-- (c) the actual incident rows
select li.id, li.catalog_item_id, li.status, li.deleted_at, li.created_at, ci.name
from list_items li join catalog_items ci on ci.id = li.catalog_item_id
where ci.name ilike '%english muffin%' order by li.created_at;
```

**Branch:**
- (a) non-empty → Bug 1 is **catalog-layer** (fix the `insert_custom_catalog_item` path to reuse an existing same-name row; separate follow-up).
- (a) empty, (b) non-empty → Bug 1 is **list-layer** only → the constraint + scoped re-add below is the complete fix.
- Keep (c) output in the session record — it's the ground-truth incident trace.

---

## Fix

### F0 — DB constraint (prevents recurrence; makes the class impossible)
Partial unique index so at most one live row per catalog item per household:

```sql
-- migration 017_one_live_list_item_per_catalog.sql
-- PRE-REQ: (b) above must return zero rows. If not, soft-delete the older
-- duplicate of each pair FIRST (reversible via deleted_at), then create the index.
create unique index if not exists uq_live_list_item
  on list_items (household_id, catalog_item_id)
  where deleted_at is null;
```
Names remain intentionally non-unique elsewhere — this constrains *live list membership*, not the catalog.

### F1 — Stop the catalog fork (Bug 1, catalog-layer — REVISED per query)
Three coordinated changes, in priority order:

**F1a — Make `insert_custom_catalog_item` idempotent (server, primary fix).** Rewrite the RPC to reuse an existing same-name row instead of blind-inserting. **Match on NORMALIZED name only — never fuzzy.** Normalize = lowercase + collapse internal whitespace + trim. Same-after-normalize ⇒ same item; anything else ⇒ distinct (so "Wheat Bread" and "Bread" stay separate — intended). This kills case/whitespace/typo-adjacent forks without ever merging two legitimately different names.

**Dedup rule (confirmed with Dan 2026-07-12):**
- A custom item may NOT share a normalized name with a **global** item → on exact-normalized match to a global, reuse the global row (a household never gets a private "Bread" when global "Bread" exists).
- A slightly different name is a legitimate distinct custom item ("Wheat Bread", "White Bread", "Sliced Bread", "Breading" are all fine alongside global "Bread").
- Within a household, reuse that household's own existing custom row on exact-normalized match (prevents self-forking).

```sql
-- migration 018_dedupe_custom_catalog.sql
-- normalize helper: lower(trim(regexp_replace(name,'\s+',' ','g')))
CREATE OR REPLACE FUNCTION public.insert_custom_catalog_item(
  p_name text, p_category text, p_household_id uuid, p_created_by uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','extensions' AS $$
DECLARE existing_id uuid; norm text;
BEGIN
  norm := lower(trim(regexp_replace(p_name, '\s+', ' ', 'g')));
  -- reuse a live row whose NORMALIZED name matches, in scope (global OR this household)
  SELECT id INTO existing_id FROM catalog_items
  WHERE lower(trim(regexp_replace(name, '\s+', ' ', 'g'))) = norm
    AND deleted_at IS NULL
    AND (is_global = true OR household_id = p_household_id)
  ORDER BY is_global DESC, created_at ASC   -- prefer global, else oldest custom
  LIMIT 1;
  IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;

  INSERT INTO catalog_items (name, category, is_global, household_id, created_by)
  VALUES (p_name, p_category, false, p_household_id, p_created_by)  -- store original casing
  RETURNING id INTO existing_id;
  RETURN existing_id;
END; $$;
```
Stores the user's original casing for display; matches on normalized form. This alone stops new forks regardless of the client bug.

**F1b — Don't evict hidden names from the resolver's re-add path (client).** The `hiddenIdsRef` eviction at L500/503 is correct for *display* (hidden items shouldn't show in Browse) but it also blinds `updateQty`'s L574 lookup, which is what triggers the insert fallthrough. Fix: keep a separate name→id map that includes hidden items for resolution only, OR have `updateQty` check hidden/deleted catalog ids before deciding to insert. With F1a live, a fork can't happen even if this fires — but fixing it means re-adding a hidden item *un-hides and reuses* the original row (correct behavior) instead of routing through insert. Grep current line numbers first.

**F1c — Partial-unique on catalog_items (defense-in-depth, now unblocked).** Dan's rule resolves the collision question, so the index shape is decidable. After prod dedup, enforce at the DB that no two live rows share a normalized name within the same scope. Because the rule forbids a custom row duplicating a *global* name, the cleanest enforcement is a unique index on the normalized name across the global set, plus per-household uniqueness for custom rows:
```sql
-- one live row per normalized name among globals
create unique index if not exists uq_global_catalog_norm
  on catalog_items (lower(trim(regexp_replace(name,'\s+',' ','g'))))
  where deleted_at is null and is_global = true;
-- one live custom row per normalized name per household
create unique index if not exists uq_custom_catalog_norm
  on catalog_items (household_id, lower(trim(regexp_replace(name,'\s+',' ','g'))))
  where deleted_at is null and is_global = false;
```
Note: these two indexes don't *by themselves* stop a custom row from duplicating a global name (different partial predicates) — that rule is enforced by F1a's reuse logic. The indexes are the backstop against same-scope self-forks. Apply only after F1a is verified and prod is deduped, or the index creation will fail on existing dups. Own migration; don't bundle.

**Prod cleanup (manual, reversible):** merge the three English-Muffins rows — repoint the live list rows to a single canonical catalog id, soft-delete the fork(s). Sequence in the diagnostic gate output; do after F1a so no new forks race the cleanup.

### F2 — Scope the toggle write (Bug 2)
`toggleChecked` must target a single row. Prefer `.eq("id", listItemId)` — the caller already has `list_item.id` in `listRows` (`newListRows[].id`). Thread the `list_item.id` through the toggle callsite in `App.js` and update the `.update()` to `.eq("id", listItemId)`. This makes the write row-specific regardless of duplicates.

### F3 — Guard optimistic `checked` against the poll (Bug 3)
Mirror the `pendingQtyRef` pattern for checks:
- add a `pendingCheckRef = useRef(new Set())`;
- `toggleChecked` adds the key on tap, deletes it on success/failure (finally);
- in `loadListItems`, replace `setChecked(newChecked)` (L186) with a merge that preserves `prev[key]` for any key in `pendingCheckRef`, identical in shape to the L178–185 quantity guard.

> If F2 moves `checked` to be keyed by `list_item.id` instead of name (cleaner, kills Bug 2 at the state layer too), the guard key must match. **Decide keying once and apply consistently** — name-keyed everywhere, or id-keyed everywhere. Recommendation: keep name-keyed for this pass (smaller diff, beta-safe) since F0+F2's `.eq("id")` already prevents the two-live-row situation that made name-keying dangerous. Revisit id-keying as a follow-up once the constraint has held in prod.

---

## Verification (two-account realtime, DH/DT, same household, prod-dev)

1. **Bug 2:** two rows *can no longer be created* (F0). With one row: check on DH → DT reflects within one poll, only that item. ✓
2. **Bug 3:** tap check → sticks on the **first** tap; no bounce across at least 5 poll cycles (10s). Tap uncheck → same. ✓
3. **Bug 1:** add "English Muffins" → remove (hide/delete) → re-add by name → exactly **one** live row (query (b) returns zero). ✓
4. Regression: quantity stepper still survives the poll (existing `pendingQtyRef` untouched). ✓

**Done when:** (b) returns zero on prod after the constraint; all four checks pass in a two-account test on dev; then dev→main + prod-verify.

---

## Sequencing for Claude Code
Query (c) already run (catalog fork confirmed). Remaining:
1. Run gate queries (a) + (b) to enumerate ALL forks/dups across prod, not just English Muffins.
2. **F1a first** (idempotent RPC, migration 018) — dev, verify a hide→re-add reuses the id, then prod. This stops the bleeding before cleanup.
3. **Prod cleanup:** merge existing forks — repoint live list rows to one canonical catalog id per name, soft-delete the extras (reversible via `deleted_at`). Re-run (a) → clean.
4. **F2 + F3** in one commit (check path — toggle scoping + optimistic guard); dev two-account verify.
5. **F1b** in its own commit (resolver eviction fix — re-add un-hides instead of forking).
6. **F0** (partial-unique on `list_items`) after (b) returns zero — prevents live list dups.
7. **F1c** deferred (catalog partial-unique) — needs the global-vs-household name-collision decision. Flag, don't build.
8. Promote dev→main per change → prod-verify. One tested change per commit throughout.

**Decision resolved (Dan, 2026-07-12):** a household may NOT have a custom item with a name identical (normalized) to a global item — reuse the global. Slightly different names ("Wheat Bread" vs global "Bread") are legitimate distinct custom items. Matching is exact-on-normalized (lower + collapse-whitespace + trim), never fuzzy — fuzzy would wrongly merge "White Bread" into "Bread". This shapes F1a's match and unblocks F1c.
