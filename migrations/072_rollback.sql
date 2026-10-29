-- 072_rollback.sql — NEVER APPLIED unless 072 must be undone.
-- SPEC_meal_sharing_v2.md, Addendum 2026-10-28b S38 ("072 ships with a 072_rollback.sql, as 068 did").
--
-- Undoes 072_meal_sharing_phase_a.sql in reverse section order, landing exactly on the
-- pre-072 shape: 065's add_meal_photo body (the kind-blind trim), no kind column, no gift
-- tables, no gift functions, no gift-photos bucket or policies. Grants: 072 only ADDED
-- objects and restated add_meal_photo's existing ACL, so there is nothing to re-grant.
--
-- REFUSES, rather than destroying data, when:
--   * meal_photos has any showcase row (live or soft-deleted) — dropping kind would silently
--     turn them into cook photos and the S10 guarantee would be lost. Decide those rows first.
--   * the gift-photos bucket still holds objects — the Storage API must remove them first
--     (SQL never deletes objects; 070's D6). The bucket row goes only when it is empty.
--   Gift rows (meal_gifts, meal_gift_receipts) ARE dropped: they are Phase A's own data and
--   the receivers' copied meals / photos are independent of them (V2). Count them first.
--
-- Run as postgres (the grantor of record), dev 7642734024280108049 or prod 7606130613603586966.
-- Then remove the dev ledger row by hand: delete from supabase_migrations.schema_migrations
-- where name = '072_meal_sharing_phase_a';

begin;

do $preflight$
declare v_showcase bigint; v_objects bigint;
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '072_rollback: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '072_rollback: run as postgres — current_user is %', current_user;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'meal_photos' and column_name = 'kind') then
    select count(*) into v_showcase from public.meal_photos where kind = 'showcase';
    if v_showcase > 0 then
      raise exception '072_rollback: % showcase row(s) in meal_photos — decide them before dropping kind', v_showcase;
    end if;
  end if;
  select count(*) into v_objects from storage.objects where bucket_id = 'gift-photos';
  if v_objects > 0 then
    raise exception '072_rollback: % object(s) in gift-photos — remove them through the Storage API first', v_objects;
  end if;
  raise notice '072_rollback: dropping % gift(s) and % receipt(s)',
    (select count(*) from public.meal_gifts), (select count(*) from public.meal_gift_receipts);
end
$preflight$;

-- §9  bucket + policies
drop policy if exists "gift photos writable by the giving household" on storage.objects;
drop policy if exists "gift photos readable while the gift is live"  on storage.objects;
delete from storage.buckets where id = 'gift-photos';

-- §8, §7, §6, §5  functions (policies that referenced §7 are already gone)
drop function if exists public.accept_gift_photo(uuid, uuid, text, text, integer, integer);
drop function if exists public.gift_photo_writable(uuid);
drop function if exists public.gift_photo_readable(uuid);
drop function if exists public.preview_meal_gift_public(text);
drop function if exists public.revoke_meal_gifts(uuid);
drop function if exists public.record_meal_gift_receipt(text, uuid, uuid);
drop function if exists public.preview_meal_gift(text, uuid);
drop function if exists public.give_meal(uuid, text);
drop function if exists public.mint_gift_code();

-- §4  tables (receipts first: it references gifts)
drop table if exists public.meal_gift_receipts;
drop table if exists public.meal_gifts;

-- §3  add_showcase_photo
drop function if exists public.add_showcase_photo(uuid, text, text, integer, integer);

-- §2  add_meal_photo — 065's body, verbatim (the kind-blind trim). ACL unchanged by create or replace.
create or replace function public.add_meal_photo(
  p_meal_id      uuid,
  p_meal_cook_id uuid,
  p_thumb_path   text,
  p_view_path    text,
  p_width        integer,
  p_height       integer
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_hh       uuid;
  v_caller   uuid;
  v_prefix   text;
  v_stem     text;
  v_id       uuid;
begin
  -- Membership FIRST (051). The household comes from the meal; an unknown or deleted meal
  -- reads exactly like a foreign one, so the error never confirms a meal exists.
  select m.household_id into v_hh
    from meals m
   where m.id = p_meal_id and m.deleted_at is null and m.kind = 'meal';
  if v_hh is null or not is_member_of(v_hh) then
    raise exception 'add_meal_photo: not a member of the meal''s household' using errcode = '42501';
  end if;

  -- The caller from the JWT, never from an argument (cook_meal's pattern).
  v_caller := get_current_user_id();
  if v_caller is null then
    raise exception 'add_meal_photo: no user for the JWT subject' using errcode = '42501';
  end if;

  -- Both paths under {household}/{meal}/, one shared uuid stem, an allowed extension.
  v_prefix := v_hh::text || '/' || p_meal_id::text || '/';
  v_stem := substring(p_thumb_path from '^' || v_prefix || '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-thumb\.(webp|jpg)$');
  if v_stem is null
     or p_view_path !~ ('^' || v_prefix || v_stem || '-view\.(webp|jpg)$') then
    raise exception 'add_meal_photo: paths must be %<uuid>-thumb / -view under the meal''s folder', v_prefix
      using errcode = '22023';
  end if;

  -- Upload order (R7): both objects first, then this call.
  if (select count(*) from storage.objects o
       where o.bucket_id = 'meal-photos' and o.name in (p_thumb_path, p_view_path)) <> 2 then
    raise exception 'add_meal_photo: both objects must be uploaded before the row' using errcode = '22023';
  end if;

  -- A cook, when given (slice 2), must be this meal's, in this household.
  if p_meal_cook_id is not null and not exists (
    select 1 from meal_cooks c
     where c.id = p_meal_cook_id and c.meal_id = p_meal_id and c.household_id = v_hh
  ) then
    raise exception 'add_meal_photo: cook % is not a cook of this meal', p_meal_cook_id using errcode = '22023';
  end if;

  -- Serialize adds per meal so the cap counts a settled set: a row lock on the meal,
  -- taken only after membership is proven (a foreign meal is never locked).
  perform 1 from meals where id = p_meal_id for update;

  -- P1 (slice 2 only): one live photo per cook — a second upload replaces it.
  if p_meal_cook_id is not null then
    update meal_photos set deleted_at = now()
     where meal_cook_id = p_meal_cook_id and deleted_at is null;
  end if;

  insert into meal_photos (household_id, meal_id, meal_cook_id, thumb_path, view_path, uploaded_by, width, height)
  values (v_hh, p_meal_id, p_meal_cook_id, p_thumb_path, p_view_path, v_caller,
          case when p_width > 0 then p_width end, case when p_height > 0 then p_height end)
  returning id into v_id;

  -- R1: keep the 3 newest live photos for (meal, household); age out the rest.
  update meal_photos set deleted_at = now()
   where id in (
     select id from meal_photos
      where household_id = v_hh and meal_id = p_meal_id and deleted_at is null
      order by uploaded_at desc, id desc
      offset 3
   );

  return v_id;
end;
$function$;

-- §1  kind + index + CHECK
drop index if exists public.meal_photos_one_live_showcase_per_person;
alter table public.meal_photos drop constraint if exists meal_photos_kind_values;
alter table public.meal_photos drop column if exists kind;

notify pgrst, 'reload schema';

commit;

-- VERIFY — one row. Expect: which_db as applied · gift_objects 0 (tables, functions, bucket,
--   policies, column, index all gone) · trim_kind_blind true · add_meal_photo_acl
--   {postgres=X/postgres,authenticated=X/postgres} · meal_photos_rows unchanged from before.
select
  (select system_identifier from pg_control_system())::text                                       as which_db,
  (select count(*) from pg_class where relnamespace = 'public'::regnamespace
     and relname in ('meal_gifts', 'meal_gift_receipts', 'meal_photos_one_live_showcase_per_person'))
  + (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('mint_gift_code', 'give_meal', 'preview_meal_gift', 'record_meal_gift_receipt',
                     'revoke_meal_gifts', 'preview_meal_gift_public', 'gift_photo_readable',
                     'gift_photo_writable', 'add_showcase_photo', 'accept_gift_photo'))
  + (select count(*) from storage.buckets where id = 'gift-photos')
  + (select count(*) from pg_policies where schemaname = 'storage' and policyname ilike 'gift photos%')
  + (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'meal_photos' and column_name = 'kind')      as gift_objects,
  (select prosrc not ilike '%kind = ''cook''%' from pg_proc
    where oid = 'public.add_meal_photo(uuid, uuid, text, text, integer, integer)'::regprocedure)  as trim_kind_blind,
  (select proacl::text from pg_proc
    where oid = 'public.add_meal_photo(uuid, uuid, text, text, integer, integer)'::regprocedure)  as add_meal_photo_acl,
  (select count(*) from public.meal_photos)                                                       as meal_photos_rows;
