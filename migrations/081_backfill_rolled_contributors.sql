-- 081_backfill_rolled_contributors.sql
-- SPEC_rollforward_keeps_attribution.md, backfill B (Dan ran it 2026-11-07 after the dev re-walk PASSED
-- on 079 + 080). Data only: no function, grant or schema change.
--
-- WHAT: rolled rows that lost their contributor ledger to the pre-079/080 wipe get one contributor
--   back from added_by, carrying the row's quantity:
--     pending, live, rolled_from_item_id set, added_by set, no list_item_contributors row at all
--     (deleted or not — the client reads the ledger without a deleted_at filter), on conflict do nothing.
--
-- DEVIATION FROM THE SPEC'S SQL (Dan's ruling 2026-11-07): rows with a list_item_meals link are
--   SKIPPED. Meal adds never write the ledger (only land_ask_picks and the client's direct add do), so a
--   meal-only row has no "Added by" line by design — its provenance is the teal "For [meal]" line. The
--   spec's SQL would have given those rows a clay "Added by {added_by}" for a direct add that never
--   happened (Verify 4: "For [meal]" with no change). Cost, accepted: a row that was both a direct add
--   and a meal pull stays without its "Added by"; that can't be told apart now.
--
-- COUNT before the run (2026-11-07, read-only):
--   dev  7642734024280108049: 9 candidates under the spec's SQL, 8 meal-linked → 081 touches 1 (Board Walk).
--   prod 7606130613603586966: 8 candidates, 0 meal-linked → 081 touches 8 (1 household, 1 with qty > 1).
--
-- Tradeoff (spec): one name per row; a second adder is gone for good, and added_by can be stale after a
--   remove → re-add.
--
-- APPLY: dev first. PARSE CHECK = this file with `commit;` → `rollback;`, nothing else changed. Both
--   copies log (warnings): "081 backfill: N candidates, N inserted, 0 left, M meal-linked rows left
--   alone" and "081 contributor ids: …" (uuids only), then "081 COMMITTED — …" or "081 ROLLED BACK —
--   parse check …". Then the closing VERIFY and (dev only) the ledger row. Prod: after 079 and 080.
-- ROLLBACK: 081_rollback.sql deletes the ids the "081 contributor ids" warning logged.
--
-- DRAFTED 2026-11-07 by Claude Code.

begin;

do $backfill$
declare
  v_candidates integer;
  v_meal_left  integer;
  v_inserted   integer;
  v_left       integer;
  v_bad        integer;
  v_ids        text;
  v_xact       timestamptz := now();
begin
  select count(*) into v_candidates
    from public.list_items li
   where li.rolled_from_item_id is not null and li.deleted_at is null and li.status = 'pending'
     and li.added_by is not null
     and not exists (select 1 from public.list_item_contributors c where c.list_item_id = li.id)
     and not exists (select 1 from public.list_item_meals m where m.list_item_id = li.id);
  select count(*) into v_meal_left
    from public.list_items li
   where li.rolled_from_item_id is not null and li.deleted_at is null and li.status = 'pending'
     and not exists (select 1 from public.list_item_contributors c where c.list_item_id = li.id)
     and exists (select 1 from public.list_item_meals m where m.list_item_id = li.id);

  insert into public.list_item_contributors (list_item_id, user_id, quantity_added)
  select li.id, li.added_by, li.quantity
    from public.list_items li
   where li.rolled_from_item_id is not null and li.deleted_at is null and li.status = 'pending'
     and li.added_by is not null
     and not exists (select 1 from public.list_item_contributors c where c.list_item_id = li.id)
     and not exists (select 1 from public.list_item_meals m where m.list_item_id = li.id)
  on conflict (list_item_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;

  -- VERIFY (separate statements; any mismatch raises and rolls everything back)
  select count(*) into v_left
    from public.list_items li
   where li.rolled_from_item_id is not null and li.deleted_at is null and li.status = 'pending'
     and li.added_by is not null
     and not exists (select 1 from public.list_item_contributors c where c.list_item_id = li.id)
     and not exists (select 1 from public.list_item_meals m where m.list_item_id = li.id);
  -- every row written this transaction is one contributor = added_by, quantity_added = quantity, live,
  -- on a rolled pending row with no meal link and no other contributor
  select count(*) into v_bad
    from public.list_item_contributors c
    join public.list_items li on li.id = c.list_item_id
   where c.added_at = v_xact
     and (c.user_id is distinct from li.added_by or c.quantity_added is distinct from li.quantity
          or c.deleted_at is not null or li.rolled_from_item_id is null or li.status <> 'pending'
          or li.deleted_at is not null
          or exists (select 1 from public.list_item_meals m where m.list_item_id = li.id)
          or (select count(*) from public.list_item_contributors c2 where c2.list_item_id = li.id) <> 1);
  select coalesce(string_agg(c.id::text, ',' order by c.id), '(none)') into v_ids
    from public.list_item_contributors c where c.added_at = v_xact;

  raise warning '081 backfill: % candidates, % inserted, % left, % meal-linked rows left alone',
    v_candidates, v_inserted, v_left, v_meal_left;
  raise warning '081 contributor ids: %', v_ids;
  if v_inserted <> v_candidates or v_left <> 0 or v_bad <> 0
     or (select count(*) from public.list_item_contributors where added_at = v_xact) <> v_inserted then
    raise exception '081 VERIFY failed: % candidates, % inserted, % left, % bad rows', v_candidates, v_inserted, v_left, v_bad;
  end if;
end
$backfill$;

commit;

do $log$
begin
  if not exists (select 1 from public.list_items li
                      where li.rolled_from_item_id is not null and li.deleted_at is null and li.status = 'pending'
                        and li.added_by is not null
                        and not exists (select 1 from public.list_item_contributors c where c.list_item_id = li.id)
                        and not exists (select 1 from public.list_item_meals m where m.list_item_id = li.id)) then
    raise warning '081 COMMITTED — 0 direct rolled rows left without a contributor on %', (select system_identifier from pg_control_system());
  else
    raise warning '081 ROLLED BACK — parse check, nothing persisted on %', (select system_identifier from pg_control_system());
  end if;
end
$log$;

-- ═══ CLOSING VERIFY (read-only; run on the same database right after the commit) ══════════
-- Want: which_db as expected, direct_left 0, meal_linked_left_alone (dev 8, prod 0, at the 2026-11-07
-- count), and the backfilled rows read back by the ids the "081 contributor ids" warning logged.
select
  (select system_identifier from pg_control_system())::text                                  as which_db,
  (select count(*) from public.list_items li
    where li.rolled_from_item_id is not null and li.deleted_at is null and li.status = 'pending'
      and li.added_by is not null
      and not exists (select 1 from public.list_item_contributors c where c.list_item_id = li.id)
      and not exists (select 1 from public.list_item_meals m where m.list_item_id = li.id))  as direct_left,
  (select count(*) from public.list_items li
    where li.rolled_from_item_id is not null and li.deleted_at is null and li.status = 'pending'
      and not exists (select 1 from public.list_item_contributors c where c.list_item_id = li.id)
      and exists (select 1 from public.list_item_meals m where m.list_item_id = li.id))      as meal_linked_left_alone;

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '081_backfill_rolled_contributors'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '081_backfill_rolled_contributors');
