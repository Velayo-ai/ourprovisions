-- 076_household_showcase.sql
-- SPEC_meal_sharing_v2.md — S48, the household's showcase (Dan, 2026-10-30, addendum appended to the
-- spec in this commit). Supersedes S11 (author-only public share), S26's one showcase PER PERSON,
-- S46's author-only flip, S23's uploaded_by re-gift guard, S12's public branch and C1's pre-check.
--
-- WHY
--   Dan H could not give a meal with the showcase Dan T had made in the same household (gift
--   01896a58, 2026-10-31 01:53 UTC: give_meal's S12 pick is the GIVER's own showcase; B2, no copy).
--   The household owns its meals, its list and its photos (any member removes any photo, S27); the
--   meal has one public face and it belongs to the house. Consent is met by visibility (who made it
--   the showcase, when) and reversibility (any member can un-showcase), not by authorship.
--
-- STEP 0 (read-only, dev 7642734024280108049, 2026-10-30 late, after 075):
--   * meal_photos: id, household_id, meal_id, meal_cook_id, thumb_path, view_path, uploaded_by
--     (not null → users), uploaded_at, deleted_at, width, height, kind ('cook' | 'showcase', CHECK
--     meal_photos_kind_values). No triggers. Grants: authenticated SELECT only (service_role all);
--     one policy, member SELECT. Indexes: pkey, meal_photos_one_live_per_cook (065),
--     meal_photos_one_live_showcase_per_person (072: (meal_id, household_id, uploaded_by) where
--     showcase and live), meal_photos_meal_live_idx, meal_photos_household_live_idx.
--   * The author-only rule lives in: set_photo_kind (073 step 3 + the showcase branch retiring the
--     CALLER's own), give_meal (S12 pick: uploaded_by = caller), accept_gift_photo (replace-on-second-
--     accept keyed on uploaded_by = giver; uploaded_by is the S23 guard), add_showcase_photo (072 §3,
--     per-person replace; unused by the client since S46), and the per-person index. NOT in:
--     remove_meal_photo (any member, S27), the three sweep functions, the meal-photos storage
--     policies (membership only), the table grants.
--   * Backfill on dev: ONE meal with two live showcases, Madbury meal 0ad40d2c — a9cf8e23 (Dan H,
--     04:50 UTC 10-30) and bc5f9b4f (Dan T, 05:05). Keep the newest (bc5f9b4f), flip a9cf8e23 to cook
--     (2 live cooks → 3, exactly the cap). ONE received row: c87f9fca on copy meal d3619ea9, matched
--     through the 2ebf925d receipt (accepted 21:46:09, row 21:46:10). 21 photo rows, 9 showcase, 4
--     live. Prod has none of 072–075 → no backfill there.
--   * The cap and the swap: making a COOK photo the showcase swaps one cook out and the old showcase
--     in, so the live cook count does not move; the only cap case is un-showcase, which refuses as
--     073 did.
--
-- WHAT — seven sections, one transaction, a VERIFY DO block closing each, a definer-run fixture
--   inside a savepoint that is rolled back.
--   §1 meal_photos.showcased_by uuid null → users (set null); showcased_at timestamptz null;
--      received_at timestamptz null (Dan's ruling: received_at, not received_gift_id — lineage is
--      S42 / Phase B, and a set-null FK would lose the mark with the gift row).
--   §2 BACKFILL, before the index: (a) received marks — a live or retired showcase row on a receipt's
--      copy meal, in the receiving household, uploaded_by the gift's giver, at or after the receipt,
--      gets received_at = the receipt's accepted_at; (b) every live non-received showcase gets
--      showcased_by = uploaded_by, showcased_at = uploaded_at (the best fact on record); (c) where a
--      (meal, household) has more than one live non-received showcase, all but the newest
--      (uploaded_at desc, id desc) flip to cook with the stamps cleared. Counts in a NOTICE.
--   §3 drop meal_photos_one_live_showcase_per_person; create meal_photos_one_live_showcase_per_meal
--      unique (meal_id, household_id) where kind = 'showcase' and deleted_at is null and
--      received_at is null. Received rows sit outside it (showcase-kind, chip shown, never the
--      household's showcase).
--   §4 set_photo_kind(p_photo_id, p_kind): 073's body with the author check REMOVED. Order: JWT user
--      (42501) → live row (P0002) → member of the row's household (42501) → kind in cook|showcase
--      (22023) → to showcase: a received row is refused (22023) BEFORE the same-kind no-op, so a
--      received row never re-enters the showcase by any path → same kind: no-op → meal row lock →
--      to showcase: the household's current live non-received showcase(s) of the meal flip to cook
--      (stamps cleared), then this row becomes showcase with showcased_by = caller, showcased_at =
--      now() → to cook: the 3-cook cap refusal (22023) stays, then kind = cook, stamps cleared.
--      meal_cook_id, paths, size, uploaded_by, uploaded_at untouched (Dan, 2026-10-30).
--   §5 give_meal: the S12 pick becomes the HOUSEHOLD's live non-received showcase of the meal
--      (showcased_at desc nulls last, uploaded_at desc, limit 1). Everything else verbatim.
--   §6 accept_gift_photo: the replace-on-second-accept retires the copy's prior RECEIVED showcase
--      row(s) (not "the giver's"); the new row carries received_at = now(), uploaded_by = the giver
--      (attribution — S40 unchanged), no showcase stamps. Everything else verbatim (incl. S47's
--      (webp|jpg) guard).
--   §7 drop add_showcase_photo(uuid, text, text, integer, integer): unused since S46, and under the
--      new index its per-person replace would raise a unique violation the moment a second member
--      uploaded — a broken dead path. The ROADMAP NEXT retirement row closes with this.
--
-- NOT IN 076
--   * remove_meal_photo, add_meal_photo, the sweeps, the storage policies, the table grants.
--   * A Home activity line for showcase changes (NEXT, with the crew feed design).
--   * Any src/ change — the client commit follows (RecipePhotos flip items for every member,
--     received rows without "Make showcase", the S48 prompt copy, Photo details' "Made showcase by",
--     the C1 pre-check and B1/B2 copy, fetchMealPhotos' three new columns).
--
-- ERRORS (one vocabulary with 065 / 072 / 073): 42501 = no JWT user / not a member; P0002 = no live
--   row; 22023 = bad kind, a received row to showcase, or the cook cap on un-showcase.
-- GRANTS: create or replace keeps each function's ACL (authenticated EXECUTE); add_showcase_photo's
--   goes with it. VERIFY reads every one back through aclexplode (information_schema is lossy on 17).
-- SEARCH PATH: pinned to '' and schema-qualified (070's form) — 073 / 072 / 074 shapes.
-- FIXTURE: runs AS THE OWNER inside the transaction, in `savepoint fixture` … `rollback to
--   savepoint fixture`. Three throw-away users (two members, one not), two households, a meal with
--   three cook photos, a gift + copy + receipt, storage.objects rows standing in for the receiver's
--   uploads (postgres holds INSERT on storage.objects — 074). Impersonates through
--   request.jwt.claims (set_config …, is_local = true) and clears them. No real row is touched;
--   nothing survives. The backfill in §2 is NOT fixture: it touches the two dev rows named above and
--   is reported by count.
-- APPLY: dev (zxwtxjjmssykhqrghouf, 7642734024280108049) first, by Dan in the SQL editor:
--   PARSE CHECK first (076_household_showcase.PARSE_CHECK.sql — `commit;` → `rollback;`, the closing
--   VERIFY SELECT moved above it) — expect every DO block to pass, the §2 NOTICE "received 1 ·
--   stamped 3 · flipped 1" (dev, 10-30 data), the fixture's NOTICE "12 checks passed", and the VERIFY
--   row checked 16 · mismatches 0 · cols 3 · index_per_meal true · index_per_person false ·
--   multi_showcase 0 · received_rows 1 · unstamped_live_showcases 0 · give_meal_household_pick true ·
--   set_photo_kind_author_check false · add_showcase_photo 0 · fixture_rows 0; after the rollback the
--   read-back shows cols 0, the per-person index back, add_showcase_photo 1 … then the real run with
--   `commit;`, the closing VERIFY on the same identifier, and the ledger row below by hand. Prod
--   (parpauldmbetptkmdwbd, 7606130613603586966) at Phase A's own promotion, after 072–075 and BEFORE
--   the client; no ledger on prod, by decision. Idempotent (if not exists / create or replace / the
--   backfill's predicates are empty on a second run). Run as postgres.
-- ROLLBACK: 076_rollback.sql — REFUSES while the per-person index could not hold (two live showcase
--   rows by one uploader on one meal); otherwise restores 073's set_photo_kind, 072/074's give_meal
--   and accept_gift_photo, 072 §3's add_showcase_photo, the per-person index, and drops the three
--   columns (the marks are lost; the flipped backfill row stays a cook photo — a rollback does not
--   re-showcase).
-- DRAFTED 2026-10-30 by Claude Code. NOT APPLIED.

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '076: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '076: run as postgres — current_user is %', current_user;
  end if;
  if to_regclass('public.meal_photos') is null or to_regclass('public.meal_gifts') is null
     or to_regclass('public.meal_gift_receipts') is null
     or to_regprocedure('public.set_photo_kind(uuid, text)') is null
     or to_regprocedure('public.give_meal(uuid, text)') is null
     or to_regprocedure('public.accept_gift_photo(uuid, uuid, text, text, integer, integer)') is null
     or to_regprocedure('public.mint_gift_code()') is null then
    raise exception '076: 072 (meal_gifts, receipts, give_meal, accept_gift_photo) and 073 (set_photo_kind) must be applied first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'meal_photos' and column_name = 'kind') then
    raise exception '076: meal_photos.kind (072) is missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'meal_gifts' and column_name = 'photo_ext') then
    raise exception '076: 074 (meal_gifts.photo_ext) must be applied first — give_meal is re-stated here against 074''s shape';
  end if;
  if to_regprocedure('public.get_current_user_id()') is null or to_regprocedure('public.is_member_of(uuid)') is null then
    raise exception '076: get_current_user_id / is_member_of are missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'meal_photos'
                  and indexname = 'meal_photos_one_live_showcase_per_person')
     and not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'meal_photos'
                  and indexname = 'meal_photos_one_live_showcase_per_meal') then
    raise exception '076: neither the per-person (072) nor the per-meal index exists — inspect before applying';
  end if;
  raise notice '076: % photo row(s), % live showcase(s), % (meal, household) pair(s) with more than one live showcase, % receipt(s) before this apply',
    (select count(*) from public.meal_photos),
    (select count(*) from public.meal_photos where kind = 'showcase' and deleted_at is null),
    (select count(*) from (select 1 from public.meal_photos where kind = 'showcase' and deleted_at is null
                            group by meal_id, household_id having count(*) > 1) x),
    (select count(*) from public.meal_gift_receipts);
end
$preflight$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §1  showcased_by / showcased_at / received_at (S48)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.meal_photos add column if not exists showcased_by uuid null references public.users(id) on delete set null;
alter table public.meal_photos add column if not exists showcased_at timestamptz null;
alter table public.meal_photos add column if not exists received_at  timestamptz null;

comment on column public.meal_photos.showcased_by is
  '076 — S48: who made this photo the meal''s showcase (null on cook photos and on received rows). Stamped by set_photo_kind; cleared when the photo goes back to cook. Backfilled from uploaded_by for showcases made before 076.';
comment on column public.meal_photos.showcased_at is
  '076 — S48: when the photo became the showcase (see showcased_by). Photo details reads both: "Made showcase by {First} · {date}".';
comment on column public.meal_photos.received_at is
  '076 — S48: set by accept_gift_photo when the row arrived on a gift. A received row is showcase-kind in the receiver''s strip (chip shown) but sits outside the one-showcase-per-meal index, is never picked by give_meal, and set_photo_kind refuses to make it the showcase (22023). Null on every ordinary row.';

do $verify$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'meal_photos'
         and column_name in ('showcased_by', 'showcased_at', 'received_at') and is_nullable = 'YES' and column_default is null) <> 3 then
    raise exception '076 §1: the three columns must exist, nullable, no default';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_photos'::regclass and contype = 'f'
                  and pg_get_constraintdef(oid) ilike '%(showcased_by) REFERENCES users(id) ON DELETE SET NULL%') then
    raise exception '076 §1: showcased_by must reference users(id) on delete set null';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §2  BACKFILL — received marks, showcase stamps, one showcase per (meal, household)
