-- 054_store_identity.sql
-- SPEC_store_identity.md — global store identity, the household link, and the
-- resolver that creates both. Phase 2 prerequisite; the layout learner is a
-- separate spec and does not exist yet.
--
-- WHY
--   Capture works (GPS + store_name_raw reach the session) and match_known_store
--   exists, but nothing has ever promoted a raw name into a store row: 0 rows in
--   known_stores on both databases, store_id never set on any session. The
--   matcher has an empty table by construction. This is the missing half of the
--   handshake. Everything store-shaped (053's Anchored leg, any layout) waits on it.
--
-- THE TWO DECISIONS THAT ARE THE WHOLE SPEC (do not erode):
--   D3  stores carries NO household and NO user column — not created_by, not an
--       audit column. A store is a public place, but who created the row reveals
--       where a household shops. Absent beats restricted: an unwanted column
--       cannot leak; a policy can be misread later.
--   D5  resolve_store is the ONLY write path. No client INSERT on stores, no policy
--       that would permit one. is_member_of first (42501), search_path pinned,
--       ACL to authenticated only, per 051.
--
-- SHAPE (D1, D2)
--   stores        a real-world place: canonical_name, chain_slug, lat/lng (nullable),
--                 timestamps, deleted_at. SELECT to authenticated; no other policy.
--   known_stores  the household ↔ store link (already household-scoped, RLS via
--                 is_member_of — the 014 repair, confirmed live 2026-09-20). Gains
--                 store_id → stores(id). lat/lng go NULLABLE: a link with null geo
--                 means "we know you shop here by name; we don't know where it is"
--                 — a legitimate state, not a defect, and it upgrades itself (below).
--                 visit_count and last_visited_at are REUSED — the resolver maintains
--                 them. confirmed_by_receipt is the Phase 3 forward-reference: untouched.
--   shopping_sessions.store_id keeps pointing at known_stores (session → link → store).
--
-- THE LADDER (D7) — geo first, name second, and only within reach.
--   With GPS:     (1) a live store with coordinates within c_match_m wins;
--                 (2) else a live store within c_nearby_m whose normalized name
--                     matches; (3) else this household's own link by name — accepted
--                     only if its store has no geo yet or is within reach;
--                 (4) else create.
--   Without GPS:  match ONLY this household's own known_stores history by name —
--                 NEVER the global table (a name-only global match would merge
--                 Market Basket Madbury with a Market Basket three states away);
--                 else create a store with null geo. 3 of 25 prod sessions carry
--                 GPS, so this is the PRIMARY case, not the fallback.
--   Progressive enrichment: when a GPS-bearing call resolves to a store (or link)
--   whose coordinates are null, fill them in. Nothing is asked of the user.
--   Duplicates are accepted and merged later (D8); a disambiguation prompt is a
--   question, which this spec exists to avoid.
--   chain_slug (D4): lower-case, store numbers ("#23", bare numbers) removed,
--   non-alphanumerics collapsed to '-'. "Market Basket #23" / "MARKET BASKET" →
--   market-basket. Location suffixes are NOT stripped in v1 ("Market Basket
--   Madbury" → market-basket-madbury) — a wrong slug only weakens a prior.
--
-- match_known_store is KEPT, not wired and not dropped here: resolve_store
--   supersedes it. Retiring it is its own NEXT item once resolve_store is proven
--   on prod — dropping a function in the migration that adds two tables and an
--   RPC is stacking.
--
-- NUMBER: 054 from the live catalog high-water mark (053 on both databases).
-- APPLY: dev first via the MCP; verification by migrations/fixtures/
--   054_store_identity_verify_dev.sql (impersonates fixture members inside one
--   transaction via request.jwt.claims — reads, never a trusted 2xx). Prod by
--   hand in the SQL editor under its own authorization.

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. stores — a place. No household, no user, no creator. Ever.
-- ─────────────────────────────────────────────────────────────────────
create table public.stores (
  id             uuid        primary key default gen_random_uuid(),
  canonical_name text        not null,
  chain_slug     text,
  lat            double precision,
  lng            double precision,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint stores_geo_both_or_neither check ((lat is null) = (lng is null))
);

comment on table public.stores is
  '054 — a real-world store (SPEC_store_identity.md D1). Global identity only: NO household or user column, ever (D3 — who created the row would reveal where a household shops). Written ONLY by resolve_store (D5). Household naming/history lives on known_stores, never here (D6).';
comment on column public.stores.chain_slug is
  '054 D4 — normalized chain key for priors (group by chain_slug), derived by resolve_store. A heuristic: wrong slug only weakens a prior, never misroutes a household''s own data.';
comment on column public.stores.lat is
  '054 — nullable. Null geo = created from a name-only visit; resolve_store fills it in from the first GPS-bearing visit (progressive enrichment).';

create index idx_stores_chain_slug on public.stores (chain_slug) where deleted_at is null;
create index idx_stores_lat_lng   on public.stores (lat, lng)   where deleted_at is null and lat is not null;

alter table public.stores enable row level security;

create policy stores_select on public.stores
  for select to authenticated
  using (deleted_at is null);
-- NO insert / update / delete policy. Writes happen only inside resolve_store (D5).

-- Grants are load-bearing (046 lesson): revoke from all four by name, then grant
-- back exactly SELECT to authenticated. service_role is revoked per the spec.
revoke all on table public.stores from public;
revoke all on table public.stores from anon;
revoke all on table public.stores from authenticated;
revoke all on table public.stores from service_role;
grant select on table public.stores to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 2. known_stores — the household ↔ store link. Existing RLS untouched.
-- ─────────────────────────────────────────────────────────────────────
alter table public.known_stores
  add column if not exists store_id uuid references public.stores(id);

alter table public.known_stores alter column lat drop not null;
alter table public.known_stores alter column lng drop not null;
alter table public.known_stores
  add constraint known_stores_geo_both_or_neither check ((lat is null) = (lng is null));

create index idx_known_stores_store on public.known_stores (store_id) where deleted_at is null;

comment on column public.known_stores.store_id is
  '054 — the global store this household relationship points at (D1/D2: session → known_stores → stores). Set only by resolve_store. Nullable during transition; every row the resolver creates has it.';
comment on column public.known_stores.lat is
  '054 — NULLABLE since 054. A known_stores row with null geo means "we know you shop here by name; we don''t know where it is." A legitimate state, not a defect — it upgrades itself: when a later GPS-bearing session resolves to the same store, resolve_store fills the coordinates in. Progressive enrichment, no question asked of the user.';
comment on column public.known_stores.visit_count is
  'Maintained by resolve_store since 054 (+1 per resolved visit). Pre-existing column, reused not duplicated.';
comment on column public.known_stores.last_visited_at is
  'Maintained by resolve_store since 054. Pre-existing column, reused not duplicated.';

-- ─────────────────────────────────────────────────────────────────────
-- 3. resolve_store — the only write path to stores and to known_stores.store_id.
--    SUPERSEDES match_known_store (kept, unwired; retire separately).
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.resolve_store(
  p_household_id uuid,
  p_name_raw     text,
  p_lat          double precision default null,
  p_lng          double precision default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  -- Reach, in metres. Named here so tuning is one line each.
  c_match_m   constant double precision := 200;    -- geo-first: a store this close IS this store
  c_nearby_m  constant double precision := 2000;   -- name-second: only stores within reach may match by name
  v_user_id    uuid;
  v_name       text;
  v_norm       text;
  v_slug       text;
  v_has_gps    boolean;
  v_store_id   uuid;
  v_store_lat  double precision;
  v_store_lng  double precision;
  v_link_id    uuid;
  v_link_store uuid;
  v_link_lat   double precision;
begin
  -- 051: membership first, always.
  if not is_member_of(p_household_id) then
    raise exception 'resolve_store: not a member of household %', p_household_id using errcode = '42501';
  end if;
  v_user_id := get_current_user_id();

  v_name := nullif(regexp_replace(btrim(coalesce(p_name_raw, '')), '\s+', ' ', 'g'), '');
  if v_name is null then
    raise exception 'resolve_store: a store name is required' using errcode = '22023';
  end if;
  v_norm    := lower(v_name);
  v_has_gps := p_lat is not null and p_lng is not null;
  -- D4 chain slug: lower, drop "#23" / bare store numbers, collapse to '-'.
  v_slug := nullif(btrim(regexp_replace(
              regexp_replace(regexp_replace(v_norm, '#\s*\d+', ' ', 'g'), '\m\d+\M', ' ', 'g'),
              '[^a-z0-9]+', '-', 'g'), '-'), '');

  -- One resolution per household at a time: a repeat visit racing itself must
  -- land on one row, not two (idempotence under concurrency).
  perform pg_advisory_xact_lock(hashtext('resolve_store:' || p_household_id::text));

  -- This household's own history by name (used by both branches; D6 — the
  -- household's label is the one it typed).
  select ks.id, ks.store_id, ks.lat
    into v_link_id, v_link_store, v_link_lat
    from known_stores ks
   where ks.household_id = p_household_id
     and ks.deleted_at is null
     and lower(regexp_replace(btrim(ks.name), '\s+', ' ', 'g')) = v_norm
   order by ks.last_visited_at desc nulls last, ks.created_at
   limit 1;

  if v_has_gps then
    -- (1) geo first: the nearest live store with coordinates within c_match_m.
    select s.id, s.lat, s.lng into v_store_id, v_store_lat, v_store_lng
      from stores s
     where s.deleted_at is null and s.lat is not null
       and s.lat between p_lat - 0.05 and p_lat + 0.05
       and s.lng between p_lng - 0.05 and p_lng + 0.05
       and sqrt(power((s.lat - p_lat) * 111320, 2)
              + power((s.lng - p_lng) * 111320 * cos(radians(p_lat)), 2)) <= c_match_m
     order by sqrt(power((s.lat - p_lat) * 111320, 2)
                 + power((s.lng - p_lng) * 111320 * cos(radians(p_lat)), 2))
     limit 1;

    -- (2) name second, only within reach: a live store within c_nearby_m whose
    --     normalized canonical name matches.
    if v_store_id is null then
      select s.id, s.lat, s.lng into v_store_id, v_store_lat, v_store_lng
        from stores s
       where s.deleted_at is null and s.lat is not null
         and lower(regexp_replace(btrim(s.canonical_name), '\s+', ' ', 'g')) = v_norm
         and s.lat between p_lat - 0.05 and p_lat + 0.05
         and s.lng between p_lng - 0.05 and p_lng + 0.05
         and sqrt(power((s.lat - p_lat) * 111320, 2)
                + power((s.lng - p_lng) * 111320 * cos(radians(p_lat)), 2)) <= c_nearby_m
       order by sqrt(power((s.lat - p_lat) * 111320, 2)
                   + power((s.lng - p_lng) * 111320 * cos(radians(p_lat)), 2))
       limit 1;
    end if;

    -- (3) this household's own link by name — accepted only if its store has no
    --     geo yet (it is about to be enriched) or is within reach.
    if v_store_id is null and v_link_store is not null then
      select s.id, s.lat, s.lng into v_store_id, v_store_lat, v_store_lng
        from stores s
       where s.id = v_link_store and s.deleted_at is null
         and (s.lat is null
              or sqrt(power((s.lat - p_lat) * 111320, 2)
                    + power((s.lng - p_lng) * 111320 * cos(radians(p_lat)), 2)) <= c_nearby_m);
    end if;
  else
    -- Without GPS: this household's own history ONLY. Never the global table.
    if v_link_store is not null then
      select s.id, s.lat, s.lng into v_store_id, v_store_lat, v_store_lng
        from stores s where s.id = v_link_store and s.deleted_at is null;
    end if;
  end if;

  -- (4) create the place. No household, no user. Null geo without GPS.
  if v_store_id is null then
    insert into stores (canonical_name, chain_slug, lat, lng)
    values (v_name, v_slug,
            case when v_has_gps then p_lat end,
            case when v_has_gps then p_lng end)
    returning id, lat, lng into v_store_id, v_store_lat, v_store_lng;
  elsif v_store_lat is null and v_has_gps then
    -- Progressive enrichment: the place was known by name only; now we know where.
    update stores set lat = p_lat, lng = p_lng, updated_at = now() where id = v_store_id;
  end if;

  -- The household's link to that store: reuse (by store, else the name-matched
  -- legacy row with no store_id), maintaining visit_count / last_visited_at and
  -- enriching null geo; else create with the household's own label.
  select ks.id, ks.lat into v_link_id, v_link_lat
    from known_stores ks
   where ks.household_id = p_household_id and ks.deleted_at is null and ks.store_id = v_store_id
   order by ks.last_visited_at desc nulls last, ks.created_at
   limit 1;

  if v_link_id is null and v_link_store is null then
    -- name-matched history row that predates 054 (no store_id yet): adopt it
    select ks.id, ks.lat into v_link_id, v_link_lat
      from known_stores ks
     where ks.household_id = p_household_id and ks.deleted_at is null and ks.store_id is null
       and lower(regexp_replace(btrim(ks.name), '\s+', ' ', 'g')) = v_norm
     limit 1;
  end if;

  if v_link_id is not null then
    update known_stores
       set store_id        = v_store_id,
           visit_count     = coalesce(visit_count, 0) + 1,
           last_visited_at = now(),
           lat             = case when lat is null and v_has_gps then p_lat else lat end,
           lng             = case when lng is null and v_has_gps then p_lng else lng end,
           chain           = coalesce(chain, v_slug),
           updated_at      = now()
     where id = v_link_id;
  else
    insert into known_stores (household_id, store_id, name, chain, lat, lng, visit_count, last_visited_at, added_by)
    values (p_household_id, v_store_id, v_name, v_slug,
            case when v_has_gps then p_lat end,
            case when v_has_gps then p_lng end,
            1, now(), v_user_id)
    returning id into v_link_id;
  end if;

  return v_link_id;
end;
$function$;

comment on function public.resolve_store(uuid, text, double precision, double precision) is
  '054 — the ONLY write path to stores and to known_stores.store_id (D5). Returns the household''s known_stores.id (the session points at the link, D2). Ladder D7: with GPS geo first, name second within reach, own history, create; without GPS own history only, never the global table. Fills null coordinates on the first GPS-bearing visit. SUPERSEDES match_known_store (kept, unwired; retire separately).';

-- ACL per 051 / the 045 lesson: CREATE grants EXECUTE to PUBLIC by default.
revoke all on function public.resolve_store(uuid, text, double precision, double precision) from public;
revoke all on function public.resolve_store(uuid, text, double precision, double precision) from anon;
revoke all on function public.resolve_store(uuid, text, double precision, double precision) from service_role;
grant execute on function public.resolve_store(uuid, text, double precision, double precision) to authenticated;

commit;

-- =====================================================================
-- VERIFY — row-returning. Expect: stores_cols with NO household/user/creator
-- column; stores_policies = stores_select:r ONLY; stores relacl with
-- authenticated=r and nothing for anon/service_role; known_stores lat/lng
-- nullable + store_id FK; resolve_store secdef, pinned, authenticated-only,
-- is_member_of marker; match_known_store still present (1);
-- system_identifier so a wrong-project paste shows in its own output.
-- =====================================================================
select
  (pg_control_system()).system_identifier                                        as system_identifier,
  (select string_agg(column_name, ',' order by ordinal_position)
     from information_schema.columns where table_schema='public' and table_name='stores')  as stores_cols,
  not exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='stores'
                 and (column_name ilike '%household%' or column_name ilike '%user%'
                      or column_name ilike '%creat%by%' or column_name ilike '%added%'))    as stores_has_no_owner_column,
  (select string_agg(polname || ':' || polcmd::text, ',' order by polname)
     from pg_policy where polrelid = 'public.stores'::regclass)                    as stores_policies,
  (select relacl::text from pg_class where oid = 'public.stores'::regclass)        as stores_relacl,
  (select string_agg(column_name || ':' || is_nullable, ',' order by column_name)
     from information_schema.columns where table_schema='public' and table_name='known_stores'
       and column_name in ('lat','lng','store_id'))                                as known_stores_geo_and_link,
  (select pg_get_constraintdef(oid) from pg_constraint
     where conrelid='public.known_stores'::regclass and conname='known_stores_store_id_fkey') as known_stores_store_fk,
  (select count(*) from pg_proc where proname='resolve_store' and pronamespace='public'::regnamespace) as resolve_store_count,
  (select prosecdef from pg_proc where proname='resolve_store' and pronamespace='public'::regnamespace) as resolve_store_secdef,
  (select proconfig::text from pg_proc where proname='resolve_store' and pronamespace='public'::regnamespace) as resolve_store_search_path,
  (select proacl::text from pg_proc where proname='resolve_store' and pronamespace='public'::regnamespace) as resolve_store_acl,
  (select position('if not is_member_of(p_household_id)' in prosrc) > 0 from pg_proc
     where proname='resolve_store' and pronamespace='public'::regnamespace)        as resolve_store_membership_first,
  (select count(*) from pg_proc where proname='match_known_store' and pronamespace='public'::regnamespace) as match_known_store_still_present,
  (select count(*) from public.stores)                                             as stores_rows;
