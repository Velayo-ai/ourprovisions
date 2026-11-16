-- 085_rollback.sql — NEVER APPLIED unless 085 must be undone.
-- SPEC_qty_increment.md, 085 (Ask launch blocker 4).
--
-- Drops adjust_list_item_quantity. Nothing in the database depends on it; the client does — every
--   manual + / − / Add and a meal's removal call it after the §6 client change. Revert the client
--   FIRST (back to the updateQty build), or every quantity change fails with PGRST202.
--
-- Run as postgres, dev 7642734024280108049 or prod 7606130613603586966.
-- Then remove the dev ledger row by hand: delete from supabase_migrations.schema_migrations
-- where name = '085_adjust_list_item_quantity';

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '085_rollback: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '085_rollback: run as postgres — current_user is %', current_user;
  end if;
end
$preflight$;

drop function if exists public.adjust_list_item_quantity(uuid, uuid, integer, numeric);

notify pgrst, 'reload schema';

do $verify$
begin
  if exists (select 1 from pg_proc where proname = 'adjust_list_item_quantity'
              and pronamespace = 'public'::regnamespace) then
    raise exception '085_rollback: an adjust_list_item_quantity survived';
  end if;
  raise warning '085_rollback VERIFY: no adjust_list_item_quantity';
end
$verify$;

commit;