-- ═══════════════════════════════════════════════════════════════════════════
-- Runs before the index. Every predicate is empty on a second run. Dev expectation (10-30 data):
-- received 1 (c87f9fca ← the 2ebf925d receipt) · stamped 3 (the live non-received showcases; the received
-- row is not stamped) · flipped 1 (a9cf8e23 → cook; bc5f9b4f kept). Dry-run SELECTs on dev agree (10-30).

do $backfill$
declare v_received integer; v_stamped integer; v_flipped integer;
begin
  -- (a) received marks: the row accept_gift_photo wrote for a receipt — on the copy, in the receiving
  --     household, by the gift's giver, at or after the receipt. Live or retired rows alike.
  update public.meal_photos p
     set received_at = r.accepted_at
    from public.meal_gift_receipts r
    join public.meal_gifts g on g.id = r.gift_id
   where p.received_at is null
     and p.meal_id = r.meal_id and p.household_id = r.to_household_id
     and p.uploaded_by = g.given_by and p.kind = 'showcase'
     and p.uploaded_at >= r.accepted_at;
  get diagnostics v_received = row_count;

  -- (b) stamps on every live, non-received showcase: the uploader, at the upload (the best fact).
  update public.meal_photos
     set showcased_by = uploaded_by, showcased_at = uploaded_at
   where kind = 'showcase' and deleted_at is null and received_at is null and showcased_at is null;
  get diagnostics v_stamped = row_count;

  -- (c) one per (meal, household): all but the newest live non-received showcase flip to cook.
  with ranked as (
    select id, row_number() over (partition by meal_id, household_id order by uploaded_at desc, id desc) as rn
      from public.meal_photos
     where kind = 'showcase' and deleted_at is null and received_at is null
  )
  update public.meal_photos p
     set kind = 'cook', showcased_by = null, showcased_at = null
    from ranked
   where p.id = ranked.id and ranked.rn > 1;
  get diagnostics v_flipped = row_count;

  raise notice '076 §2 backfill: received % · stamped % · flipped %', v_received, v_stamped, v_flipped;
