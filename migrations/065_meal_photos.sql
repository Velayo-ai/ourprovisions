-- 065_meal_photos.sql
-- SPEC_meal_photos_v1.md — slice 1 (the 2026-10-13 amendment A1–A3 + the 2026-10-20
-- Step 0 rulings R1, R3, R7, R8; R2/R3 confirmed by Dan 2026-10-20 19:39).
--
-- WHY
--   A meal card with the household's own photo of its own dinner. Slice 1 is the recipe
--   view's "Add a meal photo": a photo belongs to the MEAL (meal_cook_id NULL, R3 — P2's
--   guess at which night is withdrawn); slice 2 attaches a photo taken at Cooked it to
--   that cook (D1). The newest live photo is the card (D2); removing it falls back to the
--   next (D4).
--
-- WHAT
--   1. Storage bucket `meal-photos` (R7): PRIVATE, 1 MB per object, image/webp + image/jpeg
--      only. Paths `{household_id}/{meal_id}/{uuid}-thumb.{webp|jpg}` and `-view.{…}` —
--      no user id, a new uuid per upload (upsert false). Served by signed URLs only.
--   2. storage.objects policies for the bucket: SELECT and INSERT ONLY, to authenticated,
--      through is_member_of(first path segment). The ::uuid cast is guarded by a CASE on a
--      uuid regex, so a malformed path is FALSE, never an error (AND has no guaranteed
--      evaluation order). NO UPDATE / DELETE policy: removal is a row soft-delete; objects
--      leave by a later service-role sweep (which also collects orphans — objects with no
--      live row, e.g. an upload whose RPC failed).
--      TRAP (Step 0): storage.objects.owner (uuid) and auth.uid() never match a Clerk
--      string sub — no policy here uses either.
--   3. public.meal_photos (R8): RLS on, SELECT for members, NO direct writes. Both
--      renditions (A3) — no storage_path, no origin / from_label (A4 adds them with giving).
--      uploaded_by = users.id from get_current_user_id() (cook_meal's pattern), never the
--      Clerk string.
--   4. add_meal_photo(p_meal_id, p_meal_cook_id, p_thumb_path, p_view_path, p_width,
--      p_height) → uuid, and remove_meal_photo(p_photo_id) → boolean. SECURITY DEFINER,
--      search_path pinned, membership FIRST (42501), EXECUTE to authenticated only.
--      add: the meal must be a live kind='meal' row of a household the caller belongs to;
--      both paths must sit under {household}/{meal}/ with one shared uuid stem and an
--      allowed extension, and both objects must already exist in the bucket (upload order:
--      both objects first, then this call — a row never points at nothing). A cook, when
--      given, must be this meal's in this household; P1 (one live photo per cook) replaces
--      only then. R1: after the insert, live photos beyond the 3 newest for (meal,
--      household) are soft-deleted. A FOR UPDATE row lock on the meal (after membership) serializes concurrent adds.
--      remove: soft-delete (deleted_at) — undoable by an admin until the sweep.
--
-- FKs (record in ARCHITECTURE): household_id, meal_id, meal_cook_id CASCADE — a photo has
--   no meaning without them (v1 §Data); nothing references meal_photos. uploaded_by → users
--   NO ACTION (not null; users are soft-deleted by convention).
--
-- GRANTS (CLAUDE.md new-table rule, the 046 lesson): revoke from public, anon AND
--   authenticated before granting SELECT to authenticated; VERIFY reads the granted set
--   back exactly. VERIFY probes are case-insensitive (ilike — the 060 lesson).
--
-- APPLY: dev only (system_identifier 7642734024280108049). Prod is HELD (Splunk replay-asset
--   answers first). Idempotent.
--   APPLIED ON DEV 2026-10-21 by Dan in the SQL editor — the MCP's apply_migration returned
--   {"status":"declined"} twice (no reason given). VERIFY read back exact over the dev MCP.
--   Ledger row: written by hand (a plain INSERT over the MCP was declined the same way; Dan
--   runs it). Probes run over the MCP in DO blocks that end in RAISE (nothing persists):
--   non-member 42501 on both RPCs and on object INSERT, sees 0 rows / 0 objects; a
--   malformed first segment is invisible on SELECT and refused 42501 on INSERT (never
--   22P02); anon 42501 on SELECT and both RPCs, 0 objects; bad path / stem mismatch /
--   missing object 22023; direct INSERT 42501; 4 adds → 3 live, the oldest soft-deleted;
--   two adds to one cook → the first replaced, no unique violation; the newest is the card.

begin;

-- ── 1. bucket ───────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. storage.objects policies (SELECT + INSERT only) ──────────────────
drop policy if exists "meal photos readable by members" on storage.objects;
create policy "meal photos readable by members" on storage.objects
  for select to authenticated
  using (
    case
      when bucket_id <> 'meal-photos' then false
      when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_member_of(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

drop policy if exists "meal photos writable by members" on storage.objects;
create policy "meal photos writable by members" on storage.objects
  for insert to authenticated
  with check (
    case
      when bucket_id <> 'meal-photos' then false
      when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_member_of(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

-- ── 3. meal_photos ──────────────────────────────────────────────────────
create table if not exists public.meal_photos (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null references public.households(id) on delete cascade,
  meal_id      uuid        not null references public.meals(id) on delete cascade,
  meal_cook_id uuid        null references public.meal_cooks(id) on delete cascade,
  thumb_path   text        not null,
  view_path    text        not null,
  uploaded_by  uuid        not null references public.users(id),
  uploaded_at  timestamptz not null default now(),
  deleted_at   timestamptz null,
  width        integer     null check (width is null or width > 0),
  height       integer     null check (height is null or height > 0)
);
comment on table public.meal_photos is
  '065 — a household''s own meal photo (SPEC_meal_photos_v1 + 2026-10-13/10-20 amendments). Two renditions in the private meal-photos bucket (thumb ~480 px for the library card, view ~1080 px for the recipe view). meal_cook_id NULL = added from the recipe view (slice 1, R3); set = taken at Cooked it (slice 2). Newest live row per (meal, household) is the card (D2). At most 3 live per (meal, household) (R1) and 1 live per cook (P1), both enforced by add_meal_photo. Writes ONLY through add_meal_photo / remove_meal_photo (SECURITY DEFINER); soft delete; objects swept later by service role.';

-- D2's card read (per meal) and the library's household read.
create index if not exists meal_photos_meal_live_idx
  on public.meal_photos (meal_id, uploaded_at desc) where deleted_at is null;
create index if not exists meal_photos_household_live_idx
  on public.meal_photos (household_id, uploaded_at desc) where deleted_at is null;
-- P1: one live photo per cook (slice 2). Belt to the RPC's braces.
create unique index if not exists meal_photos_one_live_per_cook
  on public.meal_photos (meal_cook_id) where deleted_at is null and meal_cook_id is not null;

alter table public.meal_photos enable row level security;

revoke all on table public.meal_photos from public;
revoke all on table public.meal_photos from anon;
revoke all on table public.meal_photos from authenticated;
grant select on table public.meal_photos to authenticated;

drop policy if exists meal_photos_select on public.meal_photos;
create policy meal_photos_select on public.meal_photos
  for select to authenticated
  using (public.is_member_of(household_id));

-- ── 4a. add_meal_photo ──────────────────────────────────────────────────
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

-- ── 4b. remove_meal_photo ───────────────────────────────────────────────
create or replace function public.remove_meal_photo(p_photo_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_hh uuid;
begin
  select household_id into v_hh from meal_photos where id = p_photo_id;
  if v_hh is null or not is_member_of(v_hh) then
    raise exception 'remove_meal_photo: not a member of the photo''s household' using errcode = '42501';
  end if;
  -- P3: any member removes any photo. Soft delete — the object stays until the sweep.
  update meal_photos set deleted_at = now() where id = p_photo_id and deleted_at is null;
  return found;
end;
$function$;

revoke all on function public.add_meal_photo(uuid, uuid, text, text, integer, integer) from public;
revoke all on function public.add_meal_photo(uuid, uuid, text, text, integer, integer) from anon;
revoke all on function public.add_meal_photo(uuid, uuid, text, text, integer, integer) from service_role;
grant execute on function public.add_meal_photo(uuid, uuid, text, text, integer, integer) to authenticated;
revoke all on function public.remove_meal_photo(uuid) from public;
revoke all on function public.remove_meal_photo(uuid) from anon;
revoke all on function public.remove_meal_photo(uuid) from service_role;
grant execute on function public.remove_meal_photo(uuid) to authenticated;

commit;

-- VERIFY — one row. Expect:
--   which_db 7642734024280108049 · bucket_public false · bucket_limit 1048576 ·
--   bucket_mimes {image/webp,image/jpeg} · storage_cmds INSERT,SELECT · storage_roles {authenticated} x2 ·
--   storage_uses_owner false · rls_on true · policies 1 · grants_public '' · grants_anon '' ·
--   grants_authenticated SELECT · add_acl_auth true · add_acl_anon false · add_acl_public false ·
--   rm_acl_auth true · rm_acl_anon false · rm_acl_public false · secdef 2 · search_path 2 · rows 0
select
  (select system_identifier from pg_control_system())                                            as which_db,
  (select public from storage.buckets where id = 'meal-photos')                                  as bucket_public,
  (select file_size_limit from storage.buckets where id = 'meal-photos')                         as bucket_limit,
  (select allowed_mime_types::text from storage.buckets where id = 'meal-photos')                as bucket_mimes,
  (select string_agg(cmd, ',' order by cmd) from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and coalesce(qual, '') || coalesce(with_check, '') ilike '%meal-photos%')                  as storage_cmds,
  (select string_agg(roles::text, ' ') from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname ilike 'meal photos%')  as storage_roles,
  (select bool_or(coalesce(qual, '') || coalesce(with_check, '') ilike any (array['%owner%', '%auth.uid%']))
     from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname ilike 'meal photos%') as storage_uses_owner,
  (select relrowsecurity from pg_class where oid = 'public.meal_photos'::regclass)               as rls_on,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'meal_photos')   as policies,
  (select coalesce(string_agg(privilege_type, ',' order by privilege_type), '') from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'meal_photos' and grantee ilike 'public')       as grants_public,
  (select coalesce(string_agg(privilege_type, ',' order by privilege_type), '') from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'meal_photos' and grantee ilike 'anon')         as grants_anon,
  (select coalesce(string_agg(privilege_type, ',' order by privilege_type), '') from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'meal_photos' and grantee ilike 'authenticated') as grants_authenticated,
  (select proacl::text ilike '%authenticated=X%' from pg_proc where oid = 'public.add_meal_photo(uuid,uuid,text,text,integer,integer)'::regprocedure) as add_acl_auth,
  (select proacl::text ilike '%anon=X%'          from pg_proc where oid = 'public.add_meal_photo(uuid,uuid,text,text,integer,integer)'::regprocedure) as add_acl_anon,
  (select proacl::text ~ '(^|[{,])=X'            from pg_proc where oid = 'public.add_meal_photo(uuid,uuid,text,text,integer,integer)'::regprocedure) as add_acl_public,
  (select proacl::text ilike '%authenticated=X%' from pg_proc where oid = 'public.remove_meal_photo(uuid)'::regprocedure) as rm_acl_auth,
  (select proacl::text ilike '%anon=X%'          from pg_proc where oid = 'public.remove_meal_photo(uuid)'::regprocedure) as rm_acl_anon,
  (select proacl::text ~ '(^|[{,])=X'            from pg_proc where oid = 'public.remove_meal_photo(uuid)'::regprocedure) as rm_acl_public,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('add_meal_photo', 'remove_meal_photo') and prosecdef) as secdef,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('add_meal_photo', 'remove_meal_photo')
      and proconfig::text ilike '%search_path=public, extensions%')                               as search_path,
  (select count(*) from public.meal_photos)                                                       as rows;
