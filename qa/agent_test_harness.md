# OurProvisions — Agent-Runnable Test Harness
*2026-06-25 · DB-layer tests Claude Code (or any agent) can run deterministically*

**Division of labor:** UI / visual / two-party real-time tests → human (Dan). Everything below → agent. The agent tests the *truth in the database*; the human tests *what renders*.

**Two run modes:**
- **DESTRUCTIVE suite** → run against **DEV ONLY** (`zxwtxjjmssykhqrghouf`). Creates/removes rows. Wrap in `begin; ... rollback;` so it self-cleans.
- **READ-ONLY gate** → safe against **PROD** (`parpauldmbetptkmdwbd`). Asserts state, mutates nothing. This is the **pre-merge gate**.

**Identity note:** RPCs resolve the caller from `auth.jwt()->>'sub'`. In a SQL harness, simulate with:
`select set_config('request.jwt.claims', json_build_object('sub', '<CLERK_ID>')::text, true);`
…in the **same transaction** as the call. Keep a small fixture of known test `clerk_id`s.

---

## HOW TO RUN THIS

This file is a **spec**, not yet executable: the destructive tests carry `<PLACEHOLDER>` IDs.
Turning it into something runnable is three steps — but **Parts A and C work with little or no setup today.**

### Setup (one-time, only needed for Part B)
1. Run `fixture_gathering.dev.sql` on **dev** to collect real test IDs.
2. Save the output as `test_fixture.dev.json` **outside the repo** (secrets hygiene — same home as Supabase creds / Bitwarden).
3. The runner substitutes those values for the `<PLACEHOLDERS>`.

