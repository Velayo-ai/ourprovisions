# SPEC_prod_meal_placements_batch.md

**Scope:** OurProvisions · prod database only · no client change
**Status:** BUILT — applied to prod 2026-09-20 by hand in the prod SQL editor (`parpauldmbetptkmdwbd`); see "Applied" at the end
**Authored:** 2026-09-14 (design chat) · **Trigger:** live error caught during a demo

---

## The defect

Prod `close_cycle` fails at Wrap up:

> Could not wrap up trip: relation "meal_placements" does not exist

**Cause.** `051_secdef_household_authorization.sql` was applied to prod on 2026-09-14 as a
security-only change. It does not carry its own `close_cycle` body — its own header says
"body is 050's" (line 108) — and that body updates `meal_placements` (line 150) to stamp
`ready_at`. `meal_placements` (047) and its `ready_at` column (050) are dev-only. 051
therefore shipped a hidden dependency on two unapplied migrations.

**Why verification missed it.** plpgsql does not resolve table references at
`CREATE FUNCTION`. The migration succeeded, the `prosrc` read-back matched, the anon
probe was clean, and the function first failed when a real person ran it.

**Doc correction.** SESSION_LOG (2026-09-14 State line) says prod has "047 applied".
The runtime error is the observed read: **it does not.** Treat the folder and every doc
as wrong until the catalog reads below say otherwise.

**Blast radius.** Every prod household's Wrap up is broken since 051 landed. Shopping,
adding, checking are unaffected. No data was lost — `close_cycle` raised inside its
transaction, so `archive_trip_items` ran but the cycle did not close. See "After the
fix" for the one household state to check.

---

## The fix — five migrations, in this order

| # | file | why it is in the batch | ordering constraint |
|---|---|---|---|
| 1 | `047_meal_placements.sql` | creates `meal_placements` + RLS + ACL | first — everything below depends on the table |
| 2 | `048_add_meal_to_list_bought_row.sql` | pending prod batch; `add_meal_to_list` live-bought branch | carries its own `is_member_of`; 051 does not touch this RPC → safe here |
| 3 | `049_contribution_ledger_invariant.sql` | pending prod batch; ledger invariant on `add_meal_to_list` / `decrement_meal_from_list` | same as 048; must follow 048 (it replaces the same function) |
| 4 | `050_meal_placements_queue.sql` | adds `ready_at` / `cooked_at` / `skipped_at` — `close_cycle` references `ready_at` | its `close_cycle` **predates 051** and has no `is_member_of`; prod is transiently un-hardened until step 5. **Do not stop here.** |
| 5 | `052_ready_at_requires_lock_in.sql` | the final `close_cycle`: 051's `is_member_of` / `42501` check (lines 46–47) **plus** the tightened `ready_at` rule | last — restores the 051 guarantee and lands the current dev body |

**Do not** apply 047 alone: `close_cycle` also needs the 050 columns.
**Do not** end on 050: it would silently revert 051's authorization on `close_cycle`.
**Do not** re-run 051: unnecessary (052 supersedes its `close_cycle`; the other fourteen are already on prod) and it would re-land the same 050 body.

Apply one file, run its closing SELECT, read it, then the next. No stacking.

---

## Verification — execution, not read-back

Catalog reads (each must return rows):

```sql
-- table + three queue columns
select column_name from information_schema.columns
 where table_schema='public' and table_name='meal_placements'
   and column_name in ('ready_at','cooked_at','skipped_at');   -- expect 3 rows

-- RLS: 3 policies, no DELETE
select policyname, cmd from pg_policies where tablename='meal_placements';

-- close_cycle is the 052 body with the membership check
select prosrc like '%is_member_of%' and prosrc like '%052%'
  from pg_proc where proname='close_cycle';                    -- expect true
```

Behavioral (the actual bar — the read-backs passed last time too):

1. Dan's prod household: add one item → Shop → check it → **Wrap up**. Toast must be
   the All done path, no error. Cycle row shows `closed_at`.
2. Anon probe: `close_cycle` with a real cycle id and no JWT → `42501`, not a row change.
3. Optional, confirms 048/049: add a meal, buy an ingredient, add the same meal again →
   pending row with `quantity = Σ quantity_contributed`.

Done when all three catalog reads and behavioral 1 + 2 pass **on prod, from the app**,
and the SESSION_LOG State line is corrected to name 047–052 as prod by observed read.