end
$backfill$;

do $verify$
begin
  if exists (select 1 from public.meal_photos where kind = 'showcase' and deleted_at is null and received_at is null
              group by meal_id, household_id having count(*) > 1) then
    raise exception '076 §2: a (meal, household) still has more than one live non-received showcase';
  end if;
  if exists (select 1 from public.meal_photos where kind = 'showcase' and deleted_at is null and received_at is null
                and (showcased_by is null or showcased_at is null)) then
    raise exception '076 §2: a live non-received showcase is unstamped';
  end if;
  if exists (select 1 from public.meal_photos where kind = 'cook' and (showcased_by is not null or showcased_at is not null)) then
    raise exception '076 §2: a cook photo carries showcase stamps';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §3  the index: one live, non-received showcase per (meal, household)
-- ═══════════════════════════════════════════════════════════════════════════

drop index if exists public.meal_photos_one_live_showcase_per_person;
create unique index if not exists meal_photos_one_live_showcase_per_meal
  on public.meal_photos (meal_id, household_id)
  where kind = 'showcase' and deleted_at is null and received_at is null;
comment on index public.meal_photos_one_live_showcase_per_meal is
  '076 — S48: at most one live showcase per meal per household, received rows excluded. The belt to set_photo_kind''s swap (the old showcase flips to cook before the new one is stamped).';

