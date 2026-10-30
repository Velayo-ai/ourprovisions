-- 073_set_photo_kind.sql
-- SPEC_meal_sharing_v2.md — S46, the flip model (Dan, 2026-10-30 00:00). Supersedes S9's
-- two-kinds-at-birth, S10's "no button" wording and S31's add_showcase_photo as the CLIENT's path.
-- 072 stays exactly as applied: kind, the showcase partial unique index, add_showcase_photo
-- (now unused by the client; retired in a later migration), the gift tables, RPCs and bucket.
--
-- WHY
--   A photo is born a meal photo (kind = 'cook', through add_meal_photo, one "Add a photo"
--   button). Its AUTHOR can flip it: the photo's ⋯ gains "Make showcase" (behind the S13 prompt)
--   and, on a showcase photo, "Make it a meal photo". Only the author — never anyone else's
--   photo. The safety guarantee becomes: a photo goes public only by its own author's deliberate
--   act, and nobody can flip another member's photo. S26's cap stands: 3 live cook photos per
--   (meal, household) + one live showcase per person per meal. Flipping to showcase frees a cook
--   slot; flipping back must fit under the cap — it never ages anything out.
--
-- WHAT — two sections, one transaction, a VERIFY DO block closing each, a definer-run fixture
--   that flips cook → showcase → cook (and probes every refusal) inside a savepoint that is
--   rolled back.
--   §2 add_meal_photo: the P1 per-cook replace gains `and kind = 'cook'` (Dan, 2026-10-30), the
--      same shape as S39's trim — a showcase row that still carries cook X's id (meal_cook_id is
--      left as-is on a flip) is never retired by a new cook-X upload. create or replace;
--      signature and ACL unchanged; VERIFY reads the ACL back unchanged.
--      AND the matching belt: 065's partial unique index meal_photos_one_live_per_cook (one live
--      row per meal_cook_id) is rebuilt cook-only — `… and kind = 'cook'`. Found by the fixture
--      on the first parse check (dev, 2026-10-30): with P1 cook-only but the index kind-blind,
--      the flipped showcase still holds cook X's slot and the next cook-X upload fails 23505
--      instead of landing. Belt and braces move together, as 072 §1 / §3 did for showcase.
--   §1 set_photo_kind(p_photo_id uuid, p_kind text) returns void
--      SECURITY DEFINER, search_path = '', EXECUTE to authenticated only (revoke-then-grant,
--      explicit for public, anon, authenticated AND service_role — S45; the 046 lesson).
--      Checks, in this order (Dan, 2026-10-30):
--        1. caller = get_current_user_id()                         none → 42501
--        2. the row exists and is live (deleted_at is null)       no  → P0002
--        3. row.uploaded_by = caller                               no  → 42501
--        4. caller is a member of row.household_id                 no  → 42501
--        5. p_kind in ('cook', 'showcase')                         no  → 22023
--        6. already that kind                                      → no-op, return
--      Then, under the meal's row lock (the same lock add_meal_photo takes, so the cap counts a
--      settled set):
--        → 'showcase': soft-delete the caller's OTHER live showcase row for that meal first, so
--          the S31 partial unique index holds (one live showcase per person per meal).
--        → 'cook': if the (meal, household) already has 3 live cook photos, raise 22023
--          "meal photos are full" — never trim (a flip must never age out a photo).
--      meal_cook_id is left as-is in both directions (Dan). uploaded_by, paths, size: untouched.
--      The two client paths that match on meal_cook_id alone: the board afterglow thumbnail
--      (Commit 0b skips showcase rows) and add_meal_photo's P1 replace (§2 here).
--
-- NOT IN 073
--   * Retiring add_showcase_photo (still granted, still correct; the client stops calling it).
--   * Any src/ change (Commit 0b follows, after this is on dev).
--
-- ERRORS (one vocabulary with 065 / 072): 42501 = no JWT user / not the author / not a member;
--   P0002 = not_found (no live row with that id); 22023 = bad kind, or the cook cap is full.
--
-- GRANTS: revoke all from public, anon, authenticated, service_role; grant EXECUTE to
--   authenticated. Dev's default privileges still hand new functions to anon (read 2026-10-28),
--   so the revokes are load-bearing. §1's VERIFY and the closing VERIFY read the ACL back through
--   aclexplode (information_schema is lossy on 17 — see 072 §4).
--
-- SEARCH PATH: pinned to '' and schema-qualified (070's form). 065's helpers (is_member_of,
--   get_current_user_id) keep their own 'public, extensions'.
--
-- FIXTURE: runs AS THE OWNER inside the transaction, in `savepoint fixture` … `rollback to
--   savepoint fixture`, so nothing it inserts survives even on a commit run. It impersonates a
--   throw-away user by setting request.jwt.claims (set_config …, is_local = true) — the GUC
--   get_current_user_id / is_member_of read through auth.jwt() — and clears it again. No real
--   household, meal, user or photo is touched. For the §2 check it also inserts the two
--   storage.objects rows a real cook upload would have (bucket meal-photos; postgres holds INSERT
--   on storage.objects, read 2026-10-30) — rolled back with everything else; SQL never deletes
--   an object. The closing VERIFY counts the fixture's rows (0).
--
-- APPLY: dev (zxwtxjjmssykhqrghouf, 7642734024280108049) first, by Dan in the SQL editor:
--   PARSE CHECK first — the whole file with the final `commit;` replaced by `rollback;`, and the
--   closing VERIFY SELECT moved ABOVE that `rollback;` so it reads the open transaction — expect
--   every DO block to pass (each raises on failure), the fixture's NOTICE "14 checks passed", and
--   the VERIFY row checked 8 · mismatches 0 · p1_cook_only true · fixture_rows 0 (the savepoint
--   already rolled the fixture back). After the rollback nothing persists: set_photo_kind is
--   absent and add_meal_photo is 072's again … then the real run with `commit;`, then the
--   closing VERIFY on the same identifier and the ledger row below by hand. Prod
--   (parpauldmbetptkmdwbd, 7606130613603586966) at Phase A's own promotion, with 072, BEFORE the
--   client; no ledger on prod, by decision. Idempotent (create or replace). Run as postgres.
-- ROLLBACK: 073_rollback.sql (drops the function, restores 072's add_meal_photo body and 065's
--   per-cook index; flipped rows keep their kind). Its preflight refuses while any live showcase
--   row carries a meal_cook_id, because 065's kind-blind index could not be rebuilt over it.
-- DRAFTED 2026-10-30 by Claude Code. NOT APPLIED.

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '073: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '073: run as postgres — current_user is %', current_user;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'meal_photos' and column_name = 'kind')
     or not exists (select 1 from pg_indexes where schemaname = 'public'
                     and indexname = 'meal_photos_one_live_showcase_per_person')
     or to_regprocedure('public.add_showcase_photo(uuid, text, text, integer, integer)') is null then
    raise exception '073: 072 (meal_photos.kind, the showcase index, add_showcase_photo) must be applied first';
  end if;
  if to_regprocedure('public.get_current_user_id()') is null or to_regprocedure('public.is_member_of(uuid)') is null then
    raise exception '073: get_current_user_id / is_member_of are missing';
  end if;
  if to_regprocedure('public.add_meal_photo(uuid, uuid, text, text, integer, integer)') is null
     or not exists (select 1 from pg_proc where oid = 'public.add_meal_photo(uuid, uuid, text, text, integer, integer)'::regprocedure
                      and prosrc ilike '%and kind = ''cook''%') then
    raise exception '073: add_meal_photo must be 072''s (the cook-only trim) before §2 replaces its body';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'meal_photos_one_live_per_cook') then
    raise exception '073: 065''s meal_photos_one_live_per_cook is missing — §2 rebuilds it and expects it';
  end if;
