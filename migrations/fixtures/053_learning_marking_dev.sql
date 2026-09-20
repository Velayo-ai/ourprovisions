-- 053_learning_marking_dev.sql — DEV retroactive marking (SPEC_learning_qualification.md, step 4)
-- Explicit and listed, never heuristic. Confirmed by Dan 2026-09-20.
-- Rule: flag a household for what it IS, never for what it currently has.
--   Real people's empty households (Home / Brad, Somewhere / Andrew) stay unflagged.
--   Orphaned "My Household" fixtures are covered by flagging their TEST ACCOUNTS.
-- Run the BEFORE read, the updates, then the AFTER read. Prod gets its own list.

-- ── BEFORE ──
select 'users' as tbl, count(*) filter (where excluded_from_learning) as flagged_now from public.users
union all
select 'households', count(*) filter (where excluded_from_learning) from public.households;

begin;

update public.users set excluded_from_learning = true, updated_at = now()
 where id in (
   '99074ecb-18a5-468a-bdd3-131da6e55792',  -- dan@velayo.ai                     Dan Holmes (founder; every demo)
   '5dcf6d82-bc85-43b3-86c9-7a9336ca54b3',  -- daniel.l.holmes@gmail.com         Dan Test User (14 of 47 dev sessions)
   '7b06cbb6-6b39-4dd6-b0f9-3540cda62368',  -- daniel.l.holmes+test300@gmail.com Test Dan
   '4bc3de73-6016-4160-b53f-73a5c43ac3c7',  -- daniel.l.holmes+test303@gmail.com Test Dan 303
   'f840b660-829f-438f-9d83-e3373f09c9cb',  -- daniel.l.holmes+test304@gmail.com Test Dan 304
   'b5247c98-1a24-4aeb-991c-659beb5121c2',  -- daniel.l.holmes+test305@gmail.com Test 305
   'b8c7422c-767d-4255-a25e-2dad85dc4da8',  -- daniel.l.holmes+test308@gmail.com Test 308
   'b30bd6f1-f2ea-436b-8a96-c66facb17a26',  -- daniel.l.holmes+test309@gmail.com Test 309
   '523389e6-d08c-4d99-82db-3dbc3fde0cc5',  -- plan-a+clerk_test@example.com     Board Walk walker
   'ef521b1f-8671-4542-92b6-cea5e8999cc1',  -- plan-b+clerk_test@example.com     Board Walk walker
   '0907b594-43a9-441c-9e46-9d14308eeffa',  -- mr_dholmes@outlook.com            MR DHOLMES
   '5e135cdf-1138-4011-9a32-a3d01c054313',  -- mr_dholmes+test2@outlook.com      MR2 DHOLMES
   '39788a5f-9a7b-41b5-a940-50b7440bc960'   -- mr_dholmes+test3@outlook.com      MR3 DHOLMES
 );

update public.households set excluded_from_learning = true, updated_at = now()
 where id in (
   '629ea3ef-06ca-449a-91e0-fa205defc620',  -- B2 - Test House
   'c96bfeff-2c03-4994-a40b-a9b355c98203',  -- Board Walk
   '32c19409-ded5-4521-9f90-f910ed1cf897'   -- o11y Test House
 );

commit;

-- ── AFTER ── name every flagged row; counts must be 13 and 3.
select 'user' as kind, id::text, email as label from public.users where excluded_from_learning
union all
select 'household', id::text, name from public.households where excluded_from_learning
order by kind, label;
