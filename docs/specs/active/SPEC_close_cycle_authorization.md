# SPEC — `close_cycle` / `archive_trip_items`: membership check + grants

**Scope:** OurProvisions
**Status:** Design approved 2026-09-14. **Prod-bound, promote ahead of the board work.**
**Found by:** Cody, 2026-09-14, while stamping `ready_at` in `close_cycle` (050 header).
**Touches:** two existing SECURITY DEFINER RPCs from the baseline (`000_canonical_baseline.sql`
lines ~506, ~547; search_path pinned by 034). One migration, number at build (`051` expected).

---

## The finding

Both functions grant `EXECUTE` to `PUBLIC` and `anon`, run as definer, and take a
`household_id` / `cycle_id` argument **with no check that the caller is a member of that
household.** Any authenticated user — and anon, before sign-in — can close any household's
open cycle and archive any household's trip items by guessing or replaying an id. Same
defect family as `033` (category_avg_prices) and `035`/`028`: a definer body trusting its
arguments.

RLS on `list_items` / `list_cycles` doesn't help — SECURITY DEFINER bypasses it. The
membership check has to be in the body.

---

## The fix

For both functions, `CREATE OR REPLACE` with the **same signature** (the 037 rule), same
`SECURITY DEFINER`, same `search_path`:

1. **Body:** first statement resolves the household and checks membership:
   - `archive_trip_items(p_household_id, …)`: `IF NOT is_member_of(p_household_id) THEN RAISE EXCEPTION 'not a member' USING ERRCODE = '42501'; END IF;`
   - `close_cycle(p_cycle_id, …)`: look up `household_id` from `list_cycles` for
     `p_cycle_id`; if no row, raise; then the same `is_member_of` check.
   Use the existing `is_member_of()` helper (the one RLS uses), so "member" means one
   thing everywhere.
2. **Grants:** `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon;` then
   `GRANT EXECUTE … TO authenticated, service_role;`. Re-state in the migration so the
   read-back proves it. (The `028` lesson: revoke before grant; `PUBLIC` is the one that
   silently re-admits anon.)
3. **Client:** no change expected — the app only calls these signed in, for its own
   household. But walk wrap-up on the deployed dev preview after applying, because a
   surprise here (an anon-keyed call somewhere in the wrap-up chain) would be a silent
   break at the worst moment.

**Audit the rest while there:** list every `SECURITY DEFINER` function in `public` with
its ACL and whether its body checks membership. Report the table in the commit body.
Fix only these two in this migration; anything else found gets its own row in NEXT.

---

## Verification (dev; then 1–3 on prod)

1. `pg_proc` read-back: both functions, one each, definer, search_path pinned, ACL =
   `authenticated` + `service_role` + owner, no `PUBLIC`, no `anon`.
2. **Non-member is refused:** account B (not in household X) calls `close_cycle` on X's
   open cycle via the REST endpoint with its own JWT → `42501`, cycle untouched.
3. **Anon is refused:** same call with the anon key → permission denied on the function
   itself (no execute), body never runs.
4. **Member still works:** the wrap-up flow on dev preview, real auth, both devices —
   cycle closes, `ready_at` stamping from 050 still fires, rolled items roll.
5. Console clean.

**Done when:** 1–5 pass on dev, then 1–3 on prod after the migration. This one goes to prod
on its own, before 048/049/050 — it's independent, smaller, and the exposure is live.

---

## DECISIONS (for ROADMAP)

| date | decision + rationale |
|---|---|
| 2026-09-14 | **Every SECURITY DEFINER RPC that takes a household/cycle id checks `is_member_of` in its body and grants execute to `authenticated` only.** `close_cycle` and `archive_trip_items` were the baseline exceptions; fixed as 051. The audit table in the commit is the checklist for the rest. |
