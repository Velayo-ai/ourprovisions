-- 066_meal_cook_ratings.sql
-- SPEC_meal_photos_v1.md — slice 2, the 2026-10-21 amendment S1 / S2 (per-person ratings
-- confirmed by Dan 19:05). Replaces A5's rating + note columns on meal_cooks.
--
-- WHY
--   Each household member rates a cook for themselves. A5's two columns on meal_cooks let a
--   second rater overwrite the first — and the disagreement ("Dan loves it, Helen doesn't")
--   is the signal. No vote is not a rating: a cleared rating leaves no row. No averages,
--   anywhere (S1, S7) — nothing here computes one.
--
-- WHAT
--   1. public.meal_cook_ratings — one row per (cook, person): rating 1–3 or null, an optional
--      note (≤ 200 chars), updated_at. Unique (meal_cook_id, user_id). RLS on, SELECT for
--      members, NO direct writes.
--   2. rate_cook(p_cook_id uuid, p_rating smallint, p_note text) → uuid. SECURITY DEFINER,
--      search_path pinned, EXECUTE to authenticated only.
--      * membership of the COOK's household first (42501) — an unknown cook reads the same;
--      * the caller is get_current_user_id(), never a parameter: it writes ONLY the caller's
--        own row, so no member can write another member's rating;
--      * household_id comes from the cook, never the client;
--      * the note is trimmed; blank = null. Rating and note both null → the caller's row is
--        DELETED (no vote is not a rating) and the function returns null; otherwise upsert and
--        return the row id. A note with no rating is allowed;
--      * a rating outside 1–3 or a note over 200 chars → 22023 (the CHECKs stay as the floor).
--   cook_meal is NOT touched; meal_cooks gets no new columns (S2). Who's cooking adds its own.
--
-- FKs: household_id → households, meal_cook_id → meal_cooks, user_id → users — all CASCADE
--   (a rating has no meaning without its cook, its household or its person). Nothing
--   references meal_cook_ratings.
--
-- GRANTS — explicit for every role (the standing 2026-10-30 rule): revoke from public, anon,
--   authenticated, service_role; then authenticated SELECT, service_role ALL, anon nothing.
--   VERIFY reads all three back; its probes are case-insensitive (the 060 lesson).
--
-- APPLY: dev only (system_identifier 7642734024280108049). Prod HELD with slice 1. Idempotent.
--   APPLIED ON DEV 2026-10-21 by Dan in the SQL editor together with its ledger row
--   (20261021232455) — the MCP's apply_migration returned {"status":"declined"} again. VERIFY read
--   back exact over the dev MCP (relacl postgres=arwdDxtm, authenticated=r, service_role=arwdDxtm;
--   cook_meal md5 2b4e1e92… unchanged). Probes (DO block ending in RAISE, nothing persists):
--   DH 3 + "  double the garlic  " → one own row, note trimmed; DH 2 → the same row; DT 1 → a second
--   row, DH's unchanged; DT clears both (null, "   ") → DT's row deleted, returns null, DH's kept;
--   a note with no rating allowed; rating 4 / a 201-char note → 22023; a member's direct INSERT,
--   UPDATE (on another's row) and DELETE → 42501; a member sees both rows; a non-member → 42501
--   and sees 0; an unknown cook → 42501; anon → 42501 on rate_cook and SELECT.

begin;

-- ── 1. meal_cook_ratings ────────────────────────────────────────────────
create table if not exists public.meal_cook_ratings (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null references public.households(id) on delete cascade,
  meal_cook_id uuid        not null references public.meal_cooks(id) on delete cascade,
  user_id      uuid        not null references public.users(id) on delete cascade,
  rating       smallint    null check (rating between 1 and 3),
  note         text        null check (char_length(note) <= 200),
  updated_at   timestamptz not null default now(),
  constraint meal_cook_ratings_one_per_person unique (meal_cook_id, user_id)
);
comment on table public.meal_cook_ratings is
  '066 — one household member''s rating of one cook (SPEC_meal_photos_v1, 2026-10-21 amendment S1/S2): rating 1–3 or null, an optional note ≤ 200 chars. Per person: nobody''s vote replaces anyone else''s. No vote is not a rating — a cleared rating is a deleted row. Nothing averages these (S7). Writes ONLY through rate_cook (SECURITY DEFINER, caller from the JWT). Notes are household-only, always (S7).';

create index if not exists meal_cook_ratings_household_cook_idx
  on public.meal_cook_ratings (household_id, meal_cook_id);

alter table public.meal_cook_ratings enable row level security;

revoke all on table public.meal_cook_ratings from public;
revoke all on table public.meal_cook_ratings from anon;
revoke all on table public.meal_cook_ratings from authenticated;
revoke all on table public.meal_cook_ratings from service_role;
grant select on table public.meal_cook_ratings to authenticated;
grant all on table public.meal_cook_ratings to service_role;

drop policy if exists meal_cook_ratings_select on public.meal_cook_ratings;
create policy meal_cook_ratings_select on public.meal_cook_ratings
  for select to authenticated
  using (public.is_member_of(household_id));

-- ── 2. rate_cook ────────────────────────────────────────────────────────
create or replace function public.rate_cook(p_cook_id uuid, p_rating smallint, p_note text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_hh     uuid;
  v_caller uuid;
  v_note   text;
  v_id     uuid;
begin
  -- Membership of the COOK's household FIRST; an unknown cook reads exactly like a foreign one.
  select c.household_id into v_hh from meal_cooks c where c.id = p_cook_id;
  if v_hh is null or not is_member_of(v_hh) then
    raise exception 'rate_cook: not a member of the cook''s household' using errcode = '42501';
  end if;

  -- The caller from the JWT, never from an argument: only the caller's own row is written.
  v_caller := get_current_user_id();
  if v_caller is null then
    raise exception 'rate_cook: no user for the JWT subject' using errcode = '42501';
  end if;

  if p_rating is not null and (p_rating < 1 or p_rating > 3) then
    raise exception 'rate_cook: a rating is 1, 2 or 3' using errcode = '22023';
  end if;
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'rate_cook: a note is at most 200 characters' using errcode = '22023';
  end if;

  -- No vote is not a rating: nothing left → no row.
  if p_rating is null and v_note is null then
    delete from meal_cook_ratings where meal_cook_id = p_cook_id and user_id = v_caller;
    return null;
  end if;

  insert into meal_cook_ratings (household_id, meal_cook_id, user_id, rating, note, updated_at)
  values (v_hh, p_cook_id, v_caller, p_rating, v_note, now())
  on conflict (meal_cook_id, user_id) do update
     set rating = excluded.rating, note = excluded.note, updated_at = excluded.updated_at
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.rate_cook(uuid, smallint, text) from public;
revoke all on function public.rate_cook(uuid, smallint, text) from anon;
revoke all on function public.rate_cook(uuid, smallint, text) from service_role;
grant execute on function public.rate_cook(uuid, smallint, text) to authenticated;

commit;

-- VERIFY — one row. Expect:
--   which_db 7642734024280108049 · rls_on true · policies 1 · grants_public '' · grants_anon '' ·
--   grants_authenticated SELECT · service_role_all true · unique_cook_user true ·
--   fn_acl_auth true · fn_acl_anon false · fn_acl_public false · fn_acl_service false ·
--   secdef true · search_path true · meal_cooks_untouched true · cook_meal_md5 2b4e1e92e87c5a2138e6c004f5e8f7e1 · rows 0
select
  (select system_identifier from pg_control_system())                                               as which_db,
  (select relrowsecurity from pg_class where oid = 'public.meal_cook_ratings'::regclass)            as rls_on,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'meal_cook_ratings') as policies,
  (select coalesce(string_agg(privilege_type, ',' order by privilege_type), '') from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'meal_cook_ratings' and grantee ilike 'public')        as grants_public,
  (select coalesce(string_agg(privilege_type, ',' order by privilege_type), '') from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'meal_cook_ratings' and grantee ilike 'anon')          as grants_anon,
  (select coalesce(string_agg(privilege_type, ',' order by privilege_type), '') from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'meal_cook_ratings' and grantee ilike 'authenticated') as grants_authenticated,
  (select count(*) >= 4 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'meal_cook_ratings' and grantee ilike 'service_role'
       and privilege_type ilike any (array['select', 'insert', 'update', 'delete']))                  as service_role_all,
  (select exists (select 1 from pg_constraint where conrelid = 'public.meal_cook_ratings'::regclass and contype = 'u'
       and pg_get_constraintdef(oid) ilike '%(meal_cook_id, user_id)%'))                              as unique_cook_user,
  (select proacl::text ilike '%authenticated=X%' from pg_proc where oid = 'public.rate_cook(uuid,smallint,text)'::regprocedure) as fn_acl_auth,
  (select proacl::text ilike '%anon=X%'          from pg_proc where oid = 'public.rate_cook(uuid,smallint,text)'::regprocedure) as fn_acl_anon,
  (select proacl::text ~ '(^|[{,])=X'            from pg_proc where oid = 'public.rate_cook(uuid,smallint,text)'::regprocedure) as fn_acl_public,
  (select proacl::text ilike '%service_role=X%'  from pg_proc where oid = 'public.rate_cook(uuid,smallint,text)'::regprocedure) as fn_acl_service,
  (select prosecdef from pg_proc where oid = 'public.rate_cook(uuid,smallint,text)'::regprocedure)                              as secdef,
  (select proconfig::text ilike '%search_path=public, extensions%' from pg_proc where oid = 'public.rate_cook(uuid,smallint,text)'::regprocedure) as search_path,
  (select string_agg(column_name, ',' order by ordinal_position) = 'id,household_id,meal_id,cooked_at,cooked_by'
     from information_schema.columns where table_schema = 'public' and table_name = 'meal_cooks')    as meal_cooks_untouched,
  (select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = 'public.cook_meal(uuid,uuid)'::regprocedure) as cook_meal_md5,
  (select count(*) from public.meal_cook_ratings)                                                   as rows;