end
$preflight$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §1  set_photo_kind (S46)
-- ═══════════════════════════════════════════════════════════════════════════

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
  '073 — S46 flip model: the photo''s AUTHOR (uploaded_by = the JWT''s user, never an argument) sets kind to cook or showcase. Checks in order: JWT user (42501), live row (P0002), author (42501), member (42501), kind (22023), no-op if unchanged. To showcase: soft-deletes the caller''s other live showcase on the meal first (S31 index). To cook: refuses with 22023 "meal photos are full" at 3 live cook photos — never trims. meal_cook_id left as-is. EXECUTE to authenticated only.';

revoke all on function public.set_photo_kind(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.set_photo_kind(uuid, text) to authenticated;

do $verify$
declare v_got text;
begin
  -- The S45 shape for an authenticated-only function, read through aclexplode.
  select coalesce(string_agg(a.grantee::regrole::text || '=' || a.privilege_type, ',' order by a.grantee::regrole::text), '') into v_got
    from pg_proc p, aclexplode(p.proacl) a
   where p.oid = 'public.set_photo_kind(uuid, text)'::regprocedure and a.grantee <> p.proowner;
  if v_got <> 'authenticated=EXECUTE' then
    raise exception '073 §1: set_photo_kind ACL want [authenticated=EXECUTE] (plus the owner) got [%]', v_got;
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
              where p.oid = 'public.set_photo_kind(uuid, text)'::regprocedure and a.grantee = 0) then
    raise exception '073 §1: set_photo_kind still grants PUBLIC';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.set_photo_kind(uuid, text)'::regprocedure
                    and prosecdef and provolatile = 'v' and proconfig = array['search_path=""']) then
    raise exception '073 §1: set_photo_kind must be SECURITY DEFINER, volatile, search_path pinned to ''''';
  end if;
  if (select pg_get_function_identity_arguments(oid) from pg_proc where oid = 'public.set_photo_kind(uuid, text)'::regprocedure)
     <> 'p_photo_id uuid, p_kind text' then
    raise exception '073 §1: set_photo_kind argument names drifted';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §2  add_meal_photo — the P1 per-cook replace counts cook photos only (Dan, 2026-10-30)
-- ═══════════════════════════════════════════════════════════════════════════
-- Body identical to 072 §2 except ONE predicate: P1's "one live photo per cook — a second upload
-- replaces it" now reads `and kind = 'cook'`, the same shape as S39's trim. Without it, a cook
-- photo that its author flipped to showcase (keeping its meal_cook_id) would be silently retired
-- by the next upload for that cook — the only server path left that could remove a showcase
-- photo without its author's act. Signature unchanged, so create or replace keeps the existing
-- ACL ({postgres=X/postgres,authenticated=X/postgres}); the VERIFY reads it back.
-- The index below is P1's belt and moves with it: a showcase row keeps its cook id but no longer
-- occupies the cook's one live slot, so the next upload for that cook lands (first parse check).

drop index if exists public.meal_photos_one_live_per_cook;
create unique index meal_photos_one_live_per_cook
  on public.meal_photos (meal_cook_id)
  where deleted_at is null and meal_cook_id is not null and kind = 'cook';

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
     where meal_cook_id = p_meal_cook_id and deleted_at is null
       and kind = 'cook';   -- 073 §2: a showcase row carrying this cook's id is never retired by a new cook upload
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

do $verify$
declare v_acl text; v_src text;
begin
  select proacl::text, prosrc into v_acl, v_src
    from pg_proc where oid = 'public.add_meal_photo(uuid, uuid, text, text, integer, integer)'::regprocedure;
  if v_acl is null or v_acl !~ 'authenticated=X' or v_acl ~ 'anon=X' or v_acl ~ 'service_role=X' or v_acl ~ '(^|[{,])=X' then
    raise exception '073 §2: add_meal_photo ACL changed — got %', v_acl;
  end if;
  if v_src !~* 'where meal_cook_id = p_meal_cook_id and deleted_at is null\s+and kind = ''cook''' then
    raise exception '073 §2: add_meal_photo P1 replace is not cook-only';
  end if;
  if (select count(*) from regexp_matches(v_src, 'and kind = ''cook''', 'g')) <> 2 then
    raise exception '073 §2: add_meal_photo should carry exactly two cook-only predicates (P1 + the trim)';
  end if;
  if (select pg_get_function_identity_arguments(oid) from pg_proc
       where oid = 'public.add_meal_photo(uuid, uuid, text, text, integer, integer)'::regprocedure)
     <> 'p_meal_id uuid, p_meal_cook_id uuid, p_thumb_path text, p_view_path text, p_width integer, p_height integer' then
    raise exception '073 §2: add_meal_photo argument names drifted';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'meal_photos_one_live_per_cook'
                    and indexdef ilike '%UNIQUE%' and indexdef ilike '%(meal_cook_id)%'
                    and indexdef ilike '%deleted_at IS NULL%' and indexdef ilike '%meal_cook_id IS NOT NULL%'
                    and indexdef ilike '%kind = ''cook''%') then
    raise exception '073 §2: meal_photos_one_live_per_cook is not the cook-only partial unique index';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIXTURE — definer-run, inside a savepoint, rolled back. Flips cook → showcase → cook and
