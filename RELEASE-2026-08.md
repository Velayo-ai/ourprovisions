# RELEASE-2026-08 — dev → main

**Status:** blocked on B1, B6
**Baseline:** `origin/main` = `1a13e98` (Jul 28) — this is what Vercel Production serves.
Do **not** compute the merge delta against local `main`; it is stale at `8a03e0c` (Jul 19).
Real delta: `origin/main..dev` = 22 commits.

> **RULE — production database state is established by `pg_get_functiondef` against the
> LIVE prod database, never by migration files.** A migration file proves what was
> *written*, not what is *running* (this repo hand-applies migrations outside any
> tracking table; files 009–012 aren't even in the tree).
>
> **✅ 2026-08-02 — the prod `pg_proc` read has been run (observed, read-only):**
> `join_household` → single row `(p_household_id uuid)`, **030 not applied** → B1 confirmed;
> `add_meal_to_list` → **absent** → B6 confirmed;
> `insert_list_item` → the **008 body** (`LANGUAGE sql`, no advisory lock, client-supplied
> `p_cycle_id`) → 026 drift is live.
> The prod-state statements below are now **observed, not inferred**.

## Structural fact that shapes this whole release

Vercel builds the React app. It does **not** run SQL.

Database migrations reach production by being applied directly to the prod Supabase
project — **outside the git merge gate entirely**. This means the prod database and the
prod git branch can disagree, and on this release they do. Every item below that touches
both a migration and `src/` has to be reasoned about as two separate deployments.

---

## Blockers

### B1 — `join_household` signature mismatch — BLOCKS MERGE

Commit `db5ec66` contains **both** migration 030 and a +50-line change to
`src/hooks/useProvisions.js`.

- Merging dev → main ships **only the client change**.
- Migration 030 is **dev-only**; prod DB still has the old function.
- Result: prod frontend calls `join_household(p_invite_code text)` against a prod
  database that has `join_household(p_household_id uuid)`.
- **The invite / join flow breaks in production on deploy.**
- ✅ **Confirmed — observed prod read 2026-08-02:** `pg_proc` returns a **single**
  `join_household(p_household_id uuid)` row, **no `text` overload** → 030 is not applied.

Two resolutions — pick one:

- **(a)** Apply migration 030 to the prod database *before* merging. Gated on B2.
- **(b)** Revert the client change on dev; ship it later paired with its migration.

Done when: prod DB function signature and the merged client code agree, verified by
signing in on production and completing a join via invite code.

### B2 — Finish migration 030 verification on dev

Recorded as 5 of 8 checks passed. Outstanding: **F2, F5, F6** unrun. **F8** needs a
second account that is a member of no household.

Gates B1 option (a). Done when: all eight checks pass on the dev preview with two real
accounts.

### B3 — App-level smoke test of 028 / 029 on production

Both are live on the prod database since Jul 31. Existing verification is genuinely
solid but is database-side only:

- 028 — `has_table_privilege` plus an external anon-key REST probe (206 → 401 / 42501).
- 029 — direct function call with injected JWT subject; deleted household flipped
  `true → false`, three live households unchanged; OIDs unchanged.

Missing: the **positive path through the running app**. 029 changed `is_member_of`,
which gates everything a user sees.

Done when: signed in on production as a real member and confirmed lists, places, and
items load normally.

### B4 — Rotate the two exposed Splunk tokens in Vercel

Independent of the merge. Tokens were exposed in screenshots.

Done when: new tokens live, old ones revoked, preview deploy still reporting RUM.

### B5 — Verify session replay masking on a preview deploy

`maskAllText: false` / `maskAllInputs: true`.

Done when: an actual replay has been watched and inputs confirmed masked, text not.

### B6 — Browse Meals lens is coupled to `add_meal_to_list` — BLOCKS MERGE

*(Was a "ship visible vs. flag" decision. It is a blocker: shipping the lens visible
breaks it in production.)*

`83041f7` adds +157 lines to `src/App.js` (the Browse Meals lens). It shares files with
the splash commits, so it **cannot be separated by cherry-pick** without conflicts —
merging dev → main ships the lens to the prod frontend.

The lens is **coupled to database objects that do not exist in production**:

- On "Add all" it calls `db.rpc("add_meal_to_list", { p_meal_id, p_servings, p_cycle_id })`
  ([useProvisions.js:1758](src/hooks/useProvisions.js#L1758)). That function is defined
  only in migration 025 (dev-only). Prod has no such function → PostgREST `PGRST202`
  (no matching function) → **"Add all" errors in production.**
- The lens also **reads the `meals` / `meal_ingredients` tables** that 025 creates and
  prod lacks — so the lens fails to load its data at all, not only on "Add all".
- ✅ **Confirmed — observed prod read 2026-08-02:** `add_meal_to_list` is **absent** from
  prod `pg_proc` → the "Add all" call fails with `PGRST202`; the `meals` tables are
  likewise absent, so the lens can't load its data either.

This is the same class of defect as B1 — a dev client change shipped to a prod database
that lacks the objects it calls — so it gates the merge the same way.

**Two resolutions — pick one:**

- **(a)** Hide the lens behind a flag (one small commit on dev) so the merged client
  renders nothing that touches the meals objects. Unblocks the merge without shipping
  meals to prod. Converts the old question into "is meals ready to be *visible*?"
- **(b)** Ship the meals migrations (025, plus its 026 dependency) to the prod database
  *before* merging, and verify the lens end-to-end on production.

Done when: either the lens is flag-hidden on dev, **or** the meals DB objects are live on
prod and the lens works end-to-end there — verified in the running app, not from
migration files.

---

## Documentation debt

### B7 — Reconcile `ARCHITECTURE.md`

Currently documents defects that are fixed, and stale signatures:

- Still asserts anon can cross-household read/write on `provision_cycles`,
  `known_stores`, `shopping_sessions` — 028 revoked this.
- Still asserts `join_household` performs no invite validation — 030 addresses this
  (dev only).
- Function catalog still shows `is_member_of(p_household_id uuid)` per migration 003,
  with no mention of 029's household/account liveness join.
- Function catalog still shows `join_household(p_household_id)` per migration 011.

This is the file a future session reads to learn the security model. Today it would
teach the wrong one.

Also add: a note that DB migrations reach production outside the git gate.

### B8 — Fast-forward local `main` to `origin/main`

Local `main` is stale at `8a03e0c`. A plain push is rejected; a `push --force` would
rewind `origin/main` from Jul 28 → Jul 19 and roll production back two weeks.

Fast-forwarding is inert with respect to production and removes the only destructive
move available.

---

## Rides along — no work needed

- Splash arc (4 commits) — approved, v3 asset shipped to dev
- Poll in-flight guard (`c6fa026`)
- Clerk publishable key env-driven (`a652a52`) — confirm prod env var is set
- Supabase MCP configs, docs commits

## Already in production — not part of this release

- Places rename (`b93c64e`) — live since Jul 28

## Explicitly out of scope

Authorization Parts 2, 3, 4b, 5, and the `search_path` item on the **five** remaining
SECURITY DEFINER functions (one of the original six, `bootstrap_new_user`, was already
pinned by `029`; the live set must be re-confirmed by the prod `proconfig is null` query,
per the RULE). Open and real; they do not gate this merge. Do not let them expand it.

**`insert_list_item` behavior drift — a known live prod defect; does NOT gate the merge.**
Migration 026 (dev-only) replaces the *body* of `insert_list_item` with a per-household
advisory lock + server-side cycle resolution. The **signature is byte-identical** to the
008 version prod runs (same 7 params, `RETURNS uuid`), and the client call is unchanged
([useProvisions.js:705](src/hooks/useProvisions.js#L705)) — so there is **no call-break**,
unlike B1/B6. ✅ **Confirmed live — observed prod read 2026-08-02:** prod runs the **008
body** (`LANGUAGE sql`, no advisory lock, client-supplied `p_cycle_id`); the 026 drift is
real and live. The cost is correctness, not a crash: prod lacks the cycle-integrity fix
(concurrent adds can open two open cycles for one household). Ships to prod with 025/026 as
their own SQL deployment, outside this merge.
