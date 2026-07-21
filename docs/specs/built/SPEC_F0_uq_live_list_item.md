# SPEC — F0: `uq_live_list_item` partial-unique on `list_items`

**Scope:** OurProvisions · DB migration (dev + prod)
**Status:** ready to apply · **Migration #:** 020 (confirm 019 is disk high-water first)
**Parent spec:** `docs/specs/active/SPEC_shared_list_integrity.md`

## Decision
Add a partial unique index guaranteeing **at most one live `list_items` row per `(household_id, catalog_item_id)`**. This is the list-layer twin of migration 019, which closed the same class at the catalog layer.

## Why now / why this shape
- **Bug 2** ("check one, checks both") was two live rows for one catalog item in a household. F2's `.eq("id", listItemId)` fixed the *symptom* (writes no longer hit both rows). This index removes the *class* — the two-live-row state can no longer exist.
- **Partial (`where deleted_at is null`)** — soft-deleted tombstones are excluded so a remove→re-add leaves the old row in place without collision. Consistent with the soft-delete model used across the schema.
- **Unique on `catalog_item_id`, not name** — stable-UUID-as-key rule; names are display-only.

## Pre-req gate (CLEARED)
Live-row dup census must return zero before CREATE, or the build fails:
```sql
select household_id, catalog_item_id, count(*)
from list_items where deleted_at is null
group by household_id, catalog_item_id having count(*) > 1;
```
Ran against prod `parpauldmbetptkmdwbd` 2026-07-14 → **0 rows**. Clean CREATE is the proof.

## Apply order
1. dev (`zxwtxjjmssykhqrghouf`) — confirm project ID by URL, not badge.
2. Clean CREATE on dev → 3. prod (`parpauldmbetptkmdwbd`) — same URL check.

## Reversible
`drop index uq_live_list_item;`

## Relationship to F1b
F0 makes a fork *impossible* to persist. F1b (client resolver eviction) is still worth doing — it makes re-adding a hidden item **un-hide and reuse** the original row instead of routing through insert (which F0 would now reject at the DB anyway, surfacing as an error rather than the correct silent reuse). F0 is the floor; F1b is the correct UX on top of it.
