-- one_off_038_prod_cycle_repair.sql
-- ONE-OFF DATA REPAIR. PROD ONLY. NOT A MIGRATION. RUN ONCE.
-- Companion to migrations/038_cycle_integrity.sql.
-- Per docs/specs/active/SPEC_cycle_integrity_038.md, D1 + D3.
--
-- =====================================================================
-- WHY THIS IS NOT A MIGRATION
-- =====================================================================
-- Every id below is a literal prod row UUID. Nothing here is portable and
-- nothing here should ever run against dev -- dev's census is already clean
-- (zero double-open households, zero stranded live items, measured 2026-08-17).
-- Running it on dev would either no-op or corrupt unrelated rows.
--
-- ⚠️ RUN THIS BEFORE 038. The unique index cannot build while `Our calendar`
-- holds two open cycles.
--
-- ENVIRONMENT GUARD: this script refuses to run anywhere but prod. Verified by
-- system_identifier, not by server label -- a label can be pointed anywhere.
--
-- =====================================================================
-- SCOPE -- DELIBERATELY NARROW. READ THIS BEFORE WIDENING IT.
-- =====================================================================
-- D1 repairs `Our calendar`'s double-open cycle.
-- D3 repoints exactly TWO `Lake house` rows.
--
-- Prod currently holds 18 live list_items pointing at a closed cycle. This
-- script touches 2 of them. That is not an oversight:
--
--   * The 2 Lake house rows are INSERT-AFTER-CLOSE (created_at > closed_at).
--     Their cause -- the unguarded insert path -- is fixed by 026, which ships
--     in this same batch. Repair and structural fix land together.
--
--   * The other 16 are CLOSE-ORPHANS (created_at < closed_at) produced by
--     close_cycle never sweeping unrolled survivors. That defect is STILL OPEN
--     (newest instance 2026-08-08). Repointing them would erase the primary
--     evidence of a live bug and be re-dirtied on the next close.
--     LEAVE THEM. They are tracked as their own ROADMAP item.
--
-- No user-visible effect either way: get_list_items_for_household filters
-- household / deleted_at / status and never reads cycle_id.
--
-- RLS: verified 2026-08-17, not assumed. 032 enabled RLS on provision_cycles,
-- but all three touched tables (provision_cycles, list_items, households) are
-- owned by `postgres` with relforcerowsecurity = FALSE in BOTH environments.
-- The SQL editor connects as the owner, so policies do not apply and these
-- UPDATEs see every row. Had FORCE RLS been set, the preconditions below would
-- have silently under-counted and the script would have aborted rather than
-- half-applied -- which is the correct failure direction, but check anyway if
-- that flag ever changes.

do $$
declare
  v_sysid            text;
  -- D1 -- Our calendar (7f687474-9186-4258-8c78-fadc3955019a)
  v_survivor  constant uuid := 'f98089a1-1f46-4aad-8948-200f9b70c981'; -- 14 items, opened 11:25:25
  v_emptied   constant uuid := 'a8dd7187-60ce-4d08-bddf-d8605826a9c5'; --  2 items, opened 11:19:44
  -- D3 -- Lake house (58ec251c-6480-4dcc-a8d4-7978a9affa56)
  v_lake_open constant uuid := '1522085c-02f3-4824-93d0-dce133c3ab3f';
  v_lake_a    constant uuid := '37aa8fca-232c-4006-8694-4a4c2f8ca582';
  v_lake_b    constant uuid := '6dee158c-cf02-4b67-8e2c-e35cee2eb60a';
  v_n                 integer;
begin
  -- ---------- environment guard ----------
  select system_identifier::text into v_sysid from pg_control_system();
  if v_sysid <> '7606130613603586966' then
    raise exception
      'REFUSING TO RUN: this one-off is prod-only. Expected system_identifier 7606130613603586966, got %.', v_sysid;
  end if;

  -- ---------- D1 preconditions ----------
  -- Assert the census still matches what was measured on 2026-08-17. If the
  -- shape drifted, stop -- do not repair a state we have not looked at.
  select count(*) into v_n from public.provision_cycles
   where household_id = '7f687474-9186-4258-8c78-fadc3955019a'
     and closed_at is null and deleted_at is null;
  if v_n <> 2 then
    raise exception 'D1 ABORT: Our calendar has % open cycles, expected 2. Re-run the census.', v_n;
  end if;

  select count(*) into v_n from public.list_items
   where cycle_id = v_survivor and deleted_at is null;
  if v_n <> 14 then
    raise exception 'D1 ABORT: survivor cycle holds % live items, expected 14.', v_n;
  end if;

  select count(*) into v_n from public.list_items
   where cycle_id = v_emptied and deleted_at is null;
  if v_n <> 2 then
    raise exception 'D1 ABORT: emptied cycle holds % live items, expected 2.', v_n;
  end if;

  -- ---------- D1 apply ----------
  -- Repoint the 2 stranded items into the survivor. rolled_from_item_id is
  -- deliberately NOT set -- these were never rolled forward, and claiming they
  -- were would fabricate provenance.
  update public.list_items
     set cycle_id   = v_survivor,
         updated_at = now()
   where cycle_id = v_emptied
     and deleted_at is null;
  get diagnostics v_n = row_count;
  raise notice 'D1: repointed % items into survivor %', v_n, v_survivor;

  -- Close the emptied cycle. It is history -- close it, never delete it.
  update public.provision_cycles
     set closed_at  = now(),
         updated_at = now()
   where id = v_emptied
     and closed_at is null;
  get diagnostics v_n = row_count;
  raise notice 'D1: closed emptied cycle % (% row)', v_emptied, v_n;

  -- ---------- D3 preconditions ----------
  select count(*) into v_n from public.provision_cycles
   where household_id = '58ec251c-6480-4dcc-a8d4-7978a9affa56'
     and closed_at is null and deleted_at is null;
  if v_n <> 1 then
    raise exception 'D3 ABORT: Lake house has % open cycles, expected exactly 1.', v_n;
  end if;

  -- Both target rows must still be live and still stranded.
  select count(*) into v_n
    from public.list_items li
    join public.provision_cycles pc on pc.id = li.cycle_id
   where li.id in (v_lake_a, v_lake_b)
     and li.deleted_at is null
     and pc.closed_at is not null;
  if v_n <> 2 then
    raise exception 'D3 ABORT: expected 2 live stranded Lake house rows, found %.', v_n;
  end if;

  -- ---------- D3 apply ----------
  -- Repoint, NEVER tombstone. These are live rows on a real household's list
  -- and are visible to that user today; deleting them would make two items
  -- vanish from someone's screen -- an accounting cleanup turned into a
  -- user-visible edit.
  update public.list_items
     set cycle_id   = v_lake_open,
         updated_at = now()
   where id in (v_lake_a, v_lake_b)
     and deleted_at is null;
  get diagnostics v_n = row_count;
  raise notice 'D3: repointed % Lake house items into open cycle %', v_n, v_lake_open;

  -- ---------- post-condition: D2 must now be able to build ----------
  select count(*) into v_n from (
    select household_id from public.provision_cycles
     where closed_at is null and deleted_at is null
     group by household_id having count(*) > 1
  ) x;
  if v_n <> 0 then
    raise exception 'POST ABORT: % household(s) still hold >1 open cycle. 038 will fail.', v_n;
  end if;

  raise notice 'one_off_038 complete. Census clean -- 038 can now build.';
end $$;
