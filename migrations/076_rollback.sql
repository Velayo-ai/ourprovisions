-- 076_rollback.sql — NEVER APPLIED unless 076 must be undone.
-- SPEC_meal_sharing_v2.md S48 (the household's showcase, Dan 2026-10-30).
--
-- Undoes 076_household_showcase.sql in reverse section order, landing on 073 / 072 / 074's shape:
-- add_showcase_photo back (072 §3, verbatim), accept_gift_photo back to the uploaded_by-keyed
-- replace (072, with S47's (webp|jpg) guard — the body 074 left in place), give_meal back to the
-- giver's-own S12 pick (072, 074-era body), set_photo_kind back to 073's author-only body, the
-- per-person index back in place of the per-meal one, and the three columns dropped.
--
-- REFUSES, rather than failing half-way, when the per-person index could not hold: two live
--   showcase-kind rows by one uploader on one (meal, household) — e.g. a household showcase made
--   from a member's cook photo beside a received row that the same member gave. Un-showcase or
--   remove one first, then run this.
--
-- DATA: the marks (showcased_by / showcased_at / received_at) are LOST with the columns. The §2
--   backfill's flipped row (a9cf8e23 on dev) stays a cook photo — a rollback does not re-showcase
--   it; the kept one (bc5f9b4f) stays the showcase. Received rows become ordinary showcase rows
--   again under 072's rules (uploaded_by = the giver is the S23 guard once more).
--
-- Run as postgres, dev 7642734024280108049 or prod 7606130613603586966.
-- Then remove the dev ledger row by hand: delete from supabase_migrations.schema_migrations
-- where name = '076_household_showcase';

begin;

do $preflight$
declare v_dups integer; v_received integer;
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '076_rollback: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '076_rollback: run as postgres — current_user is %', current_user;
  end if;
  select count(*) into v_dups from (
    select 1 from public.meal_photos where kind = 'showcase' and deleted_at is null
     group by meal_id, household_id, uploaded_by having count(*) > 1) x;
  if v_dups > 0 then
    raise exception '076_rollback: % (meal, household, uploader) group(s) carry more than one live showcase — the per-person index cannot be restored over them; un-showcase or remove first', v_dups;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'meal_photos' and column_name = 'received_at') then
    select count(*) into v_received from public.meal_photos where received_at is not null;
    raise notice '076_rollback: % received mark(s) will be lost with the column', v_received;
  end if;
  if to_regprocedure('public.set_photo_kind(uuid, text)') is null or to_regprocedure('public.give_meal(uuid, text)') is null
     or to_regprocedure('public.accept_gift_photo(uuid, uuid, text, text, integer, integer)') is null then
    raise exception '076_rollback: a function this rollback re-states is missing — inspect before rolling back';
  end if;
end
$preflight$;

-- §7  add_showcase_photo — 072 §3's body, verbatim; ACL re-stated (a dropped function has none).
create or replace function public.add_showcase_photo(p_meal_id uuid, p_thumb_path text, p_view_path text, p_width integer, p_height integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hh     uuid;
  v_caller uuid;
  v_prefix text;
  v_stem   text;
  v_id     uuid;
begin
  select m.household_id into v_hh
    from public.meals m
   where m.id = p_meal_id and m.deleted_at is null and m.kind = 'meal';
  if v_hh is null or not public.is_member_of(v_hh) then
    raise exception 'add_showcase_photo: not a member of the meal''s household' using errcode = '42501';
  end if;

  v_caller := public.get_current_user_id();
  if v_caller is null then
    raise exception 'add_showcase_photo: no user for the JWT subject' using errcode = '42501';
  end if;

  v_prefix := v_hh::text || '/' || p_meal_id::text || '/';
  v_stem := substring(p_thumb_path from '^' || v_prefix || '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-thumb\.(webp|jpg)$');
  if v_stem is null
     or p_view_path !~ ('^' || v_prefix || v_stem || '-view\.(webp|jpg)$') then
    raise exception 'add_showcase_photo: paths must be %<uuid>-thumb / -view under the meal''s folder', v_prefix
      using errcode = '22023';
  end if;

  if (select count(*) from storage.objects o
       where o.bucket_id = 'meal-photos' and o.name in (p_thumb_path, p_view_path)) <> 2 then
    raise exception 'add_showcase_photo: both objects must be uploaded before the row' using errcode = '22023';
  end if;

  perform 1 from public.meals where id = p_meal_id for update;

  -- S26: one live showcase photo per person per meal — a second upload replaces it.
  update public.meal_photos set deleted_at = now()
   where meal_id = p_meal_id and household_id = v_hh and uploaded_by = v_caller
     and kind = 'showcase' and deleted_at is null;

  insert into public.meal_photos (household_id, meal_id, meal_cook_id, kind, thumb_path, view_path, uploaded_by, width, height)
  values (v_hh, p_meal_id, null, 'showcase', p_thumb_path, p_view_path, v_caller,
          case when p_width > 0 then p_width end, case when p_height > 0 then p_height end)
  returning id into v_id;

  return v_id;
end
$function$;
revoke all on function public.add_showcase_photo(uuid, text, text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.add_showcase_photo(uuid, text, text, integer, integer) to authenticated;

-- §6  accept_gift_photo — 072's body (S47's (webp|jpg) guard included), verbatim. ACL kept.
create or replace function public.accept_gift_photo(p_gift_id uuid, p_household_id uuid, p_thumb_path text, p_view_path text, p_width integer, p_height integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_meal   uuid;
  v_giver  uuid;
  v_rev    timestamptz;
  v_prefix text;
  v_stem   text;
  v_id     uuid;
begin
  -- Membership in the receiving place FIRST (S40: the household is named, then checked).
  if not public.is_member_of(p_household_id) then
    raise exception 'accept_gift_photo: not a member of the target household' using errcode = '42501';
  end if;
  if public.get_current_user_id() is null then
    raise exception 'accept_gift_photo: no user for the JWT subject' using errcode = '42501';
  end if;

  -- The receipt for (gift, household) names the copy's meal (V25: none → 42501, nothing inserted).
  select r.meal_id, g.given_by, g.revoked_at into v_meal, v_giver, v_rev
    from public.meal_gift_receipts r
    join public.meal_gifts g on g.id = r.gift_id
   where r.gift_id = p_gift_id and r.to_household_id = p_household_id;
  if v_meal is null then
    raise exception 'accept_gift_photo: no receipt for this gift in the target household' using errcode = '42501';
  end if;

  -- S40: refuse the photo, never the meal.
  if v_rev is not null then
    raise exception 'accept_gift_photo: gift revoked' using errcode = '55000';
  end if;
  if v_giver is null or not exists (select 1 from public.users u where u.id = v_giver and u.deleted_at is null) then
    raise exception 'accept_gift_photo: the giver''s account is gone' using errcode = '55000';
  end if;

  -- The copy must still be a live meal of the receiving place.
  if not exists (select 1 from public.meals m
                  where m.id = v_meal and m.household_id = p_household_id
                    and m.deleted_at is null and m.kind = 'meal') then
    raise exception 'accept_gift_photo: the copy is not a live meal of the target household' using errcode = '42501';
  end if;

  -- Both paths under {p_household_id}/{meal_id}/ (V18: never a path into the giver's folder).
  v_prefix := p_household_id::text || '/' || v_meal::text || '/';
  v_stem := substring(p_thumb_path from '^' || v_prefix || '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-thumb\.(webp|jpg)$');
  if v_stem is null
     or p_view_path !~ ('^' || v_prefix || v_stem || '-view\.(webp|jpg)$') then
    raise exception 'accept_gift_photo: paths must be %<uuid>-thumb / -view under the copy''s folder', v_prefix
      using errcode = '22023';
  end if;
  if (select count(*) from storage.objects o
       where o.bucket_id = 'meal-photos' and o.name in (p_thumb_path, p_view_path)) <> 2 then
    raise exception 'accept_gift_photo: both objects must be uploaded before the row' using errcode = '22023';
  end if;

  perform 1 from public.meals where id = v_meal for update;

  -- S40: a second accept replaces — the giver is the "person" of the one-per-person index.
  update public.meal_photos set deleted_at = now()
   where meal_id = v_meal and household_id = p_household_id and uploaded_by = v_giver
     and kind = 'showcase' and deleted_at is null;

  insert into public.meal_photos (household_id, meal_id, meal_cook_id, kind, thumb_path, view_path, uploaded_by, width, height)
  values (p_household_id, v_meal, null, 'showcase', p_thumb_path, p_view_path, v_giver,
          case when p_width > 0 then p_width end, case when p_height > 0 then p_height end)
  returning id into v_id;

  return v_id;
end
$function$;
comment on function public.accept_gift_photo(uuid, uuid, text, text, integer, integer) is
  '072 — records the received gift photo as a showcase row on the receiver''s copy; uploaded_by = the giver (derived, S23 / S36 / S40). A second accept replaces the giver''s prior row. EXECUTE to authenticated only.';

-- §5  give_meal — 072's body (074-era; the S12 pick = the giver's own showcase), verbatim. ACL kept.
create or replace function public.give_meal(p_meal_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hh      uuid;
  v_kind    text;
  v_caller  uuid;
  v_note    text;
  v_first   text;
  v_snap    jsonb;
  v_view    text;
  v_thumb   text;
  v_code    text;
  v_id      uuid;
begin
  select m.household_id, m.kind into v_hh, v_kind
    from public.meals m
   where m.id = p_meal_id and m.deleted_at is null;
  if v_hh is null or not public.is_member_of(v_hh) then
    raise exception 'give_meal: not a member of the meal''s household' using errcode = '42501';
  end if;
  if v_kind <> 'meal' then
    raise exception 'give_meal: only meals can be given (kind = %)', v_kind using errcode = '22023';
  end if;

  v_caller := public.get_current_user_id();
  if v_caller is null then
    raise exception 'give_meal: no user for the JWT subject' using errcode = '42501';
  end if;

  v_note := nullif(btrim(p_note), '');
  if char_length(v_note) > 280 then
    raise exception 'give_meal: note is longer than 280 characters' using errcode = '22023';
  end if;

  -- The giver's first name travels inside the snapshot (10-07 shape; Phase B privacy line).
  select nullif(split_part(btrim(u.full_name), ' ', 1), '') into v_first
    from public.users u where u.id = v_caller;

  -- V3: the recipe as it is right now. Ingredients carry names, never catalog ids — the
  -- receiver's form matches them against ITS OWN catalog. Soft-deleted rows are left out.
  select jsonb_build_object(
           'name',             m.name,
           'base_servings',    m.base_servings,
           'instructions',     m.instructions,
           'occasion',         to_jsonb(m.occasion),
           'attribution',      m.attribution,
           'ingredients',      coalesce((
                                 select jsonb_agg(jsonb_build_object(
                                          'name',                 c.name,
                                          'category',             c.category,
                                          'quantity_per_serving', mi.quantity_per_serving)
                                        order by c.name)
                                   from public.meal_ingredients mi
                                   join public.catalog_items c on c.id = mi.catalog_item_id
                                  where mi.meal_id = m.id and mi.deleted_at is null and c.deleted_at is null), '[]'::jsonb),
           'giver_first_name', v_first)
    into v_snap
    from public.meals m where m.id = p_meal_id;

  -- S12 (public branch, S19): the giver's OWN latest live showcase photo of this meal, or none.
  -- Never a cook photo. Never another member's showcase photo (S11).
  select p.view_path, p.thumb_path into v_view, v_thumb
    from public.meal_photos p
   where p.meal_id = p_meal_id and p.household_id = v_hh
     and p.kind = 'showcase' and p.uploaded_by = v_caller and p.deleted_at is null
   order by p.uploaded_at desc, p.id desc
   limit 1;

  v_code := public.mint_gift_code();

  insert into public.meal_gifts (code, from_household_id, given_by, source_meal_id, snapshot, note)
  values (v_code, v_hh, v_caller, p_meal_id, v_snap, v_note)
  returning id into v_id;

  return jsonb_build_object('code', v_code, 'gift_id', v_id,
                            'photo_path', v_view, 'photo_thumb_path', v_thumb);
end
$function$;
comment on function public.give_meal(uuid, text) is
  '072 — mints a gift of the caller''s household''s meal (S43 code; V3 snapshot built here, names not ids); returns photo_path / photo_thumb_path of the GIVER''s own live showcase (S12 / S11) or null. EXECUTE to authenticated only.';

-- §4  set_photo_kind — 073's body (author-only, S46), verbatim. ACL kept.
create or replace function public.set_photo_kind(p_photo_id uuid, p_kind text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller uuid;
  v_row    public.meal_photos%rowtype;
  v_cooks  integer;
begin
  -- 1. The caller from the JWT, never from an argument.
  v_caller := public.get_current_user_id();
  if v_caller is null then
    raise exception 'set_photo_kind: no user for the JWT subject' using errcode = '42501';
  end if;

  -- 2. A live row. A soft-deleted or unknown id reads the same.
  select * into v_row from public.meal_photos p where p.id = p_photo_id and p.deleted_at is null;
  if v_row.id is null then
    raise exception 'set_photo_kind: not_found' using errcode = 'P0002';
  end if;

  -- 3. Only the author (S46): nobody can flip another member's photo.
  if v_row.uploaded_by <> v_caller then
    raise exception 'set_photo_kind: only the photo''s author can change its kind' using errcode = '42501';
  end if;

  -- 4. And the author must still be a member of the photo's household.
  if not public.is_member_of(v_row.household_id) then
    raise exception 'set_photo_kind: not a member of the photo''s household' using errcode = '42501';
  end if;

  -- 5. The two kinds, and nothing else (the CHECK would say so too, less kindly).
  if p_kind is null or p_kind not in ('cook', 'showcase') then
    raise exception 'set_photo_kind: kind must be cook or showcase (got %)', coalesce(p_kind, 'null') using errcode = '22023';
  end if;

  -- 6. Already that kind: nothing to do, nothing to say.
  if v_row.kind = p_kind then
    return;
  end if;

  -- Serialize with add_meal_photo's cap and with another flip of the same meal: the meal's row
  -- lock, taken only after membership is proven (a foreign meal is never locked).
  perform 1 from public.meals where id = v_row.meal_id for update;

  if p_kind = 'showcase' then
    -- S26 / S31: one live showcase per person per meal. Retire the caller's other one first, so
    -- the partial unique index holds; the retired row is soft-deleted, never removed.
    update public.meal_photos set deleted_at = now()
     where meal_id = v_row.meal_id and household_id = v_row.household_id
       and uploaded_by = v_caller and kind = 'showcase' and deleted_at is null
       and id <> p_photo_id;
  else
    -- S26's cap: 3 live cook photos per (meal, household). A flip never ages a photo out — it
    -- refuses instead, and the client says "meal photos are full".
    select count(*) into v_cooks from public.meal_photos
     where meal_id = v_row.meal_id and household_id = v_row.household_id
       and kind = 'cook' and deleted_at is null;
    if v_cooks >= 3 then
      raise exception 'set_photo_kind: meal photos are full' using errcode = '22023';
    end if;
  end if;

  -- meal_cook_id, paths, size, uploaded_by, uploaded_at: untouched (Dan, 2026-10-30).
  update public.meal_photos set kind = p_kind where id = p_photo_id;
end
$function$;
comment on function public.set_photo_kind(uuid, text) is
  '073 — S46: the photo''s AUTHOR flips a live photo between cook and showcase. To showcase: the caller''s other live showcase of the meal retires (one per person, S26). To cook: the 3-cook cap refuses (22023). JWT user / author / member (42501), live row (P0002), kind in cook|showcase (22023). EXECUTE to authenticated only.';

-- §3  the index — 072's per-person shape back.
drop index if exists public.meal_photos_one_live_showcase_per_meal;
create unique index if not exists meal_photos_one_live_showcase_per_person
  on public.meal_photos (meal_id, household_id, uploaded_by)
  where kind = 'showcase' and deleted_at is null;

-- §1  the three columns.
alter table public.meal_photos drop column if exists showcased_by;
alter table public.meal_photos drop column if exists showcased_at;
alter table public.meal_photos drop column if exists received_at;

do $verify$
declare v_got text;
begin
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'meal_photos'
        and column_name in ('showcased_by', 'showcased_at', 'received_at')) <> 0 then
    raise exception '076_rollback: a 076 column still exists';
  end if;
  if exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'meal_photos' and indexname = 'meal_photos_one_live_showcase_per_meal')
     or not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'meal_photos' and indexname = 'meal_photos_one_live_showcase_per_person') then
    raise exception '076_rollback: the index swap did not reverse';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.set_photo_kind(uuid, text)'::regprocedure and prosrc ilike '%uploaded_by <> v_caller%') then
    raise exception '076_rollback: set_photo_kind is not back to 073''s author check';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.give_meal(uuid, text)'::regprocedure and prosrc ilike '%p.uploaded_by = v_caller%') then
    raise exception '076_rollback: give_meal is not back to the giver''s own pick';
  end if;
  if exists (select 1 from pg_proc where oid = 'public.accept_gift_photo(uuid, uuid, text, text, integer, integer)'::regprocedure and prosrc ilike '%received_at%') then
    raise exception '076_rollback: accept_gift_photo still writes received_at';
  end if;
  select coalesce(string_agg(a.grantee::regrole::text || '=' || a.privilege_type, ',' order by a.grantee::regrole::text), '') into v_got
    from pg_proc p, aclexplode(p.proacl) a
   where p.oid = 'public.add_showcase_photo(uuid, text, text, integer, integer)'::regprocedure and a.grantee <> p.proowner;
  if v_got <> 'authenticated=EXECUTE' then
    raise exception '076_rollback: add_showcase_photo ACL want [authenticated=EXECUTE] got [%]', v_got;
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;

-- VERIFY — one row, after commit. Expect: which_db as above · cols 0 · index_per_person true · index_per_meal false ·
--   add_showcase_photo 1 · set_photo_kind_author_check true · give_meal_own_pick true · live_showcases (unchanged).
select
  (select system_identifier from pg_control_system())::text                                       as which_db,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'meal_photos'
    and column_name in ('showcased_by', 'showcased_at', 'received_at'))                            as cols,
  (select count(*) = 1 from pg_indexes where schemaname = 'public' and tablename = 'meal_photos' and indexname = 'meal_photos_one_live_showcase_per_person') as index_per_person,
  (select count(*) = 1 from pg_indexes where schemaname = 'public' and tablename = 'meal_photos' and indexname = 'meal_photos_one_live_showcase_per_meal')   as index_per_meal,
  (select count(*) from pg_proc where oid = to_regprocedure('public.add_showcase_photo(uuid, text, text, integer, integer)')) as add_showcase_photo,
  (select prosrc ilike '%uploaded_by <> v_caller%' from pg_proc where oid = to_regprocedure('public.set_photo_kind(uuid, text)')) as set_photo_kind_author_check,
  (select prosrc ilike '%p.uploaded_by = v_caller%' from pg_proc where oid = to_regprocedure('public.give_meal(uuid, text)'))    as give_meal_own_pick,
  (select count(*) from public.meal_photos where kind = 'showcase' and deleted_at is null)        as live_showcases;