do $verify$
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'meal_photos' and indexname = 'meal_photos_one_live_showcase_per_person') then
    raise exception '076 §3: the per-person index still exists';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'meal_photos' and indexname = 'meal_photos_one_live_showcase_per_meal'
                  and indexdef ilike '%UNIQUE%' and indexdef ilike '%(meal_id, household_id)%'
                  and indexdef ilike '%received_at IS NULL%' and indexdef ilike '%deleted_at IS NULL%' and indexdef ilike '%showcase%') then
    raise exception '076 §3: meal_photos_one_live_showcase_per_meal is missing or has the wrong shape';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'meal_photos' and indexname = 'meal_photos_one_live_per_cook') then
    raise exception '076 §3: 065''s per-cook index went missing';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §4  set_photo_kind — any member; a received row never becomes the showcase (S48)
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

  -- 3. Any member of the photo's household (S48: the showcase is the household's — no author check).
  if not public.is_member_of(v_row.household_id) then
    raise exception 'set_photo_kind: not a member of the photo''s household' using errcode = '42501';
  end if;

  -- 4. The two kinds, and nothing else (the CHECK would say so too, less kindly).
  if p_kind is null or p_kind not in ('cook', 'showcase') then
    raise exception 'set_photo_kind: kind must be cook or showcase (got %)', coalesce(p_kind, 'null') using errcode = '22023';
  end if;

  -- 5. A received photo (it arrived on a gift) is never the receiving household's showcase — checked
  --    BEFORE the same-kind no-op, so a received showcase-kind row answers the same way.
  if p_kind = 'showcase' and v_row.received_at is not null then
    raise exception 'set_photo_kind: a photo that came with a gift cannot be the showcase' using errcode = '22023';
  end if;

  -- 6. Already that kind: nothing to do, nothing to say.
  if v_row.kind = p_kind then
    return;
  end if;

  -- Serialize with add_meal_photo's cap and with another flip of the same meal: the meal's row
  -- lock, taken only after membership is proven (a foreign meal is never locked).
  perform 1 from public.meals where id = v_row.meal_id for update;

  if p_kind = 'showcase' then
    -- S48: one live showcase per meal per household. The current one (whoever made it) goes back to
    -- a meal photo first — flipped, never deleted — so the partial unique index holds. The cook
    -- count does not move: this cook photo leaves the count as the old showcase joins it.
    update public.meal_photos set kind = 'cook', showcased_by = null, showcased_at = null
     where meal_id = v_row.meal_id and household_id = v_row.household_id
       and kind = 'showcase' and deleted_at is null and received_at is null
       and id <> p_photo_id;
    update public.meal_photos set kind = 'showcase', showcased_by = v_caller, showcased_at = now()
     where id = p_photo_id;
  else
    -- S26's cap: 3 live cook photos per (meal, household). A flip never ages a photo out — it
    -- refuses instead, and the client says "meal photos are full".
    select count(*) into v_cooks from public.meal_photos
     where meal_id = v_row.meal_id and household_id = v_row.household_id
       and kind = 'cook' and deleted_at is null;
    if v_cooks >= 3 then
      raise exception 'set_photo_kind: meal photos are full' using errcode = '22023';
    end if;
    update public.meal_photos set kind = 'cook', showcased_by = null, showcased_at = null
     where id = p_photo_id;
  end if;
  -- meal_cook_id, paths, size, uploaded_by, uploaded_at: untouched (Dan, 2026-10-30).
end
$function$;

comment on function public.set_photo_kind(uuid, text) is
  '073/076 — S48: ANY member of the photo''s household flips a live photo between cook and showcase. To showcase: a received row is refused (22023), the household''s current showcase of the meal goes back to cook (flipped, never deleted), this row is stamped showcased_by = caller / showcased_at = now(). To cook: the 3-cook cap refuses (22023), stamps cleared. JWT user (42501), live row (P0002), member (42501), kind in cook|showcase (22023). EXECUTE to authenticated only.';

do $verify$
declare v_got text; v_src text;
begin
  select coalesce(string_agg(a.grantee::regrole::text || '=' || a.privilege_type, ',' order by a.grantee::regrole::text), '') into v_got
    from pg_proc p, aclexplode(p.proacl) a
   where p.oid = 'public.set_photo_kind(uuid, text)'::regprocedure and a.grantee <> p.proowner;
  if v_got <> 'authenticated=EXECUTE' then
    raise exception '076 §4: set_photo_kind ACL want [authenticated=EXECUTE] got [%]', v_got;
  end if;
  select prosrc into v_src from pg_proc where oid = 'public.set_photo_kind(uuid, text)'::regprocedure;
  if v_src ilike '%only the photo''''s author%' or v_src ilike '%uploaded_by <> v_caller%' then
    raise exception '076 §4: set_photo_kind still carries the author check';
  end if;
  if v_src not ilike '%received_at is not null%' or v_src not ilike '%showcased_by = v_caller%' then
    raise exception '076 §4: set_photo_kind lacks the received refusal or the stamp';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.set_photo_kind(uuid, text)'::regprocedure
                    and prosecdef and provolatile = 'v' and proconfig = array['search_path=""']) then
    raise exception '076 §4: set_photo_kind must be SECURITY DEFINER, volatile, search_path pinned to ''''';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §5  give_meal — the household's showcase travels (S48, V5)
