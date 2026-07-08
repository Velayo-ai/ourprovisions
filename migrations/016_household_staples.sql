-- ============================================================
-- Migration 016 — household_staples (per-household staple prefs)
--
-- WHY THIS EXISTS
-- ---------------
-- KNOWN DATA-MODEL DEFECT (found 2026-06-29, confirmed 2026-07-07):
-- `catalog_items.is_staple` is a SINGLE boolean on the shared
-- `is_global = true` row (household_id = NULL). It therefore cannot
-- hold a PER-HOUSEHOLD preference:
--   * Symptom 1 — tapping Staple on a global item writes nothing.
--     The catalog_items UPDATE policy only admits rows whose
--     household_id is in the caller's memberships; a global row has
--     household_id = NULL, so `NULL in (...)` is never true → 0 rows
--     updated, no error → silent failure (reverts on the 20s poll).
--   * Symptom 2 — the Staples filter reads that shared flag, so a
--     fresh household (owning no staple-flagged global rows) matches
--     almost nothing.
--
-- THE FIX (design locked 2026-07-07): staple status becomes
-- ROW-PRESENCE in a join table keyed (household_id, catalog_item_id),
-- the SINGLE source of truth for BOTH global and custom items.
-- RLS-gated on is_member_of(household_id) — the Harbour standard
-- authorization primitive (migration 003). Existing custom staples
-- are backfilled; the dormant is_staple column is left in place
-- (not dropped) for a clean rollback, and no read path uses it after
-- this migration.
--
-- FK NOTE — deliberate exception to the "all FKs referencing
-- catalog_items are NO ACTION" invariant. household_staples is
-- DISPOSABLE PREFERENCE DATA, not history (unlike list_items). A
-- stapled item's preference SHOULD vanish when the item is deleted,
-- so catalog_item_id is ON DELETE CASCADE. This keeps the migration
-- self-contained (no surgery on the multi-step delete RPCs) and is
-- the correct semantic for a preference row. Recorded in
-- docs/ARCHITECTURE.md as a scoped carve-out.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The table. Row presence = "this household staples this item."
-- ------------------------------------------------------------
create table if not exists public.household_staples (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id)    on delete cascade,
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (household_id, catalog_item_id)
);

-- Read path is always "staples for THIS household" → index household_id.
-- (The UNIQUE constraint already covers (household_id, catalog_item_id).)
create index if not exists idx_household_staples_household
  on public.household_staples (household_id);

-- ------------------------------------------------------------
-- 2. RLS — a member may see/add/remove ONLY their household's
--    staples. No UPDATE policy: staple state is row-presence, so
--    there is nothing to update (insert = staple, delete = unstaple).
-- ------------------------------------------------------------
alter table public.household_staples enable row level security;

create policy "household_staples_select" on public.household_staples
  for select to authenticated
  using (is_member_of(household_id));

create policy "household_staples_insert" on public.household_staples
  for insert to authenticated
  with check (is_member_of(household_id));

create policy "household_staples_delete" on public.household_staples
  for delete to authenticated
  using (is_member_of(household_id));

-- ------------------------------------------------------------
-- 3. Grants. Matches the public-schema grant baseline
--    (docs/007_dev_restore_role_grants.sql). RLS still governs rows;
--    the grant only opens the table-level privilege.
-- ------------------------------------------------------------
grant select, insert, delete on public.household_staples to authenticated;

-- ------------------------------------------------------------
-- 4. Backfill existing CUSTOM staples into the join table. Global
--    rows can't map to a household (household_id = NULL) and the
--    prod leak-check (is_global=true and is_staple=true) returned 0
--    rows, so only real household-scoped customs carry over.
--    ON CONFLICT DO NOTHING makes this migration idempotent.
-- ------------------------------------------------------------
insert into public.household_staples (household_id, catalog_item_id)
  select household_id, id
  from catalog_items
  where is_global = false
    and is_staple = true
    and household_id is not null
    and deleted_at is null
on conflict (household_id, catalog_item_id) do nothing;

-- ------------------------------------------------------------
-- 5. Repoint the SHOP list read. get_list_items_for_household now
--    derives is_staple from household_staples for the requested
--    household, not from the shared column. SECURITY DEFINER, so it
--    reads the join table regardless of the caller's RLS. Signature
--    (return columns) is UNCHANGED — client contract is stable.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_list_items_for_household(p_household_id uuid)
 RETURNS TABLE(id uuid, catalog_item_id uuid, quantity integer, price_per_unit numeric, status text, added_by uuid, name text, category text, is_staple boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    li.id, li.catalog_item_id, li.quantity, li.price_per_unit,
    li.status, li.added_by,
    ci.name, ci.category,
    exists (
      select 1 from household_staples hs
      where hs.household_id = p_household_id
        and hs.catalog_item_id = ci.id
    ) as is_staple
  from list_items li
  join catalog_items ci on ci.id = li.catalog_item_id
  where li.household_id = p_household_id
    and li.deleted_at is null
    and li.status in ('pending','bought')
    and ci.deleted_at is null
$function$;

-- ============================================================
-- DEV VERIFICATION (run by hand in the dev SQL Editor — NOT part
-- of the migration body). The SQL Editor has silently kept old
-- function versions before, so confirm the RPC actually saved.
--
--   -- a. Confirm the RPC re-saved with the household_staples EXISTS:
--   select pg_get_functiondef(oid) from pg_proc
--   where proname = 'get_list_items_for_household';
--
--   -- b. Confirm RLS + membership gate. As Dan (member of "My
--   --    Household" + "Lake House"): inserting a staple for either
--   --    of his households succeeds; inserting one for a household
--   --    he is NOT in is rejected by household_staples_insert.
--
--   -- c. Global staple now persists per-household: staple a global
--   --    item in household A, confirm a row appears in
--   --    household_staples; confirm household B does NOT see it
--   --    (its get_list_items_for_household / catalog read returns
--   --    is_staple=false for the same catalog_item_id).
--
--   -- d. Backfill sanity — every pre-existing custom staple copied:
--   select count(*) from catalog_items
--     where is_global=false and is_staple=true and deleted_at is null;
--   -- should equal the number of custom rows now in household_staples.
-- ============================================================