-- probes every refusal; then proves §2 (a flipped showcase survives a new upload for its cook).
-- A throw-away user, household, meal, cook and photos; impersonation through request.jwt.claims
-- (what auth.jwt() reads), cleared at the end. Nothing here survives.
-- ═══════════════════════════════════════════════════════════════════════════
savepoint fixture;

do $fixture$
declare
  v_tag    text := '073-fixture-' || gen_random_uuid()::text;
  v_user   uuid;   -- the author
  v_other  uuid;   -- another member of the same household
  v_hh     uuid;
  v_meal   uuid;
  v_p1     uuid;   -- the author's first photo
  v_p2     uuid;   -- the author's second photo
  v_p3     uuid;   -- the other member's photo
  v_p4     uuid;   -- cap filler
  v_p5     uuid;   -- cap filler
  v_p6     uuid;   -- §2: the author's cook-X photo, flipped to showcase
  v_p7     uuid;   -- §2: the new cook-X upload through add_meal_photo
  v_cook   uuid;   -- cook X
  v_stem   text;
  v_thumb  text;
  v_view   text;
  v_kind   text;
  v_n      integer;
  v_state  text;
  v_dead   timestamptz;
  v_claims text;
begin
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-a', v_tag || '-a@fixture.invalid', '073 Fixture A') returning id into v_user;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-b', v_tag || '-b@fixture.invalid', '073 Fixture B') returning id into v_other;
  insert into public.households (name, created_by) values (v_tag, v_user) returning id into v_hh;
  insert into public.household_members (household_id, user_id) values (v_hh, v_user), (v_hh, v_other);
  insert into public.meals (household_id, name, created_by) values (v_hh, v_tag, v_user) returning id into v_meal;
  insert into public.meal_photos (household_id, meal_id, thumb_path, view_path, uploaded_by)
  values (v_hh, v_meal, v_hh || '/' || v_meal || '/' || gen_random_uuid() || '-thumb.webp', v_hh || '/' || v_meal || '/x-view.webp', v_user) returning id into v_p1;
  insert into public.meal_photos (household_id, meal_id, thumb_path, view_path, uploaded_by)
  values (v_hh, v_meal, v_hh || '/' || v_meal || '/' || gen_random_uuid() || '-thumb.webp', v_hh || '/' || v_meal || '/y-view.webp', v_user) returning id into v_p2;
  insert into public.meal_photos (household_id, meal_id, thumb_path, view_path, uploaded_by)
  values (v_hh, v_meal, v_hh || '/' || v_meal || '/' || gen_random_uuid() || '-thumb.webp', v_hh || '/' || v_meal || '/z-view.webp', v_other) returning id into v_p3;

  -- (1) No JWT user → 42501, before anything is read.
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.set_photo_kind(v_p1, 'showcase');
    raise exception '073 fixture (1): no-JWT call did not raise';
  exception when sqlstate '42501' then null;
  end;

  -- Act as the author.
  v_claims := json_build_object('sub', v_tag || '-a', 'role', 'authenticated')::text;
  perform set_config('request.jwt.claims', v_claims, true);
  if public.get_current_user_id() <> v_user then
    raise exception '073 fixture: impersonation failed — get_current_user_id() is %', public.get_current_user_id();
  end if;

  -- (2) Unknown id → P0002.
  begin
    perform public.set_photo_kind(gen_random_uuid(), 'showcase');
    raise exception '073 fixture (2): unknown id did not raise';
  exception when sqlstate 'P0002' then null;
  end;

  -- (3) Another member's photo → 42501 (the author rule, S46).
  begin
    perform public.set_photo_kind(v_p3, 'showcase');
    raise exception '073 fixture (3): flipping another member''s photo did not raise';
  exception when sqlstate '42501' then null;
  end;

  -- (4) Bad kind → 22023.
  begin
    perform public.set_photo_kind(v_p1, 'public');
    raise exception '073 fixture (4): bad kind did not raise';
  exception when sqlstate '22023' then null;
  end;

  -- (5) No-op: already cook.
  perform public.set_photo_kind(v_p1, 'cook');
  select kind into v_kind from public.meal_photos where id = v_p1;
  if v_kind <> 'cook' then raise exception '073 fixture (5): no-op changed the kind to %', v_kind; end if;

  -- (6) cook → showcase.
  perform public.set_photo_kind(v_p1, 'showcase');
  select kind into v_kind from public.meal_photos where id = v_p1;
  if v_kind <> 'showcase' then raise exception '073 fixture (6): p1 is % after the flip', v_kind; end if;

  -- (7) A second flip to showcase by the same author retires the first (S31 index holds).
  perform public.set_photo_kind(v_p2, 'showcase');
  select deleted_at into v_dead from public.meal_photos where id = v_p1;
  if v_dead is null then raise exception '073 fixture (7): p1 was not retired by p2''s flip'; end if;
  select count(*) into v_n from public.meal_photos
   where meal_id = v_meal and household_id = v_hh and uploaded_by = v_user and kind = 'showcase' and deleted_at is null;
  if v_n <> 1 then raise exception '073 fixture (7): % live showcase rows for the author, want 1', v_n; end if;

  -- (8) showcase → cook (room under the cap: p3 is the only live cook photo).
  perform public.set_photo_kind(v_p2, 'cook');
  select kind into v_kind from public.meal_photos where id = v_p2;
  if v_kind <> 'cook' then raise exception '073 fixture (8): p2 is % after the flip back', v_kind; end if;

  -- (9) Full: p2 → showcase again, then fill the cook cap (p3 + two more = 3 live cooks);
  --     flipping p2 back to cook must refuse with 22023 and change nothing.
  perform public.set_photo_kind(v_p2, 'showcase');
  insert into public.meal_photos (household_id, meal_id, thumb_path, view_path, uploaded_by)
  values (v_hh, v_meal, v_hh || '/' || v_meal || '/' || gen_random_uuid() || '-thumb.webp', v_hh || '/' || v_meal || '/4-view.webp', v_user) returning id into v_p4;
  insert into public.meal_photos (household_id, meal_id, thumb_path, view_path, uploaded_by)
  values (v_hh, v_meal, v_hh || '/' || v_meal || '/' || gen_random_uuid() || '-thumb.webp', v_hh || '/' || v_meal || '/5-view.webp', v_user) returning id into v_p5;
  select count(*) into v_n from public.meal_photos where meal_id = v_meal and household_id = v_hh and kind = 'cook' and deleted_at is null;
  if v_n <> 3 then raise exception '073 fixture (9): expected 3 live cook photos before the full test, got %', v_n; end if;
  begin
    perform public.set_photo_kind(v_p2, 'cook');
    raise exception '073 fixture (9): flipping to cook at the cap did not raise';
  exception when sqlstate '22023' then
    if sqlerrm not ilike '%meal photos are full%' then raise exception '073 fixture (9): wrong 22023 message: %', sqlerrm; end if;
  end;
  select kind into v_kind from public.meal_photos where id = v_p2;
  if v_kind <> 'showcase' then raise exception '073 fixture (9): p2 changed to % despite the refusal', v_kind; end if;
  select count(*) into v_n from public.meal_photos where meal_id = v_meal and household_id = v_hh and deleted_at is null;
  if v_n <> 4 then raise exception '073 fixture (9): a refusal aged something out — % live rows, want 4', v_n; end if;

  -- (10) Flipping a cook photo to showcase frees a cook slot: p4 → showcase retires p2 (one per
  --      person) and leaves 2 live cooks; now p2 … is retired, so flip p5 back and forth instead.
  perform public.set_photo_kind(v_p4, 'showcase');
  select deleted_at into v_dead from public.meal_photos where id = v_p2;
  if v_dead is null then raise exception '073 fixture (10): p2 was not retired by p4''s flip'; end if;
  select count(*) into v_n from public.meal_photos where meal_id = v_meal and household_id = v_hh and kind = 'cook' and deleted_at is null;
  if v_n <> 2 then raise exception '073 fixture (10): % live cook photos after freeing a slot, want 2', v_n; end if;

  -- (11) A soft-deleted row reads as not_found.
  begin
    perform public.set_photo_kind(v_p1, 'cook');
    raise exception '073 fixture (11): a retired row did not raise';
  exception when sqlstate 'P0002' then null;
  end;

  -- (12) §2: a showcase row carrying cook X's id survives a new cook-X upload. The author logs a
  --      cook X, attaches p6 to it (a cook photo), flips p6 to showcase (meal_cook_id stays), then
  --      uploads a new photo for cook X through add_meal_photo — the real RPC, with the two
  --      storage.objects rows it checks for. Before §2, P1 would have retired p6.
  insert into public.meal_cooks (household_id, meal_id, cooked_by) values (v_hh, v_meal, v_user) returning id into v_cook;
  insert into public.meal_photos (household_id, meal_id, meal_cook_id, thumb_path, view_path, uploaded_by)
  values (v_hh, v_meal, v_cook, v_hh || '/' || v_meal || '/' || gen_random_uuid() || '-thumb.webp', v_hh || '/' || v_meal || '/6-view.webp', v_user) returning id into v_p6;
  perform public.set_photo_kind(v_p6, 'showcase');   -- retires p4 (one live showcase per person); p6 keeps cook X's id
  select kind, meal_cook_id::text into v_kind, v_state from public.meal_photos where id = v_p6;
  if v_kind <> 'showcase' or v_state <> v_cook::text then raise exception '073 fixture (12): p6 is % / cook % after the flip', v_kind, v_state; end if;
  v_stem  := gen_random_uuid()::text;
  v_thumb := v_hh || '/' || v_meal || '/' || v_stem || '-thumb.webp';
  v_view  := v_hh || '/' || v_meal || '/' || v_stem || '-view.webp';
  insert into storage.objects (bucket_id, name, owner, metadata) values ('meal-photos', v_thumb, null, '{"mimetype":"image/webp"}'), ('meal-photos', v_view, null, '{"mimetype":"image/webp"}');
  select public.add_meal_photo(v_meal, v_cook, v_thumb, v_view, 480, 1080) into v_p7;
  select deleted_at, kind into v_dead, v_kind from public.meal_photos where id = v_p6;
  if v_dead is not null then raise exception '073 fixture (12): the flipped showcase p6 was retired by the new cook-X upload (P1 is not cook-only)'; end if;
  if v_kind <> 'showcase' then raise exception '073 fixture (12): p6 kind changed to %', v_kind; end if;
  select count(*) into v_n from public.meal_photos where meal_cook_id = v_cook and deleted_at is null;
  if v_n <> 2 then raise exception '073 fixture (12): want 2 live rows on cook X (the showcase + the new cook photo), got %', v_n; end if;
  select kind, meal_cook_id::text into v_kind, v_state from public.meal_photos where id = v_p7;
  if v_kind <> 'cook' or v_state <> v_cook::text then raise exception '073 fixture (12): p7 is % / cook %', v_kind, v_state; end if;
  -- …and the rebuilt index still holds P1 for COOK rows: a second live cook row on cook X is refused.
  begin
    insert into public.meal_photos (household_id, meal_id, meal_cook_id, thumb_path, view_path, uploaded_by)
    values (v_hh, v_meal, v_cook, v_hh || '/' || v_meal || '/' || gen_random_uuid() || '-thumb.webp', v_hh || '/' || v_meal || '/8-view.webp', v_user);
    raise exception '073 fixture (12): a second live cook row on cook X was accepted — the per-cook index is gone';
  exception when unique_violation then null;
  end;

  -- (13) The author who has left the household → 42501 (member check, step 4).
  update public.household_members set deleted_at = now() where household_id = v_hh and user_id = v_user;
  begin
    perform public.set_photo_kind(v_p5, 'showcase');
    raise exception '073 fixture (13): a departed author did not raise';
  exception when sqlstate '42501' then null;
  end;

  -- (14) meal_cook_id is left as-is: the flip path never writes it (it is not in the UPDATE
  --      list) — the function source is the proof, and (12) showed the id surviving the flip.
  if (select prosrc from pg_proc where oid = 'public.set_photo_kind(uuid, text)'::regprocedure) ilike '%set meal_cook_id%' then
    raise exception '073 fixture (14): set_photo_kind writes meal_cook_id';
  end if;

  perform set_config('request.jwt.claims', '', true);
  select current_setting('request.jwt.claims', true) into v_state;
  if coalesce(v_state, '') <> '' then raise exception '073 fixture: claims not cleared'; end if;
  raise notice '073 fixture: 14 checks passed (rolled back next)';