-- ═══════════════════════════════════════════════════════════════════════════

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

  -- S48 (replaces S12's public branch): the HOUSEHOLD's live showcase photo of this meal, or none.
  -- Never a cook photo. Never a received row (it came with a gift; this household did not publish it).
  select p.view_path, p.thumb_path into v_view, v_thumb
    from public.meal_photos p
   where p.meal_id = p_meal_id and p.household_id = v_hh
     and p.kind = 'showcase' and p.deleted_at is null and p.received_at is null
   order by p.showcased_at desc nulls last, p.uploaded_at desc, p.id desc
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
  '072/076 — mints a gift of the caller''s household''s meal (S43 code; V3 snapshot built here, names not ids). S48: returns photo_path / photo_thumb_path of the HOUSEHOLD''s live non-received showcase of the meal (or null) for the client to copy into gift-photos and then attach_gift_photo. Member (42501), meals only (22023), note ≤ 280 (22023). EXECUTE to authenticated only.';

do $verify$
declare v_got text; v_src text;
begin
  select coalesce(string_agg(a.grantee::regrole::text || '=' || a.privilege_type, ',' order by a.grantee::regrole::text), '') into v_got
    from pg_proc p, aclexplode(p.proacl) a
   where p.oid = 'public.give_meal(uuid, text)'::regprocedure and a.grantee <> p.proowner;
  if v_got <> 'authenticated=EXECUTE' then
    raise exception '076 §5: give_meal ACL want [authenticated=EXECUTE] got [%]', v_got;
  end if;
  select prosrc into v_src from pg_proc where oid = 'public.give_meal(uuid, text)'::regprocedure;
  if v_src ilike '%p.uploaded_by = v_caller%' or v_src not ilike '%p.received_at is null%' then
    raise exception '076 §5: give_meal still picks the giver''s own showcase, or admits received rows';
  end if;
  if v_src not ilike '%''photo_thumb_path'', v_thumb%' then
    raise exception '076 §5: give_meal''s return shape drifted';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §6  accept_gift_photo — the received mark (S48 replaces S23's uploaded_by guard)
-- ═══════════════════════════════════════════════════════════════════════════

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

  -- S40 / S48: a second accept replaces — the copy's prior RECEIVED showcase row(s) retire (soft-
  -- deleted, never removed). Keyed on the received mark, not on who uploaded.
  update public.meal_photos set deleted_at = now()
   where meal_id = v_meal and household_id = p_household_id
     and kind = 'showcase' and received_at is not null and deleted_at is null;

  -- uploaded_by = the GIVER (attribution, derived — S23 / S36 / S40); received_at = the mark (S48):
  -- never this household's showcase, never picked by give_meal, never re-showcased.
  insert into public.meal_photos (household_id, meal_id, meal_cook_id, kind, thumb_path, view_path, uploaded_by, width, height, received_at)
  values (p_household_id, v_meal, null, 'showcase', p_thumb_path, p_view_path, v_giver,
          case when p_width > 0 then p_width end, case when p_height > 0 then p_height end, now())
  returning id into v_id;

  return v_id;
end
$function$;

comment on function public.accept_gift_photo(uuid, uuid, text, text, integer, integer) is
  '072/076 — records the received gift photo as a showcase-kind row on the receiver''s copy: uploaded_by = the giver (attribution, derived), received_at = now() (S48: the mark — outside the one-showcase index, never picked by give_meal, never re-showcased). A second accept retires the copy''s prior received row. Member (42501), receipt required (42501), revoked / giver gone (55000), paths under {household}/{meal}/<uuid>-thumb|-view.(webp|jpg) with both objects present (22023). EXECUTE to authenticated only.';

do $verify$
declare v_got text; v_src text;
begin
  select coalesce(string_agg(a.grantee::regrole::text || '=' || a.privilege_type, ',' order by a.grantee::regrole::text), '') into v_got
    from pg_proc p, aclexplode(p.proacl) a
   where p.oid = 'public.accept_gift_photo(uuid, uuid, text, text, integer, integer)'::regprocedure and a.grantee <> p.proowner;
  if v_got <> 'authenticated=EXECUTE' then
    raise exception '076 §6: accept_gift_photo ACL want [authenticated=EXECUTE] got [%]', v_got;
  end if;
  select prosrc into v_src from pg_proc where oid = 'public.accept_gift_photo(uuid, uuid, text, text, integer, integer)'::regprocedure;
  if v_src not ilike '%received_at is not null and deleted_at is null%' or v_src not ilike '%, received_at)%' then
    raise exception '076 §6: accept_gift_photo does not key the replace on received_at or does not stamp it';
  end if;
  if v_src ilike '%uploaded_by = v_giver%' then
    raise exception '076 §6: accept_gift_photo still keys the replace on uploaded_by';
  end if;
  if v_src not like '%-view\\.(webp|jpg)$%' then   -- LIKE: \\ matches the body's one backslash (074's preflight shape)
    raise exception '076 §6: accept_gift_photo lost S47''s (webp|jpg) guard';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §7  add_showcase_photo retires (unused since S46; per-person replace contradicts §3)
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.add_showcase_photo(uuid, text, text, integer, integer);

do $verify$
begin
  if to_regprocedure('public.add_showcase_photo(uuid, text, text, integer, integer)') is not null then
    raise exception '076 §7: add_showcase_photo still exists';
  end if;
  -- The neighbours stand.
  if to_regprocedure('public.add_meal_photo(uuid, uuid, text, text, integer, integer)') is null
     or to_regprocedure('public.remove_meal_photo(uuid)') is null
     or to_regprocedure('public.attach_gift_photo(uuid, text)') is null then
    raise exception '076 §7: a neighbouring function went missing';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIXTURE — definer-run, inside a savepoint, rolled back. Two members and an outsider, a meal with
-- three cook photos, a gift to a second household with a copy and a receipt. Probes the household
-- flip, the swap, the stamps, the cap, give_meal's pick, the received mark and its refusals, the
-- index, and that add_showcase_photo is gone. Nothing here survives.
-- ═══════════════════════════════════════════════════════════════════════════
savepoint fixture;

