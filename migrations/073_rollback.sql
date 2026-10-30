-- 073_rollback.sql — NEVER APPLIED unless 073 must be undone.
-- SPEC_meal_sharing_v2.md S46 (the flip model, 2026-10-30).
--
-- Undoes 073_set_photo_kind.sql: drops the one function. Nothing else — 073 created no table,
-- column, index, bucket or policy, and touched no other ACL.
--
-- DATA: rows whose kind was flipped through set_photo_kind KEEP their kind. 072's model (kind,
--   the showcase index, add_showcase_photo) still stands after this rollback, so a showcase row
--   is still a valid, meaningful row; turning flipped rows back would be a decision about
--   people's photos, not a rollback. The count is reported, never changed. A row the function
--   soft-deleted (the author's previous showcase, step "to showcase") stays soft-deleted.
--
-- Run as postgres, dev 7642734024280108049 or prod 7606130613603586966.
-- Then remove the dev ledger row by hand: delete from supabase_migrations.schema_migrations
-- where name = '073_set_photo_kind';

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '073_rollback: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '073_rollback: run as postgres — current_user is %', current_user;
  end if;
  if to_regprocedure('public.set_photo_kind(uuid, text)') is null then
    raise notice '073_rollback: set_photo_kind is already absent — nothing to drop';
  end if;
  raise notice '073_rollback: % live showcase row(s) stay as they are',
    (select count(*) from public.meal_photos where kind = 'showcase' and deleted_at is null);
end
$preflight$;

drop function if exists public.set_photo_kind(uuid, text);

do $verify$
begin
  if to_regprocedure('public.set_photo_kind(uuid, text)') is not null then
    raise exception '073_rollback: set_photo_kind still exists';
  end if;
  -- 072's objects are untouched by this rollback.
  if to_regprocedure('public.add_showcase_photo(uuid, text, text, integer, integer)') is null
     or not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'meal_photos_one_live_showcase_per_person') then
    raise exception '073_rollback: a 072 object is missing — this rollback must not have touched it';
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;

-- VERIFY — one row, after commit. Expect: which_db as above · set_photo_kind 0 · showcase_index 1 ·
--   add_showcase_photo 1 · showcase_rows unchanged from the preflight notice.
select
  (select system_identifier from pg_control_system())::text                                       as which_db,
  (select count(*) from pg_proc where oid = to_regprocedure('public.set_photo_kind(uuid, text)'))  as set_photo_kind,
  (select count(*) from pg_indexes where schemaname = 'public'
    and indexname = 'meal_photos_one_live_showcase_per_person')                                   as showcase_index,
  (select count(*) from pg_proc
    where oid = to_regprocedure('public.add_showcase_photo(uuid, text, text, integer, integer)')) as add_showcase_photo,
  (select count(*) from public.meal_photos where kind = 'showcase' and deleted_at is null)        as showcase_rows;
