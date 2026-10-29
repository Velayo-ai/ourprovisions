-- 072_meal_sharing_phase_a.sql
-- SPEC_meal_sharing_v2.md — Phase A schema. Addendum 2026-10-28 (S34–S37) + Addendum
-- 2026-10-28b (S38–S45) + the 2026-10-28 ruling under S43 (16-character codes), on the 10-07
-- base as amended 10-22 (S1/S2: a gift never connects), 10-23 (S8–S18: two kinds of photo),
-- 10-24 (S19–S23), 10-24b (S24–S30: receipt shape S25, showcase cap S26), 10-24c (S31–S33).
--
-- WHY
--   Give a meal by link. The gift is a snapshot taken at give time (V3): the recipe Andrew
--   gives is the recipe Dan gets, whatever Andrew does to his meal afterwards. A gift never
--   connects households (S1) and nothing comes back to the giver (S2). The giver's own latest
--   SHOWCASE photo travels with a public gift, or none — never a cook photo (S12, S19). The
--   photo travels as copies (S20): the giver's client copies it into a policy-guarded
--   gift-photos bucket; the receiver's client copies it into its own household folder and
--   records it through accept_gift_photo, with uploaded_by = the giver (S23). Nobody mints a
--   URL server-side (S34): clients sign their own, as they do for meal-photos today.
--
-- WHAT — nine sections in dependency order (S38), one transaction, a VERIFY DO block closing
--   each section so a failure names its section and the whole file rolls back.
--   §1 meal_photos.kind ('cook' | 'showcase', default 'cook') + the showcase partial unique
--      index on (meal_id, household_id, uploaded_by) (S26, S31)
--   §2 add_meal_photo: signature and ACL untouched; the 3-newest trim counts cook photos only (S39)
--   §3 add_showcase_photo(p_meal_id, p_thumb_path, p_view_path, p_width, p_height) (S31)
--   §4 meal_gifts + meal_gift_receipts, RLS, explicit grants, indexes (10-07 shape; S25 receipt)
--   §5 mint_gift_code (internal), give_meal, preview_meal_gift, record_meal_gift_receipt,
--      revoke_meal_gifts (10-07 RPC table; S42: no lineage; S44: give_meal returns jsonb)
--   §6 preview_meal_gift_public(p_code) — the signed-out preview card (S43)
--   §7 gift_photo_readable (anon + authenticated), gift_photo_writable (authenticated) (S35, S41)
--   §8 accept_gift_photo(p_gift_id, p_household_id, p_thumb_path, p_view_path, p_width, p_height) (S36, S40)
--   §9 the gift-photos bucket (private, webp, 1 MB) + its SELECT and INSERT policies (S34)
--
-- NOT IN 072 (S38)
--   * The meals lineage columns copied_from_meal_id / copied_from_household_id / copied_at —
--     Phase B, with a write guard (S42). record_meal_gift_receipt stamps no lineage.
--   * The S37 sweep pass over gift-photos — its own migration, with the meal-photo-sweep change.
--   * Any src/ change. The client slices follow in their own commits.
--
-- CODES (S43 ruling 2026-10-28): 16 characters from ABCDEFGHJKMNPQRSTUVWXYZ23456789 (31
--   symbols: A–Z without O/I/L, 2–9) ≈ 79 bits. Minted from extensions.gen_random_bytes with
--   rejection sampling (bytes ≥ 248 are discarded; 248 = 8 × 31) so every symbol is equally
--   likely. The 10-07 "8 chars" (≈ 40 bits) is superseded.
--
-- ERRORS (one vocabulary, as 065): 42501 = not a member / no JWT user / no receipt;
--   22023 = bad argument (kind, note length, paths, missing objects); P0002 = not_found
--   (preview_meal_gift / record_meal_gift_receipt: the code is unknown); 55000 = revoked
--   (object_not_in_prerequisite_state) — and, in accept_gift_photo, "the giver is gone".
--
-- ARGUMENT ORDER (Dan, 2026-10-29): both new photo RPCs take (p_thumb_path, p_view_path), as 065's
--   add_meal_photo does — not S31 / S36 / S40's (p_path, p_thumb_path). Each VERIFY reads the
--   identity arguments back.
--
-- GRANTS (S45; the 046 lesson; CLAUDE.md's new-table rule): every object REVOKEs from public,
--   anon, authenticated AND service_role first, then grants exactly:
--   tables            anon —   · authenticated SELECT (RLS)        · service_role ALL
--     ALL on PostgreSQL 17 (dev and prod are 17.6) = DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,
--     TRIGGER,TRUNCATE,UPDATE — arwdDxtm, as 065's service_role grant reads today. Every ACL
--     check here uses aclexplode; information_schema omits MAINTAIN and would show 7 (see §4).
--   functions         anon —   · authenticated EXECUTE             · service_role —
--     except preview_meal_gift_public, gift_photo_readable: anon + authenticated EXECUTE
--     and mint_gift_code: nobody (called only inside give_meal, which runs as owner)
--   add_meal_photo    existing ACL (postgres=X, authenticated=X), unchanged by create or replace
--   gift-photos       no grants — policies only (SELECT anon + authenticated, INSERT authenticated)
--   Dev's default privileges still hand new functions to anon (read 2026-10-28), so the
--   revokes are load-bearing, not ceremony. The closing VERIFY reads every ACL back exactly.
--
-- SEARCH PATH: every function here pins search_path = '' and schema-qualifies (070's form).
--   065's helpers (is_member_of, get_current_user_id) keep their own 'public, extensions'.
--
-- APPLY: dev (zxwtxjjmssykhqrghouf, 7642734024280108049) first, by Dan in the SQL editor, then
--   VERIFY on the same identifier and the ledger row below by hand. Prod (parpauldmbetptkmdwbd,
--   7606130613603586966) at Phase A's own promotion, 072 BEFORE the client; no ledger on prod,
--   by decision. Idempotent (create or replace / if not exists / on conflict). Run as postgres.
-- ROLLBACK: 072_rollback.sql (never applied unless 072 must be undone).
-- DRAFTED 2026-10-28 by Claude Code. NOT APPLIED.

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '072: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '072: run as postgres — current_user is %', current_user;
  end if;
  if to_regclass('public.meal_photos') is null
     or to_regprocedure('public.add_meal_photo(uuid, uuid, text, text, integer, integer)') is null then
    raise exception '072: 065 (meal_photos, add_meal_photo) must be applied first';
  end if;
  if to_regclass('public.meal_gifts') is null and exists (select 1 from storage.buckets where id = 'gift-photos') then
    raise exception '072: a gift-photos bucket exists without meal_gifts — inspect before applying';
  end if;
end
$preflight$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §1  meal_photos.kind + the showcase partial unique index (S26, S31)
-- ═══════════════════════════════════════════════════════════════════════════
-- Every existing row is a cook photo by default; no backfill. One live showcase photo per
-- person per meal (S26) — the index is the belt to add_showcase_photo's / accept_gift_photo's
-- braces (both soft-delete the previous one first). Cook photos are untouched by it.

alter table public.meal_photos
  add column if not exists kind text not null default 'cook';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_photos'::regclass and conname = 'meal_photos_kind_values') then
    alter table public.meal_photos
      add constraint meal_photos_kind_values check (kind in ('cook', 'showcase'));
  end if;
end
$$;

create unique index if not exists meal_photos_one_live_showcase_per_person
  on public.meal_photos (meal_id, household_id, uploaded_by)
  where kind = 'showcase' and deleted_at is null;

comment on column public.meal_photos.kind is
  '072 — cook (065: Cooked it or the recipe view; household + crew only, never public, S10) | showcase (S9: "Add a showcase photo", can travel on its author''s own public gift, S11). Default cook. Showcase photos sit outside the 3-live cook cap (S26) and never on the card while a cook photo exists (S17). A received gift photo is a showcase row whose uploaded_by is the GIVER (S23).';

do $verify$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'meal_photos' and column_name = 'kind'
                    and is_nullable = 'NO' and column_default = '''cook''::text') then
    raise exception '072 §1: meal_photos.kind is not "text not null default cook"';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.meal_photos'::regclass and conname = 'meal_photos_kind_values') then
    raise exception '072 §1: meal_photos_kind_values CHECK missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'meal_photos_one_live_showcase_per_person'
                    and indexdef ilike '%UNIQUE%' and indexdef ilike '%showcase%' and indexdef ilike '%deleted_at IS NULL%') then
    raise exception '072 §1: showcase partial unique index missing or wrong';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §2  add_meal_photo — the trim counts cook photos only (S39)
-- ═══════════════════════════════════════════════════════════════════════════
-- Body identical to 065 except the R1 trim's "and kind = 'cook'" (the insert takes the
-- column default, cook). Without it a cook upload would age out a showcase photo (S26).
-- Signature unchanged, so create or replace keeps the existing ACL; §2's VERIFY reads it back.

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

do $verify$
declare
  v_acl text;
begin
  select proacl::text into v_acl
    from pg_proc where oid = 'public.add_meal_photo(uuid, uuid, text, text, integer, integer)'::regprocedure;
  if v_acl is null or v_acl !~ 'authenticated=X' or v_acl ~ 'anon=X' or v_acl ~ 'service_role=X' or v_acl ~ '(^|[{,])=X' then
    raise exception '072 §2: add_meal_photo ACL changed — got %', v_acl;
  end if;
  if not exists (select 1 from pg_proc
                  where oid = 'public.add_meal_photo(uuid, uuid, text, text, integer, integer)'::regprocedure
                    and prosrc ilike '%and kind = ''cook''%') then
    raise exception '072 §2: add_meal_photo trim is not cook-only';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §3  add_showcase_photo (S31)
-- ═══════════════════════════════════════════════════════════════════════════
-- No p_meal_cook_id: "a showcase photo never attaches to a cook" is in the signature.
-- Soft-deletes the caller's previous live showcase row for the meal, then inserts (S26).
-- Never touches the cook cap or its trim. Same path contract and upload order as 065.

create or replace function public.add_showcase_photo(
  p_meal_id    uuid,
  p_thumb_path text,
  p_view_path  text,
  p_width      integer,
  p_height     integer
)
returns uuid
language plpgsql
volatile
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

comment on function public.add_showcase_photo(uuid, text, text, integer, integer) is
  '072 — "Add a showcase photo" (SPEC_meal_sharing_v2 S9/S13/S31). kind = showcase, uploaded_by = the caller, household from the meal. One live per person per meal (S26): the caller''s previous one is soft-deleted first. Outside the cook cap; no cook id by signature. EXECUTE to authenticated only.';

revoke all on function public.add_showcase_photo(uuid, text, text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.add_showcase_photo(uuid, text, text, integer, integer) to authenticated;

do $verify$
declare v_acl text;
begin
  select proacl::text into v_acl from pg_proc where oid = 'public.add_showcase_photo(uuid, text, text, integer, integer)'::regprocedure;
  if v_acl !~ 'authenticated=X' or v_acl ~ 'anon=X' or v_acl ~ 'service_role=X' or v_acl ~ '(^|[{,])=X' then
    raise exception '072 §3: add_showcase_photo ACL wrong — got %', v_acl;
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.add_showcase_photo(uuid, text, text, integer, integer)'::regprocedure
                    and prosecdef and proconfig = array['search_path=""']) then
    raise exception '072 §3: add_showcase_photo must be SECURITY DEFINER with search_path pinned';
  end if;
  if (select pg_get_function_identity_arguments(oid) from pg_proc
       where oid = 'public.add_showcase_photo(uuid, text, text, integer, integer)'::regprocedure)
     <> 'p_meal_id uuid, p_thumb_path text, p_view_path text, p_width integer, p_height integer' then
    raise exception '072 §3: add_showcase_photo argument order must be 065''s (p_thumb_path, p_view_path)';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §4  meal_gifts + meal_gift_receipts (10-07 shape; S25 receipt; S42 no lineage)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.meal_gifts (
  id                uuid        primary key default gen_random_uuid(),
  code              text        not null unique
                                check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{16}$'),
  from_household_id uuid        not null references public.households(id) on delete cascade,
  given_by          uuid        null references public.users(id) on delete set null,
  source_meal_id    uuid        null references public.meals(id) on delete set null,  -- provenance only (V3)
  snapshot          jsonb       not null,
  note              text        null check (note is null or char_length(note) <= 280),
  created_at        timestamptz not null default now(),
  revoked_at        timestamptz null
);
comment on table public.meal_gifts is
  '072 — a meal given by link (SPEC_meal_sharing_v2 Phase A). code is a 16-char bearer key (S43 ruling 2026-10-28, ~79 bits; scrubbed like token=, S22). snapshot is built server-side by give_meal (V3: the recipe at give time; never a cross-household read). A gift never connects households (S1) and tells the giver nothing (S2). Members of from_household_id read their own gifts; recipients only through preview_meal_gift / preview_meal_gift_public. Writes ONLY through give_meal / revoke_meal_gifts. revoked_at stops previews, receipts, and the gift-photos read policy (S34).';

-- revoke_meal_gifts' lookup, and "Stop giving" visibility per meal.
create index if not exists meal_gifts_source_meal_idx
  on public.meal_gifts (source_meal_id) where revoked_at is null;
create index if not exists meal_gifts_from_household_idx
  on public.meal_gifts (from_household_id, created_at desc);

create table if not exists public.meal_gift_receipts (
  gift_id         uuid        not null references public.meal_gifts(id) on delete cascade,
  to_household_id uuid        not null references public.households(id) on delete cascade,
  accepted_by     uuid        null references public.users(id) on delete set null,
  meal_id         uuid        null references public.meals(id) on delete set null,
  accepted_at     timestamptz not null default now(),
  primary key (gift_id, to_household_id)                -- V11: once per place
);
comment on table public.meal_gift_receipts is
  '072 — the receiving household''s record that it accepted a gift (S25): what the server needs to stop double-adds and to let accept_gift_photo find the copy''s meal. SELECT for members of to_household_id ONLY — the giver''s household can never read it, count it, or join it (S25 standing trap). Writes ONLY through record_meal_gift_receipt. No status, no thanked_at (Phase B parked). No lineage stamping in Phase A (S42).';

create index if not exists meal_gift_receipts_household_idx
  on public.meal_gift_receipts (to_household_id, accepted_at desc);

alter table public.meal_gifts         enable row level security;
alter table public.meal_gift_receipts enable row level security;

revoke all on table public.meal_gifts         from public, anon, authenticated, service_role;
revoke all on table public.meal_gift_receipts from public, anon, authenticated, service_role;
grant select on table public.meal_gifts         to authenticated;
grant select on table public.meal_gift_receipts to authenticated;
grant all    on table public.meal_gifts         to service_role;
grant all    on table public.meal_gift_receipts to service_role;

drop policy if exists meal_gifts_select on public.meal_gifts;
create policy meal_gifts_select on public.meal_gifts
  for select to authenticated
  using (public.is_member_of(from_household_id));

drop policy if exists meal_gift_receipts_select on public.meal_gift_receipts;
create policy meal_gift_receipts_select on public.meal_gift_receipts
  for select to authenticated
  using (public.is_member_of(to_household_id));

do $verify$
-- ACLs are read from aclexplode, the closing VERIFY's source. information_schema.role_table_grants
-- omits MAINTAIN on PostgreSQL 17 and reported 7 of the 8 bits grant all writes (parse check,
-- dev 17.6, 2026-10-29) — the grant was right, the view is lossy.
declare v_all constant text := 'DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE';  -- arwdDxtm
        v_t text; v_got text;
begin
  foreach v_t in array array['meal_gifts', 'meal_gift_receipts'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_t)::regclass) then
      raise exception '072 §4: RLS off on %', v_t;
    end if;
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = v_t) <> 1
       or (select string_agg(cmd, ',') from pg_policies where schemaname = 'public' and tablename = v_t) <> 'SELECT' then
      raise exception '072 §4: % must have exactly one SELECT policy', v_t;
    end if;
    select coalesce(string_agg(a.privilege_type, ',' order by a.privilege_type), '') into v_got
      from pg_class c, aclexplode(c.relacl) a
     where c.oid = ('public.' || v_t)::regclass and a.grantee = 'authenticated'::regrole;
    if v_got <> 'SELECT' then raise exception '072 §4: %/authenticated want [SELECT] got [%]', v_t, v_got; end if;
    select coalesce(string_agg(a.privilege_type, ',' order by a.privilege_type), '') into v_got
      from pg_class c, aclexplode(c.relacl) a
     where c.oid = ('public.' || v_t)::regclass and a.grantee = 'service_role'::regrole;
    if v_got <> v_all then raise exception '072 §4: %/service_role want [%] got [%]', v_t, v_all, v_got; end if;
    if exists (select 1 from pg_class c, aclexplode(c.relacl) a
                where c.oid = ('public.' || v_t)::regclass and (a.grantee = 0 or a.grantee = 'anon'::regrole)) then
      raise exception '072 §4: % still grants anon / PUBLIC', v_t;
    end if;
  end loop;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §5  mint_gift_code, give_meal, preview_meal_gift, record_meal_gift_receipt, revoke_meal_gifts
-- ═══════════════════════════════════════════════════════════════════════════

-- Internal. 16 symbols from the 31-symbol alphabet, unbiased (rejection sampling), unique.
create or replace function public.mint_gift_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- 31 symbols; no 0/O/1/I/L
  v_code  text;
  v_bytes bytea;
  v_i     integer;
  v_b     integer;
begin
  loop
    v_code := '';
    while length(v_code) < 16 loop
      v_bytes := extensions.gen_random_bytes(32);
      v_i := 0;
      while v_i < 32 and length(v_code) < 16 loop
        v_b := get_byte(v_bytes, v_i);
        v_i := v_i + 1;
        -- 248 = 8 * 31: bytes 248..255 are discarded so each symbol is exactly 8/256 likely.
        if v_b < 248 then
          v_code := v_code || substr(v_alphabet, (v_b % 31) + 1, 1);
        end if;
      end loop;
    end loop;
    exit when not exists (select 1 from public.meal_gifts g where g.code = v_code);
  end loop;
  return v_code;
end
$function$;
comment on function public.mint_gift_code() is
  '072 — internal: a 16-character gift code (S43 ruling 2026-10-28; ~79 bits) from gen_random_bytes with rejection sampling, retried on collision. Called only inside give_meal (runs as owner). No client role can execute it.';

-- give_meal — membership first; kind = meal only; the snapshot (V3) and the S12 public-branch
-- photo pick happen here, server-side. Returns {code, gift_id, photo_path, photo_thumb_path}
-- (S44; the thumb is added so the client can copy both renditions — see the draft report).
create or replace function public.give_meal(p_meal_id uuid, p_note text)
returns jsonb
language plpgsql
volatile
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
  '072 — Give this meal (10-07; S44). Membership first; kind = meal only; note <= 280. Builds the V3 snapshot and picks the S12 public-branch photo server-side (the giver''s own latest showcase, or none). Returns {code, gift_id, photo_path, photo_thumb_path}; the client copies the photo to gift-photos/{gift_id}/ BEFORE the share sheet opens (S34). EXECUTE to authenticated only.';

-- preview_meal_gift — the signed-in arrival. Membership in the TARGET place first.
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

-- record_meal_gift_receipt — after the receiver's normal save. Idempotent. No lineage (S42).
create or replace function public.record_meal_gift_receipt(p_code text, p_household_id uuid, p_meal_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_g      public.meal_gifts%rowtype;
  v_caller uuid;
begin
  if not public.is_member_of(p_household_id) then
    raise exception 'record_meal_gift_receipt: not a member of the target household' using errcode = '42501';
  end if;
  v_caller := public.get_current_user_id();
  if v_caller is null then
    raise exception 'record_meal_gift_receipt: no user for the JWT subject' using errcode = '42501';
  end if;

  select * into v_g from public.meal_gifts g where g.code = upper(btrim(p_code));
  if v_g.id is null then
    raise exception 'record_meal_gift_receipt: not_found' using errcode = 'P0002';
  end if;
  if v_g.revoked_at is not null then
    raise exception 'record_meal_gift_receipt: revoked' using errcode = '55000';
  end if;

  -- The copy must be a live meal of the receiving place. A foreign meal reads like a missing one.
  if not exists (select 1 from public.meals m
                  where m.id = p_meal_id and m.household_id = p_household_id
                    and m.deleted_at is null and m.kind = 'meal') then
    raise exception 'record_meal_gift_receipt: meal is not a live meal of the target household' using errcode = '42501';
  end if;

  insert into public.meal_gift_receipts (gift_id, to_household_id, accepted_by, meal_id)
  values (v_g.id, p_household_id, v_caller, p_meal_id)
  on conflict (gift_id, to_household_id) do nothing;   -- V11: once per place; retries are silent
end
$function$;
comment on function public.record_meal_gift_receipt(text, uuid, uuid) is
  '072 — writes the receiving household''s receipt after Add to our meals saved the copy (10-07; S25). Idempotent (on conflict do nothing). Stamps NO lineage in Phase A (S42). Refuses a revoked gift (55000), an unknown code (P0002), a non-member or a meal outside the target place (42501). EXECUTE to authenticated only.';

-- revoke_meal_gifts — "Stop giving". Returns how many it revoked, never how many were accepted (S25).
create or replace function public.revoke_meal_gifts(p_meal_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_hh uuid;
  v_n  integer;
begin
  select m.household_id into v_hh from public.meals m where m.id = p_meal_id and m.deleted_at is null;
  if v_hh is null or not public.is_member_of(v_hh) then
    raise exception 'revoke_meal_gifts: not a member of the meal''s household' using errcode = '42501';
  end if;
  update public.meal_gifts
     set revoked_at = now()
   where source_meal_id = p_meal_id and from_household_id = v_hh and revoked_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end
$function$;
comment on function public.revoke_meal_gifts(uuid) is
  '072 — Stop giving (10-07 V11): revokes every live gift of the meal. Previews, receipts and the gift-photos read policy stop at once; copies already added are untouched (V2). Returns the revoked count only — never an accepted count (S25). EXECUTE to authenticated only.';

revoke all on function public.mint_gift_code()                                   from public, anon, authenticated, service_role;
revoke all on function public.give_meal(uuid, text)                              from public, anon, authenticated, service_role;
revoke all on function public.preview_meal_gift(text, uuid)                      from public, anon, authenticated, service_role;
revoke all on function public.record_meal_gift_receipt(text, uuid, uuid)         from public, anon, authenticated, service_role;
revoke all on function public.revoke_meal_gifts(uuid)                            from public, anon, authenticated, service_role;
grant execute on function public.give_meal(uuid, text)                           to authenticated;
grant execute on function public.preview_meal_gift(text, uuid)                   to authenticated;
grant execute on function public.record_meal_gift_receipt(text, uuid, uuid)      to authenticated;
grant execute on function public.revoke_meal_gifts(uuid)                         to authenticated;

do $verify$
declare v_sig text; v_acl text;
begin
  foreach v_sig in array array['public.give_meal(uuid, text)', 'public.preview_meal_gift(text, uuid)',
                               'public.record_meal_gift_receipt(text, uuid, uuid)', 'public.revoke_meal_gifts(uuid)'] loop
    select proacl::text into v_acl from pg_proc where oid = v_sig::regprocedure;
    if v_acl !~ 'authenticated=X' or v_acl ~ 'anon=X' or v_acl ~ 'service_role=X' or v_acl ~ '(^|[{,])=X' then
      raise exception '072 §5: % ACL wrong — got %', v_sig, v_acl;
    end if;
    if not exists (select 1 from pg_proc where oid = v_sig::regprocedure and prosecdef and proconfig = array['search_path=""']) then
      raise exception '072 §5: % must be SECURITY DEFINER with search_path pinned', v_sig;
    end if;
  end loop;
  select proacl::text into v_acl from pg_proc where oid = 'public.mint_gift_code()'::regprocedure;
  if v_acl is null or v_acl ~ 'anon=X' or v_acl ~ 'authenticated=X' or v_acl ~ 'service_role=X' or v_acl ~ '(^|[{,])=X' then
    raise exception '072 §5: mint_gift_code must be executable by the owner only — got %', v_acl;
  end if;
  -- The minter's shape, on a scratch value that is never stored.
  if public.mint_gift_code() !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{16}$' then
    raise exception '072 §5: mint_gift_code produced a code outside the 16-char alphabet';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §6  preview_meal_gift_public (S43) — the signed-out preview card
-- ═══════════════════════════════════════════════════════════════════════════
-- Returns exactly gift_id, title, attribution, ingredient_count, has_photo. Never the giver's
-- name, the household, ingredient names, steps, or any meal_photos path. An unknown code and a
-- revoked code return the same empty set, so the RPC can't be used to test whether a code
-- exists. The code's ~79 bits are its only rate limit (S43).

create or replace function public.preview_meal_gift_public(p_code text)
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

do $verify$
declare v_acl text;
begin
  select proacl::text into v_acl from pg_proc where oid = 'public.preview_meal_gift_public(text)'::regprocedure;
  if v_acl !~ 'anon=X' or v_acl !~ 'authenticated=X' or v_acl ~ 'service_role=X' or v_acl ~ '(^|[{,])=X' then
    raise exception '072 §6: preview_meal_gift_public ACL wrong — got %', v_acl;
  end if;
  if (select count(*) from public.preview_meal_gift_public('NOSUCHCODE')) <> 0 then
    raise exception '072 §6: an unknown code must return no row';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §7  gift_photo_readable (S35), gift_photo_writable (S41)
-- ═══════════════════════════════════════════════════════════════════════════
-- Under 068 anon holds no table grants and storage policies run as the calling role, so the
-- policies ask these definers instead of meal_gifts. Each reads one thing and returns a boolean.
-- Probe 2026-10-28 (dev, rolled back): anon saw exactly the live gift's object through this
-- shape; a non-uuid first segment neither errored nor leaked.

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

create or replace function public.gift_photo_writable(p_gift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (select 1 from public.meal_gifts g
                  where g.id = p_gift_id and g.revoked_at is null
                    and public.is_member_of(g.from_household_id))
$function$;
comment on function public.gift_photo_writable(uuid) is
  '072 — asked by the gift-photos INSERT policy (S41): true only for a live gift whose from_household_id the caller belongs to. EXECUTE to authenticated only.';

revoke all on function public.gift_photo_readable(uuid) from public, anon, authenticated, service_role;
revoke all on function public.gift_photo_writable(uuid) from public, anon, authenticated, service_role;
grant execute on function public.gift_photo_readable(uuid) to anon, authenticated;
grant execute on function public.gift_photo_writable(uuid) to authenticated;

do $verify$
declare v_acl text;
begin
  select proacl::text into v_acl from pg_proc where oid = 'public.gift_photo_readable(uuid)'::regprocedure;
  if v_acl !~ 'anon=X' or v_acl !~ 'authenticated=X' or v_acl ~ 'service_role=X' or v_acl ~ '(^|[{,])=X' then
    raise exception '072 §7: gift_photo_readable ACL wrong — got %', v_acl;
  end if;
  select proacl::text into v_acl from pg_proc where oid = 'public.gift_photo_writable(uuid)'::regprocedure;
  if v_acl ~ 'anon=X' or v_acl !~ 'authenticated=X' or v_acl ~ 'service_role=X' or v_acl ~ '(^|[{,])=X' then
    raise exception '072 §7: gift_photo_writable ACL wrong — got %', v_acl;
  end if;
  if public.gift_photo_readable(gen_random_uuid()) or public.gift_photo_writable(gen_random_uuid()) then
    raise exception '072 §7: a random uuid must not be readable or writable';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §8  accept_gift_photo (S36, S40)
-- ═══════════════════════════════════════════════════════════════════════════
-- The receiver's client copied the gift photo into ITS OWN household folder in meal-photos
-- (both renditions, a fresh uuid stem) and now records it. uploaded_by is the GIVER, derived
-- from the gift row — never an argument (S23, S36). Refuses the photo, never the meal (S40).

create or replace function public.accept_gift_photo(
  p_gift_id      uuid,
  p_household_id uuid,
  p_thumb_path   text,
  p_view_path    text,
  p_width        integer,
  p_height       integer
)
returns uuid
language plpgsql
volatile
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
  '072 — records the receiver''s copy of a gift photo (S36/S40): kind = showcase, uploaded_by = the GIVER (derived from the gift, never passed — S23), household = p_household_id (membership checked), meal = the receipt''s meal_id. Refuses the photo, never the meal: no receipt / non-member / foreign paths (42501, 22023), revoked gift or giver gone (55000). A second accept replaces. Never touches the cook cap. EXECUTE to authenticated only.';

revoke all on function public.accept_gift_photo(uuid, uuid, text, text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.accept_gift_photo(uuid, uuid, text, text, integer, integer) to authenticated;

do $verify$
declare v_acl text;
begin
  select proacl::text into v_acl from pg_proc where oid = 'public.accept_gift_photo(uuid, uuid, text, text, integer, integer)'::regprocedure;
  if v_acl !~ 'authenticated=X' or v_acl ~ 'anon=X' or v_acl ~ 'service_role=X' or v_acl ~ '(^|[{,])=X' then
    raise exception '072 §8: accept_gift_photo ACL wrong — got %', v_acl;
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.accept_gift_photo(uuid, uuid, text, text, integer, integer)'::regprocedure
                    and prosecdef and proconfig = array['search_path=""']) then
    raise exception '072 §8: accept_gift_photo must be SECURITY DEFINER with search_path pinned';
  end if;
  if (select pg_get_function_identity_arguments(oid) from pg_proc
       where oid = 'public.accept_gift_photo(uuid, uuid, text, text, integer, integer)'::regprocedure)
     <> 'p_gift_id uuid, p_household_id uuid, p_thumb_path text, p_view_path text, p_width integer, p_height integer' then
    raise exception '072 §8: accept_gift_photo argument order must be 065''s (p_thumb_path, p_view_path)';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §9  the gift-photos bucket and its policies (S34, S35, S41)
-- ═══════════════════════════════════════════════════════════════════════════
-- Private; webp only; 1 MB per object (065's limit). Paths {gift_id}/view.webp and
-- {gift_id}/thumb.webp — the gift id only, never a household id. SELECT for anon and
-- authenticated through gift_photo_readable; INSERT for authenticated through
-- gift_photo_writable, and only onto those two exact names. No UPDATE, no DELETE (clients
-- never upsert). The ::uuid cast sits behind a regex CASE guard, as 065's policies do.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gift-photos', 'gift-photos', false, 1048576, array['image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "gift photos readable while the gift is live" on storage.objects;
create policy "gift photos readable while the gift is live" on storage.objects
  for select to anon, authenticated
  using (
    case
      when bucket_id <> 'gift-photos' then false
      when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.gift_photo_readable(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

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

notify pgrst, 'reload schema';

do $verify$
begin
  if not exists (select 1 from storage.buckets where id = 'gift-photos' and public = false
                    and file_size_limit = 1048576 and allowed_mime_types = array['image/webp']) then
    raise exception '072 §9: gift-photos bucket missing or not private / webp / 1 MB';
  end if;
  if (select string_agg(cmd || ':' || (select string_agg(r, ',' order by r) from unnest(roles) r), ' ' order by cmd)
         from pg_policies
       where schemaname = 'storage' and tablename = 'objects' and policyname ilike 'gift photos%')
     <> 'INSERT:authenticated SELECT:anon,authenticated' then
    raise exception '072 §9: gift-photos policies are not exactly SELECT(anon, authenticated) + INSERT(authenticated)';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname ilike 'gift photos%'
                and coalesce(qual, '') || coalesce(with_check, '') ilike any (array['%owner%', '%auth.uid%'])) then
    raise exception '072 §9: a gift-photos policy uses owner / auth.uid (the 065 trap)';
  end if;
end
$verify$;

commit;

-- VERIFY — one row, after commit. Expect (dev):
--   which_db 7642734024280108049 · checked 52 · mismatches 0 · mismatch_detail '' ·
--   anon_fn_exec gift_photo_readable,preview_meal_gift_public · public_fn_exec '' ·
--   kind_default cook · showcase_idx true · trim_cook_only true · add_meal_photo_acl
--   {postgres=X/postgres,authenticated=X/postgres} · bucket_public false · bucket_mimes {image/webp} ·
--   storage_policies INSERT:authenticated SELECT:anon,authenticated · rls_on 2 · policies 2 ·
--   gifts 0 · receipts 0 · showcase_rows 0 (on first apply)
-- Prod: identical except which_db 7606130613603586966.
with fn_target (sig, anon_p, auth_p, svc_p) as (values
  ('public.mint_gift_code()',                                            '',        '',        ''),
  ('public.give_meal(uuid, text)',                                       '',        'EXECUTE', ''),
  ('public.preview_meal_gift(text, uuid)',                               '',        'EXECUTE', ''),
  ('public.record_meal_gift_receipt(text, uuid, uuid)',                  '',        'EXECUTE', ''),
  ('public.revoke_meal_gifts(uuid)',                                     '',        'EXECUTE', ''),
  ('public.preview_meal_gift_public(text)',                              'EXECUTE', 'EXECUTE', ''),
  ('public.gift_photo_readable(uuid)',                                   'EXECUTE', 'EXECUTE', ''),
  ('public.gift_photo_writable(uuid)',                                   '',        'EXECUTE', ''),
  ('public.add_showcase_photo(uuid, text, text, integer, integer)',      '',        'EXECUTE', ''),
  ('public.accept_gift_photo(uuid, uuid, text, text, integer, integer)', '',        'EXECUTE', ''),
  ('public.add_meal_photo(uuid, uuid, text, text, integer, integer)',    '',        'EXECUTE', '')
),
rel_target (obj, anon_p, auth_p, svc_p) as (values
  ('meal_gifts',         '', 'SELECT', 'ALL'),
  ('meal_gift_receipts', '', 'SELECT', 'ALL')
),
expected (kind, obj, grantee, privs) as (
  select 'rel', t.obj, v.grantee,
         case v.p when 'ALL' then 'DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE' else v.p end
    from rel_target t,
         lateral (values ('PUBLIC', ''), ('anon', t.anon_p), ('authenticated', t.auth_p), ('service_role', t.svc_p)) v (grantee, p)
  union all
  select 'fn', t.sig, v.grantee, v.p
    from fn_target t,
         lateral (values ('PUBLIC', ''), ('anon', t.anon_p), ('authenticated', t.auth_p), ('service_role', t.svc_p)) v (grantee, p)
),
actual as (
  select e.kind, e.obj, e.grantee, e.privs as want,
         coalesce(case e.kind
           when 'rel' then (select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                              from pg_class c, aclexplode(c.relacl) a
                             where c.oid = to_regclass('public.' || e.obj)
                               and a.grantee = case e.grantee when 'PUBLIC' then 0 else e.grantee::regrole::oid end)
           else           (select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                              from pg_proc p, aclexplode(p.proacl) a
                             where p.oid = to_regprocedure(e.obj)
                               and a.grantee = case e.grantee when 'PUBLIC' then 0 else e.grantee::regrole::oid end)
         end, '') as got,
         case e.kind when 'rel' then to_regclass('public.' || e.obj) is not null
                     else to_regprocedure(e.obj) is not null end as present
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
  (select trim(both '''' from replace(column_default, '::text', '')) from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_photos' and column_name = 'kind')        as kind_default,
  (select count(*) = 1 from pg_indexes where schemaname = 'public'
    and indexname = 'meal_photos_one_live_showcase_per_person')                                   as showcase_idx,
  (select prosrc ilike '%and kind = ''cook''%' from pg_proc
    where oid = 'public.add_meal_photo(uuid, uuid, text, text, integer, integer)'::regprocedure)  as trim_cook_only,
  (select proacl::text from pg_proc
    where oid = 'public.add_meal_photo(uuid, uuid, text, text, integer, integer)'::regprocedure)  as add_meal_photo_acl,
  (select public from storage.buckets where id = 'gift-photos')                                   as bucket_public,
  (select allowed_mime_types::text from storage.buckets where id = 'gift-photos')                 as bucket_mimes,
  (select string_agg(cmd || ':' || (select string_agg(r, ',' order by r) from unnest(roles) r), ' ' order by cmd)
     from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname ilike 'gift photos%')    as storage_policies,
  (select count(*) from pg_class where oid in ('public.meal_gifts'::regclass, 'public.meal_gift_receipts'::regclass)
    and relrowsecurity)                                                                           as rls_on,
  (select count(*) from pg_policies where schemaname = 'public'
    and tablename in ('meal_gifts', 'meal_gift_receipts'))                                        as policies,
  (select count(*) from public.meal_gifts)                                                        as gifts,
  (select count(*) from public.meal_gift_receipts)                                                as receipts,
  (select count(*) from public.meal_photos where kind = 'showcase')                               as showcase_rows;

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '072_meal_sharing_phase_a'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '072_meal_sharing_phase_a');
