-- 075_rollback.sql — NEVER APPLIED unless 075 must be undone.
-- SPEC_meal_sharing_phase_a_client.md C11 (the giving place opens its own gift, Dan 2026-10-30).
--
-- Undoes 075_gift_giving_place.sql: preview_meal_gift back to 074 §4's body, verbatim (six keys:
-- gift_id, snapshot, note, already_added, has_photo, photo_ext). Nothing else — 075 touched no
-- table, no grant, no other function, no policy.
--
-- REFUSES nothing: there is no data this rollback could strand. A client at the C11 commit reads
--   the missing is_giving_place as false and opens the form, as before 075 (the pre-C11 behaviour
--   — a same-place copy can be made again). Roll the client back too if that matters.
--
-- Run as postgres, dev 7642734024280108049 or prod 7606130613603586966.
-- Then remove the dev ledger row by hand: delete from supabase_migrations.schema_migrations
-- where name = '075_gift_giving_place';

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '075_rollback: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '075_rollback: run as postgres — current_user is %', current_user;
  end if;
  if to_regprocedure('public.preview_meal_gift(text, uuid)') is null then
    raise exception '075_rollback: preview_meal_gift is missing — 072 / 074 must be in place';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.preview_meal_gift(text, uuid)'::regprocedure
                  and prosrc ilike '%''is_giving_place'',%') then
    raise notice '075_rollback: preview_meal_gift does not carry is_giving_place — 075 is already undone (re-asserting 074''s body anyway)';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'meal_gifts' and column_name = 'photo_ext') then
    raise exception '075_rollback: meal_gifts.photo_ext is missing — 074''s body cannot be restored over a 072 schema; run 074 first or 074_rollback''s preview instead';
  end if;
end
$preflight$;

-- §1  preview_meal_gift — 074 §4's body, verbatim. ACL kept by create or replace.
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
declare v_acl text; v_src text;
begin
  select proacl::text into v_acl from pg_proc where oid = 'public.preview_meal_gift(text, uuid)'::regprocedure;
  if v_acl !~ 'authenticated=X' or v_acl ~ 'anon=X' or v_acl ~ 'service_role=X' or v_acl ~ '(^|[{,])=X' then
    raise exception '075_rollback: preview_meal_gift ACL changed — got %', v_acl;
  end if;
  select prosrc into v_src from pg_proc where oid = 'public.preview_meal_gift(text, uuid)'::regprocedure;
  if v_src ilike '%is_giving_place%' or v_src ilike '%source_meal_id%' then
    raise exception '075_rollback: preview_meal_gift still carries is_giving_place / source_meal_id';
  end if;
  if (select count(*) from regexp_matches(v_src, '''[a-z_]+'',\s', 'g')) <> 6 then
    raise exception '075_rollback: preview_meal_gift must build exactly six keys again';
  end if;
  if v_src not ilike '%''photo_ext'',%' then
    raise exception '075_rollback: preview_meal_gift lost 074''s photo_ext';
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;

-- VERIFY — one row, after commit. Expect: which_db as above · returns_giving_place false ·
--   keys_in_source 6 · returns_photo_ext true · authenticated_only true · gifts / receipts unchanged.
select
  (select system_identifier from pg_control_system())::text                                       as which_db,
  (select prosrc ilike '%''is_giving_place'',%' from pg_proc
    where oid = to_regprocedure('public.preview_meal_gift(text, uuid)'))                           as returns_giving_place,
  (select count(*) from pg_proc p, regexp_matches(p.prosrc, '''[a-z_]+'',\s', 'g')
    where p.oid = to_regprocedure('public.preview_meal_gift(text, uuid)'))                         as keys_in_source,
  (select prosrc ilike '%''photo_ext'',%' from pg_proc
    where oid = to_regprocedure('public.preview_meal_gift(text, uuid)'))                           as returns_photo_ext,
  (select coalesce(string_agg(distinct a.grantee::regrole::text, ',' order by a.grantee::regrole::text), '') = 'authenticated,postgres'
     from pg_proc p, aclexplode(p.proacl) a
    where p.oid = to_regprocedure('public.preview_meal_gift(text, uuid)'))                         as authenticated_only,
  (select count(*) from public.meal_gifts)                                                        as gifts,
  (select count(*) from public.meal_gift_receipts)                                                as receipts;
