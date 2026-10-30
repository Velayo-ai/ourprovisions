-- 074_gift_photo_ext.sql
-- SPEC_meal_sharing_v2.md — S47, gift photos keep their own format (Dan, 2026-10-30). Supersedes
-- C4's "re-encode" fix (bf09477), C8's trust in has_photo as a storage probe, and 072 §9's
-- webp-only gift-photos bucket. Option 1 (a WASM WebP encoder on the giver's device) is not built.
--
-- WHY
--   The first real give on dev (2026-10-30 11:37 UTC, gift 3fbd3dba) was an iPhone-made showcase.
--   Safari cannot encode WebP, so 065's renderMealPhoto stored it as JPEG; the client posted those
--   bytes to the webp-only gift-photos bucket as view.webp and Storage answered 415 InvalidMimeType
--   → B5, no photo. bf09477 re-encoded JPEG → WebP on the giver's device, which leaves every
--   Safari / iPhone GIVER on B5 (the same device cannot encode WebP either). S47's rule instead:
--   a gift photo travels in the format it was stored in (webp or jpeg), byte for byte, never
--   re-encoded — and the SERVER marks a gift as having a photo only after it has checked that both
--   renditions exist, in one format, with matching bytes-type.
--
-- STEP 0 (read-only, dev 7642734024280108049, 2026-10-30) — what each S47 point met:
--   * has_photo today is a storage probe in BOTH preview RPCs: exists(storage.objects where
--     bucket_id = 'gift-photos' and name = gift_id || '/view.webp'). view only, thumb never
--     checked; give_meal records NO photo on the gift row (it returns the giver's showcase paths in
--     meal-photos for the client to copy). meal_gifts has no photo column.
--   * accept_gift_photo ALREADY accepts .jpg: its guard is `-thumb\.(webp|jpg)$` / `-view\.(webp|jpg)$`
--     under {household}/{meal}/ (065's shape). Untouched here. (It does not require the two
--     renditions to share an extension — 065 never did; the receiver's client copies both with the
--     source's one extension, so the pair matches in practice.)
--   * gift-photos bucket: private, file_size_limit 1048576, allowed_mime_types {image/webp}. The
--     bucket's MIME check runs BEFORE the INSERT policy, which is why the policy's name guard
--     (`/(view|thumb)\.webp$`) was never reached on 10-30. meal-photos allows {image/webp,image/jpeg}
--     at the same 1 MiB.
--   * Largest LIVE JPEG rendition in meal-photos: 276,204 bytes (a cook view); largest live
--     showcase JPEG 193,409 (the 10-30 give). Largest JPEG object of any row, live or retired:
--     402,205. All well under 1 MiB → the limit stays.
--   * The SELECT policy's guard reads the folder only (no extension), so .jpg reads already pass
--     it; gift_photo_readable is where S47's "only after the mark" lands.
--   * preview_meal_gift_public returns TABLE(... has_photo boolean): adding a column changes the
--     return type, so it is DROPped and re-created (ACL re-stated — a drop loses it).
--   * Two live gifts on dev (10-30), 0 objects in gift-photos, both correctly without a photo.
--   CORRECTION to the shape as written: "both renditions must share one extension" cannot be
--   checked by the INSERT policy (each object arrives alone). The policy admits each NAME —
--   {gift}/(view|thumb).(webp|jpg) — and attach_gift_photo enforces the pair: both objects for
--   that ext exist, each object's stored mimetype matches the ext, and no object of the other ext
--   sits under the gift. A mixed pair is refused at attach and reads as B5 (no mark, no photo).
--
-- WHAT — five sections, one transaction, a VERIFY DO block closing each, a definer-run fixture
--   inside a savepoint that is rolled back.
--   §1 meal_gifts.photo_ext text null, check in ('webp','jpg'); null = no photo. Written ONLY by
--      attach_gift_photo. Table grants unchanged (authenticated SELECT through the members-of-the-
--      giving-household policy; the giver's own household may see its gifts' format).
--   §2 the gift-photos bucket allows image/webp AND image/jpeg; 1 MiB stays. The INSERT policy's
--      name guard widens to `^{uuid}/(view|thumb)\.(webp|jpg)$`; gift_photo_writable unchanged.
--   §3 attach_gift_photo(p_gift_id uuid, p_ext text) returns void — SECURITY DEFINER,
--      search_path '', EXECUTE to authenticated only. Checks, in this order:
--        1. caller = get_current_user_id()                                        none → 42501
--        2. the gift exists AND caller is a member of from_household_id          no   → 42501
--           (an unknown gift reads like a foreign one — 051's shape)
--        3. revoked_at is null                                                    no   → 55000
--        4. p_ext in ('webp','jpg')                                               no   → 22023
--        then, under the gift's row lock:
--        5. photo_ext already = p_ext                                             → no-op, return
--           photo_ext set to the OTHER ext                                        → 22023
--        6. both {gift}/view.{ext} and {gift}/thumb.{ext} exist in storage.objects  no → 22023
--        7. each object's metadata->>'mimetype' is the ext's type                 no   → 22023
--        8. no other object under {gift}/ (the one-format rule)                   no   → 22023
--        9. update meal_gifts set photo_ext = p_ext
--      Called by the GIVER's client after both uploads. If it fails, the sheet reads B5 (the copy
--      is left as it is — no retry, no delete; the S37 sweep collects strays).
--   §4 preview_meal_gift_public and preview_meal_gift return photo_ext, and has_photo is now
--      `photo_ext is not null` (never a storage probe). has_photo STAYS in both results so the
--      client that is deployed between this apply and the client commit keeps working (063's
--      "migration before the client" order). Unknown and revoked codes still return the same
--      empty result (S43). The public RPC gains ONE field (photo_ext): the format, nothing else —
--      S43's "exactly five fields" becomes six by this ruling.
--   §5 gift_photo_readable also requires photo_ext is not null: nobody can sign a gift's objects
--      before the server has marked the gift. The SELECT policy itself is unchanged.
--
-- NOT IN 074
--   * accept_gift_photo (already accepts .jpg under the receiver's folder — Step 0).
--   * give_meal (unchanged: it still returns the giver's showcase paths; the format is whatever
--     renderMealPhoto stored).
--   * Any src/ change — the client commit follows, after this is on dev: revert bf09477's
--     re-encode (image.js giftWebp + tests, giveMeal.js giftBytesPlan / C4 comment,
--     useProvisions copyGiftPhoto's contentType), giftObjectPath / giftSourcePaths /
--     acceptCopyPaths / supabaseAnon.giftPhotoPath take the ext, copyGiftPhoto copies bytes with
--     the source contentType view then thumb then calls attach_gift_photo, previewMealGift and
--     giftCardModel read photo_ext, GiftCard / acceptGiftPhoto sign the right name.
--   * Retiring add_showcase_photo (still queued, NEXT).
--
-- ERRORS (one vocabulary with 065 / 072 / 073): 42501 = no JWT user / not a member (unknown gift
--   reads the same); 55000 = revoked; 22023 = bad ext, the other ext already attached, a rendition
--   missing, a mimetype that does not match the ext, or a stray object of the other format.
--
-- GRANTS: attach_gift_photo revoke all from public, anon, authenticated, service_role; grant
--   EXECUTE to authenticated. preview_meal_gift_public is dropped and re-created, so its ACL is
--   re-stated: revoke all, grant EXECUTE to anon + authenticated. preview_meal_gift and
--   gift_photo_readable are create or replace (same signature) — ACL kept; VERIFY reads every one
--   back through aclexplode (information_schema is lossy on 17 — see 072 §4).
--
-- SEARCH PATH: pinned to '' and schema-qualified (070's form).
--
-- FIXTURE: runs AS THE OWNER inside the transaction, in `savepoint fixture` … `rollback to
--   savepoint fixture`, so nothing it inserts survives even on a commit run. It impersonates a
--   throw-away user through request.jwt.claims (set_config …, is_local = true), inserts the
--   storage.objects rows a real upload would have (bucket gift-photos; postgres holds INSERT on
--   storage.objects, read 2026-10-30) and clears the claims again. No real household, meal, user,
--   gift or object is touched. SQL never deletes an object. The closing VERIFY counts the
--   fixture's rows (0).
--
-- APPLY: dev (zxwtxjjmssykhqrghouf, 7642734024280108049) first, by Dan in the SQL editor:
--   PARSE CHECK first — the whole file with the final `commit;` replaced by `rollback;`, and the
--   closing VERIFY SELECT moved ABOVE that `rollback;` so it reads the open transaction — expect
--   every DO block to pass (each raises on failure), the fixture's NOTICE "16 checks passed", and
--   the VERIFY row checked 20 · mismatches 0 · photo_ext_col true · photo_ext_check true ·
--   bucket_mimes {image/webp,image/jpeg} · bucket_limit 1048576 · insert_guard_widened true ·
--   readable_requires_ext true · public_fields gift_id,title,attribution,ingredient_count,has_photo,photo_ext ·
--   anon_fn_exec gift_photo_readable,preview_meal_gift_public · jpg_objects 0 · fixture_rows 0.
--   After the rollback nothing persists: photo_ext is absent, the bucket is webp-only and
--   attach_gift_photo does not exist … then the real run with `commit;`, then the closing VERIFY
--   on the same identifier and the ledger row below by hand. Prod (parpauldmbetptkmdwbd,
--   7606130613603586966) at Phase A's own promotion, after 072 and 073 and BEFORE the client; no
--   ledger on prod, by decision. Idempotent (if not exists / create or replace / on conflict; the
--   drop-and-create in §4 is safe to re-run). Run as postgres.
-- ROLLBACK: 074_rollback.sql — REFUSES while any .jpg object exists in gift-photos (the webp-only
--   bucket could not be restored over them); otherwise drops attach_gift_photo, restores 072's
--   gift_photo_readable, preview RPCs, INSERT guard and bucket MIME list, and drops photo_ext
--   (gifts marked 'webp' lose the mark; has_photo reverts to 072's storage probe, so their photo
--   still shows).
-- DRAFTED 2026-10-30 by Claude Code. NOT APPLIED.

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '074: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '074: run as postgres — current_user is %', current_user;
  end if;
  if to_regclass('public.meal_gifts') is null
     or to_regprocedure('public.preview_meal_gift_public(text)') is null
     or to_regprocedure('public.preview_meal_gift(text, uuid)') is null
     or to_regprocedure('public.gift_photo_readable(uuid)') is null
     or to_regprocedure('public.gift_photo_writable(uuid)') is null
     or to_regprocedure('public.accept_gift_photo(uuid, uuid, text, text, integer, integer)') is null
     or not exists (select 1 from storage.buckets where id = 'gift-photos') then
    raise exception '074: 072 (meal_gifts, the preview RPCs, gift_photo_readable/writable, accept_gift_photo, the gift-photos bucket) must be applied first';
  end if;
  if to_regprocedure('public.get_current_user_id()') is null or to_regprocedure('public.is_member_of(uuid)') is null then
    raise exception '074: get_current_user_id / is_member_of are missing';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'gift photos writable by the giving household')
     or not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'gift photos readable while the gift is live') then
    raise exception '074: 072 §9''s two gift-photos policies must exist (this file replaces the INSERT one by name)';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.accept_gift_photo(uuid, uuid, text, text, integer, integer)'::regprocedure
                  and prosrc like '%-view\\.(webp|jpg)$%') then
    raise exception '074: accept_gift_photo no longer accepts .jpg — Step 0 read it as 065''s (webp|jpg) guard; inspect before applying';
  end if;
  raise notice '074: % gift(s), % object(s) in gift-photos (% of them .jpg) before this apply',
    (select count(*) from public.meal_gifts),
    (select count(*) from storage.objects where bucket_id = 'gift-photos'),
    (select count(*) from storage.objects where bucket_id = 'gift-photos' and name like '%.jpg');
end
$preflight$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §1  meal_gifts.photo_ext (S47)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.meal_gifts add column if not exists photo_ext text null;

do $ck$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_gifts'::regclass and conname = 'meal_gifts_photo_ext_check') then
    alter table public.meal_gifts
      add constraint meal_gifts_photo_ext_check check (photo_ext is null or photo_ext in ('webp', 'jpg'));
  end if;
end
$ck$;

comment on column public.meal_gifts.photo_ext is
  '074 — S47: the format the gift photo was stored in (webp or jpg), or null = no photo. Stamped ONLY by attach_gift_photo after both renditions exist in gift-photos/{id}/ in that one format with matching mimetypes. has_photo in both preview RPCs is `photo_ext is not null`; gift_photo_readable requires it. Never re-encoded: the bytes travel as they were stored.';

comment on table public.meal_gifts is
  '072 — a meal given by link (SPEC_meal_sharing_v2 Phase A). code is a 16-char bearer key (S43 ruling 2026-10-28, ~79 bits; scrubbed like token=, S22). snapshot is built server-side by give_meal (V3: the recipe at give time; never a cross-household read). A gift never connects households (S1) and tells the giver nothing (S2). Members of from_household_id read their own gifts; recipients only through preview_meal_gift / preview_meal_gift_public. Writes ONLY through give_meal / revoke_meal_gifts / attach_gift_photo (074: photo_ext). revoked_at stops previews, receipts, and the gift-photos read policy (S34).';

do $verify$
declare v_got text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'meal_gifts' and column_name = 'photo_ext'
                    and data_type = 'text' and is_nullable = 'YES' and column_default is null) then
    raise exception '074 §1: meal_gifts.photo_ext must be text, nullable, no default';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_gifts'::regclass
                  and conname = 'meal_gifts_photo_ext_check' and contype = 'c'
                  and pg_get_constraintdef(oid) ilike '%webp%' and pg_get_constraintdef(oid) ilike '%jpg%') then
    raise exception '074 §1: meal_gifts_photo_ext_check is missing or does not name webp / jpg';
  end if;
  -- Table grants untouched: authenticated SELECT only, service_role ALL, nothing for anon / PUBLIC.
  select coalesce(string_agg(a.privilege_type, ',' order by a.privilege_type), '') into v_got
    from pg_class c, aclexplode(c.relacl) a
   where c.oid = 'public.meal_gifts'::regclass and a.grantee = 'authenticated'::regrole;
  if v_got <> 'SELECT' then raise exception '074 §1: meal_gifts/authenticated want [SELECT] got [%]', v_got; end if;
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
              where c.oid = 'public.meal_gifts'::regclass and (a.grantee = 0 or a.grantee = 'anon'::regrole)) then
    raise exception '074 §1: meal_gifts grants anon / PUBLIC';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §2  the gift-photos bucket allows JPEG; the INSERT name guard widens (S47)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1 MiB stays (Step 0: the largest live JPEG rendition is 276,204 bytes). The policy's shape is
