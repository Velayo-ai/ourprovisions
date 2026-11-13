-- 084_rollback.sql — NEVER APPLIED unless 084 must be undone.
-- SPEC_ask_slice4.md, 084 (S4-8).
--
-- Drops the three item_photo_sweep_* functions. Nothing else depends on them but the
--   meal-photo-sweep function's item pass, which then errors (counted) and deletes nothing.
--   Deploy the function without its item pass FIRST so the scheduled run stays green.
--
-- Run as postgres, dev 7642734024280108049 or prod 7606130613603586966.
-- Then remove the dev ledger row by hand: delete from supabase_migrations.schema_migrations
-- where name = '084_item_photo_sweep_rpcs';

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '084_rollback: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '084_rollback: run as postgres — current_user is %', current_user;
  end if;
end
$preflight$;

drop function if exists public.item_photo_sweep_delete_rows(uuid[]);
drop function if exists public.item_photo_sweep_orphans(integer);
drop function if exists public.item_photo_sweep_expired(integer);

notify pgrst, 'reload schema';

do $verify$
begin
  if to_regprocedure('public.item_photo_sweep_expired(integer)') is not null
     or to_regprocedure('public.item_photo_sweep_orphans(integer)') is not null
     or to_regprocedure('public.item_photo_sweep_delete_rows(uuid[])') is not null then
    raise exception '084_rollback: an 084 function survived';
  end if;
  raise warning '084_rollback VERIFY: no item_photo_sweep_* functions';
end
$verify$;

commit;
