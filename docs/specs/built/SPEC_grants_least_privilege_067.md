# SPEC — Explicit, least-privilege grants (migration 067)

**Status:** Design-final, pending Step 0. Touches prod. Dev first, walked, then prod.
**Author:** design chat, 2026-10-23, from Claude Code's read-only inventory of the same night (both databases, PostgreSQL 17.6).
**Migration:** 067 (free in both the dev ledger and `migrations/`).

---

## Why

Supabase stops automatic grants for **new** objects in `public` on 2026-10-30. **Existing objects keep their grants**, so nothing live breaks on the 30th. The new-table half is already covered by the standing rule (since 10-21): every new-table migration states its grants for `anon`, `authenticated` and `service_role`.

The inventory found three real problems.

1. **Our grants aren't written down.** Fifteen tables, a view and about a dozen functions get some or all of their privileges from platform defaults rather than any `GRANT` in `migrations/`. A rebuild after the 30th would bring them back with no grants.
2. **Those defaults are far too wide:**
   - `anon` holds every table privilege on 15 RLS tables, including writes, `TRUNCATE`, `REFERENCES` and `TRIGGER` (plus `MAINTAIN` on prod).
   - `authenticated` holds the same extras on 19.
   - `get_catalog_names_by_ids(uuid[])` is SECURITY DEFINER and executable by `anon`, so it resolves catalog names, custom items included, past RLS for anyone holding the ids.
   - RLS protects rows and PostgREST doesn't expose `TRUNCATE`, so nothing is known to have leaked. But we're relying on one layer where two are cheap.
3. **Dev and prod disagree.** Prod has `MAINTAIN` and dev doesn't (`007_dev_restore_role_grants.sql` predates PostgreSQL 17), and their default ACLs differ.

**Ruling:** don't write today's over-wide grants into a migration only to revoke them later. Write the **target** once, least privilege for what the app actually does, and converge both databases onto it.

The deadline doesn't force the timing. We do it soon because the risk is cheap to remove, not because the 30th breaks anything.

---

## Decisions

**G1 — One shared target, prod-led.** Both databases end on the same ACLs, so dev drops nothing prod keeps and gains nothing prod lacks. 065/066 objects (dev-only, already explicit) are out of scope and promote with Meal Photos unchanged.

**G2 — `anon` keeps exactly one table privilege:** `INSERT` on `beta_signups` (the landing form). Every other table and the `category_avg_prices` view: `REVOKE ALL` from `anon`.

**G3 — `authenticated` keeps exactly the DML it has today:** `SELECT, INSERT, UPDATE, DELETE` where live holds `arwd`. The following are revoked everywhere:
- `TRUNCATE`
- `REFERENCES`
- `TRIGGER`
- `MAINTAIN`

No per-table DML narrowing in this migration. That would be a behaviour change, so it gets its own decision. Tables whose migrations already grant narrower DML explicitly (`household_staples`, `meals`, `meal_ingredients`, `list_item_meals`) keep **the live DML**, now written down, with the gap noted in a comment.

**G4 — `service_role` keeps what it has, now written down.** That means `GRANT ALL` where live holds it, including `meal_ready_events`. `stores` stays with **no** `service_role` grant, as 054 intended.

**G5 — Functions.**
- **Written down:** every default-derived `EXECUTE` that the app or a policy needs, granted explicitly to `authenticated` and `service_role`. This includes `service_role` on:
  - `join_household`
  - `bootstrap_new_user` (4-arg)
  - `discard_unclaimed_household`
  - `mint_referral_code`
  - `cook_meal`
  - `get_trip_reality`
  - `answer_trip_reality`
- **Revoked from `anon` and `PUBLIC`:**
  - `get_catalog_names_by_ids`
  - `get_current_household_id`
  - `get_current_user_id`
  - `get_my_households`
  - `is_member_of`