do $fixture$
declare
  v_tag    text := '076-fixture-' || gen_random_uuid()::text;
  v_a      uuid; v_b uuid; v_c uuid;   -- A, B members of hh (A also of hh2); C member of nothing
  v_hh     uuid; v_hh2 uuid;
  v_meal   uuid; v_copy uuid;
  v_pa     uuid; v_pb uuid; v_pc uuid; v_pd uuid;   -- photos on v_meal
  v_code   text; v_gift uuid;
  v_j      jsonb;
  v_r      public.meal_photos%rowtype;
  v_recv   uuid; v_recv2 uuid;
  v_n      integer;
  v_claims text; v_state text;
  v_stem   text;
  v_p      text;   -- path prefix for the copy
begin
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-a', v_tag || '-a@fixture.invalid', '076 Alpha') returning id into v_a;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-b', v_tag || '-b@fixture.invalid', '076 Bravo') returning id into v_b;
  insert into public.users (clerk_id, email, full_name) values (v_tag || '-c', v_tag || '-c@fixture.invalid', '076 Charlie') returning id into v_c;
  insert into public.households (name, created_by) values (v_tag, v_a) returning id into v_hh;
  insert into public.households (name, created_by) values (v_tag || '-other', v_a) returning id into v_hh2;
  insert into public.household_members (household_id, user_id) values (v_hh, v_a), (v_hh, v_b), (v_hh2, v_a);
  insert into public.meals (household_id, name, created_by) values (v_hh, v_tag, v_a) returning id into v_meal;
  insert into public.meal_photos (household_id, meal_id, kind, thumb_path, view_path, uploaded_by)
    values (v_hh, v_meal, 'cook', v_hh || '/' || v_meal || '/a-thumb.webp', v_hh || '/' || v_meal || '/a-view.webp', v_a) returning id into v_pa;
  insert into public.meal_photos (household_id, meal_id, kind, thumb_path, view_path, uploaded_by)
    values (v_hh, v_meal, 'cook', v_hh || '/' || v_meal || '/b-thumb.jpg', v_hh || '/' || v_meal || '/b-view.jpg', v_b) returning id into v_pb;
  insert into public.meal_photos (household_id, meal_id, kind, thumb_path, view_path, uploaded_by)
    values (v_hh, v_meal, 'cook', v_hh || '/' || v_meal || '/c-thumb.webp', v_hh || '/' || v_meal || '/c-view.webp', v_b) returning id into v_pc;

  -- Act as B (NOT the author of pA).
  v_claims := json_build_object('sub', v_tag || '-b', 'role', 'authenticated')::text;
  perform set_config('request.jwt.claims', v_claims, true);
  if public.get_current_user_id() <> v_b then raise exception '076 fixture: impersonation failed'; end if;

  -- (1) Any member makes any photo the showcase: B flips A's photo; stamped by B, now.
  perform public.set_photo_kind(v_pa, 'showcase');
  select * into v_r from public.meal_photos where id = v_pa;
  if v_r.kind <> 'showcase' or v_r.showcased_by is distinct from v_b or v_r.showcased_at is null or v_r.uploaded_by <> v_a then
    raise exception '076 fixture (1): B could not showcase A''s photo, or the stamp is wrong (kind %, by %)', v_r.kind, v_r.showcased_by;
  end if;

  -- (2) The swap: A makes pB the showcase; pA goes back to cook (not deleted), stamps cleared; one live showcase.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tag || '-a', 'role', 'authenticated')::text, true);
  perform public.set_photo_kind(v_pb, 'showcase');
  select * into v_r from public.meal_photos where id = v_pa;
  if v_r.kind <> 'cook' or v_r.deleted_at is not null or v_r.showcased_by is not null or v_r.showcased_at is not null then
    raise exception '076 fixture (2): the old showcase did not flip back cleanly (kind %, deleted %, by %)', v_r.kind, v_r.deleted_at, v_r.showcased_by;
  end if;
  select count(*) into v_n from public.meal_photos where meal_id = v_meal and household_id = v_hh and kind = 'showcase' and deleted_at is null;
  if v_n <> 1 then raise exception '076 fixture (2): % live showcases on the meal', v_n; end if;
  select * into v_r from public.meal_photos where id = v_pb;
  if v_r.showcased_by is distinct from v_a then raise exception '076 fixture (2): pB stamped by %', v_r.showcased_by; end if;

  -- (3) give_meal by A returns the HOUSEHOLD's showcase (pB, made by B's upload, stamped by A) — not A's own.
  v_j := public.give_meal(v_meal, null);
  if (v_j ->> 'photo_path') is distinct from v_r.view_path or (v_j ->> 'photo_thumb_path') is distinct from v_r.thumb_path then
    raise exception '076 fixture (3): give_meal returned % — want the household showcase %', v_j ->> 'photo_path', v_r.view_path;
  end if;
  v_code := v_j ->> 'code'; v_gift := (v_j ->> 'gift_id')::uuid;

  -- (4) …and by B too (V36: whoever gives, the showcase travels).
  perform set_config('request.jwt.claims', v_claims, true);
  v_j := public.give_meal(v_meal, null);
  if (v_j ->> 'photo_path') is distinct from v_r.view_path then
    raise exception '076 fixture (4): give_meal by B returned %', v_j ->> 'photo_path';
  end if;
  update public.meal_gifts set revoked_at = now() where id = (v_j ->> 'gift_id')::uuid;   -- tidy: one live gift below

  -- (5) An outsider: 42501 on the flip.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tag || '-c', 'role', 'authenticated')::text, true);
  begin
    perform public.set_photo_kind(v_pa, 'showcase');
    raise exception '076 fixture (5): an outsider flipped a photo';
  exception when sqlstate '42501' then null;
  end;

  -- (6) Un-showcase by any member (B un-showcases pB, which A stamped): back to cook; then the cap:
  --     with pA showcase and three cooks (pB, pC, pD) un-showcasing pA refuses 22023.
  perform set_config('request.jwt.claims', v_claims, true);
  perform public.set_photo_kind(v_pb, 'cook');
  select * into v_r from public.meal_photos where id = v_pb;
  if v_r.kind <> 'cook' or v_r.showcased_by is not null then raise exception '076 fixture (6): un-showcase failed'; end if;
  perform public.set_photo_kind(v_pa, 'showcase');            -- cooks: pB, pC
  insert into public.meal_photos (household_id, meal_id, kind, thumb_path, view_path, uploaded_by)
    values (v_hh, v_meal, 'cook', v_hh || '/' || v_meal || '/d-thumb.webp', v_hh || '/' || v_meal || '/d-view.webp', v_a) returning id into v_pd;   -- cooks: 3
  begin
    perform public.set_photo_kind(v_pa, 'cook');
    raise exception '076 fixture (6): un-showcase at the cap did not refuse';
  exception when sqlstate '22023' then null;
  end;
  -- …and the swap at the cap still works (the count does not move): pD becomes the showcase, pA a cook.
  perform public.set_photo_kind(v_pd, 'showcase');
  select count(*) into v_n from public.meal_photos where meal_id = v_meal and household_id = v_hh and kind = 'cook' and deleted_at is null;
  if v_n <> 3 then raise exception '076 fixture (6): % live cooks after the swap at the cap (want 3)', v_n; end if;

  -- (7) The index: a second live non-received showcase on (meal, household) is refused at the table.
  begin
    insert into public.meal_photos (household_id, meal_id, kind, thumb_path, view_path, uploaded_by)
      values (v_hh, v_meal, 'showcase', v_hh || '/' || v_meal || '/x-thumb.webp', v_hh || '/' || v_meal || '/x-view.webp', v_a);
    raise exception '076 fixture (7): the index admitted a second live showcase';
  exception when unique_violation then null;
  end;

  -- (8) The receiving side: A accepts the gift into hh2 — a received row: showcase-kind, received_at set,
  --     uploaded_by = the giver (A), no stamps.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tag || '-a', 'role', 'authenticated')::text, true);
  insert into public.meals (household_id, name, created_by) values (v_hh2, v_tag || '-copy', v_a) returning id into v_copy;
  insert into public.meal_gift_receipts (gift_id, to_household_id, accepted_by, meal_id) values (v_gift, v_hh2, v_a, v_copy);
  v_p := v_hh2::text || '/' || v_copy::text || '/';
  v_stem := gen_random_uuid()::text;
  insert into storage.objects (bucket_id, name, owner, metadata) values
    ('meal-photos', v_p || v_stem || '-thumb.jpg', null, '{"mimetype":"image/jpeg","size":40000}'),
    ('meal-photos', v_p || v_stem || '-view.jpg',  null, '{"mimetype":"image/jpeg","size":193409}');
  v_recv := public.accept_gift_photo(v_gift, v_hh2, v_p || v_stem || '-thumb.jpg', v_p || v_stem || '-view.jpg', 1200, 900);
  select * into v_r from public.meal_photos where id = v_recv;
  if v_r.kind <> 'showcase' or v_r.received_at is null or v_r.uploaded_by <> v_a or v_r.showcased_by is not null then
    raise exception '076 fixture (8): the received row is wrong (kind %, received %, by %)', v_r.kind, v_r.received_at, v_r.uploaded_by;
  end if;

  -- (9) V39: a received row never becomes the showcase — 22023 even though it is showcase-kind already;
  --     and the receiver's give_meal carries no photo.
  begin
    perform public.set_photo_kind(v_recv, 'showcase');
    raise exception '076 fixture (9): a received row was accepted as the showcase';
  exception when sqlstate '22023' then null;
  end;
  v_j := public.give_meal(v_copy, null);
  if v_j -> 'photo_path' <> 'null'::jsonb then
    raise exception '076 fixture (9): giving the copy carried the received photo %', v_j ->> 'photo_path';
  end if;
  update public.meal_gifts set revoked_at = now() where id = (v_j ->> 'gift_id')::uuid;

  -- (10) A received row does not block the household's own showcase on the copy (outside the index),
  --      and un-showcasing the received row to cook is allowed (then 'showcase' on it is still 22023).
  insert into public.meal_photos (household_id, meal_id, kind, thumb_path, view_path, uploaded_by)
    values (v_hh2, v_copy, 'cook', v_p || 'own-thumb.webp', v_p || 'own-view.webp', v_a) returning id into v_pd;
  perform public.set_photo_kind(v_pd, 'showcase');
  select count(*) into v_n from public.meal_photos where meal_id = v_copy and household_id = v_hh2 and kind = 'showcase' and deleted_at is null;
  if v_n <> 2 then raise exception '076 fixture (10): want the own showcase beside the received row (2), got %', v_n; end if;
  perform public.set_photo_kind(v_recv, 'cook');
  begin
    perform public.set_photo_kind(v_recv, 'showcase');
    raise exception '076 fixture (10): a received cook row was re-showcased';
  exception when sqlstate '22023' then null;
  end;
  update public.meal_photos set kind = 'showcase' where id = v_recv;   -- restore for (11)

  -- (11) A second accept replaces the copy's received row (keyed on received_at, not uploaded_by).
  v_stem := gen_random_uuid()::text;
  insert into storage.objects (bucket_id, name, owner, metadata) values
    ('meal-photos', v_p || v_stem || '-thumb.webp', null, '{"mimetype":"image/webp","size":30000}'),
    ('meal-photos', v_p || v_stem || '-view.webp',  null, '{"mimetype":"image/webp","size":120000}');
  v_recv2 := public.accept_gift_photo(v_gift, v_hh2, v_p || v_stem || '-thumb.webp', v_p || v_stem || '-view.webp', 1200, 900);
  if (select deleted_at from public.meal_photos where id = v_recv) is null then
    raise exception '076 fixture (11): the first received row was not retired';
  end if;
  if (select received_at from public.meal_photos where id = v_recv2) is null then
    raise exception '076 fixture (11): the second received row is unmarked';
  end if;
  if (select deleted_at from public.meal_photos where id = v_pd) is not null then
    raise exception '076 fixture (11): the household''s own showcase on the copy was retired by the accept';
  end if;

  -- (12) add_showcase_photo is gone; the kind CHECK still refuses a third value.
  if to_regprocedure('public.add_showcase_photo(uuid, text, text, integer, integer)') is not null then
    raise exception '076 fixture (12): add_showcase_photo still exists';
  end if;
  begin
    update public.meal_photos set kind = 'hero' where id = v_pa;
    raise exception '076 fixture (12): the kind CHECK accepted hero';
  exception when check_violation then null;
  end;

  perform set_config('request.jwt.claims', '', true);
  select current_setting('request.jwt.claims', true) into v_state;
  if coalesce(v_state, '') <> '' then raise exception '076 fixture: claims not cleared'; end if;
  raise notice '076 fixture: 12 checks passed (rolled back next)';
