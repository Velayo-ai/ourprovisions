-- 053_learning_marking_prod.sql — PROD retroactive marking (SPEC_learning_qualification.md, step 4)
-- Explicit and listed, never heuristic. Confirmed by Dan 2026-09-20. PROD IDS — they differ from dev.
-- Rules applied:
--   * Flag an ACCOUNT for what it is. Test accounts are flagged even when soft-deleted and unable
--     to produce data today — keeping the rule absolute means no judgment call at the next boundary.
--     Retired REAL people (Jean Hennessy, Aunt Barb, Michael Snow) are not test accounts: unflagged.
--   * Flag a HOUSEHOLD for what it IS, never for what it currently has. Only the two fixtures by
--     name and intent. NOT Madbury, Sacandaga, Mens Weekend - October 2026 (a real trip), BVI,
--     GSL Home, NewLeaf (Dan's accounts cover every session there today), the orphaned
--     "My Household" rows, or any real-people household — a household that cannot be positively
--     classified as a fixture is left alone, so a real member joining later is never silently erased.
-- Run in the prod SQL editor: the BEFORE read, the updates, then the AFTER read. Every row named.

-- ── BEFORE ── expect 0 and 0
select 'users' as tbl, count(*) filter (where excluded_from_learning) as flagged_now, count(*) as total from public.users
union all
select 'households', count(*) filter (where excluded_from_learning), count(*) from public.households;

begin;

update public.users set excluded_from_learning = true, updated_at = now()
 where id in (
   '0e45361e-44ae-48ea-83bc-dcff99ec440b',  -- dan@velayo.ai                                    Daniel Holmes (founder; 22 of 25 sessions)
   'e7dbff42-d690-4a3d-9bd0-b5a1fd6c65a7',  -- daniel.l.holmes@gmail.com                        Dan Test User (alt; 2 sessions)
   -- soft-deleted test accounts (retired 2026-08-15) — flagged for what they are
   'd639bc53-8eb2-4be2-b3bf-6cb327d6c2c2',  -- retired-2026-08-15-danholm@cisco.com             (Dan's Cisco account)
   '9f9d2716-c8b8-43eb-bcc7-23b043b453cf',  -- retired-…-daniel.l.holmes+test10@gmail.com       Test User10
   '67234136-59d7-4437-b386-5b81eefff7f4',  -- retired-…-daniel.l.holmes+test20@gmail.com       (test20 — surfaced by the deleted-users read)
   '9eedf825-df3e-4340-ac41-db01a63418ba',  -- retired-…-daniel.l.holmes+test21@gmail.com       Test Uesr21
   '5f748401-b739-4dba-ab62-f56b8e741b1a',  -- retired-…-daniel.l.holmes+test30@gmail.com       Test User 30
   '446f9922-1ea7-448a-b1b8-b8a053dd783e',  -- retired-…-daniel.l.holmes+test50@gmail.com       Test User 50
   '94a68449-8aac-4f3a-a8b8-b7b9090a3e90',  -- retired-…-daniel.l.holmes+test60@gmail.com       Test User 60
   'edef0ec7-efca-4753-bafb-5adbf09d1083'   -- retired-…-daniel.l.holmes+test53@gmail.com       Test User53
 );

update public.households set excluded_from_learning = true, updated_at = now()
 where id in (
   'f93f5263-17c1-473b-9eb7-7f514d6cc707',  -- Test House   (created 2026-09-20; the incident's retry fixture)
   '12e0431e-3488-475d-acdf-12f145304680'   -- Test 1 House (Test User10's)
 );

commit;

-- ── AFTER ── name every flagged row; counts must be 10 users and 2 households.
select 'user' as kind, id::text, email as label from public.users where excluded_from_learning
union all
select 'household', id::text, name from public.households where excluded_from_learning
union all
select 'TOTAL', (select count(*) from public.users where excluded_from_learning)::text || ' users',
       (select count(*) from public.households where excluded_from_learning)::text || ' households'
order by kind, label;
