-- 074_rollback.sql — NEVER APPLIED unless 074 must be undone.
-- SPEC_meal_sharing_v2.md S47 (gift photos keep their own format, Dan 2026-10-30).
--
-- Undoes 074_gift_photo_ext.sql in reverse section order, landing exactly on 072 §6 / §7 / §9's
-- shape: gift_photo_readable without the photo_ext requirement, both preview RPCs with 072's
-- storage-probe has_photo (preview_meal_gift_public dropped and re-created with its five columns,
-- ACL re-stated), the INSERT guard back to `(view|thumb)\.webp`, the bucket back to
-- {image/webp}, attach_gift_photo dropped, and meal_gifts.photo_ext (with its CHECK) dropped.
-- Nothing else — 074 touched no table grant, no other function, no index.
--
-- REFUSES, rather than failing half-way or stranding data, when ANY .jpg object exists in
--   gift-photos (Dan's rule): the webp-only bucket and the webp-only guard could not be restored
--   over them, and the gifts they belong to would keep previewing a photo nobody can read. Remove
--   those objects through the Storage API first (SQL never deletes an object — 070's D6), then
--   run this.
--
-- DATA: gifts marked photo_ext = 'webp' LOSE the mark when the column goes, but nothing is
--   lost: 072's has_photo is a storage probe for {gift}/view.webp, which still exists, so their
--   photo keeps showing. The count is reported in the preflight notice. A gift marked 'jpg'
--   cannot exist when this runs (its objects would have stopped the preflight).
--
-- Run as postgres, dev 7642734024280108049 or prod 7606130613603586966.
-- Then remove the dev ledger row by hand: delete from supabase_migrations.schema_migrations
-- where name = '074_gift_photo_ext';

begin;

do $preflight$
declare v_jpg bigint; v_marked bigint;
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '074_rollback: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '074_rollback: run as postgres — current_user is %', current_user;
  end if;
  select count(*) into v_jpg from storage.objects where bucket_id = 'gift-photos' and name like '%.jpg';
  if v_jpg > 0 then
    raise exception '074_rollback: % .jpg object(s) in gift-photos — remove them through the Storage API first; the webp-only bucket cannot be restored over them', v_jpg;
  end if;
  if to_regprocedure('public.attach_gift_photo(uuid, text)') is null then
    raise notice '074_rollback: attach_gift_photo is already absent — nothing to drop';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'meal_gifts' and column_name = 'photo_ext') then
    select count(*) into v_marked from public.meal_gifts where photo_ext is not null;
    raise notice '074_rollback: % gift(s) carry a photo_ext mark; the column goes, their view.webp stays readable through 072''s probe', v_marked;
    if exists (select 1 from public.meal_gifts where photo_ext = 'jpg') then
      raise exception '074_rollback: a gift is marked jpg although no .jpg object exists — inspect before rolling back';
    end if;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'gift photos writable by the giving household') then
    raise exception '074_rollback: 072 §9''s INSERT policy is missing — this rollback re-creates it by name and expects it';
  end if;
end
$preflight$;

