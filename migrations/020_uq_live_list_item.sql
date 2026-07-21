-- 020_uq_live_list_item.sql
-- F0 — Shared-list integrity hardening (list layer).
--
-- WHY: The structural twin of migration 019 (which closed the CATALOG layer with
-- uq_global_catalog_norm / uq_custom_catalog_norm). This closes the LIST layer.
-- Bug 2 ("check one, checks both") was rooted in two live list_items rows for the
-- same catalog item in one household. F2 (.eq("id", listItemId)) fixed the SYMPTOM
-- at write time; this index removes the whole CLASS — at most one live row per
-- (household, catalog item) is now structurally guaranteed by the DB.
--
-- PRE-REQ (verified 2026-07-14 against prod parpauldmbetptkmdwbd): the live-row
-- dup census returned ZERO rows, so this index builds clean. A clean CREATE is
-- itself proof there are no violating rows — same evidence pattern as 019.
--
-- SCOPE: partial index, live rows only (deleted_at is null). Soft-deleted rows are
-- intentionally excluded so a remove→re-add cycle can leave the old tombstone in
-- place without colliding. Matches the soft-delete model used everywhere else.
--
-- REVERSIBLE: drop index uq_live_list_item;

create unique index if not exists uq_live_list_item
  on list_items (household_id, catalog_item_id)
  where deleted_at is null;
