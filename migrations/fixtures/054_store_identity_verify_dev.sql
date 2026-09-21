-- 054_store_identity_verify_dev.sql — DEV verification of SPEC_store_identity.md
-- (Verification steps 3–8; steps 1 and 2 are the migration's VERIFY select and the
-- anon PostgREST probe respectively).
--
-- Reads, never a trusted 2xx. The resolver is exercised AS A MEMBER by setting
-- request.jwt.claims for the session (auth.jwt() reads it; is_member_of and
-- get_current_user_id resolve the caller from it) — the same path PostgREST uses.
-- Each session's store_id is then written exactly as the client does after the
-- RPC returns. Every check ends up as a row in the final SELECT.
--
-- Fixture households: A = "Learning Fixture (053)" (user fixture_learning_053),
-- B = "Store Fixture B (054)" (user fixture_store_054_b). Both unflagged. Fixed
-- f0540000-… ids; idempotent; nothing touches a real household.

-- ── fixtures ──
insert into public.users (id, clerk_id, email, full_name)
values ('f0540000-0000-4000-8000-000000000001', 'fixture_store_054_b',
        'store-fixture-054-b@ourprovisions.invalid', 'Store Fixture B 054')
on conflict (id) do nothing;
insert into public.households (id, name, created_by)
values ('f0540000-0000-4000-8000-000000000002', 'Store Fixture B (054)',
        'f0540000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
insert into public.household_members (id, household_id, user_id, role, joined_at)
values ('f0540000-0000-4000-8000-000000000003',
        'f0540000-0000-4000-8000-000000000002',
        'f0540000-0000-4000-8000-000000000001', 'owner', now())
on conflict (id) do nothing;
insert into public.provision_cycles (id, household_id, cycle_type, created_by, started_at)
values ('f0540000-0000-4000-8000-000000000005', 'f0540000-0000-4000-8000-000000000002',
        'planned', 'f0540000-0000-4000-8000-000000000001', '2026-09-19 14:00:00+00')
on conflict (id) do nothing;

-- eight sessions, store_id null (as the client creates them); A = 053 fixture, B = above
insert into public.shopping_sessions (id, household_id, cycle_id, user_id, started_at, gps_lat, gps_lng) values
  ('f0540000-0000-4000-8000-000000000010', 'f0530000-0000-4000-8000-000000000002', 'f0530000-0000-4000-8000-000000000005', 'f0530000-0000-4000-8000-000000000001', '2026-09-19 15:00:00+00', 43.0713, -70.9337),  -- S1 A gps  "Market Basket #23"
  ('f0540000-0000-4000-8000-000000000011', 'f0530000-0000-4000-8000-000000000002', 'f0530000-0000-4000-8000-000000000005', 'f0530000-0000-4000-8000-000000000001', '2026-09-19 15:10:00+00', 43.0715, -70.9339),  -- S2 A gps  "market basket" (~30 m away)
  ('f0540000-0000-4000-8000-000000000012', 'f0540000-0000-4000-8000-000000000002', 'f0540000-0000-4000-8000-000000000005', 'f0540000-0000-4000-8000-000000000001', '2026-09-19 15:20:00+00', 43.0712, -70.9338),  -- S3 B gps  "Market Basket"
  ('f0540000-0000-4000-8000-000000000013', 'f0530000-0000-4000-8000-000000000002', 'f0530000-0000-4000-8000-000000000005', 'f0530000-0000-4000-8000-000000000001', '2026-09-19 15:30:00+00', 42.3601, -71.0589),  -- S4 A gps  "MARKET BASKET" (far)
  ('f0540000-0000-4000-8000-000000000014', 'f0530000-0000-4000-8000-000000000002', 'f0530000-0000-4000-8000-000000000005', 'f0530000-0000-4000-8000-000000000001', '2026-09-19 15:40:00+00', null, null),          -- S5 A nogps "Hannaford"
  ('f0540000-0000-4000-8000-000000000015', 'f0540000-0000-4000-8000-000000000002', 'f0540000-0000-4000-8000-000000000005', 'f0540000-0000-4000-8000-000000000001', '2026-09-19 15:50:00+00', null, null),          -- S6 B nogps "Market Basket" (own history)
  ('f0540000-0000-4000-8000-000000000016', 'f0540000-0000-4000-8000-000000000002', 'f0540000-0000-4000-8000-000000000005', 'f0540000-0000-4000-8000-000000000001', '2026-09-19 16:00:00+00', null, null),          -- S7 B nogps "Hannaford" (must NOT match A's)
  ('f0540000-0000-4000-8000-000000000017', 'f0530000-0000-4000-8000-000000000002', 'f0530000-0000-4000-8000-000000000005', 'f0530000-0000-4000-8000-000000000001', '2026-09-19 16:10:00+00', 43.1300, -70.9200)   -- S8 A gps  "Hannaford" (enriches)
on conflict (id) do nothing;

create temp table if not exists v054_ctx (k text primary key, v text);
delete from v054_ctx;
insert into v054_ctx values ('stores_before', (select count(*)::text from public.stores));

-- ── run the ladder as each member (the client sequence: rpc, then set store_id) ──
select set_config('request.jwt.claims', '{"sub":"fixture_learning_053","role":"authenticated"}', false);
insert into v054_ctx values ('S1', public.resolve_store('f0530000-0000-4000-8000-000000000002', 'Market Basket #23', 43.0713, -70.9337)::text);
update public.shopping_sessions set store_id = (select v::uuid from v054_ctx where k='S1') where id = 'f0540000-0000-4000-8000-000000000010';
insert into v054_ctx values ('stores_after_S1', (select count(*)::text from public.stores));

insert into v054_ctx values ('S2', public.resolve_store('f0530000-0000-4000-8000-000000000002', 'market basket', 43.0715, -70.9339)::text);
update public.shopping_sessions set store_id = (select v::uuid from v054_ctx where k='S2') where id = 'f0540000-0000-4000-8000-000000000011';
insert into v054_ctx values ('stores_after_S2', (select count(*)::text from public.stores));

select set_config('request.jwt.claims', '{"sub":"fixture_store_054_b","role":"authenticated"}', false);
insert into v054_ctx values ('S3', public.resolve_store('f0540000-0000-4000-8000-000000000002', 'Market Basket', 43.0712, -70.9338)::text);
update public.shopping_sessions set store_id = (select v::uuid from v054_ctx where k='S3') where id = 'f0540000-0000-4000-8000-000000000012';
insert into v054_ctx values ('stores_after_S3', (select count(*)::text from public.stores));

select set_config('request.jwt.claims', '{"sub":"fixture_learning_053","role":"authenticated"}', false);
insert into v054_ctx values ('S4', public.resolve_store('f0530000-0000-4000-8000-000000000002', 'MARKET BASKET', 42.3601, -71.0589)::text);
update public.shopping_sessions set store_id = (select v::uuid from v054_ctx where k='S4') where id = 'f0540000-0000-4000-8000-000000000013';

insert into v054_ctx values ('S5', public.resolve_store('f0530000-0000-4000-8000-000000000002', 'Hannaford', null, null)::text);
update public.shopping_sessions set store_id = (select v::uuid from v054_ctx where k='S5') where id = 'f0540000-0000-4000-8000-000000000014';
-- capture NOW: S8 enriches this same store later, so a read at the end would no longer be null
insert into v054_ctx values ('S5_store_geo_null',
  (select (lat is null and lng is null)::text from public.stores
    where id = (select store_id from public.known_stores where id = (select v::uuid from v054_ctx where k='S5'))));

select set_config('request.jwt.claims', '{"sub":"fixture_store_054_b","role":"authenticated"}', false);
insert into v054_ctx values ('S6', public.resolve_store('f0540000-0000-4000-8000-000000000002', 'Market Basket', null, null)::text);
update public.shopping_sessions set store_id = (select v::uuid from v054_ctx where k='S6') where id = 'f0540000-0000-4000-8000-000000000015';
insert into v054_ctx values ('stores_after_S6', (select count(*)::text from public.stores));

insert into v054_ctx values ('S7', public.resolve_store('f0540000-0000-4000-8000-000000000002', 'Hannaford', null, null)::text);
update public.shopping_sessions set store_id = (select v::uuid from v054_ctx where k='S7') where id = 'f0540000-0000-4000-8000-000000000016';

select set_config('request.jwt.claims', '{"sub":"fixture_learning_053","role":"authenticated"}', false);
insert into v054_ctx values ('S8', public.resolve_store('f0530000-0000-4000-8000-000000000002', 'Hannaford', 43.1300, -70.9200)::text);
update public.shopping_sessions set store_id = (select v::uuid from v054_ctx where k='S8') where id = 'f0540000-0000-4000-8000-000000000017';

select set_config('request.jwt.claims', '', false);

-- ── checks ──
with c as (select k, v from v054_ctx),
     ks as (select id, household_id, store_id, lat, lng, visit_count, name from public.known_stores),
     st as (select id, canonical_name, chain_slug, lat, lng from public.stores),
     ses as (select id, store_id from public.shopping_sessions)
select * from (
  select 3 as step, 'S1 created exactly one store' as check_name,
         ((select v from c where k='stores_after_S1')::int - (select v from c where k='stores_before')::int)::text as result, '1' as expected
  union all
  select 3, 'S1 created exactly one link for A (store_id set)',
         (select count(*)::text from ks where household_id='f0530000-0000-4000-8000-000000000002' and store_id = (select store_id from ks where id=(select v::uuid from c where k='S1'))), '1'
  union all
  select 3, 'S1 session.store_id = returned link',
         (select (store_id = (select v::uuid from c where k='S1'))::text from ses where id='f0540000-0000-4000-8000-000000000010'), 'true'
  union all
  select 4, 'S2 repeat visit → same link id as S1',
         ((select v from c where k='S2') = (select v from c where k='S1'))::text, 'true'
  union all
  select 4, 'S2 created no new store',
         ((select v from c where k='stores_after_S2')::int - (select v from c where k='stores_after_S1')::int)::text, '0'
  union all
  select 4, 'S2 bumped visit_count to 2',
         (select visit_count::text from ks where id=(select v::uuid from c where k='S1')), '2'
  union all
  select 5, 'S3 (household B) → its OWN link, not A''s',
         ((select v from c where k='S3') <> (select v from c where k='S1'))::text, 'true'
  union all
  select 5, 'S3 link points at the SAME stores row as A''s link  ← the cross-household guarantee',
         ((select store_id from ks where id=(select v::uuid from c where k='S3')) = (select store_id from ks where id=(select v::uuid from c where k='S1')))::text, 'true'
  union all
  select 5, 'S3 created no new store',
         ((select v from c where k='stores_after_S3')::int - (select v from c where k='stores_after_S2')::int)::text, '0'
  union all
  select 6, 'S4 far away "MARKET BASKET" → a DIFFERENT stores row',
         ((select store_id from ks where id=(select v::uuid from c where k='S4')) <> (select store_id from ks where id=(select v::uuid from c where k='S1')))::text, 'true'
  union all
  select 6, 'both Market Basket stores share chain_slug market-basket',
         (select count(distinct id)::text from st where chain_slug='market-basket' and id in (select store_id from ks where id in ((select v::uuid from c where k='S1'), (select v::uuid from c where k='S4')))), '2'
  union all
  select 7, 'S5 no-GPS "Hannaford" (A) → store created with null geo (captured before S8 enriched it)',
         (select v from c where k='S5_store_geo_null'), 'true'
  union all
  select 7, 'S6 no-GPS "Market Basket" (B) → B''s own history link (S3), no new store',
         ((select v from c where k='S6') = (select v from c where k='S3'))::text, 'true'
  union all
  select 7, 'S6 created no new store',
         ((select v from c where k='stores_after_S6')::int - (select v from c where k='stores_after_S3')::int)::text, '1'
  union all
  select 7, 'S7 no-GPS "Hannaford" (B) does NOT match A''s Hannaford → distinct store',
         ((select store_id from ks where id=(select v::uuid from c where k='S7')) <> (select store_id from ks where id=(select v::uuid from c where k='S5')))::text, 'true'
  union all
  select 7, 'S8 GPS "Hannaford" (A) → same link as S5 (own history)',
         ((select v from c where k='S8') = (select v from c where k='S5'))::text, 'true'
  union all
  select 7, 'S8 enriched the store''s null geo (progressive enrichment)',
         (select coalesce(lat::text,'null') || ',' || coalesce(lng::text,'null') from st where id=(select store_id from ks where id=(select v::uuid from c where k='S8'))), '43.13,-70.92'
  union all
  select 7, 'S8 enriched the link''s null geo too',
         (select coalesce(lat::text,'null') from ks where id=(select v::uuid from c where k='S8')), '43.13'
  union all
  select 8, 'S1 in aisle_order_sessions: leg_anchored',
         (select leg_anchored::text from public.aisle_order_sessions where session_id='f0540000-0000-4000-8000-000000000010'), 'true'
  union all
  select 8, 'S1 reason_codes no longer contains no_store',
         (select (not ('no_store' = any(reason_codes)))::text from public.aisle_order_sessions where session_id='f0540000-0000-4000-8000-000000000010'), 'true'
  union all
  select 9, 'D3: stores has no owner column',
         (not exists (select 1 from information_schema.columns where table_schema='public' and table_name='stores' and (column_name ilike '%household%' or column_name ilike '%user%' or column_name ilike '%creat%by%' or column_name ilike '%added%')))::text, 'true'
  union all
  select 9, 'total stores created by this script',
         ((select count(*) from st) - (select v from c where k='stores_before')::int)::text, '4'
) t order by step, check_name;