-- §5  gift_photo_readable — 072 §7's body, verbatim. ACL kept by create or replace.
create or replace function public.gift_photo_readable(p_gift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (select 1 from public.meal_gifts g where g.id = p_gift_id and g.revoked_at is null)
$function$;
comment on function public.gift_photo_readable(uuid) is
  '072 — asked by the gift-photos SELECT policy (S35): true only for a gift that exists and is not revoked. Reads nothing else. EXECUTE to anon + authenticated (the policy runs as the caller).';

-- §4  the two preview RPCs — 072 §6 / §5's bodies, verbatim. The public one changes its return
--     type back, so drop + create + re-state the ACL; the jsonb one is create or replace.
drop function if exists public.preview_meal_gift_public(text);
create function public.preview_meal_gift_public(p_code text)
returns table (gift_id uuid, title text, attribution text, ingredient_count integer, has_photo boolean)
language sql
stable
security definer
set search_path = ''
as $function$
  select g.id,
         g.snapshot ->> 'name',
         g.snapshot ->> 'attribution',
         coalesce(jsonb_array_length(g.snapshot -> 'ingredients'), 0),
         exists (select 1 from storage.objects o
                  where o.bucket_id = 'gift-photos' and o.name = g.id::text || '/view.webp')
    from public.meal_gifts g
   where g.code = upper(btrim(p_code))
     and g.revoked_at is null
$function$;
comment on function public.preview_meal_gift_public(text) is
  '072 — the signed-out preview card (S43): gift_id, title, attribution, ingredient_count, has_photo — nothing else. Unknown and revoked codes both return no row. EXECUTE to anon + authenticated.';

revoke all on function public.preview_meal_gift_public(text) from public, anon, authenticated, service_role;
grant execute on function public.preview_meal_gift_public(text) to anon, authenticated;

create or replace function public.preview_meal_gift(p_code text, p_household_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_g   public.meal_gifts%rowtype;
  v_meal uuid;
begin
  if not public.is_member_of(p_household_id) then
    raise exception 'preview_meal_gift: not a member of the target household' using errcode = '42501';
  end if;

  select * into v_g from public.meal_gifts g where g.code = upper(btrim(p_code));
  if v_g.id is null then
    raise exception 'preview_meal_gift: not_found' using errcode = 'P0002';
  end if;
  if v_g.revoked_at is not null then
    raise exception 'preview_meal_gift: revoked' using errcode = '55000';
  end if;

  select r.meal_id into v_meal
    from public.meal_gift_receipts r
   where r.gift_id = v_g.id and r.to_household_id = p_household_id;

  return jsonb_build_object(
    'gift_id',       v_g.id,
    'snapshot',      v_g.snapshot,
    'note',          v_g.note,
    'already_added', v_meal,                       -- null, or the copy's meal_id (V11)
    'has_photo',     exists (select 1 from storage.objects o
                              where o.bucket_id = 'gift-photos' and o.name = v_g.id::text || '/view.webp'));
end
$function$;
comment on function public.preview_meal_gift(text, uuid) is
  '072 — the signed-in gift arrival (10-07): snapshot + note + already_added (the receipt''s meal_id for this place, or null) + gift_id and has_photo so the client can sign gift-photos/{gift_id}/view.webp itself (S34, S43). Membership in p_household_id first. not_found = P0002, revoked = 55000. EXECUTE to authenticated only.';

-- §3  attach_gift_photo
drop function if exists public.attach_gift_photo(uuid, text);

-- §2  the INSERT guard and the bucket — 072 §9's shape, verbatim.
drop policy if exists "gift photos writable by the giving household" on storage.objects;
create policy "gift photos writable by the giving household" on storage.objects
  for insert to authenticated
  with check (
    case
      when bucket_id <> 'gift-photos' then false
      when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(view|thumb)\.webp$'
        then public.gift_photo_writable(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

update storage.buckets
   set allowed_mime_types = array['image/webp'],
       file_size_limit    = 1048576,
       public             = false
 where id = 'gift-photos';

-- §1  meal_gifts.photo_ext
alter table public.meal_gifts drop constraint if exists meal_gifts_photo_ext_check;
alter table public.meal_gifts drop column if exists photo_ext;
comment on table public.meal_gifts is
  '072 — a meal given by link (SPEC_meal_sharing_v2 Phase A). code is a 16-char bearer key (S43 ruling 2026-10-28, ~79 bits; scrubbed like token=, S22). snapshot is built server-side by give_meal (V3: the recipe at give time; never a cross-household read). A gift never connects households (S1) and tells the giver nothing (S2). Members of from_household_id read their own gifts; recipients only through preview_meal_gift / preview_meal_gift_public. Writes ONLY through give_meal / revoke_meal_gifts. revoked_at stops previews, receipts, and the gift-photos read policy (S34).';

do $verify$
declare v_acl text; v_cols text;
begin
  if to_regprocedure('public.attach_gift_photo(uuid, text)') is not null then
    raise exception '074_rollback: attach_gift_photo still exists';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'meal_gifts' and column_name = 'photo_ext') then
    raise exception '074_rollback: meal_gifts.photo_ext still exists';
  end if;
  if not exists (select 1 from storage.buckets where id = 'gift-photos' and public = false
                    and file_size_limit = 1048576 and allowed_mime_types = array['image/webp']) then
    raise exception '074_rollback: gift-photos bucket is not back to private / webp / 1 MB';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'gift photos writable by the giving household'
                  and with_check like '%(view|thumb)\\.webp$%') then
    raise exception '074_rollback: the INSERT guard is not back to (view|thumb).webp';
  end if;
  if (select string_agg(cmd || ':' || (select string_agg(r, ',' order by r) from unnest(roles) r), ' ' order by cmd)
         from pg_policies
       where schemaname = 'storage' and tablename = 'objects' and policyname ilike 'gift photos%')
     <> 'INSERT:authenticated SELECT:anon,authenticated' then
    raise exception '074_rollback: gift-photos policies are not exactly SELECT(anon, authenticated) + INSERT(authenticated)';
  end if;
  select proacl::text into v_acl from pg_proc where oid = 'public.preview_meal_gift_public(text)'::regprocedure;
  if v_acl !~ 'anon=X' or v_acl !~ 'authenticated=X' or v_acl ~ 'service_role=X' or v_acl ~ '(^|[{,])=X' then
    raise exception '074_rollback: preview_meal_gift_public ACL wrong — got %', v_acl;
  end if;
  select string_agg(a.attname, ',' order by a.ord) into v_cols
    from pg_proc p, unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, mode, ord)
   where p.oid = 'public.preview_meal_gift_public(text)'::regprocedure and a.mode = 't';
  if v_cols <> 'gift_id,title,attribution,ingredient_count,has_photo' then
    raise exception '074_rollback: preview_meal_gift_public columns are [%]', v_cols;
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.preview_meal_gift(text, uuid)'::regprocedure
                    and prosrc ilike '%storage.objects%' and prosrc not ilike '%photo_ext%') then
    raise exception '074_rollback: preview_meal_gift is not back to 072''s storage probe';
  end if;
  select proacl::text into v_acl from pg_proc where oid = 'public.gift_photo_readable(uuid)'::regprocedure;
  if v_acl !~ 'anon=X' or v_acl !~ 'authenticated=X' or v_acl ~ 'service_role=X' or v_acl ~ '(^|[{,])=X' then
    raise exception '074_rollback: gift_photo_readable ACL changed — got %', v_acl;
  end if;
  if exists (select 1 from pg_proc where oid = 'public.gift_photo_readable(uuid)'::regprocedure and prosrc ilike '%photo_ext%') then
    raise exception '074_rollback: gift_photo_readable still requires photo_ext';
  end if;
  -- 072's other objects are untouched by this rollback.
  if to_regprocedure('public.gift_photo_writable(uuid)') is null
     or to_regprocedure('public.accept_gift_photo(uuid, uuid, text, text, integer, integer)') is null
     or to_regprocedure('public.give_meal(uuid, text)') is null then
    raise exception '074_rollback: a 072 object is missing — this rollback must not have touched it';
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;