end
$fixture$;

rollback to savepoint fixture;
release savepoint fixture;

notify pgrst, 'reload schema';

commit;

-- VERIFY — one row, after commit. Expect (dev):
--   which_db 7642734024280108049 · checked 8 · mismatches 0 · mismatch_detail '' · secdef_pinned true ·
--   identity_args 'p_photo_id uuid, p_kind text' · p1_cook_only true · trim_cook_only true · cook_idx_cook_only true ·
--   add_meal_photo_acl {postgres=X/postgres,authenticated=X/postgres} (unchanged from 065/072) ·
--   fixture_rows 0 · fixture_objects 0 · showcase_rows (as before) ·
--   add_showcase_photo_acl {postgres=X/postgres,authenticated=X/postgres} (unchanged)
-- Prod: identical except which_db 7606130613603586966.
with fn_target (sig) as (values
  ('public.set_photo_kind(uuid, text)'),
  ('public.add_meal_photo(uuid, uuid, text, text, integer, integer)')
),
expected (obj, grantee, want) as (
  select t.sig, v.grantee, v.p
    from fn_target t, lateral (values ('PUBLIC', ''), ('anon', ''), ('authenticated', 'EXECUTE'), ('service_role', '')) v (grantee, p)
),
actual as (
  select e.obj, e.grantee, e.want,
         coalesce((select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                     from pg_proc p, aclexplode(p.proacl) a
                    where p.oid = to_regprocedure(e.obj)
                      and a.grantee = case e.grantee when 'PUBLIC' then 0 else e.grantee::regrole::oid end), '') as got,
         to_regprocedure(e.obj) is not null as present
    from expected e
)
select
  (select system_identifier from pg_control_system())::text                                       as which_db,
  (select count(*) from actual)                                                                   as checked,
  (select count(*) from actual where got <> want or not present)                                  as mismatches,
  (select coalesce(string_agg(obj || '/' || grantee || ' want [' || want || '] got [' || got || ']'
                              || case when present then '' else ' MISSING' end, '; ' order by obj, grantee), '')
     from actual where got <> want or not present)                                                as mismatch_detail,
  (select prosecdef and proconfig = array['search_path=""'] from pg_proc
    where oid = to_regprocedure('public.set_photo_kind(uuid, text)'))                            as secdef_pinned,
  (select pg_get_function_identity_arguments(oid) from pg_proc
    where oid = to_regprocedure('public.set_photo_kind(uuid, text)'))                            as identity_args,
  (select prosrc ~* 'where meal_cook_id = p_meal_cook_id and deleted_at is null\s+and kind = ''cook''' from pg_proc
    where oid = to_regprocedure('public.add_meal_photo(uuid, uuid, text, text, integer, integer)'))  as p1_cook_only,
  (select prosrc ilike '%deleted_at is null%and kind = ''cook''%order by uploaded_at desc%' from pg_proc
    where oid = to_regprocedure('public.add_meal_photo(uuid, uuid, text, text, integer, integer)'))  as trim_cook_only,
  (select count(*) = 1 from pg_indexes where schemaname = 'public' and indexname = 'meal_photos_one_live_per_cook'
    and indexdef ilike '%UNIQUE%' and indexdef ilike '%kind = ''cook''%')                           as cook_idx_cook_only,
  (select proacl::text from pg_proc
    where oid = to_regprocedure('public.add_meal_photo(uuid, uuid, text, text, integer, integer)'))  as add_meal_photo_acl,
  (select count(*) from public.users where clerk_id like '073-fixture-%')
  + (select count(*) from public.households where name like '073-fixture-%')
  + (select count(*) from public.meals where name like '073-fixture-%')                           as fixture_rows,
  (select count(*) from storage.objects o where o.bucket_id = 'meal-photos'
    and o.name like any (select h.id::text || '/%' from public.households h where h.name like '073-fixture-%'))  as fixture_objects,
  (select count(*) from public.meal_photos where kind = 'showcase')                               as showcase_rows,
  (select proacl::text from pg_proc
    where oid = 'public.add_showcase_photo(uuid, text, text, integer, integer)'::regprocedure)    as add_showcase_photo_acl;

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '073_set_photo_kind'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '073_set_photo_kind');