### Three ways to run (increasing automation)
- **Option A — by hand (works NOW, zero setup).** Paste a query block into the Supabase SQL editor, sub in fixture values, run, eyeball the `EXPECT`/`ASSERT` comment. Fine as v1 for **Part A** before a merge.
- **Option B — Claude Code runs it (near-term target).** Claude Code reads this file + the fixture, substitutes IDs, executes via `psql`/Supabase CLI, reports pass/fail. **Prerequisite: DB credentials available to Claude Code → secrets hygiene (Bitwarden).** Until then, Claude Code can *assemble* the runnable SQL and you paste-run.
- **Option C — CI test runner (end-state, don't build yet).** Assertions become real test files (pgTAP or a small script) triggered automatically on merge/migration. This is Stage 2 of the agentic-pipeline roadmap.

### What to run when (and what's free today)
| Suite | Trigger | Needs fixture? | Runnable today? |
|---|---|---|---|
| **Part A** (read-only prod gate) | before every `dev→main` | No | **Yes — Option A, manual paste** |
| **Part B** (destructive dev suite) | after any dev DB migration | **Yes** | After fixture + (ideally) Option B |
| **Part C** (static repo checks) | every commit | No (no DB) | **Yes — Claude Code, today** |

### Start here (highest value, lowest setup)
1. **Part C now:** hand this file to Claude Code → "run the Part C static checks on the repo." Catches the `007` numbering collision + missing `009`–`012` + `window.confirm` count. No DB, no fixture.
2. **Part A at your next merge:** paste the four read-only queries into the **prod** SQL editor. Any A1 `FAIL` = do not merge. That's the drift gate working by hand.
3. **Part B + automation:** waits on the fixture (15 min of lookups) and secrets hygiene. Don't force it early.

---

# PART A — PRE-MERGE PROD GATE (read-only, run on PROD before every `dev→main`)
*This is the highest-value automation. It would have caught today's `get_my_households` drift.*

## A1 — Every frontend RPC exists on prod
Agent first greps the client for `.rpc("...")` calls, then feeds the list in here.
Fails loudly if any are missing. (Regenerate the `values` list from grep; don't hardcode forever.)
```sql
with needed(fn) as (
  values ('archive_trip_items'),('bootstrap_new_user'),('close_cycle'),
         ('create_household'),('delete_custom_catalog_item'),
         ('get_household_member_profiles'),('get_list_items_for_household'),
         ('get_my_households'),('insert_custom_catalog_item'),('insert_list_item'),
         ('join_household'),('leave_household'),('remove_list_item'),('remove_member')
)
select n.fn,
       case when p.proname is null then 'FAIL: MISSING ON PROD' else 'ok' end as status
from needed n
left join pg_proc p on p.proname = n.fn and p.pronamespace = 'public'::regnamespace
order by status desc, n.fn;
-- ASSERT: zero rows with status like 'FAIL%'. Any FAIL blocks the merge.
```

## A2 — Authorization spine intact on prod
Asserts the policy keystone functions exist.
```sql
select proname,
       case when count(*) = 0 then 'FAIL: missing' else 'ok' end as status
from (values ('is_member_of'),('get_current_user_id'),('get_my_households')) v(proname)
left join pg_proc p on p.proname = v.proname and p.pronamespace='public'::regnamespace
group by proname
order by status desc;
-- ASSERT: no 'FAIL'.
```

## A3 — Critical write policies still gate on is_member_of (not the old guess)
Catches a silent revert of the 004/005/007 sweep.
```sql
select tablename, policyname, cmd,
       case
         when (qual ilike '%is_member_of%' or with_check ilike '%is_member_of%') then 'ok'
         when (qual ilike '%get_current_household_id%') then 'FAIL: reverted to single-household guess'
         else 'CHECK: unexpected policy body'
       end as status
from pg_policies
where schemaname='public'
  and tablename in ('list_items','households','household_members','catalog_items','waste_events')
  and cmd in ('INSERT','UPDATE','DELETE','ALL')
order by status desc, tablename;
-- ASSERT: no 'FAIL'. 'CHECK' rows get human eyes.
```

## A4 — dev↔prod function parity (run on BOTH, diff the outputs)
Agent runs identical query on each env, diffs. Anything on dev & absent on prod = drift candidate.
```sql
select n.nspname as schema, p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
order by p.proname, args;
-- ASSERT: prod set ⊇ dev set, EXCEPT documented dev-only items (002 stopgap). Any other gap = investigate.
```

## A5 — Store/crew policies never revert to auth.uid() (added 2026-06-29, migration 014)
Guards the four tables fixed in 014. A silent revert to the Clerk-string-vs-uuid
bug would otherwise be invisible. Household-table policies must use is_member_of
or get_current_user_id; crew tables use get_current_user_id (crew-keyed, no household_id).
```sql
select tablename, policyname, cmd,
       case
         when (coalesce(qual,'') ilike '%auth.uid()%'
               or coalesce(with_check,'') ilike '%auth.uid()%')
              then 'FAIL: reverted to auth.uid() (Clerk-string vs uuid, always false)'
         when (coalesce(qual,'') ilike '%is_member_of%'
               or coalesce(with_check,'') ilike '%is_member_of%'
               or coalesce(qual,'') ilike '%get_current_user_id%'
               or coalesce(with_check,'') ilike '%get_current_user_id%')
              then 'ok'
         else 'CHECK: unexpected policy body'
       end as status
from pg_policies
where schemaname='public'
  and tablename in ('known_stores','shopping_sessions',
                    'velayo_crews','velayo_crew_members')
order by status desc, tablename, policyname;
-- ASSERT: no 'FAIL'. 'CHECK' rows get human eyes.
-- NOTE: known_stores + shopping_sessions have RLS DISABLED, so these policies
-- are inert today; the check still guards the definitions against revert for
-- when RLS is eventually enabled. Crew tables have RLS ENABLED (live).
```

---

# PART B — DESTRUCTIVE BEHAVIORAL SUITE (DEV ONLY, self-cleaning)
*Each test is a single transaction that sets up, asserts, and ROLLS BACK. No fixture pollution.*

## B1 — Create household → appears in get_my_households (the original bug, backend half)
```sql
begin;
  select set_config('request.jwt.claims', json_build_object('sub','<DAN_CLERK_ID>')::text, true);
  select create_household('HARNESS-CREATE-TEST', '<DAN_CLERK_ID>');
  -- ASSERT: the new household is now returned by get_my_households
  select count(*) as found
  from get_my_households()
  where name = 'HARNESS-CREATE-TEST';
  -- EXPECT found = 1
rollback;
```

## B2 — Write isolation: item added to A is invisible in B (the authorization spine)
*The test the docs say was "RLS-guaranteed but never demonstrated." This demonstrates it.*
```sql
begin;
  select set_config('request.jwt.claims', json_build_object('sub','<DAN_CLERK_ID>')::text, true);
  -- add a known catalog item to household A
  select insert_list_item('<HOUSEHOLD_A_ID>','<CATALOG_ITEM_ID>',1,'pending','<DAN_USER_UUID>',null,null);
  -- ASSERT present in A
  select count(*) as in_a from get_list_items_for_household('<HOUSEHOLD_A_ID>')
    where catalog_item_id = '<CATALOG_ITEM_ID>';  -- EXPECT >=1
  -- ASSERT absent in B
  select count(*) as in_b from get_list_items_for_household('<HOUSEHOLD_B_ID>')
    where catalog_item_id = '<CATALOG_ITEM_ID>';  -- EXPECT 0
rollback;
```

## B3 — Cross-user authorization: non-member cannot read household A's list
```sql
begin;
  -- impersonate a user who is NOT a member of household A
  select set_config('request.jwt.claims', json_build_object('sub','<NONMEMBER_CLERK_ID>')::text, true);
  select count(*) as leaked from get_list_items_for_household('<HOUSEHOLD_A_ID>');
  -- EXPECT leaked = 0  (is_member_of gate denies)
rollback;
```

## B4 — is_member_of returns correct booleans
```sql
begin;
  select set_config('request.jwt.claims', json_build_object('sub','<DAN_CLERK_ID>')::text, true);
  select
    is_member_of('<HOUSEHOLD_DAN_BELONGS_TO>') as should_be_true,
    is_member_of('<HOUSEHOLD_DAN_DOES_NOT>')   as should_be_false,
    is_member_of(null)                          as should_be_false_null;
  -- EXPECT: true, false, false
rollback;
```

## B5 — Leave-then-rejoin does not collide (migration 011 revive-or-insert)
```sql
begin;
  select set_config('request.jwt.claims', json_build_object('sub','<TEST_CLERK_ID>')::text, true);
  select leave_household('<HOUSEHOLD_ID>');     -- soft-delete membership
  select join_household('<HOUSEHOLD_ID>');      -- must revive, not 23505
  -- ASSERT exactly one live membership row, role='member'
  select count(*) as live_memberships
  from household_members hm join users u on u.id=hm.user_id
  where u.clerk_id='<TEST_CLERK_ID>' and hm.household_id='<HOUSEHOLD_ID>' and hm.deleted_at is null;
  -- EXPECT 1
rollback;
```

## B6 — remove_member soft-deletes (not hard) + clears nothing it shouldn't
```sql
begin;
  select set_config('request.jwt.claims', json_build_object('sub','<OWNER_CLERK_ID>')::text, true);
  select remove_member('<HOUSEHOLD_ID>','<TARGET_USER_UUID>');
  -- ASSERT membership soft-deleted (deleted_at set), row still exists
  select (deleted_at is not null) as soft_deleted
  from household_members
  where household_id='<HOUSEHOLD_ID>' and user_id='<TARGET_USER_UUID>';
  -- EXPECT soft_deleted = true
rollback;
```

## B7 — remove_list_item clears contributors atomically (migration 009, badge-resurrection fix)
```sql
begin;
  select set_config('request.jwt.claims', json_build_object('sub','<DAN_CLERK_ID>')::text, true);
  select insert_list_item('<HOUSEHOLD_A_ID>','<CATALOG_ITEM_ID>',1,'pending','<DAN_USER_UUID>',null,null);
  select remove_list_item('<HOUSEHOLD_A_ID>','<CATALOG_ITEM_ID>');
  -- ASSERT no live contributor rows survive for that item
  select count(*) as orphan_contributors
  from list_item_contributors lic
  join list_items li on li.id = lic.list_item_id
  where li.household_id='<HOUSEHOLD_A_ID>' and li.catalog_item_id='<CATALOG_ITEM_ID>';
  -- EXPECT 0
rollback;
```

---

# PART C — STATIC / REPO CHECKS (no DB; agent runs on the codebase)
## C1 — No new `.rpc()` call lacks a prod function
Grep client for `.rpc("x")`, cross-check against Part A1's prod list. Fail if any client RPC isn't in prod.

## C2 — Migration folder hygiene
- No duplicate migration numbers (today's `007` collision). Fail if two files share a leading number.
- Sequence is gapless `000..NNN`. Flag missing numbers (today: `009`–`012` absent from folder).

## C3 — No `window.confirm` / `window.alert` regressions (style gate, optional)
Grep `App.js` for `window.confirm`/`window.alert`. Report count + line numbers (currently 3 — tracked roadmap item).

---

# What stays MANUAL (human / Dan) — do not attempt to automate yet
- **Section 3 removal-notice (two-party, real-time, visual):** concurrent sessions + 30s poll + "did the right rectangle with the real name render." Human eyes catch what DOM asserts miss (e.g. "that household" vs real name).
- **Visual/brand judgment:** does it look right, espresso tokens, layout, the new branded-confirm modal when built.
- **Clerk auth flows:** sign-up, invite-link redirect, session edge cases.
- **Anything where "looks like a sync bug" vs "is a sync bug" is the question.**

---

# Suggested agent workflow
1. **On every `dev→main`:** run **Part A** (read-only) on prod. Any FAIL → block merge. Run A4 on both envs → diff.
2. **After any DB migration on dev:** run **Part B** (destructive, self-rollback) on dev → all green before considering prod.
3. **On every commit:** run **Part C** static checks.
4. Human runs the MANUAL list when those surfaces are touched.

**Fixture needed (one-time):** a small JSON of known test `clerk_id`s + user UUIDs + household IDs for dev (Dan Holmes, Dan Test User, a non-member, household A/B, a catalog item id). Store outside the repo (secrets hygiene). The harness reads from it instead of `<PLACEHOLDERS>`.