end
$fixture$;

rollback to savepoint fixture;
release savepoint fixture;

notify pgrst, 'reload schema';

commit;

-- VERIFY — one row, after commit. Expect (dev):
--   which_db 7642734024280108049 · checked 16 · mismatches 0 · mismatch_detail '' · cols 3 ·
--   index_per_meal true · index_per_person false · multi_showcase 0 · live_showcases (3 on 10-30 data: 2 own + 1 received) ·
--   received_rows 1 · unstamped_live_showcases 0 · cooks_with_stamps 0 · give_meal_household_pick true ·
--   set_photo_kind_author_check false · accept_marks_received true · add_showcase_photo 0 · fixture_rows 0
-- Prod: identical except which_db 7606130613603586966 and the counts (0 showcases there until Phase A lands).
with fn_target (sig, anon_p, auth_p, svc_p) as (values
  ('public.set_photo_kind(uuid, text)',                                               '', 'EXECUTE', ''),
  ('public.give_meal(uuid, text)',                                                    '', 'EXECUTE', ''),
  ('public.accept_gift_photo(uuid, uuid, text, text, integer, integer)',              '', 'EXECUTE', ''),
  ('public.add_meal_photo(uuid, uuid, text, text, integer, integer)',                 '', 'EXECUTE', '')
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
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_photos'
      and column_name in ('showcased_by', 'showcased_at', 'received_at'))                          as cols,
  (select count(*) = 1 from pg_indexes where schemaname = 'public' and tablename = 'meal_photos'
    and indexname = 'meal_photos_one_live_showcase_per_meal' and indexdef ilike '%received_at IS NULL%') as index_per_meal,
  (select count(*) = 1 from pg_indexes where schemaname = 'public' and tablename = 'meal_photos'
    and indexname = 'meal_photos_one_live_showcase_per_person')                                   as index_per_person,
  (select count(*) from (select 1 from public.meal_photos where kind = 'showcase' and deleted_at is null and received_at is null
                           group by meal_id, household_id having count(*) > 1) x)                 as multi_showcase,
  (select count(*) from public.meal_photos where kind = 'showcase' and deleted_at is null)        as live_showcases,
  (select count(*) from public.meal_photos where received_at is not null)                         as received_rows,
  (select count(*) from public.meal_photos where kind = 'showcase' and deleted_at is null and received_at is null
    and (showcased_by is null or showcased_at is null))                                           as unstamped_live_showcases,
  (select count(*) from public.meal_photos where kind = 'cook' and (showcased_by is not null or showcased_at is not null)) as cooks_with_stamps,
  (select prosrc ilike '%p.received_at is null%' and prosrc not ilike '%p.uploaded_by = v_caller%' from pg_proc
    where oid = to_regprocedure('public.give_meal(uuid, text)'))                                   as give_meal_household_pick,
  (select prosrc ilike '%uploaded_by <> v_caller%' from pg_proc
    where oid = to_regprocedure('public.set_photo_kind(uuid, text)'))                              as set_photo_kind_author_check,
  (select prosrc ilike '%, received_at)%' from pg_proc
    where oid = to_regprocedure('public.accept_gift_photo(uuid, uuid, text, text, integer, integer)')) as accept_marks_received,
  (select count(*) from pg_proc where oid = to_regprocedure('public.add_showcase_photo(uuid, text, text, integer, integer)')) as add_showcase_photo,
  (select count(*) from public.users where clerk_id like '076-fixture-%')
  + (select count(*) from public.households where name like '076-fixture-%')
  + (select count(*) from public.meals where name like '076-fixture-%')                           as fixture_rows;

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '076_household_showcase'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '076_household_showcase');
