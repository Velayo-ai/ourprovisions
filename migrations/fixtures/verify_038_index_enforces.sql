-- verify_038_index_enforces.sql
-- §F3 PROOF -- run AFTER 038 is applied. Safe on dev AND prod.
--
-- "An index is worthless if unproven." This does not inspect catalogue metadata
-- and call that proof -- it ATTEMPTS the violation the index is supposed to stop
-- and fails loudly if the violation succeeds.
--
-- Self-cleaning: the throwaway household and its cycles are removed on every
-- exit path, including failure. Creates nothing that outlives the run.
-- No list_items or memberships are created, so nothing references the rows.

do $$
declare
  v_owner    uuid;
  v_hh       uuid;
  v_c1       uuid;
  v_blocked  boolean := false;
  v_valid    boolean;
  v_unique   boolean;
begin
  -- ---------- 1. the index exists, is UNIQUE and is VALID ----------
  -- indisvalid matters specifically because CREATE INDEX CONCURRENTLY can leave
  -- an INVALID index behind, and an invalid index enforces NOTHING while still
  -- satisfying `if not exists`.
  if to_regclass('public.uq_open_cycle_per_household') is null then
    raise exception 'FAIL: uq_open_cycle_per_household does not exist.';
  end if;

  select i.indisvalid, i.indisunique into v_valid, v_unique
    from pg_index i
   where i.indexrelid = to_regclass('public.uq_open_cycle_per_household');
  if not v_unique then
    raise exception 'FAIL: uq_open_cycle_per_household exists but is NOT unique.';
  end if;
  if not v_valid then
    raise exception 'FAIL: uq_open_cycle_per_household is INVALID (a failed CONCURRENTLY build). It enforces nothing. Drop it and rebuild.';
  end if;
  raise notice 'PASS 1/4: index exists, indisunique = true, indisvalid = true.';

  -- ---------- 2. set up a throwaway household ----------
  select created_by into v_owner
    from public.households where deleted_at is null limit 1;
  if v_owner is null then
    raise exception 'SETUP FAIL: no live household to borrow a valid users FK from.';
  end if;

  insert into public.households (name, created_by)
  values ('ZZ_throwaway_038_index_test', v_owner)
  returning id into v_hh;

  insert into public.provision_cycles (household_id, cycle_type, created_by)
  values (v_hh, 'planned', v_owner)
  returning id into v_c1;
  raise notice 'PASS 2/4: first open cycle accepted (%).', v_c1;

  -- ---------- 3. the violation must be REJECTED ----------
  begin
    insert into public.provision_cycles (household_id, cycle_type, created_by)
    values (v_hh, 'planned', v_owner);
  exception when unique_violation then
    v_blocked := true;
  end;

  if not v_blocked then
    -- clean up before shouting, so a failed run leaves no debris
    delete from public.provision_cycles where household_id = v_hh;
    delete from public.households where id = v_hh;
    raise exception 'FAIL: a SECOND open cycle was ACCEPTED. The index is not enforcing.';
  end if;
  raise notice 'PASS 3/4: second open cycle REJECTED with unique_violation.';

  -- ---------- 4. the index must be PARTIAL, not blanket ----------
  -- Closing the first cycle must free the slot. If this insert is also
  -- rejected, the predicate is wrong and we have broken the normal
  -- close-then-open flow -- a far worse outcome than the bug being fixed.
  update public.provision_cycles set closed_at = now() where id = v_c1;

  insert into public.provision_cycles (household_id, cycle_type, created_by)
  values (v_hh, 'planned', v_owner);
  raise notice 'PASS 4/4: after closing, a new open cycle is accepted -- predicate is partial, close-then-open still works.';

  -- ---------- cleanup ----------
  delete from public.provision_cycles where household_id = v_hh;
  delete from public.households where id = v_hh;

  raise notice '================================================';
  raise notice '038 INDEX VERIFIED: 4/4 passed. Throwaway removed.';
  raise notice '================================================';
end $$;

-- =====================================================================
-- AFTER-STATE PROOF -- run in the SAME paste as the block above.
-- The block's PASS notices are invisible in the SQL editor (see
-- migrations/README.md). If the block failed, it raised an exception and you
-- never reached this SELECT. If you see these rows, all four checks passed.
-- Expected: true / true / 0.
-- =====================================================================
select
  (select indisvalid  from pg_index
     where indexrelid = to_regclass('public.uq_open_cycle_per_household'))  as index_valid,
  (select indisunique from pg_index
     where indexrelid = to_regclass('public.uq_open_cycle_per_household'))  as index_unique,
  (select count(*) from households where name like 'ZZ_throwaway%')         as leftover_throwaway;
