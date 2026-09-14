# SPEC — SECURITY DEFINER household RPCs: membership check + grants

**Scope:** OurProvisions
**Status:** Design approved 2026-09-14; **scope widened 2026-09-14 from two functions to the
audit table** (Dan, on Cody's audit). **Prod-bound, promote ahead of the board work.**
**Found by:** Cody, 2026-09-14, while stamping `ready_at` in `close_cycle` (050 header); the
audit that followed found the same defect on thirteen more functions.
**Touches:** fifteen existing SECURITY DEFINER RPCs in `public`. One migration, `051`.
Security only — the `ready_at` tightening from the Planned spec is NOT on this migration.

---

## The finding

Fifteen SECURITY DEFINER functions take a household id (or a cycle id that resolves to
one) and granted `EXECUTE` to `PUBLIC` and `anon`. Eleven of them never identified the
caller at all. SECURITY DEFINER bypasses RLS, so the body is the only guard, and there
was none. Prod matched dev on every row (read-only probe, `system_identifier`
`7606130613603586966`). Same defect family as `033` and `035`/`028`: a definer body
trusting its arguments.

**Audit — every SECURITY DEFINER function in `public` (dev and prod identical)**

| function | anon exec | body identifies caller | body checks membership | verdict |
|---|---|---|---|---|
| insert_list_item(household, item, qty, status, added_by, cycle, price) | yes | no | no | worse: writes any household's list with any added_by |
| insert_custom_catalog_item(name, category, household, created_by) | yes | no | no | worse: mints catalog rows into any household |
| delete_custom_catalog_item(household, item) | yes | no | no | worse: hard-deletes list rows + catalog item for any household |
| create_household(name, clerk_id) | yes | no | no | worse: creates a household owned by any Clerk id |
| get_household_member_profiles(household) | yes | no | no | worse: full_name, email, clerk_id of any household |
| get_list_items_for_household(household) | yes | no | no | worse (read): any household's list |
| get_household_user_ids(household) | yes | no | no | worse (read) |
| get_active_cycle(household) | yes | no | no | worse (read) |
| match_known_store(household, lat, lng) | yes | no | no | worse (read): store locations |
| close_cycle(cycle, roll_ids) | yes | no | no | the original finding |
| archive_trip_items(household, keep_ids) | yes | no | no | the original finding |
| remove_list_item, remove_member | yes | yes (JWT) | yes | guarded in body; anon grant dead weight |
| leave_household, delete_household | yes | yes (JWT) | own-row / owner | guarded in body; anon grant dead weight |
| add_meal_to_list, decrement_meal_from_list | no | yes | yes | correct |
| bootstrap_new_user, join_household, discard_unclaimed_household | no | yes | caller-scoped | correct |
| get_my_households, get_current_user_id, get_current_household_id, is_member_of | yes | yes | caller-scoped | correct by design |
| get_catalog_names_by_ids | yes | no | n/a | global read |
| mint_referral_code | no (service_role) | | | correct |
| list_items_resurrect_cleanup, rls_auto_enable | trigger functions | | | not RPC-callable |

Migrations `004`/`005`/`007` ("authorize" sweep) were about RLS policies, not function
bodies; the baseline did not undo them — these bodies were never guarded anywhere. The
baseline declared eleven of them unguarded and is patched in the same commit.

---

## The fix — one rule, fifteen times (migration 051)

For each of the fifteen, `CREATE OR REPLACE` with the **same signature** (the 037 rule),
same `SECURITY DEFINER`, same `search_path`, body otherwise verbatim:

1. **First statement is the membership check:**
   `IF NOT is_member_of(p_household_id) THEN RAISE EXCEPTION … USING ERRCODE = '42501'; END IF;`
   `close_cycle` resolves the household from `provision_cycles` first (a missing cycle
   raises before the check). `create_household` has no household yet: its first statement
   resolves the caller from `get_current_user_id()` and raises `42501` if unresolved.
   Use the existing `is_member_of()` helper (the one RLS uses), so "member" means one
   thing everywhere.
2. **Caller-typed arguments are not trusted (the 036 pattern):** `create_household` ignores
   `p_clerk_id`, `insert_list_item` ignores `p_added_by`, `insert_custom_catalog_item`
   ignores `p_created_by`; each derives the caller from `get_current_user_id()`. The
   arguments stay in the signatures.
3. **The five SQL-language readers become plpgsql** so they can `RAISE`. Return types
   unchanged. `get_household_member_profiles` keeps `clerk_id` and `email`: the client
   uses both (creator check compares clerk ids; display name falls back to the email
   local part).
4. **Grants:** `REVOKE ALL … FROM PUBLIC, anon, service_role` by name (revoking `PUBLIC`
   alone leaves explicit role grants; the `028`/`045` lesson), then
   `GRANT EXECUTE … TO authenticated` only. No server path calls any of these (the one
   edge function calls no RPC); `service_role` is granted back per function when one does.
5. **Client:** no change. The app calls these signed in, for its own household.
   `get_list_items_for_household` is the main list read, so a wrong check here is a dead
   app — hence the end-to-end walk below.

**Behaviour a member can see, deliberately:** `leave_household` by a non-member raises
`42501` instead of returning `{"left": false}`. Nothing else changes for a member.

---

## Verification (dev; then 1–3 on prod)

1. `pg_proc` read-back: fifteen functions, one each, definer, search_path pinned, ACL =
   `authenticated` + owner only; `anon`, `PUBLIC` and `service_role` cannot execute;
   first statement is the check.
2. **Non-member is refused:** account A (not in household Y) calls `insert_list_item`,
   `get_household_member_profiles` and `delete_custom_catalog_item` on Y via the REST
   endpoint with its own JWT → `42501`, rows untouched.
3. **Anon is refused:** the same three calls with the anon key → permission denied on the
   function itself, body never runs.
4. **Member still works — the app end to end** on the dev preview, real auth: list load,
   add, remove, custom item create and delete, wrap-up (both devices; `ready_at` still
   stamps; rolled items roll), invite (leave and rejoin).
5. Console clean.

**Done when:** 1–5 pass on dev, then 1–3 on prod after the migration. This one goes to prod
on its own, before 048/049/050 — it's independent, smaller, and the exposure is live.

---

## DECISIONS (for ROADMAP)

| date | decision + rationale |
|---|---|
| 2026-09-14 | **Every SECURITY DEFINER RPC that takes a household/cycle id checks `is_member_of` in its body, derives the caller from the JWT rather than an argument, and grants execute to `authenticated` only.** Fifteen baseline-era functions fixed as 051; the audit table is the checklist. |
| 2026-09-14 | **The baseline carries the guarded bodies.** A clean rebuild must not recreate the exposure; `000_canonical_baseline.sql` is patched from 051's text in the same commit. |
