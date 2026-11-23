-- 088_rollback.sql — NEVER APPLIED unless 088 must be undone.
-- SPEC_offline_checkoff_amendment_2026-11-23.md, 088 (status_changed_at).
--
-- Drops trg_list_items_status_changed_at, its function and list_items.status_changed_at. Nothing in the
--   database depends on them; the client does: every check write sends status_changed_at and filters on
--   it. Revert the client FIRST (to the build before the offline check-off conflict rule), or every check
--   fails (PostgREST: column not found) — and the stamps are lost for good (the column's values are gone).
--
-- Run as postgres, dev 7642734024280108049 or prod 7606130613603586966.
-- Then remove the dev ledger row by hand: delete from supabase_migrations.schema_migrations
-- where name = '088_status_changed_at';

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '088_rollback: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '088_rollback: run as postgres — current_user is %', current_user;
  end if;
end
$preflight$;

drop trigger if exists trg_list_items_status_changed_at on public.list_items;
drop function if exists public.list_items_stamp_status_changed_at();
alter table public.list_items drop column if exists status_changed_at;

notify pgrst, 'reload schema';

do $verify$
declare
  v_order text;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'list_items' and column_name = 'status_changed_at')
     or exists (select 1 from pg_proc where proname = 'list_items_stamp_status_changed_at' and pronamespace = 'public'::regnamespace)
     or exists (select 1 from pg_trigger where tgname = 'trg_list_items_status_changed_at') then
    raise exception '088_rollback: an 088 object survived';
  end if;
  select string_agg(tgname, ' → ' order by tgname) into v_order
    from pg_trigger where tgrelid = 'public.list_items'::regclass and not tgisinternal and (tgtype & 2) = 2 and (tgtype & 16) = 16;
  if v_order <> 'trg_list_items_picked_by_guard → trg_list_items_resurrect' then
    raise exception '088_rollback: BEFORE UPDATE triggers are %', v_order;
  end if;
  raise warning '088_rollback VERIFY: no 088 objects; BEFORE UPDATE %', v_order;
end
$verify$;

commit;