- **Exception:** if Step 0 finds a policy that `anon` reaches calling one of these (for example `beta_signups`'s insert policy), that function keeps `anon` and the spec records why.
- **Trigger and event-trigger functions** (`list_items_resurrect_cleanup`, `rls_auto_enable`) are **untouched**. Their firing doesn't depend on caller `EXECUTE`, and changing them buys nothing.

**G6 — Default privileges are not touched.** The 10-30 rollout owns `ALTER DEFAULT PRIVILEGES`. New objects are covered by the standing per-migration rule.

**G7 — `007_dev_restore_role_grants.sql` leaves `migrations/`.** `git mv` it to `scripts/dev-only/`, keeping the header and content. It's a dev repair script, and as a migration any replay would run it and re-create wide defaults. The other `007_` stays. No renumbering.

**G8 — The migration is idempotent and self-verifying.** It runs inside `begin … commit`, and its `VERIFY` select returns one row comparing every in-scope object's `relacl` / `proacl` with the target. The expected row is identical on dev and prod.

---

## Risk to check before writing anything

Today an `anon` request to a member table gets **an empty result** (RLS filters everything). After G2 it gets **`42501 permission denied`**. That changes behaviour wherever the client talks to tables without a live token. The known case is the `createSupabaseClient` fetch wrapper, which silently downgrades to `anon` on a null token (the `SPEC_auth_state_ui_gating` design item). Step 0 must say what the user would see.

---

## Step 0 (Claude Code, read-only, before any file)

1. **Signed-out paths.** List every Supabase call that can run with no token:
   - the welcome screen
   - the boot before Clerk loads
   - the fetch wrapper's null-token downgrade
   - the landing site `ourprovisions-landing` (`door.js`, the survey)

   For each, give the table or RPC it hits, and whether it uses `anon` today.
2. **The landing insert.** Does the beta form's insert ask for the row back (`select()` / `return=representation`)? If so, `anon` also needs a `SELECT` path, so report it before G2 is final.
3. **Policies that `anon` reaches.** For `beta_signups`, list its policies and any function they call (feeds G5's exception).
4. **Error handling.**
   - How do `classifyFetchError`, `authHealth` and the connectivity pill treat a `42501` against an empty `200`?
   - Would a downgraded `anon` request after G2 show the user a scary error, a false "offline", or a false empty list?

   Quote the code.
5. **The target table.** For every object in scope, give current prod ACL → target ACL, one row per object per role. That's the migration's body in plain form.
6. **Live `anon` traffic.** From RUM spans or Supabase API logs, are there `anon` REST requests on prod in the last 7 days, other than `beta_signups`?

**Stop and report.** If items 1, 4 or 6 show a real signed-out dependency on a table, bring it back to the design chat before writing 067.

---

## Build order

1. **Write `migrations/067_explicit_least_privilege_grants.sql`** from the Step 0 target table.
   - Header: why, scope, the G3 comment on the four narrower-explicit tables.
   - Body: `REVOKE` first, then `GRANT`, then the `VERIFY` select.
   - G7's `git mv` in the same commit.
2. **Dev:** Dan applies 067 in the SQL editor and reads `VERIFY` back. Write the ledger row by hand.
3. **Dev walk (Dan, phone and desktop):**
   - signed out, the welcome and boot render with no error
   - signed in, a full loop: Home, Plan, Meals, recipe view, Shop add/check/wrap-up, Browse, the place sheet
   - airplane mode, then back online: the pill reads offline/online honestly, with no permission-denied toast
   - a forced null-token request (Step 0 says how) shows what Step 0 predicted
4. **Prod:** confirm by the slug `parpauldmbetptkmdwbd`. Dan applies 067 in the SQL editor, `VERIFY` reads back, and it's read again over `supabase-prod-readonly`. No ledger (prod has none, by decision).
5. **Prod checks:**
   - a smoke walk on a real household
   - **one beta signup on `ourprovisions.app`**: POST 201, the row read back, then a guarded delete of exactly 1 row (the 10-08 pattern)

**Rollback:** a prepared `067_rollback.sql` re-grants the pre-067 ACLs exactly as listed in the Step 0 table. It's written alongside 067 and never applied unless needed.

---

## Verification

- **V1:** `VERIFY` returns the expected row on dev and prod, the same row on both.
- **V2:** no object in scope grants `anon` anything except `beta_signups` `INSERT`, and the G5 exception if Step 0 finds one.
- **V3:** no `TRUNCATE`, `REFERENCES`, `TRIGGER` or `MAINTAIN` for `anon` or `authenticated` on any table or view in `public`.
- **V4:** `service_role` ACLs are unchanged, and `stores` still has no `service_role` grant.
- **V5:** the dev walk passes, including signed-out and offline.
- **V6:** the prod smoke walk and the landing signup pass.
- **V7:** `scripts/dev-only/007_dev_restore_role_grants.sql` exists, and `migrations/` holds no file that issues `ALTER DEFAULT PRIVILEGES`.

---

## Out of scope (logged, not done)

- Per-table DML narrowing for `authenticated` (G3).
- A refreshed `000_canonical_baseline.sql` from prod, so a rebuild works end to end. 067 makes the grants replayable, but the folder still has gaps, a duplicate 007 and no prod ledger.
- `stores` for an Edge Function, if one ever needs it.

---

## Amendment 2026-10-23 — Step 0 rulings (design chat)

Append-only. Where this amendment and the text above disagree, this amendment wins.

**Step 0 found** (read-only, both databases, edge logs 2026-10-16 → 10-23): no signed-out path in the app or the landing site touches a table except the landing's `beta_signups` insert (`Prefer: return=minimal`, so INSERT only); `beta_signups`'s one policy (`public can apply`, anon INSERT, `WITH CHECK (true)`) calls no function; the **only** non-authenticated `/rest/v1/` traffic on prod is the Splunk Synthetics uptime test — `GET catalog_items?select=id&limit=1`, legacy anon JWT, every 5 minutes, 245–288 a day. G2 as written would have failed it and paged Critical.

**R1 — Split into two migrations.**
- **`067_health_rpc.sql` (additive):** `public.health()` returns `boolean`, `language sql`, `stable`, `security invoker`, `set search_path = ''`, body `select true`. Revoke all from `public` (and from every role the default ACL hands it to); grant `EXECUTE` to `anon` and `service_role` only. A VERIFY row.
- **`068_explicit_least_privilege_grants.sql`** = the grants: G1–G8 above, with R2–R3. **G2 now reads: `anon` = `beta_signups` INSERT + EXECUTE on `health()`, nothing else.**
- **Prod order:** 067 → Dan repoints the Splunk synthetic to `POST /rest/v1/rpc/health` with prod's `sb_publishable_` key → two green runs → 068 → the synthetic is still green. ARCHITECTURE's monitoring row records the change.

**R2 — `beta_signups`:** `authenticated` → nothing (its only policy is for `anon`). `service_role` keeps `ALL`.

**R3 — `category_avg_prices`:** `authenticated` → `SELECT` only (it is an aggregate view; nothing writes it).

**R4 — Logged NEXT P1, not in 068:** `list_item_contributors` has a `public` SELECT policy `USING (true)`, so any authenticated user reads every household's contributor rows (before 068, anon too: 90 of 90 rows as anon on dev). Rescope it to membership through `list_items`, after a read-only usage check. Same row: `households`' open INSERT policy (`WITH CHECK (true)`) for `authenticated`.

**R5 — The "silent anon downgrade" premise is corrected.** Since `SPEC_auth_state_ui_gating` D1, `createSupabaseClient`'s fetch wrapper **throws `AuthTokenMissing`** on a null token and sends nothing (`src/lib/supabaseClient.js`); no app request reaches PostgREST as `anon`. 068 therefore changes nothing a signed-out or token-less user sees. Should a request ever reach PostgREST as `anon` after 068, it is answered **401 / `42501`**:
- **polled reads** run `stopOnAuthFailure` first → `classifyAuthFailure` = `'rejected'` → `reportAuthRejected` → the pollers hold, `authPhase` = `signed_in_no_token`, the quiet "Reconnecting…" pill — no toast, no false offline;
- **writes and unpolled reads** fall to `classifyFetchError` → "permission denied for table …" is not a transient phrase → `'real'` → a toast (e.g. "Could not add meal to list: permission denied…"). Before 068 the same request got `200 []`, a false empty list.

The dev walk's "forced null-token request" therefore shows the existing hold (the wrapper refuses before PostgREST); the 42501 path is reachable only by hand (e.g. `curl` with the anon key).

**Rollback:** `migrations/068_rollback.sql` re-grants the pre-068 **prod** ACLs exactly (never applied unless needed). 067 needs no rollback beyond `drop function public.health()`, and only after the synthetic is pointed back.