---

## After the fix

- **Check for a half-closed cycle.** The failed Wrap up ran `archive_trip_items` before
  `close_cycle` raised. If `archive_trip_items` runs in its own call (client sequence is
  two RPCs), Dan's active cycle may have archived rows and no `closed_at`. Query
  `provision_cycles` for the open cycle and its `list_items`; if the trip's rows are
  archived, one more Wrap up after the fix closes it cleanly. Do not hand-edit rows.
- **Client promotion stays separate.** Prod bundle `1f0dcbd` never reads
  `meal_placements`; the board UI ships on its own schedule per the 09-14 Next session.

---

## Decisions this spec records

| date | decision + rationale |
|---|---|
| 2026-09-14 | **A `CREATE OR REPLACE` migration inherits every dependency of the body it copies.** A "security-only" migration that pastes a live dev body is not security-only. Migrations that replace a function must state the schema they assume in their header, and the promotion checklist must confirm those objects exist on the target first. |
| 2026-09-14 | **Prod verification of an RPC includes executing it once from the app.** `prosrc` read-back and anon probes prove presence and ACL, not that the function runs. Added to the environment-verification rules. |
| 2026-09-14 | **Never end a prod batch on a migration that predates a later security migration for the same function.** Ordering inside a batch is by dependency and by the latest body, not by file number alone. |

---

## Applied — 2026-09-20 (amendment)

Applied in the order above, one file at a time, each closing SELECT read by Dan, each state read
back through `supabase-prod-readonly` (system_identifier `7606130613603586966`), with a read-only
dependency pre-check before each file confirming every object its body references already existed
on prod.

**Finding — the 050 → 052 window is wider than row 4 describes.** Row 4 says prod is "transiently
un-hardened" because 050's `close_cycle` has no `is_member_of`. It is worse: 050's ACL block also
**re-grants `close_cycle` EXECUTE to PUBLIC, anon and service_role**, which 051 had revoked on
prod. Between 050 and 052 an anonymous caller with a real cycle id could have closed any
household's cycle. 052 reverses both — it revokes from public / anon / service_role, grants
`authenticated` only, and restores the membership check. Apply 050 and 052 back to back, always;
read the ACL after 052, not after 050. The anon probe below, run after 052, proves the reversal.

**Read-backs.** 047: `authenticated_privs` exactly `INSERT,SELECT,UPDATE`, no anon in relacl,
FKs CASCADE / CASCADE / SET NULL (prod is PostgreSQL 17.6 — `arwdDxtm` on `grant all` is the
MAINTAIN bit, not a stray privilege). 048 / 049: single overloads, markers present, anon execute
false. 050: three queue columns, three policies, `-- 050:` marker, ACL widened as above. 052: ACL
`{postgres=X/postgres,authenticated=X/postgres}`, anon / service_role execute false, `-- 052:`
marker, `is_member_of` / `42501`, lock-in predicate ×2, body MD5 (CRLF-normalised)
`af59f15d027e8e5a767c97140141d603` — identical to dev.

**Catalog reads:** all three pass on prod (3 columns; 3 policies, no DELETE; `close_cycle`
`is_member_of` + `052` true).

**Behavioral 1:** Dan's live Wrap Up on Madbury succeeded — cycle `7e2331ab` (open since 09-13)
`closed_at` 2026-09-20 21:34 UTC, `item_count` 0, `sessions_count` 11, 55 archived rows, no
successor cycle (nothing rolled).

**Behavioral 2:** `POST /rest/v1/rpc/close_cycle` with the anon key (with and without a Bearer
header) and a real cycle id →
`HTTP 401 {"code":"42501","message":"permission denied for function close_cycle"}`; cycle row,
cycle count, placements and events unchanged after. The refusal is the ACL layer; the body's own
`42501` check stands behind it for authenticated non-members.

**After the fix:** every archive cluster on an open cycle matched a shopping session's `ended_at`
to the second — the Wrap Up path. Madbury had at least six failed attempts on one cycle.
Sacandaga (8 archived bought, 6 live bought, one session never ended) and Test House (3 archived
bought, 13 live pending) remain half-closed; each closes on its next ordinary Wrap Up. No rows
hand-edited.

**Done when — all met.** Board client not promoted, per scope. What was missing for six days was a
watcher on this RPC; that is now a ROADMAP NEXT item.
