-- 053_learning_fixtures_dev.sql — DEV verification fixtures for aisle_order_sessions
-- (SPEC_learning_qualification.md, Verification step 5 + the admit branch).
--
-- Dev flags prove the mechanism but protect nothing, so verification needs
-- fixtures that make both branches provable:
--   NEGATIVE  store-anchored, short, single-section → must be qualified = false
--             (reason {no_traversal}) yet PRESENT in a plain non-excluded read.
--             This is the D1 guarantee: a milk run is real staples data.
--   POSITIVE  store-anchored, several sections, realistic pacing → qualified = true.
--             Shaped on the only genuine shop in either database — prod Madbury
--             8ee6e792 (2026-09-12 21:29, 12.6 min, 16 checks, 5 sections,
--             median gap 9.8s): the SAME category sequence and the SAME
--             check-to-check offsets, not invented numbers.
--
-- Owned by a dedicated, never-flagged fixture user in its own household so the
-- admit branch stays exercisable whatever the real flag set becomes. Fixed
-- uuids (…0053 suffixes) so the script is idempotent and every row is greppable.
-- Timestamps are fixed in the past. Nothing here touches a real household.

begin;

-- fixture user + household + membership
insert into public.users (id, clerk_id, email, full_name)
values ('f0530000-0000-4000-8000-000000000001', 'fixture_learning_053',
        'learning-fixture-053@ourprovisions.invalid', 'Learning Fixture 053')
on conflict (id) do nothing;