-- 072 §9's exactly — one regex alternation wider. gift_photo_writable is unchanged (a live gift
-- whose from_household_id the caller belongs to).

update storage.buckets
   set allowed_mime_types = array['image/webp', 'image/jpeg'],
       file_size_limit    = 1048576,
       public             = false
 where id = 'gift-photos';

drop policy if exists "gift photos writable by the giving household" on storage.objects;
create policy "gift photos writable by the giving household" on storage.objects
  for insert to authenticated
  with check (
    case
      when bucket_id <> 'gift-photos' then false
      when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(view|thumb)\.(webp|jpg)$'
        then public.gift_photo_writable(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

do $verify$
begin
  if not exists (select 1 from storage.buckets where id = 'gift-photos' and public = false
                    and file_size_limit = 1048576 and allowed_mime_types = array['image/webp', 'image/jpeg']) then
    raise exception '074 §2: gift-photos bucket is not private / 1 MiB / {image/webp,image/jpeg}';
  end if;
  if (select string_agg(cmd || ':' || (select string_agg(r, ',' order by r) from unnest(roles) r), ' ' order by cmd)
         from pg_policies
       where schemaname = 'storage' and tablename = 'objects' and policyname ilike 'gift photos%')
     <> 'INSERT:authenticated SELECT:anon,authenticated' then
    raise exception '074 §2: gift-photos policies are not exactly SELECT(anon, authenticated) + INSERT(authenticated)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'gift photos writable by the giving household'
                  and with_check like '%(view|thumb)\\.(webp|jpg)$%'
                  and with_check like '%gift_photo_writable%') then
    raise exception '074 §2: the INSERT guard is not {uuid}/(view|thumb).(webp|jpg) → gift_photo_writable';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname ilike 'gift photos%'
                and coalesce(qual, '') || coalesce(with_check, '') ilike any (array['%owner%', '%auth.uid%'])) then
    raise exception '074 §2: a gift-photos policy uses owner / auth.uid (the 065 trap)';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §3  attach_gift_photo (S47) — the server marks the gift, after checking
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.attach_gift_photo(p_gift_id uuid, p_ext text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller uuid;
  v_g      public.meal_gifts%rowtype;
  v_mime   text;
  v_view   text;
  v_thumb  text;
  v_n      integer;
  v_bad    integer;
  v_stray  integer;
begin
  -- 1. The caller from the JWT, never from an argument.
  v_caller := public.get_current_user_id();
  if v_caller is null then
    raise exception 'attach_gift_photo: no user for the JWT subject' using errcode = '42501';
  end if;

  -- 2. The gift, and membership in the GIVING household. An unknown gift reads exactly like a
  --    foreign one (051): the error never confirms a gift id exists.
  select * into v_g from public.meal_gifts g where g.id = p_gift_id;
  if v_g.id is null or not public.is_member_of(v_g.from_household_id) then
    raise exception 'attach_gift_photo: not a member of the giving household' using errcode = '42501';
  end if;

  -- 3. A live gift (S34: revoked_at stops everything about the photo).
  if v_g.revoked_at is not null then
    raise exception 'attach_gift_photo: gift revoked' using errcode = '55000';
  end if;

  -- 4. The two formats, and nothing else (the CHECK would say so too, less kindly).
  if p_ext is null or p_ext not in ('webp', 'jpg') then
    raise exception 'attach_gift_photo: ext must be webp or jpg (got %)', coalesce(p_ext, 'null') using errcode = '22023';
  end if;
  v_mime := case p_ext when 'webp' then 'image/webp' else 'image/jpeg' end;

  -- Serialize with a second attach of the same gift: the gift's row lock, taken only after
  -- membership is proven (a foreign gift is never locked). Re-read the mark under the lock.
  perform 1 from public.meal_gifts where id = p_gift_id for update;
  select g.photo_ext into v_g.photo_ext from public.meal_gifts g where g.id = p_gift_id;

  -- 5. Already marked: the same format is a no-op; the other format is a contradiction.
  if v_g.photo_ext = p_ext then
    return;
  end if;
  if v_g.photo_ext is not null then
    raise exception 'attach_gift_photo: a % photo is already attached', v_g.photo_ext using errcode = '22023';
  end if;

  -- 6. Both renditions, in THIS format, exist (the client uploads view then thumb, then calls).
  v_view  := p_gift_id::text || '/view.'  || p_ext;
  v_thumb := p_gift_id::text || '/thumb.' || p_ext;
  select count(*) into v_n from storage.objects o
   where o.bucket_id = 'gift-photos' and o.name in (v_view, v_thumb);
  if v_n <> 2 then
    raise exception 'attach_gift_photo: both renditions must be uploaded before the mark (% of 2 present as .%)', v_n, p_ext
      using errcode = '22023';
  end if;

  -- 7. Each object's stored mimetype is the format's — JPEG bytes named .webp (the 10-30 shape)
  --    are never marked.
  select count(*) into v_bad from storage.objects o
   where o.bucket_id = 'gift-photos' and o.name in (v_view, v_thumb)
     and coalesce(o.metadata ->> 'mimetype', '') <> v_mime;
  if v_bad > 0 then
    raise exception 'attach_gift_photo: % object(s) under the gift are not %', v_bad, v_mime using errcode = '22023';
  end if;

  -- 8. One format per gift: nothing else may sit under {gift}/.
  select count(*) into v_stray from storage.objects o
   where o.bucket_id = 'gift-photos' and o.name like p_gift_id::text || '/%'
     and o.name not in (v_view, v_thumb);
  if v_stray > 0 then
    raise exception 'attach_gift_photo: % stray object(s) under the gift — one format only', v_stray using errcode = '22023';
  end if;

  -- 9. The mark. photo_ext is the only column this function ever writes.
  update public.meal_gifts set photo_ext = p_ext where id = p_gift_id;
end
$function$;

comment on function public.attach_gift_photo(uuid, text) is
  '074 — S47: the GIVER''s client calls this after uploading gift-photos/{gift_id}/view.{ext} and thumb.{ext}; the server marks meal_gifts.photo_ext only after checking: JWT user (42501), member of from_household_id — unknown reads the same (42501), live (55000), ext in webp|jpg (22023), same ext already marked = no-op / other ext = 22023, both objects present (22023), each object''s mimetype matches (22023), no stray object of another format (22023). Writes photo_ext and nothing else. EXECUTE to authenticated only.';

revoke all on function public.attach_gift_photo(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.attach_gift_photo(uuid, text) to authenticated;

do $verify$
declare v_got text;
begin
  select coalesce(string_agg(a.grantee::regrole::text || '=' || a.privilege_type, ',' order by a.grantee::regrole::text), '') into v_got
    from pg_proc p, aclexplode(p.proacl) a
   where p.oid = 'public.attach_gift_photo(uuid, text)'::regprocedure and a.grantee <> p.proowner;
  if v_got <> 'authenticated=EXECUTE' then
    raise exception '074 §3: attach_gift_photo ACL want [authenticated=EXECUTE] (plus the owner) got [%]', v_got;
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
              where p.oid = 'public.attach_gift_photo(uuid, text)'::regprocedure and a.grantee = 0) then
    raise exception '074 §3: attach_gift_photo still grants PUBLIC';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.attach_gift_photo(uuid, text)'::regprocedure
                    and prosecdef and provolatile = 'v' and proconfig = array['search_path=""']) then
    raise exception '074 §3: attach_gift_photo must be SECURITY DEFINER, volatile, search_path pinned to ''''';
  end if;
  if (select pg_get_function_identity_arguments(oid) from pg_proc where oid = 'public.attach_gift_photo(uuid, text)'::regprocedure)
     <> 'p_gift_id uuid, p_ext text' then
    raise exception '074 §3: attach_gift_photo argument names drifted';
  end if;
  if (select count(*) from regexp_matches((select prosrc from pg_proc where oid = 'public.attach_gift_photo(uuid, text)'::regprocedure),
                                          'update public\.meal_gifts set', 'gi')) <> 1 then
    raise exception '074 §3: attach_gift_photo must carry exactly one UPDATE of meal_gifts';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §4  the two preview RPCs return photo_ext; has_photo = photo_ext is not null (S47, S43)
-- ═══════════════════════════════════════════════════════════════════════════
-- preview_meal_gift_public's RETURNS TABLE gains a column → drop and re-create (create or replace
-- cannot change a return type), then the ACL is re-stated. preview_meal_gift returns jsonb →
-- create or replace, ACL kept. Neither reads storage any more.

drop function if exists public.preview_meal_gift_public(text);
create function public.preview_meal_gift_public(p_code text)
returns table (gift_id uuid, title text, attribution text, ingredient_count integer, has_photo boolean, photo_ext text)
language sql
stable
security definer
set search_path = ''
as $function$
  select g.id,
         g.snapshot ->> 'name',
         g.snapshot ->> 'attribution',
         coalesce(jsonb_array_length(g.snapshot -> 'ingredients'), 0),
         g.photo_ext is not null,
         g.photo_ext
    from public.meal_gifts g
   where g.code = upper(btrim(p_code))
     and g.revoked_at is null
$function$;
comment on function public.preview_meal_gift_public(text) is
  '072/074 — the signed-out preview card (S43 + S47): gift_id, title, attribution, ingredient_count, has_photo (= photo_ext is not null), photo_ext (webp | jpg | null) — nothing else; the client signs gift-photos/{gift_id}/view.{photo_ext}. Unknown and revoked codes both return no row. EXECUTE to anon + authenticated.';

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
    'has_photo',     v_g.photo_ext is not null,    -- 074: the server's mark, never a storage probe
    'photo_ext',     v_g.photo_ext);               -- 074: webp | jpg | null — the name to sign
end
$function$;
comment on function public.preview_meal_gift(text, uuid) is
  '072/074 — the signed-in gift arrival (10-07): snapshot + note + already_added (the receipt''s meal_id for this place, or null) + gift_id, has_photo (= photo_ext is not null) and photo_ext so the client signs gift-photos/{gift_id}/view.{photo_ext} itself (S34, S43, S47). Membership in p_household_id first. not_found = P0002, revoked = 55000. EXECUTE to authenticated only.';

do $verify$
declare v_acl text; v_cols text;
begin
  select proacl::text into v_acl from pg_proc where oid = 'public.preview_meal_gift_public(text)'::regprocedure;
  if v_acl !~ 'anon=X' or v_acl !~ 'authenticated=X' or v_acl ~ 'service_role=X' or v_acl ~ '(^|[{,])=X' then
    raise exception '074 §4: preview_meal_gift_public ACL wrong — got %', v_acl;
  end if;
  select string_agg(a.attname, ',' order by a.ord) into v_cols
    from pg_proc p, unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, mode, ord)
   where p.oid = 'public.preview_meal_gift_public(text)'::regprocedure and a.mode = 't';
  if v_cols <> 'gift_id,title,attribution,ingredient_count,has_photo,photo_ext' then
    raise exception '074 §4: preview_meal_gift_public columns are [%]', v_cols;
  end if;
  if (select count(*) from public.preview_meal_gift_public('NOSUCHCODE')) <> 0 then
    raise exception '074 §4: an unknown code must return no row';
  end if;
  if exists (select 1 from pg_proc where oid in ('public.preview_meal_gift_public(text)'::regprocedure,
                                                 'public.preview_meal_gift(text, uuid)'::regprocedure)
                and prosrc ilike '%storage.objects%') then
    raise exception '074 §4: a preview RPC still probes storage.objects for has_photo';
  end if;
  select proacl::text into v_acl from pg_proc where oid = 'public.preview_meal_gift(text, uuid)'::regprocedure;
  if v_acl !~ 'authenticated=X' or v_acl ~ 'anon=X' or v_acl ~ 'service_role=X' or v_acl ~ '(^|[{,])=X' then
    raise exception '074 §4: preview_meal_gift ACL changed — got %', v_acl;
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.preview_meal_gift(text, uuid)'::regprocedure
                    and prosrc ilike '%''photo_ext'',%v_g.photo_ext%') then
    raise exception '074 §4: preview_meal_gift does not return photo_ext';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §5  gift_photo_readable requires the mark (S35 + S47)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.gift_photo_readable(p_gift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (select 1 from public.meal_gifts g
                  where g.id = p_gift_id and g.revoked_at is null and g.photo_ext is not null)
$function$;
comment on function public.gift_photo_readable(uuid) is
  '072/074 — asked by the gift-photos SELECT policy (S35): true only for a gift that exists, is not revoked, AND has been marked by attach_gift_photo (photo_ext is not null — S47). Reads nothing else. EXECUTE to anon + authenticated (the policy runs as the caller).';

do $verify$
declare v_acl text;
begin
  select proacl::text into v_acl from pg_proc where oid = 'public.gift_photo_readable(uuid)'::regprocedure;
  if v_acl !~ 'anon=X' or v_acl !~ 'authenticated=X' or v_acl ~ 'service_role=X' or v_acl ~ '(^|[{,])=X' then
    raise exception '074 §5: gift_photo_readable ACL changed — got %', v_acl;
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.gift_photo_readable(uuid)'::regprocedure
                    and prosrc ilike '%photo_ext is not null%') then
    raise exception '074 §5: gift_photo_readable does not require photo_ext';
  end if;
  if public.gift_photo_readable(gen_random_uuid()) then
    raise exception '074 §5: a random uuid must not be readable';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIXTURE — definer-run, inside a savepoint, rolled back. A throw-away giver, household, meal and
-- five gifts; storage.objects rows stand in for the uploads. Probes every refusal of
-- attach_gift_photo, the mark, the two previews and gift_photo_readable before / after. Nothing
-- here survives.
-- ═══════════════════════════════════════════════════════════════════════════
savepoint fixture;

do $fixture$
declare
  v_tag    text := '074-fixture-' || gen_random_uuid()::text;
  v_user   uuid;   -- the giver
  v_hh     uuid;
  v_hh2    uuid;   -- another household (the giver is not a member)
  v_meal   uuid;
  v_snap   jsonb := '{"name":"074 fixture","attribution":"Fixture","ingredients":[{"name":"salt"}]}'::jsonb;
  v_ga     uuid; v_ca text;   -- A: the jpg pair, the success path
  v_gb     uuid; v_cb text;   -- B: a mixed pair (view.webp + thumb.jpg)
  v_gc     uuid;              -- C: jpg names, one object's mimetype is image/webp
  v_gd     uuid;              -- D: revoked, with a good pair
  v_ge     uuid;              -- E: another household's gift
  v_ext    text;
  v_n      integer;
  v_state  text;
  v_claims text;
  v_row    record;
begin
  insert into public.users (clerk_id, email, full_name) values (v_tag, v_tag || '@fixture.invalid', '074 Fixture') returning id into v_user;
  insert into public.households (name, created_by) values (v_tag, v_user) returning id into v_hh;
  insert into public.households (name, created_by) values (v_tag || '-other', v_user) returning id into v_hh2;
  insert into public.household_members (household_id, user_id) values (v_hh, v_user);
  insert into public.meals (household_id, name, created_by) values (v_hh, v_tag, v_user) returning id into v_meal;
  v_ca := public.mint_gift_code(); v_cb := public.mint_gift_code();
  insert into public.meal_gifts (code, from_household_id, given_by, source_meal_id, snapshot) values (v_ca, v_hh, v_user, v_meal, v_snap) returning id into v_ga;
  insert into public.meal_gifts (code, from_household_id, given_by, source_meal_id, snapshot) values (v_cb, v_hh, v_user, v_meal, v_snap) returning id into v_gb;
  insert into public.meal_gifts (code, from_household_id, given_by, source_meal_id, snapshot) values (public.mint_gift_code(), v_hh, v_user, v_meal, v_snap) returning id into v_gc;
  insert into public.meal_gifts (code, from_household_id, given_by, source_meal_id, snapshot, revoked_at) values (public.mint_gift_code(), v_hh, v_user, v_meal, v_snap, now()) returning id into v_gd;
  insert into public.meal_gifts (code, from_household_id, given_by, source_meal_id, snapshot) values (public.mint_gift_code(), v_hh2, v_user, null, v_snap) returning id into v_ge;

  -- (1) No JWT user → 42501, before anything is read.
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.attach_gift_photo(v_ga, 'jpg');
    raise exception '074 fixture (1): no-JWT call did not raise';
  exception when sqlstate '42501' then null;
  end;

  -- Act as the giver.
  v_claims := json_build_object('sub', v_tag, 'role', 'authenticated')::text;
  perform set_config('request.jwt.claims', v_claims, true);
  if public.get_current_user_id() <> v_user then
    raise exception '074 fixture: impersonation failed — get_current_user_id() is %', public.get_current_user_id();
  end if;

  -- (2) Unknown gift → 42501 (reads like a foreign one).
  begin
    perform public.attach_gift_photo(gen_random_uuid(), 'jpg');
    raise exception '074 fixture (2): unknown gift did not raise';
  exception when sqlstate '42501' then null;
  end;

  -- (3) Another household's gift → 42501.
  begin
    perform public.attach_gift_photo(v_ge, 'jpg');
    raise exception '074 fixture (3): a foreign gift did not raise';
  exception when sqlstate '42501' then null;
  end;

  -- (4) Bad ext → 22023.
  begin
    perform public.attach_gift_photo(v_ga, 'jpeg');
    raise exception '074 fixture (4): bad ext did not raise';
  exception when sqlstate '22023' then null;
  end;

  -- (5) No objects yet → 22023, and nothing marked.
  begin
    perform public.attach_gift_photo(v_ga, 'jpg');
    raise exception '074 fixture (5): no-objects call did not raise';
  exception when sqlstate '22023' then null;
  end;

  -- (6) view only → still 22023 (both renditions).
  insert into storage.objects (bucket_id, name, owner, metadata) values ('gift-photos', v_ga || '/view.jpg', null, '{"mimetype":"image/jpeg","size":193409}');
  begin
    perform public.attach_gift_photo(v_ga, 'jpg');
    raise exception '074 fixture (6): view-only call did not raise';
  exception when sqlstate '22023' then null;
  end;

  -- (7) Before the mark, with both objects present, nothing is readable or previewed as a photo
  --     (S47: the server marks only after checking — the objects alone mean nothing).
  insert into storage.objects (bucket_id, name, owner, metadata) values ('gift-photos', v_ga || '/thumb.jpg', null, '{"mimetype":"image/jpeg","size":40000}');
  if public.gift_photo_readable(v_ga) then raise exception '074 fixture (7): readable before the mark'; end if;
  select has_photo, photo_ext into v_row from public.preview_meal_gift_public(v_ca);
  if v_row.has_photo or v_row.photo_ext is not null then raise exception '074 fixture (7): public preview shows a photo before the mark'; end if;

  -- (8) The mark: both .jpg, both image/jpeg → photo_ext = 'jpg'.
  perform public.attach_gift_photo(v_ga, 'jpg');
  select photo_ext into v_ext from public.meal_gifts where id = v_ga;
  if v_ext <> 'jpg' then raise exception '074 fixture (8): photo_ext is % after the mark', coalesce(v_ext, 'null'); end if;

  -- (9) After the mark: readable; both previews say has_photo true, photo_ext 'jpg'.
  if not public.gift_photo_readable(v_ga) then raise exception '074 fixture (9): not readable after the mark'; end if;
  select has_photo, photo_ext into v_row from public.preview_meal_gift_public(v_ca);
  if not v_row.has_photo or v_row.photo_ext <> 'jpg' then raise exception '074 fixture (9): public preview has_photo % / photo_ext %', v_row.has_photo, v_row.photo_ext; end if;
  select (j ->> 'has_photo')::boolean as has_photo, j ->> 'photo_ext' as photo_ext into v_row
    from public.preview_meal_gift(v_ca, v_hh) j;
  if not v_row.has_photo or v_row.photo_ext <> 'jpg' then raise exception '074 fixture (9): signed-in preview has_photo % / photo_ext %', v_row.has_photo, v_row.photo_ext; end if;

  -- (10) Idempotent: the same ext again is a no-op; the other ext is refused and changes nothing.
  perform public.attach_gift_photo(v_ga, 'jpg');
  begin
    perform public.attach_gift_photo(v_ga, 'webp');
    raise exception '074 fixture (10): marking the other ext did not raise';
  exception when sqlstate '22023' then null;
  end;
  select photo_ext into v_ext from public.meal_gifts where id = v_ga;
  if v_ext <> 'jpg' then raise exception '074 fixture (10): photo_ext changed to %', v_ext; end if;

  -- (11) B: a mixed pair (view.webp + thumb.jpg) is refused under either ext — one format per gift.
  insert into storage.objects (bucket_id, name, owner, metadata) values
    ('gift-photos', v_gb || '/view.webp', null, '{"mimetype":"image/webp","size":50000}'),
    ('gift-photos', v_gb || '/thumb.jpg', null, '{"mimetype":"image/jpeg","size":40000}');
  begin
    perform public.attach_gift_photo(v_gb, 'webp');
    raise exception '074 fixture (11): mixed pair marked as webp';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.attach_gift_photo(v_gb, 'jpg');
    raise exception '074 fixture (11): mixed pair marked as jpg';
  exception when sqlstate '22023' then null;
  end;
  select photo_ext into v_ext from public.meal_gifts where id = v_gb;
  if v_ext is not null then raise exception '074 fixture (11): B was marked %', v_ext; end if;
  select has_photo into v_row from public.preview_meal_gift_public(v_cb);
  if v_row.has_photo then raise exception '074 fixture (11): B previews with a photo'; end if;

  -- (12) C: jpg names, but the view object's stored mimetype is image/webp → refused (the 10-30
  --      shape inverted: bytes of one type under a name of another are never marked).
  insert into storage.objects (bucket_id, name, owner, metadata) values
    ('gift-photos', v_gc || '/view.jpg',  null, '{"mimetype":"image/webp","size":50000}'),
    ('gift-photos', v_gc || '/thumb.jpg', null, '{"mimetype":"image/jpeg","size":40000}');
  begin
    perform public.attach_gift_photo(v_gc, 'jpg');
    raise exception '074 fixture (12): mimetype mismatch was marked';
  exception when sqlstate '22023' then null;
  end;

  -- (13) D: a revoked gift with a good pair → 55000, never marked.
  insert into storage.objects (bucket_id, name, owner, metadata) values
    ('gift-photos', v_gd || '/view.webp',  null, '{"mimetype":"image/webp","size":50000}'),
    ('gift-photos', v_gd || '/thumb.webp', null, '{"mimetype":"image/webp","size":20000}');
  begin
    perform public.attach_gift_photo(v_gd, 'webp');
    raise exception '074 fixture (13): a revoked gift was marked';
  exception when sqlstate '55000' then null;
  end;
  if public.gift_photo_readable(v_gd) then raise exception '074 fixture (13): a revoked gift is readable'; end if;

  -- (14) The webp path marks too (the desktop giver): A's sibling with a clean webp pair.
  update public.meal_gifts set revoked_at = null where id = v_gd;   -- reuse D as a live webp gift
  perform public.attach_gift_photo(v_gd, 'webp');
  select photo_ext into v_ext from public.meal_gifts where id = v_gd;
  if v_ext <> 'webp' then raise exception '074 fixture (14): webp pair marked as %', coalesce(v_ext, 'null'); end if;

  -- (15) The CHECK holds against a direct write of a bad value (belt to §3's step 4).
  begin
    update public.meal_gifts set photo_ext = 'png' where id = v_gb;
    raise exception '074 fixture (15): the CHECK accepted png';
  exception when check_violation then null;
  end;

  -- (16) attach_gift_photo writes photo_ext and nothing else: the function source is the proof.
  if (select prosrc from pg_proc where oid = 'public.attach_gift_photo(uuid, text)'::regprocedure)
       ~* 'set\s+(code|from_household_id|given_by|source_meal_id|snapshot|note|created_at|revoked_at)\s*=' then
    raise exception '074 fixture (16): attach_gift_photo writes a column other than photo_ext';
  end if;

  perform set_config('request.jwt.claims', '', true);
  select current_setting('request.jwt.claims', true) into v_state;
  if coalesce(v_state, '') <> '' then raise exception '074 fixture: claims not cleared'; end if;
  select count(*) into v_n from storage.objects where bucket_id = 'gift-photos' and name like any (array[v_ga || '/%', v_gb || '/%', v_gc || '/%', v_gd || '/%']);
  raise notice '074 fixture: 16 checks passed (% fixture objects, rolled back next)', v_n;
end
$fixture$;

rollback to savepoint fixture;
release savepoint fixture;

notify pgrst, 'reload schema';

commit;

-- VERIFY — one row, after commit. Expect (dev):
--   which_db 7642734024280108049 · checked 20 · mismatches 0 · mismatch_detail '' ·
--   anon_fn_exec gift_photo_readable,preview_meal_gift_public · public_fn_exec '' ·
--   photo_ext_col true · photo_ext_check true · bucket_public false ·
--   bucket_mimes {image/webp,image/jpeg} · bucket_limit 1048576 · insert_guard_widened true ·
--   storage_policies INSERT:authenticated SELECT:anon,authenticated · readable_requires_ext true ·
--   previews_probe_storage false · public_fields gift_id,title,attribution,ingredient_count,has_photo,photo_ext ·
--   attach_secdef_pinned true · gifts (as before) · gifts_marked 0 (on first apply) ·
--   gift_objects 0 · jpg_objects 0 · fixture_rows 0
-- Prod: identical except which_db 7606130613603586966.
with fn_target (sig, anon_p, auth_p, svc_p) as (values
  ('public.attach_gift_photo(uuid, text)',                               '',        'EXECUTE', ''),
  ('public.preview_meal_gift_public(text)',                              'EXECUTE', 'EXECUTE', ''),
  ('public.preview_meal_gift(text, uuid)',                               '',        'EXECUTE', ''),
  ('public.gift_photo_readable(uuid)',                                   'EXECUTE', 'EXECUTE', ''),
  ('public.gift_photo_writable(uuid)',                                   '',        'EXECUTE', '')
),
expected (obj, grantee, want) as (
  select t.sig, v.grantee, v.p
    from fn_target t,
         lateral (values ('PUBLIC', ''), ('anon', t.anon_p), ('authenticated', t.auth_p), ('service_role', t.svc_p)) v (grantee, p)
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
  (select coalesce(string_agg(distinct p.proname, ',' order by p.proname), '')
     from pg_proc p, aclexplode(p.proacl) a
    where p.oid in (select to_regprocedure(sig) from fn_target) and a.grantee = 'anon'::regrole)   as anon_fn_exec,
  (select coalesce(string_agg(distinct p.proname, ',' order by p.proname), '')
     from pg_proc p, aclexplode(p.proacl) a
    where p.oid in (select to_regprocedure(sig) from fn_target) and a.grantee = 0)                 as public_fn_exec,
  (select count(*) = 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_gifts' and column_name = 'photo_ext'
      and data_type = 'text' and is_nullable = 'YES')                                              as photo_ext_col,
  (select count(*) = 1 from pg_constraint
    where conrelid = to_regclass('public.meal_gifts') and conname = 'meal_gifts_photo_ext_check')  as photo_ext_check,
  (select public from storage.buckets where id = 'gift-photos')                                   as bucket_public,
  (select allowed_mime_types::text from storage.buckets where id = 'gift-photos')                 as bucket_mimes,
  (select file_size_limit from storage.buckets where id = 'gift-photos')                          as bucket_limit,
  (select count(*) = 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'gift photos writable by the giving household'
    and with_check like '%(view|thumb)\\.(webp|jpg)$%')                                           as insert_guard_widened,
  (select string_agg(cmd || ':' || (select string_agg(r, ',' order by r) from unnest(roles) r), ' ' order by cmd)
     from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname ilike 'gift photos%')    as storage_policies,
  (select prosrc ilike '%photo_ext is not null%' from pg_proc
    where oid = to_regprocedure('public.gift_photo_readable(uuid)'))                               as readable_requires_ext,
  (select bool_or(prosrc ilike '%storage.objects%') from pg_proc
    where oid in (to_regprocedure('public.preview_meal_gift_public(text)'),
                  to_regprocedure('public.preview_meal_gift(text, uuid)')))                        as previews_probe_storage,
  (select string_agg(a.attname, ',' order by a.ord)
     from pg_proc p, unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, mode, ord)
    where p.oid = to_regprocedure('public.preview_meal_gift_public(text)') and a.mode = 't')       as public_fields,
  (select prosecdef and provolatile = 'v' and proconfig = array['search_path=""'] from pg_proc
    where oid = to_regprocedure('public.attach_gift_photo(uuid, text)'))                           as attach_secdef_pinned,
  (select count(*) from public.meal_gifts)                                                        as gifts,
  (select count(*) from public.meal_gifts where photo_ext is not null)                            as gifts_marked,
  (select count(*) from storage.objects where bucket_id = 'gift-photos')                          as gift_objects,
  (select count(*) from storage.objects where bucket_id = 'gift-photos' and name like '%.jpg')    as jpg_objects,
  (select count(*) from public.users where clerk_id like '074-fixture-%')
  + (select count(*) from public.households where name like '074-fixture-%')
  + (select count(*) from public.meals where name like '074-fixture-%')                           as fixture_rows;

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '074_gift_photo_ext'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '074_gift_photo_ext');