-- VERIFY — one row, after commit. Expect: which_db as above · attach_gift_photo 0 · photo_ext_col 0 ·
--   bucket_mimes {image/webp} · insert_guard_webp_only true · public_fields gift_id,title,attribution,ingredient_count,has_photo ·
--   previews_probe_storage true · readable_requires_ext false · anon_fn_exec gift_photo_readable,preview_meal_gift_public ·
--   gift_objects (as before) · jpg_objects 0 · gifts unchanged from the preflight.
select
  (select system_identifier from pg_control_system())::text                                       as which_db,
  (select count(*) from pg_proc where oid = to_regprocedure('public.attach_gift_photo(uuid, text)')) as attach_gift_photo,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_gifts' and column_name = 'photo_ext')     as photo_ext_col,
  (select allowed_mime_types::text from storage.buckets where id = 'gift-photos')                 as bucket_mimes,
  (select count(*) = 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'gift photos writable by the giving household'
    and with_check like '%(view|thumb)\\.webp$%')                                                 as insert_guard_webp_only,
  (select string_agg(a.attname, ',' order by a.ord)
     from pg_proc p, unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, mode, ord)
    where p.oid = to_regprocedure('public.preview_meal_gift_public(text)') and a.mode = 't')       as public_fields,
  (select bool_and(prosrc ilike '%storage.objects%') from pg_proc
    where oid in (to_regprocedure('public.preview_meal_gift_public(text)'),
                  to_regprocedure('public.preview_meal_gift(text, uuid)')))                        as previews_probe_storage,
  (select prosrc ilike '%photo_ext%' from pg_proc
    where oid = to_regprocedure('public.gift_photo_readable(uuid)'))                               as readable_requires_ext,
  (select coalesce(string_agg(distinct p.proname, ',' order by p.proname), '')
     from pg_proc p, aclexplode(p.proacl) a
    where p.proname in ('gift_photo_readable', 'preview_meal_gift_public', 'preview_meal_gift', 'gift_photo_writable')
      and p.pronamespace = 'public'::regnamespace and a.grantee = 'anon'::regrole)                as anon_fn_exec,
  (select count(*) from storage.objects where bucket_id = 'gift-photos')                          as gift_objects,
  (select count(*) from storage.objects where bucket_id = 'gift-photos' and name like '%.jpg')    as jpg_objects,
  (select count(*) from public.meal_gifts)                                                        as gifts;