insert into public.households (id, name, created_by)
values ('f0530000-0000-4000-8000-000000000002', 'Learning Fixture (053)',
        'f0530000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.household_members (id, household_id, user_id, role, joined_at)
values ('f0530000-0000-4000-8000-000000000003',
        'f0530000-0000-4000-8000-000000000002',
        'f0530000-0000-4000-8000-000000000001', 'owner', now())
on conflict (id) do nothing;

-- the store (the only known_stores row on either database — nothing creates one)
insert into public.known_stores (id, household_id, name, chain, lat, lng, radius_m, added_by)
values ('f0530000-0000-4000-8000-000000000004',
        'f0530000-0000-4000-8000-000000000002',
        'Fixture Market', 'Fixture', 43.0713, -70.9337, 150,
        'f0530000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- one cycle for both sessions
insert into public.provision_cycles (id, household_id, cycle_type, created_by, started_at)
values ('f0530000-0000-4000-8000-000000000005',
        'f0530000-0000-4000-8000-000000000002', 'planned',
        'f0530000-0000-4000-8000-000000000001', '2026-09-18 14:00:00+00')
on conflict (id) do nothing;

-- household-owned catalog rows carrying the reference trip's categories
-- (Other / Desserts / Frozen Food are open-set categories on prod; Pantry and
-- Produce exist globally but a local row keeps the fixture self-contained).
insert into public.catalog_items (id, name, category, unit, is_global, created_by, household_id) values
  ('f0530000-0000-4000-8000-000000000101', 'Pesto - Classico',                 'Pantry',      'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  ('f0530000-0000-4000-8000-000000000102', 'Pumpkin Spice Coffee',             'Other',       'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  ('f0530000-0000-4000-8000-000000000103', 'Parmesan cheese',                  'Other',       'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  ('f0530000-0000-4000-8000-000000000104', 'Mixed Lettuce',                    'Produce',     'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  ('f0530000-0000-4000-8000-000000000105', 'Tomatoes',                         'Produce',     'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  ('f0530000-0000-4000-8000-000000000106', 'Celery',                           'Produce',     'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  ('f0530000-0000-4000-8000-000000000107', 'Cucumber',                         'Produce',     'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  ('f0530000-0000-4000-8000-000000000108', 'Radishes',                         'Produce',     'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  ('f0530000-0000-4000-8000-000000000109', 'Pasta - Rotini Primavera',         'Produce',     'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  ('f0530000-0000-4000-8000-000000000110', 'Carrots',                          'Produce',     'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  ('f0530000-0000-4000-8000-000000000111', 'Bell Pepper - Red/Orange/Yellow',  'Produce',     'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  ('f0530000-0000-4000-8000-000000000112', 'Bell Pepper - Green',              'Produce',     'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  ('f0530000-0000-4000-8000-000000000113', 'Ice cream - Tillamook - Mint Choc Chip', 'Other', 'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  ('f0530000-0000-4000-8000-000000000114', 'Cookies',                          'Desserts',    'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  ('f0530000-0000-4000-8000-000000000115', 'Frozen Peas',                      'Other',       'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  ('f0530000-0000-4000-8000-000000000116', 'Frozen Corn',                      'Frozen Food', 'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  -- negative fixture: one section
  ('f0530000-0000-4000-8000-000000000201', 'Whole Milk',                       'Dairy',       'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  ('f0530000-0000-4000-8000-000000000202', 'Butter',                           'Dairy',       'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002'),
  ('f0530000-0000-4000-8000-000000000203', 'Yogurt',                           'Dairy',       'each', false, 'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

-- ── POSITIVE: mirrors prod 8ee6e792. Session 21:29:18 → 21:41:54 (756s);
--    first check +119.2s; 16 checks at the reference offsets; 5 sections;
--    median check-to-check gap 9.8s. Base 2026-09-18 15:00:00 UTC.
insert into public.shopping_sessions (id, household_id, cycle_id, user_id, store_id, store_name_raw, started_at, ended_at, gps_lat, gps_lng)
values ('f0530000-0000-4000-8000-000000000010',
        'f0530000-0000-4000-8000-000000000002',
        'f0530000-0000-4000-8000-000000000005',
        'f0530000-0000-4000-8000-000000000001',
        'f0530000-0000-4000-8000-000000000004', 'Fixture Market',
        '2026-09-18 15:00:00+00', '2026-09-18 15:12:36+00', 43.0713, -70.9337)
on conflict (id) do nothing;

insert into public.list_item_events (id, household_id, list_item_id, catalog_item_id, user_id, session_id, cycle_id, event_type, sequence, created_at)
select gen_random_uuid(), 'f0530000-0000-4000-8000-000000000002', null, c.item,
       'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000010',
       'f0530000-0000-4000-8000-000000000005', 'checked', c.seq,
       timestamptz '2026-09-18 15:00:00+00' + interval '119.2 seconds' + (c.offset_s * interval '1 second')
from (values
  ( 1, 'f0530000-0000-4000-8000-000000000101'::uuid,   0.00),   -- Pantry
  ( 2, 'f0530000-0000-4000-8000-000000000102'::uuid,   3.42),   -- Other
  ( 3, 'f0530000-0000-4000-8000-000000000103'::uuid,  57.75),   -- Other
  ( 4, 'f0530000-0000-4000-8000-000000000104'::uuid, 142.06),   -- Produce
  ( 5, 'f0530000-0000-4000-8000-000000000105'::uuid, 151.40),
  ( 6, 'f0530000-0000-4000-8000-000000000106'::uuid, 185.81),
  ( 7, 'f0530000-0000-4000-8000-000000000107'::uuid, 192.39),
  ( 8, 'f0530000-0000-4000-8000-000000000108'::uuid, 202.20),
  ( 9, 'f0530000-0000-4000-8000-000000000109'::uuid, 204.14),
  (10, 'f0530000-0000-4000-8000-000000000110'::uuid, 205.74),
  (11, 'f0530000-0000-4000-8000-000000000111'::uuid, 262.25),
  (12, 'f0530000-0000-4000-8000-000000000112'::uuid, 263.56),
  (13, 'f0530000-0000-4000-8000-000000000113'::uuid, 431.88),   -- Other
  (14, 'f0530000-0000-4000-8000-000000000114'::uuid, 464.05),   -- Desserts
  (15, 'f0530000-0000-4000-8000-000000000115'::uuid, 521.89),   -- Other
  (16, 'f0530000-0000-4000-8000-000000000116'::uuid, 525.32)    -- Frozen Food
) as c(seq, item, offset_s)
where not exists (select 1 from public.list_item_events
                   where session_id = 'f0530000-0000-4000-8000-000000000010');

-- ── NEGATIVE: the milk run. Store-anchored, 3 checks, ONE section (Dairy),
--    gaps 35s / 40s (median 37.5s — well paced), 2.5 minutes.
insert into public.shopping_sessions (id, household_id, cycle_id, user_id, store_id, store_name_raw, started_at, ended_at, gps_lat, gps_lng)
values ('f0530000-0000-4000-8000-000000000011',
        'f0530000-0000-4000-8000-000000000002',
        'f0530000-0000-4000-8000-000000000005',
        'f0530000-0000-4000-8000-000000000001',
        'f0530000-0000-4000-8000-000000000004', 'Fixture Market',
        '2026-09-18 17:00:00+00', '2026-09-18 17:02:30+00', 43.0713, -70.9337)
on conflict (id) do nothing;

insert into public.list_item_events (id, household_id, list_item_id, catalog_item_id, user_id, session_id, cycle_id, event_type, sequence, created_at)
select gen_random_uuid(), 'f0530000-0000-4000-8000-000000000002', null, c.item,
       'f0530000-0000-4000-8000-000000000001', 'f0530000-0000-4000-8000-000000000011',
       'f0530000-0000-4000-8000-000000000005', 'checked', c.seq,
       timestamptz '2026-09-18 17:00:30+00' + (c.offset_s * interval '1 second')
from (values
  (1, 'f0530000-0000-4000-8000-000000000201'::uuid,  0),
  (2, 'f0530000-0000-4000-8000-000000000202'::uuid, 35),
  (3, 'f0530000-0000-4000-8000-000000000203'::uuid, 75)
) as c(seq, item, offset_s)
where not exists (select 1 from public.list_item_events
                   where session_id = 'f0530000-0000-4000-8000-000000000011');

commit;

-- ── READ BACK: both fixture sessions with their measurements and verdicts.
select left(session_id::text, 13) as session, leg_anchored as store_resolved, check_count,
       distinct_sections, median_gap_seconds, leg_traverses, leg_paced, qualified, reason_codes
  from public.aisle_order_sessions
 where household_id = 'f0530000-0000-4000-8000-000000000002'
 order by started_at;
