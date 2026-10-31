-- 075_gift_giving_place.sql
-- SPEC_meal_sharing_phase_a_client.md — C11, the giving place opens its own gift (Dan, 2026-10-30).
-- When the signed-in arrival's target place IS the gift's own giving household, the client shows
-- "Already one of {Place}'s meals · Open it" instead of the form, and makes no copy. The client
-- cannot know that by itself: preview_meal_gift returns the snapshot, never the giving household.
-- So the SERVER says so — one boolean, computed from from_household_id = p_household_id. The
-- household id itself is never returned (Dan's rule; 051's shape: a foreign id never crosses).
--
-- STEP 0 (read-only, dev 7642734024280108049, 2026-10-30, after 074 — ledger 20261030210728):
--   * preview_meal_gift(p_code text, p_household_id uuid) returns jsonb with EXACTLY these keys:
--     gift_id, snapshot, note, already_added, has_photo, photo_ext (072 §5 + 074 §4). ACL
--     {postgres=X/postgres, authenticated=X/postgres}. STABLE, SECURITY DEFINER, search_path ''.
--     It raises 42501 before reading the gift when the caller is not a member of p_household_id;
--     P0002 unknown; 55000 revoked. It reads from_household_id into v_g (%rowtype) and never emits it.
--   * meal_gifts.source_meal_id → meals(id) ON DELETE SET NULL; meals are soft-deleted
--     (deleted_at), so the FK rarely fires — "the source meal still exists" means source_meal_id
--     is not null AND that meal is live (deleted_at is null, kind = 'meal') in from_household_id.
--     0 gifts on dev have a dangling source_meal_id.
--   * The snapshot's keys: attribution, base_servings, giver_first_name, ingredients, instructions,
--     name, occasion — no meal id. "Open it" therefore needs the server to name the source meal.
--     CORRECTION to the ruling's shape: beside is_giving_place, the RPC returns source_meal_id —
--     ONLY when is_giving_place is true and the meal is live, null otherwise. It is the caller's
--     own household's meal id (the caller is a member of it — that is what is_giving_place means),
--     never another household's row. The client opens it if it is in its own loaded meals; else
--     the line alone. Dan may strike the field; the boolean stands either way.
--   * record_meal_gift_receipt and accept_gift_photo do NOT refuse a same-place accept. Untouched
--     here (C11 is a client stop; the two same-place copies on dev — gifts 3fbd3dba and 2ebf925d,
--     receipts in their own giving household — are the walk's data, not a bug to repair).
--   * 7 gifts, 2 receipts (both same-place) on dev; preview_meal_gift_public untouched (its six
--     074 columns stay — a signed-out visitor has no place to compare).
--
-- WHAT — one section, one transaction, a VERIFY DO block, a definer-run fixture inside a
--   savepoint that is rolled back.
--   §1 preview_meal_gift: create or replace (same signature, same jsonb return — ACL kept). Two
--      keys join the result:
--        is_giving_place   boolean  from_household_id = p_household_id
--        source_meal_id    uuid     the live source meal, only when is_giving_place; else null
--      Everything else is 074 §4's body verbatim (membership first; P0002 / 55000; already_added;
--      has_photo = photo_ext is not null; photo_ext). Keys that return: gift_id, snapshot, note,
--      already_added, has_photo, photo_ext, is_giving_place, source_meal_id — eight, no household id.
--      Both already_added and is_giving_place can be true at once (a same-place copy was made
--      before C11 — the dev walk's shape); the client checks is_giving_place FIRST.
--
-- NOT IN 075
--   * preview_meal_gift_public (signed out — there is no place to compare).
--   * record_meal_gift_receipt / accept_gift_photo (no server refusal of a same-place accept —
--     the client no longer offers the form; a stop there is a separate ruling if wanted).
--   * Any src/ change — the client commit follows after this is on dev (C10 photo slot, C11 line,
--     the signed-out tab bar, the Wrap Up bar under sheets).
--
-- ERRORS: unchanged — 42501 not a member; P0002 unknown; 55000 revoked.
-- GRANTS: create or replace keeps the ACL (authenticated EXECUTE only); VERIFY reads it back
--   through aclexplode (information_schema is lossy on 17 — 072 §4).
-- SEARCH PATH: pinned to '' and schema-qualified (070's form).
-- FIXTURE: runs AS THE OWNER inside the transaction, in `savepoint fixture` … `rollback to
--   savepoint fixture`. A throw-away user in two households, a third it is not a member of, a
--   meal, a gift, a copy, two receipts. Impersonates through request.jwt.claims
--   (set_config …, is_local = true) and clears them. No real row is touched; nothing survives.
-- APPLY: dev (zxwtxjjmssykhqrghouf, 7642734024280108049) first, by Dan in the SQL editor:
--   PARSE CHECK first (075_gift_giving_place.PARSE_CHECK.sql — the final `commit;` replaced by
--   `rollback;`, the closing VERIFY SELECT moved above it) — expect every DO block to pass, the
--   fixture's NOTICE "9 checks passed", and the VERIFY row checked 4 · mismatches 0 ·
--   returns_giving_place true · returns_source_meal true · leaks_household_id false ·
--   keys_in_source 8 · public_fields gift_id,title,attribution,ingredient_count,has_photo,photo_ext ·
--   preview_secdef_pinned true · fixture_rows 0; after the rollback, the read-back shows the 074
--   body again (returns_giving_place false) … then the real run with `commit;`, the closing VERIFY
--   on the same identifier, and the ledger row below by hand. Prod (parpauldmbetptkmdwbd,
--   7606130613603586966) at Phase A's own promotion, after 072–074 and BEFORE the client; no
--   ledger on prod, by decision. Idempotent (create or replace). Run as postgres.
-- ROLLBACK: 075_rollback.sql — restores 074 §4's preview_meal_gift verbatim. No data to refuse
--   on (no table changed); a client at the C11 commit reads a missing is_giving_place as false
--   and opens the form, as before 075.
-- DRAFTED 2026-10-30 by Claude Code. NOT APPLIED.

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '075: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '075: run as postgres — current_user is %', current_user;
  end if;
  if to_regclass('public.meal_gifts') is null
     or to_regclass('public.meal_gift_receipts') is null
     or to_regprocedure('public.preview_meal_gift(text, uuid)') is null
     or to_regprocedure('public.mint_gift_code()') is null then
    raise exception '075: 072 (meal_gifts, meal_gift_receipts, preview_meal_gift, mint_gift_code) must be applied first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'meal_gifts' and column_name = 'photo_ext')
     or to_regprocedure('public.attach_gift_photo(uuid, text)') is null
     or not exists (select 1 from pg_proc where oid = 'public.preview_meal_gift(text, uuid)'::regprocedure
                      and prosrc ilike '%''photo_ext'',%') then
    raise exception '075: 074 (meal_gifts.photo_ext, attach_gift_photo, preview_meal_gift returning photo_ext) must be applied first';
  end if;
  if to_regprocedure('public.get_current_user_id()') is null or to_regprocedure('public.is_member_of(uuid)') is null then
    raise exception '075: get_current_user_id / is_member_of are missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'meals' and column_name = 'deleted_at') then
    raise exception '075: meals.deleted_at is missing — "the source meal still exists" is read from it';
  end if;
  raise notice '075: % gift(s), % receipt(s), % of them in the gift''s own giving household, before this apply',
    (select count(*) from public.meal_gifts),
    (select count(*) from public.meal_gift_receipts),
    (select count(*) from public.meal_gift_receipts r join public.meal_gifts g on g.id = r.gift_id
      where r.to_household_id = g.from_household_id);
end
$preflight$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §1  preview_meal_gift returns is_giving_place (+ source_meal_id for the giving place)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.preview_meal_gift(p_code text, p_household_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_g      public.meal_gifts%rowtype;
  v_meal   uuid;
  v_giving boolean;
  v_source uuid;
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

  -- 075 / C11: the target place is the gift's own giving household. The caller is a member of
  -- p_household_id (checked above), so the comparison reveals nothing about any other place.
  v_giving := (v_g.from_household_id = p_household_id);

  -- 075: the live source meal, named ONLY for the giving place (it is that place's own row);
  -- null when the meal is gone (soft-deleted, or the FK set the id to null) or for any other place.
  if v_giving and v_g.source_meal_id is not null then
    select m.id into v_source
      from public.meals m
     where m.id = v_g.source_meal_id
       and m.household_id = p_household_id
       and m.deleted_at is null
       and m.kind = 'meal';
  end if;

  return jsonb_build_object(
    'gift_id',         v_g.id,
    'snapshot',        v_g.snapshot,
    'note',            v_g.note,
    'already_added',   v_meal,                       -- null, or the copy's meal_id (V11)
    'has_photo',       v_g.photo_ext is not null,    -- 074: the server's mark, never a storage probe
    'photo_ext',       v_g.photo_ext,                -- 074: webp | jpg | null — the name to sign
    'is_giving_place', v_giving,                     -- 075 / C11: this place gave it
    'source_meal_id',  v_source);                    -- 075: the giving place's own live meal, else null
end
$function$;
comment on function public.preview_meal_gift(text, uuid) is
  '072/074/075 — the signed-in gift arrival (10-07): snapshot + note + already_added (the receipt''s meal_id for this place, or null) + gift_id, has_photo (= photo_ext is not null) and photo_ext so the client signs gift-photos/{gift_id}/view.{photo_ext} itself (S34, S43, S47); is_giving_place (C11: p_household_id is the gift''s own from_household_id — the id itself is never returned) and source_meal_id (the giving place''s live source meal, only when is_giving_place; else null). Membership in p_household_id first. not_found = P0002, revoked = 55000. EXECUTE to authenticated only.';

do $verify$
declare v_acl text; v_src text;
begin
  select proacl::text into v_acl from pg_proc where oid = 'public.preview_meal_gift(text, uuid)'::regprocedure;
  if v_acl !~ 'authenticated=X' or v_acl ~ 'anon=X' or v_acl ~ 'service_role=X' or v_acl ~ '(^|[{,])=X' then
    raise exception '075 §1: preview_meal_gift ACL changed — got %', v_acl;
  end if;
  select prosrc into v_src from pg_proc where oid = 'public.preview_meal_gift(text, uuid)'::regprocedure;
  if v_src not ilike '%''is_giving_place'',%' or v_src not ilike '%''source_meal_id'',%' then
    raise exception '075 §1: preview_meal_gift does not return is_giving_place / source_meal_id';
  end if;
  if v_src ilike '%''from_household_id'',%' or v_src ilike '%''to_household_id'',%' then
    raise exception '075 §1: preview_meal_gift emits a household id as a key';
  end if;
  if (select count(*) from regexp_matches(v_src, '''[a-z_]+'',\s', 'g')) <> 8 then
    raise exception '075 §1: preview_meal_gift must build exactly eight keys';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.preview_meal_gift(text, uuid)'::regprocedure
                    and prosecdef and provolatile = 's' and proconfig = array['search_path=""']) then
    raise exception '075 §1: preview_meal_gift must be SECURITY DEFINER, stable, search_path pinned to ''''';
  end if;
  if v_src ilike '%storage.objects%' then
    raise exception '075 §1: preview_meal_gift probes storage again';
  end if;
end
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIXTURE — definer-run, inside a savepoint, rolled back. A throw-away user, three households
-- (member of two), a meal, a gift, a copy, receipts. Probes the boolean, the source meal, the
-- key set, and that 072's refusals still stand. Nothing here survives.
-- ═══════════════════════════════════════════════════════════════════════════
savepoint fixture;

do $fixture$
declare
  v_tag    text := '075-fixture-' || gen_random_uuid()::text;
  v_user   uuid;
  v_hh     uuid;   -- the giving place
  v_hh2    uuid;   -- another place the user belongs to (the receiver)
  v_hh3    uuid;   -- a place the user does NOT belong to
  v_meal   uuid;   -- the source meal, in v_hh
  v_copy   uuid;   -- the receiver's copy, in v_hh2
  v_copy2  uuid;   -- a same-place copy, in v_hh (the dev walk's shape)
  v_snap   jsonb := '{"name":"075 fixture","attribution":"Fixture","ingredients":[{"name":"salt"}]}'::jsonb;
  v_code   text;
  v_gift   uuid;
  v_j      jsonb;
  v_keys   text;
  v_claims text;
  v_state  text;
begin
  insert into public.users (clerk_id, email, full_name) values (v_tag, v_tag || '@fixture.invalid', '075 Fixture') returning id into v_user;
  insert into public.households (name, created_by) values (v_tag, v_user) returning id into v_hh;
  insert into public.households (name, created_by) values (v_tag || '-other', v_user) returning id into v_hh2;
  insert into public.households (name, created_by) values (v_tag || '-foreign', v_user) returning id into v_hh3;
  insert into public.household_members (household_id, user_id) values (v_hh, v_user), (v_hh2, v_user);
  insert into public.meals (household_id, name, created_by) values (v_hh, v_tag, v_user) returning id into v_meal;
  v_code := public.mint_gift_code();
  insert into public.meal_gifts (code, from_household_id, given_by, source_meal_id, snapshot)
    values (v_code, v_hh, v_user, v_meal, v_snap) returning id into v_gift;

  -- Act as the user.
  v_claims := json_build_object('sub', v_tag, 'role', 'authenticated')::text;
  perform set_config('request.jwt.claims', v_claims, true);
  if public.get_current_user_id() <> v_user then
    raise exception '075 fixture: impersonation failed — get_current_user_id() is %', public.get_current_user_id();
  end if;

  -- (1) The giving place: is_giving_place true, source_meal_id = the live source meal, nothing added yet.
  v_j := public.preview_meal_gift(v_code, v_hh);
  if not (v_j ->> 'is_giving_place')::boolean or (v_j ->> 'source_meal_id')::uuid is distinct from v_meal or v_j -> 'already_added' <> 'null'::jsonb then
    raise exception '075 fixture (1): giving place got %', v_j - 'snapshot';
  end if;

  -- (2) Another place: false, source_meal_id null (the key is present, its value null), no household id anywhere.
  v_j := public.preview_meal_gift(v_code, v_hh2);
  if (v_j ->> 'is_giving_place')::boolean or v_j -> 'source_meal_id' <> 'null'::jsonb or not (v_j ? 'source_meal_id') then
    raise exception '075 fixture (2): other place got %', v_j - 'snapshot';
  end if;
  if v_j ? 'from_household_id' or v_j ? 'to_household_id' or v_j::text like '%' || v_hh::text || '%' then
    raise exception '075 fixture (2): the giving household id leaked into the result';
  end if;

  -- (3) The exact key set — eight keys, in whatever order jsonb keeps them.
  select string_agg(k, ',' order by k) into v_keys from jsonb_object_keys(v_j) k;
  if v_keys <> 'already_added,gift_id,has_photo,is_giving_place,note,photo_ext,snapshot,source_meal_id' then
    raise exception '075 fixture (3): keys are [%]', v_keys;
  end if;

  -- (4) A place the caller does not belong to → 42501, before anything about the gift is read.
  begin
    perform public.preview_meal_gift(v_code, v_hh3);
    raise exception '075 fixture (4): a foreign place did not raise';
  exception when sqlstate '42501' then null;
  end;

  -- (5) The source meal soft-deleted: still the giving place, but no meal to open.
  update public.meals set deleted_at = now() where id = v_meal;
  v_j := public.preview_meal_gift(v_code, v_hh);
  if not (v_j ->> 'is_giving_place')::boolean or v_j -> 'source_meal_id' <> 'null'::jsonb then
    raise exception '075 fixture (5): deleted source got %', v_j - 'snapshot';
  end if;
  update public.meals set deleted_at = null where id = v_meal;

  -- (6) The FK's SET NULL shape (source_meal_id null on the row): the same answer.
  update public.meal_gifts set source_meal_id = null where id = v_gift;
  v_j := public.preview_meal_gift(v_code, v_hh);
  if not (v_j ->> 'is_giving_place')::boolean or v_j -> 'source_meal_id' <> 'null'::jsonb then
    raise exception '075 fixture (6): null source got %', v_j - 'snapshot';
  end if;
  update public.meal_gifts set source_meal_id = v_meal where id = v_gift;

  -- (7) The receiver accepted: already_added = its copy; is_giving_place stays false.
  insert into public.meals (household_id, name, created_by) values (v_hh2, v_tag || '-copy', v_user) returning id into v_copy;
  insert into public.meal_gift_receipts (gift_id, to_household_id, accepted_by, meal_id) values (v_gift, v_hh2, v_user, v_copy);
  v_j := public.preview_meal_gift(v_code, v_hh2);
  if (v_j ->> 'already_added')::uuid is distinct from v_copy or (v_j ->> 'is_giving_place')::boolean then
    raise exception '075 fixture (7): receiver after accept got %', v_j - 'snapshot';
  end if;

  -- (8) A same-place copy made before C11 (the dev walk's shape): BOTH flags are reported; the
  --     client checks is_giving_place first and opens the SOURCE meal, not the copy.
  insert into public.meals (household_id, name, created_by) values (v_hh, v_tag || '-copy2', v_user) returning id into v_copy2;
  insert into public.meal_gift_receipts (gift_id, to_household_id, accepted_by, meal_id) values (v_gift, v_hh, v_user, v_copy2);
  v_j := public.preview_meal_gift(v_code, v_hh);
  if not (v_j ->> 'is_giving_place')::boolean or (v_j ->> 'source_meal_id')::uuid is distinct from v_meal or (v_j ->> 'already_added')::uuid is distinct from v_copy2 then
    raise exception '075 fixture (8): same-place copy got %', v_j - 'snapshot';
  end if;

  -- (9) 072's refusals still stand: unknown → P0002; revoked → 55000 (for the giving place too).
  begin
    perform public.preview_meal_gift('NOSUCHCODE000000', v_hh);
    raise exception '075 fixture (9): an unknown code did not raise';
  exception when sqlstate 'P0002' then null;
  end;
  update public.meal_gifts set revoked_at = now() where id = v_gift;
  begin
    perform public.preview_meal_gift(v_code, v_hh);
    raise exception '075 fixture (9): a revoked gift did not raise';
  exception when sqlstate '55000' then null;
  end;

  perform set_config('request.jwt.claims', '', true);
  select current_setting('request.jwt.claims', true) into v_state;
  if coalesce(v_state, '') <> '' then raise exception '075 fixture: claims not cleared'; end if;
  raise notice '075 fixture: 9 checks passed (rolled back next)';
end
$fixture$;

rollback to savepoint fixture;
release savepoint fixture;

notify pgrst, 'reload schema';

commit;

-- VERIFY — one row, after commit. Expect (dev):
--   which_db 7642734024280108049 · checked 4 · mismatches 0 · mismatch_detail '' ·
--   returns_giving_place true · returns_source_meal true · leaks_household_id false · keys_in_source 8 ·
--   probes_storage false · preview_secdef_pinned true ·
--   public_fields gift_id,title,attribution,ingredient_count,has_photo,photo_ext (074's, untouched) ·
--   gifts / receipts / same_place_receipts (as the preflight notice: 7 / 2 / 2 on dev, 10-30) · fixture_rows 0
-- Prod: identical except which_db 7606130613603586966 and the counts.
with expected (grantee, want) as (values ('PUBLIC', ''), ('anon', ''), ('authenticated', 'EXECUTE'), ('service_role', '')),
actual as (
  select e.grantee, e.want,
         coalesce((select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                     from pg_proc p, aclexplode(p.proacl) a
                    where p.oid = to_regprocedure('public.preview_meal_gift(text, uuid)')
                      and a.grantee = case e.grantee when 'PUBLIC' then 0 else e.grantee::regrole::oid end), '') as got
    from expected e
),
src as (select prosrc from pg_proc where oid = to_regprocedure('public.preview_meal_gift(text, uuid)'))
select
  (select system_identifier from pg_control_system())::text                                       as which_db,
  (select count(*) from actual)                                                                   as checked,
  (select count(*) from actual where got <> want)                                                 as mismatches,
  (select coalesce(string_agg(grantee || ' want [' || want || '] got [' || got || ']', '; ' order by grantee), '')
     from actual where got <> want)                                                               as mismatch_detail,
  (select prosrc ilike '%''is_giving_place'',%' from src)                                         as returns_giving_place,
  (select prosrc ilike '%''source_meal_id'',%' from src)                                          as returns_source_meal,
  (select prosrc ilike '%''from_household_id'',%' or prosrc ilike '%''to_household_id'',%' from src) as leaks_household_id,
  (select count(*) from src, regexp_matches(prosrc, '''[a-z_]+'',\s', 'g'))                       as keys_in_source,
  (select prosrc ilike '%storage.objects%' from src)                                              as probes_storage,
  (select prosecdef and provolatile = 's' and proconfig = array['search_path=""'] from pg_proc
    where oid = to_regprocedure('public.preview_meal_gift(text, uuid)'))                           as preview_secdef_pinned,
  (select string_agg(a.attname, ',' order by a.ord)
     from pg_proc p, unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, mode, ord)
    where p.oid = to_regprocedure('public.preview_meal_gift_public(text)') and a.mode = 't')       as public_fields,
  (select count(*) from public.meal_gifts)                                                        as gifts,
  (select count(*) from public.meal_gift_receipts)                                                as receipts,
  (select count(*) from public.meal_gift_receipts r join public.meal_gifts g on g.id = r.gift_id
    where r.to_household_id = g.from_household_id)                                                as same_place_receipts,
  (select count(*) from public.users where clerk_id like '075-fixture-%')
  + (select count(*) from public.households where name like '075-fixture-%')
  + (select count(*) from public.meals where name like '075-fixture-%')                           as fixture_rows;

-- LEDGER (dev only). The version is the apply time in UTC, like every other row in the ledger.
-- insert into supabase_migrations.schema_migrations (version, name)
-- select '<YYYYMMDDHHMMSS>', '075_gift_giving_place'
-- where not exists (select 1 from supabase_migrations.schema_migrations where name = '075_gift_giving_place');
