-- 073_rollback.sql — NEVER APPLIED unless 073 must be undone.
-- SPEC_meal_sharing_v2.md S46 (the flip model, 2026-10-30).
--
-- Undoes 073_set_photo_kind.sql in reverse: restores 065's kind-blind per-cook index and 072 §2's
-- add_meal_photo body (the P1 per-cook replace kind-blind again, the S39 trim still cook-only),
-- then drops set_photo_kind. Nothing else — 073 created no table, column, bucket or policy, and
-- touched no ACL (add_meal_photo's is kept by create or replace both ways).
--
-- REFUSES, rather than failing half-way or destroying data, when any LIVE showcase row carries a
--   meal_cook_id: 065's index (one live row per cook, kind-blind) cannot be rebuilt over such a row
--   if its cook also has a live cook photo, and the flip model is what made the pair legal. Decide
--   those rows first (flip them back through set_photo_kind, or remove them), then run this.
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
  if exists (select 1 from public.meal_photos where kind = 'showcase' and deleted_at is null and meal_cook_id is not null) then
    raise exception '073_rollback: % live showcase row(s) carry a meal_cook_id — 065''s kind-blind per-cook index cannot be rebuilt over them; decide those rows first',
      (select count(*) from public.meal_photos where kind = 'showcase' and deleted_at is null and meal_cook_id is not null);
  end if;
  raise notice '073_rollback: % live showcase row(s) stay as they are',
    (select count(*) from public.meal_photos where kind = 'showcase' and deleted_at is null);
end
$preflight$;

-- §2  the per-cook index — 065's shape, verbatim (kind-blind).
drop index if exists public.meal_photos_one_live_per_cook;
create unique index meal_photos_one_live_per_cook
  on public.meal_photos (meal_cook_id) where deleted_at is null and meal_cook_id is not null;

-- §2  add_meal_photo — 072 §2's body, verbatim (P1 kind-blind; the S39 trim cook-only). ACL unchanged.
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

  -- R1: keep the 3 newest live COOK photos for (meal, household); age out the rest.
  -- 072 (S39): showcase photos sit outside this cap and are never trimmed here.
  update meal_photos set deleted_at = now()
   where id in (
     select id from meal_photos
      where household_id = v_hh and meal_id = p_meal_id and deleted_at is null
        and kind = 'cook'
      order by uploaded_at desc, id desc
      offset 3
   );

  return v_id;
end;
$function$;

-- §1  set_photo_kind
drop function if exists public.set_photo_kind(uuid, text);

do $verify$
declare v_acl text; v_src text;
begin
  if to_regprocedure('public.set_photo_kind(uuid, text)') is not null then
    raise exception '073_rollback: set_photo_kind still exists';
  end if;
  select proacl::text, prosrc into v_acl, v_src
    from pg_proc where oid = 'public.add_meal_photo(uuid, uuid, text, text, integer, integer)'::regprocedure;
  if v_acl is null or v_acl !~ 'authenticated=X' or v_acl ~ 'anon=X' or v_acl ~ 'service_role=X' or v_acl ~ '(^|[{,])=X' then
    raise exception '073_rollback: add_meal_photo ACL changed — got %', v_acl;
  end if;
  if v_src ~* 'where meal_cook_id = p_meal_cook_id and deleted_at is null\s+and kind = ''cook''' then
    raise exception '073_rollback: add_meal_photo P1 replace is still cook-only';
  end if;
  if (select count(*) from regexp_matches(v_src, 'and kind = ''cook''', 'g')) <> 1 then
    raise exception '073_rollback: add_meal_photo should carry exactly one cook-only predicate (072''s trim)';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'meal_photos_one_live_per_cook'
                    and indexdef ilike '%UNIQUE%' and indexdef not ilike '%kind%') then
    raise exception '073_rollback: meal_photos_one_live_per_cook is not back to 065''s kind-blind shape';
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

-- VERIFY — one row, after commit. Expect: which_db as above · set_photo_kind 0 · p1_kind_blind true ·
--   trim_cook_only true · cook_idx_kind_blind true · add_meal_photo_acl {postgres=X/postgres,authenticated=X/postgres} ·
--   showcase_index 1 · add_showcase_photo 1 · showcase_rows unchanged from the preflight notice.
select
  (select system_identifier from pg_control_system())::text                                       as which_db,
  (select count(*) from pg_proc where oid = to_regprocedure('public.set_photo_kind(uuid, text)'))  as set_photo_kind,
  (select count(*) = 1 from pg_indexes where schemaname = 'public' and indexname = 'meal_photos_one_live_per_cook'
    and indexdef ilike '%UNIQUE%' and indexdef not ilike '%kind%')                                 as cook_idx_kind_blind,
  (select prosrc !~* 'where meal_cook_id = p_meal_cook_id and deleted_at is null\s+and kind = ''cook''' from pg_proc
    where oid = to_regprocedure('public.add_meal_photo(uuid, uuid, text, text, integer, integer)'))  as p1_kind_blind,
  (select prosrc ilike '%deleted_at is null%and kind = ''cook''%order by uploaded_at desc%' from pg_proc
    where oid = to_regprocedure('public.add_meal_photo(uuid, uuid, text, text, integer, integer)'))  as trim_cook_only,
  (select proacl::text from pg_proc
    where oid = to_regprocedure('public.add_meal_photo(uuid, uuid, text, text, integer, integer)'))  as add_meal_photo_acl,
  (select count(*) from pg_indexes where schemaname = 'public'
    and indexname = 'meal_photos_one_live_showcase_per_person')                                   as showcase_index,
  (select count(*) from pg_proc
    where oid = to_regprocedure('public.add_showcase_photo(uuid, text, text, integer, integer)')) as add_showcase_photo,
  (select count(*) from public.meal_photos where kind = 'showcase' and deleted_at is null)        as showcase_rows;
