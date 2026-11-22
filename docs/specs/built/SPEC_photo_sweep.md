# SPEC — Meal photo sweep (30-day grace)

**Date:** 2026-10-25 · **Scope:** OurProvisions · **Status:** Ready for Step 0
**Touches:** prod storage (permanent deletes), a new Edge Function, a cron schedule (070)
**Principle it carries out:** *a cleanup sweep keeps a grace window* (named 2026-10-25)

---

## Why

Removing a meal photo is a soft delete (`meal_photos.deleted_at`, 065). The row and both storage
objects stay forever — 065 promised "objects leave by a later service-role sweep," and that sweep
was never built. Today that means:

- **Storage grows without bound.** Every Remove, every Replace, and every photo aged out by the
  3-photo cap (R1) leaves two objects behind.
- **"Removed for everyone in your household" is only true on screen.** The confirm sheet's copy
  should be true in storage too, after a grace window.
- **Orphans pile up.** An upload whose `add_meal_photo` RPC failed (and Replace's upload-first
  path) leaves objects with no row at all.

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **30-day grace** after `deleted_at`, then permanent delete of both objects and the row. | Matches iOS Recently Deleted — the model people already know. Long enough to recover a mistake by hand. |
| D2 | **Applies to every soft-deleted photo**, whatever the cause: Remove, Replace, the cap's age-out (R1), the one-per-cook replace (P1). | One rule, no special cases. An aged-out photo was removed by the system on the household's behalf; it gets the same window. |
| D3 | **No restore UI.** Recovery inside the 30 days stays an admin operation. Build restore only if households ask for it. | Dan, 2026-10-25: wait for demand. Keeps "never celebrate deleting" — nothing on screen points at removed photos. |
| D4 | **Orphan objects** (no `meal_photos` row at all, live *or* soft-deleted) are deleted after **7 days**. | They were never visible. 7 days clears any in-flight upload (objects land before the RPC) with a wide margin. |
| D5 | **Storage first, then the row.** For each expired photo: remove `thumb_path` + `view_path` via the Storage API; only on success hard-delete the row. | The row is the to-do list. If a storage call fails, the row survives and the next run retries. A row whose objects are already gone is harmless (it's soft-deleted, never shown). |
| D6 | **Storage API only — never `DELETE FROM storage.objects`.** | Deleting `storage.objects` rows in SQL leaves the files in the bucket. This is why the sweep is an Edge Function, not pure `pg_cron` SQL. |
| D7 | **Daily, bounded.** One run per day, at most 500 photos and 1000 orphan objects per run. | A backlog drains over a few days instead of one long risky run. |
| D8 | **Dry run first, on both databases.** The function takes `dry_run` (default `true` until promoted); a dry run reports counts and deletes nothing. | Permanent deletes on prod get a read-back before they happen. |

## What to build

### 1. Edge Function `meal-photo-sweep`

- Runs as **service role**; invoked only by the cron job, authenticated by a shared secret header
  (`x-sweep-secret`, stored as a function secret + in Vault for the cron). JWT verification off;
  any request without the secret → 401, nothing else read.
- **Expired photos:** `select id, thumb_path, view_path from meal_photos where deleted_at < now() - interval '30 days' order by deleted_at limit 500` — the cutoff computed **in the database**, never from the function's clock.
- **Path guard:** before any storage call, every path must match
  `^<uuid>/<uuid>/<uuid>-(thumb|view)\.(webp|jpg)$`. A path that doesn't match is skipped and
  counted, never deleted.
- **Bucket guard:** the only bucket touched is `meal-photos`, hard-coded.
- Remove objects in batches (Storage `remove()` takes a list); then `delete from meal_photos where id = any(<ids whose objects were removed>) and deleted_at < now() - interval '30 days'` — the condition repeated so a row restored mid-run is never deleted.
- **Orphans:** list objects in `meal-photos` with `created_at < now() - interval '7 days'` whose
  name appears in **no** row's `thumb_path` or `view_path` (live or soft-deleted). Same path
  guard. Remove up to 1000.
- **Output / logs: counts only** — `{dry_run, expired_found, expired_removed, rows_deleted, orphans_found, orphans_removed, skipped_bad_path, errors}`. No paths, ids or household ids in logs (they carry household/meal uuids).

### 2. Migration `070_meal_photo_sweep_schedule.sql`

- `cron.schedule('meal-photo-sweep', '<daily, off-peak UTC>', …)` calling the function via
  `pg_net` with the secret read from Vault.
- Idempotent (`cron.unschedule` if it exists, then schedule). VERIFY reads back the job row,
  its schedule, and that the secret is not in the command text.
- `service_role` already holds `select, insert, update, delete` on `meal_photos` (065, explicit).
  No grant changes expected — Step 0 confirms.

### 3. No client change

Copy stays as built: "It'll be removed for everyone in your household." — now true in storage
after 30 days.

## Rollout

1. **Dev:** deploy function with `dry_run=true`; invoke by hand; read the counts against a
   hand count (`select count(*) … deleted_at < now() - '30 days'`, plus an orphan listing).
2. **Dev, live:** run once with `dry_run=false`; read back (rows gone, objects gone, live photos
   untouched); then apply 070 and let one scheduled run happen.
3. **Prod:** deploy with `dry_run=true`; Dan reads the counts. Then apply 070 and flip to live.
   On prod today nothing is older than 30 days, so the first live runs should delete **orphans
   only** (if any) — say so in the read-back.

## Verification

1. A photo soft-deleted 31 days ago (dev, backdated `deleted_at`) → both objects and the row gone.
2. A photo soft-deleted 29 days ago → untouched.
3. Live photos (`deleted_at is null`) → never touched, objects present, recipe view unchanged.
4. An aged-out photo (cap) and a P1-replaced photo follow the same 30-day rule.
5. An orphan object 8 days old → removed; an orphan 1 day old → kept; an object belonging to a
   **soft-deleted** row is not treated as an orphan.
6. A storage failure (simulate) → row kept, retried next run, counted in `errors`.
7. A bad path in a row → skipped, counted, nothing deleted.
8. No secret → 401. Wrong secret → 401. Logs contain counts only.
9. `dry_run=true` deletes nothing (objects and rows read back identical).
10. 070 VERIFY: one job, daily, the secret not in `cron.job.command`.

## Watch-outs

- **Black n' Pumpkin's original photo** (`8351467f…`, soft-deleted 2026-10-25 17:27 UTC) will be
  **permanently deleted around 2026-11-24** — by Dan's choice not to restore it. Last chance to
  change that is before then.
- **Admin restore is only possible for 30 days** from now on. A restore is: set `deleted_at = null`
  — but if the meal already has 3 live photos, that breaks R1. Any hand restore must check the
  live count first.
- **Meals are soft-deleted by convention**, so `meal_photos` rows don't cascade away. If a meal is
  ever hard-deleted, its photo rows go with it (CASCADE) and its objects become orphans → the
  orphan pass collects them after 7 days.

## Step 0 — confirm before building

- `pg_cron`, `pg_net` and Vault enabled on **both** projects (versions, and how existing scheduled
  work — if any — is wired).
- The current orphan count on dev and prod (a dry run answers it).
- Storage `remove()` batch limit and behaviour on an already-missing object (expected: no error).
- Whether listing bucket objects by `created_at` is better done through the Storage API or a
  read-only `select` on `storage.objects` (reading is fine; deleting there is not — D6).
- Whether any code path besides `add_meal_photo` / `remove_meal_photo` writes `deleted_at`.

## Deferred

- **Restore UI** ("Recently removed" in the meal's Edit view) — only on demand (D3).
- A household-visible storage usage figure — not planned.

---

## Amendment 2026-10-25 — Step 0 results (Claude Code, at BUILD)

**Read on prod** (`parpauldmbetptkmdwbd`, system_identifier `7606130613603586966`, read-only MCP).
**Dev not read:** the `supabase-dev` MCP failed to connect this session (CONNECT_TIMEOUT), and there
is no Supabase CLI on this machine. Dev's half of Step 0 is the query block at the end of this
amendment — Dan runs it in the dev SQL editor before the dev dry run.

### What Step 0 found (prod)

| Question | Answer |
|---|---|
| `pg_cron` | **Not installed.** Available, default 1.6.4. |
| `pg_net` | **Not installed.** Available, default 0.20.0. |
| Vault | `supabase_vault` 0.3.1 installed, **0 secrets**. |
| Existing scheduled work | **None.** `cron.job` does not exist. Nothing to fit around. |
| Who writes `meal_photos.deleted_at` | **Only `add_meal_photo`** (P1 replace + R1 age-out) **and `remove_meal_photo`.** No triggers on `meal_photos`. `authenticated` holds `SELECT` only, so the client cannot write it. `src/` writes it only through those two RPCs. |
| `service_role` | Holds `SELECT, INSERT, UPDATE, DELETE, TRUNCATE` on `meal_photos`, `SELECT`/`DELETE` on `storage.objects`, and `BYPASSRLS`. **No grant changes needed on `meal_photos`.** |
| Member storage policies on `meal-photos` | `SELECT` and `INSERT` only. Members cannot delete or overwrite objects, so the sweep is the only way an object leaves. |
| Object names | All 20 objects match `U/U/U-(thumb\|view).(webp\|jpg)`, so the path guard matches real data. |
| Counts today | 10 rows, 7 soft-deleted (oldest 2026-10-24 21:53 UTC), **0 expired**, 0 within a day of expiry; 20 objects; **0 orphans of any age.** |
| `remove()` batch limit | **1000 paths per call** (Supabase docs, "Delete Objects"). D7's 1000 orphans is one call; 500 photos is 1000 paths, also one call. |
| `remove()` on a missing object | **Not confirmed by the docs.** Expected: no error, and the missing path is just absent from the returned list. **This is checked on the dev live run (Verification 11), not assumed.** |
| How to list orphans | **SQL read of `storage.objects`**, not the Storage API. `list()` takes one folder at a time and isn't recursive, so it would walk every household/meal folder. A `select` on `storage.objects` is one query and filters on `created_at` in the database. Reading is fine; deleting stays Storage-API only (D6). |

### Corrections to the spec

- **C1 — Turn on `pg_cron` and `pg_net` before 070 on both databases** (prod has neither, and dev is
  unread). The schedule migration starts with `create extension if not exists pg_cron` /
  `pg_net`. That is the first scheduled work on either database, so there is no existing pattern
  to follow.
- **C2 — The function reads and deletes through three service-role-only RPCs, so the numbering
  shifts.** supabase-js can't reach `storage.objects` through PostgREST, and the 30-day cutoff must
  be computed in the database (§1). The function therefore calls:
  - `meal_photo_sweep_expired(p_limit)` returns `id, thumb_path, view_path`, using the §1 select.
  - `meal_photo_sweep_orphans(p_limit)` returns object names older than 7 days that match no row,
    live or soft-deleted.
  - `meal_photo_sweep_delete_rows(p_ids)` runs the §1 delete with the 30-day condition repeated,
    and returns the row count.
  - All three are `security invoker` with `search_path = ''`. `EXECUTE` goes to `service_role`
    only, revoked from `public`, `anon` and `authenticated` (the 068 model).
  - **New numbering: `070_meal_photo_sweep_rpcs.sql`** (needed before the first dry run) and
    **`071_meal_photo_sweep_schedule.sql`** (the old §2, applied after the dev live run, as Rollout
    2 already orders).
- **C3 — "Success" in D5 means the batch's `remove()` returned no error.** It does not mean every
  path appeared in the returned list. Otherwise a row whose objects are already gone could never be
  deleted. A `remove()` error keeps every row in that batch and counts 1 in `errors`.
- **C4 — Live mode needs two keys.** `dry_run` is `false` only when the request body says
  `"dry_run": false` **and** the function secret `SWEEP_LIVE` is `true`. On deploy `SWEEP_LIVE` is
  unset, so every run is a dry run however it's called. Promotion (D8) means setting that secret.
- **C5 — The output adds one count, `capped`.** It is `true` when a pass hit its limit, so "found"
  is a lower bound. Everything else in §1's output stays as written.

### Note (no change): cascades skip the grace window

`meal_photos` cascades from **`meal_id`, `meal_cook_id` and `household_id`** (all `ON DELETE
CASCADE`), not just meals. `meals` has a member `DELETE` policy (`is_member_of(household_id)`), but
`src/` has no hard-delete call on `meals` or `meal_cooks`, and no prod function hard-deletes them.
If any hard delete ever happens, those photos skip the 30-day window and go as orphans after 7 days.
That's acceptable while hard deletes don't happen. Any future hard-delete path should note it.

### Verification additions

11. **(dev live run)** A row whose objects were already removed by hand → `remove()` returns no
    error → the row is deleted. This confirms the missing-object behaviour.
12. With `SWEEP_LIVE` unset, `{"dry_run": false}` still returns `dry_run: true` and deletes nothing.

### Dev Step 0 — read later the same session, once the MCP reconnected

Dev (`zxwtxjjmssykhqrghouf`, `7642734024280108049`) **matches prod on every Step 0 point**:
`pg_cron` and `pg_net` are not installed, Vault 0.3.1 holds 0 secrets, and there is no `cron.job`.
The only writers are `add_meal_photo` and `remove_meal_photo`. There are no triggers, and
`authenticated` has no `UPDATE`. `service_role` holds `DELETE` on `meal_photos` and `SELECT` on
`storage.objects`. Data: 9 rows, 6 soft-deleted, 0 expired, 18 objects, 0 orphans, 0 bad names.
C1 therefore holds on both databases.

070 was applied on dev 2026-10-26 02:44 UTC (`apply_migration` was accepted and wrote ledger row
`20261026024410`). VERIFY was exact: three functions, `secdef false`, `search_path` empty, `EXECUTE`
to `service_role` only, no PUBLIC. `meal-photo-sweep` v1 deployed to dev with `verify_jwt false` and
neither secret set. An unauthenticated call returns `500 misconfigured` (fail closed).

### Dev test fixtures (2026-10-26) and the undo list

These were planted on dev for a dry run with counts that aren't zero (Verification 1, 2, 5). All are
in Madbury, meal "Dark and Stormy". That meal's removed rows are photo-menu walk data from
2026-10-25 and are disposable.

| Fixture | What | Set to | Expected dry run |
|---|---|---|---|
| Row `5405afa8-bddf-43b9-bd1b-8d4515a9bcdf` | removed photo, both objects present | `deleted_at` = now() − 31 days (was 2026-10-25 03:10:32.865611+00) | expired (the live run deletes it permanently, by design) |
| Row `7856708a-a47d-49c6-92d5-95b132cfa8d0` | removed photo, both objects present | `deleted_at` = now() − 29 days | untouched |
| Object A `faadd8be-5772-4f8f-b5e4-2684ebd6f700/bba37108-2ca2-401c-915f-c7c525981f3e/a5b7e827-45ad-4dc0-a8b4-01e9da7b3f53-thumb.jpg` | orphan, valid name | `created_at` − 8 days | orphan (the live run removes it) |
| Object B `faadd8be-5772-4f8f-b5e4-2684ebd6f700/bba37108-2ca2-401c-915f-c7c525981f3e/3d2fa31d-8316-4849-9ba3-aa505034b24d-view.jpg` | orphan, valid name | today | too new to sweep |
| Object C `faadd8be-5772-4f8f-b5e4-2684ebd6f700/bba37108-2ca2-401c-915f-c7c525981f3e/sweep-test-C-bad-name.jpg` | orphan, bad name | `created_at` − 8 days | `orphans_found` counts it, then `skipped_bad_path` |

Expected dry run: `expired_found 1`, `orphans_found 2` (A + C), `skipped_bad_path 1`, every
removed/deleted count 0, `errors 0`. Rows and objects are unchanged before and after.

**Dev dry run, 2026-10-26 03:13:56 UTC: PASS.** Dan ran it with `SWEEP_SECRET` set and
`SWEEP_LIVE` unset. It returned `dry_run true, expired_found 1, expired_removed 0, rows_deleted 0,
orphans_found 2, orphans_removed 0, skipped_bad_path 1, capped false, errors 0`, matching
every field of the expectation. The hand counts before (03:12:48) and after (03:14:32) are
identical: 9 rows (3 live), 21 objects, expired 1, orphans 2, and row `5405afa8` still has both
objects. All three fixtures are still present. The function log line holds the counts only, with
no paths or ids (Verification 8, part; Verification 9 passed). Before the secret was set, a call
returned `500 misconfigured` and logged only that.

Planned live-run test of C3: before the live run, delete **one** of row `5405afa8`'s two objects
by hand. The run should still return no error and then delete the row.

**UNDO, owed after the dev live run. Not done until each is read back:**
1. **Restore the 29-day row:** `update meal_photos set deleted_at = '2026-10-25 03:11:32.382776+00'
   where id = '7856708a-a47d-49c6-92d5-95b132cfa8d0';`. Otherwise it expires for real one day after the
   backdate (from 2026-10-27 02:55 UTC) and the next sweep run deletes it, scheduled or by hand. **Do this before 071's first scheduled
   run** if the live run slips.
2. **Delete object C by hand** through the Storage API (dashboard or service-role `remove()`),
   never `DELETE FROM storage.objects` (D6). The sweep never removes it because the path guard
   skips it on every run, by design.
3. Object B becomes a real 7-day orphan about 2026-11-02 and the scheduled sweep removes it. No
   hand step is needed, but delete it with C if you'd rather not wait.

The query below was run for the read above; kept for prod and re-runs:

```sql
select (select system_identifier from pg_control_system()) as which_db,  -- expect 7642734024280108049
  (select json_agg(json_build_object('name',name,'installed',installed_version))
     from pg_available_extensions where name in ('pg_cron','pg_net','supabase_vault')) as exts,
  (select count(*) from vault.secrets) as vault_secrets,
  to_regclass('cron.job') is not null as cron_present,
  (select string_agg(p.proname, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~* 'update\s+(public\.)?meal_photos') as writers_of_meal_photos,
  (select count(*) from pg_trigger where tgrelid = 'public.meal_photos'::regclass and not tgisinternal) as photo_triggers;
```

---

# SPEC_photo_sweep.md — Amendment 2026-10-26b: schedule from GitHub Actions, not pg_cron + pg_net

*Design chat, 2026-10-26 22:06 ET. Append to `docs/specs/active/SPEC_photo_sweep.md` after Amendment 2026-10-25, append-only. Supersedes the scheduling half of D7 and Amendment C1 / C2. Everything else in the spec stands, including the function, 070, D1–D6, D8 and the two-key live mode (C4).*

---

## Why

071 was applied on dev (Dan, SQL editor, 2026-10-26 ~22:03 ET) and **raised as designed**:
`071: an API role still holds access on net or cron on 7642734024280108049 — the revokes did not take; not scheduling`.
The whole transaction rolled back.

A rolled-back diagnostic (the same create + revoke, then a forced raise) showed the cause:

- `net` schema ACL includes `=U/supabase_admin`: **PUBLIC usage, granted by `supabase_admin`**.
- `net.http_get` / `net.http_post` ACLs include `=X/supabase_admin`: **PUBLIC execute, granted by `supabase_admin`**.
- `anon`, `authenticated` and `service_role` therefore all read `net_usage=t, http_post=t, http_get=t` after our revokes.
- `cron` is clean: `cron_usage=f` for every API role.

Only the grantor (or a superuser) can revoke a grant. `postgres` is neither, so `revoke … from public` is a silent no-op. A pg_net upgrade would re-grant anyway. **Installing pg_net gives every API role an outbound-HTTP capability we cannot narrow.** That breaks the rule set 2026-10-26 (an API role holding access to `net` = stop before scheduling) and the least-privilege model of 068.

Read back afterwards: `pg_extension` holds neither `pg_cron` nor `pg_net` on dev (0 rows). Nothing from 071 or the diagnostic persisted.

## Decision (Dan)

**A — the daily call comes from a GitHub Actions scheduled workflow, not from the database.** No pg_net, no pg_cron, no new database surface. The `meal-photo-sweep` function, its secrets, 070's RPCs and the two-key live mode are unchanged.

Rejected:
- **B, install pg_net and accept the PUBLIC grants.** Every API role would gain outbound HTTP. That's acceptable only if something else (e.g. Database Webhooks) ever forces pg_net in, and then it's its own decision.
- **C, ask Supabase support to revoke as `supabase_admin`.** Undone by the next pg_net upgrade.

## Design

**G1. One workflow file: `.github/workflows/meal-photo-sweep.yml`.**
- Scheduled workflows fire only from the default branch, so the file must be on `main`.
- Carry the identical file on `dev` so the trees match. It never fires from `dev`.

**G2. Triggers.**
- `schedule: - cron: '17 8 * * *'` (UTC, unchanged from 071).
- `workflow_dispatch` with a `target` choice input (`dev` | `prod`), **default `dev`**. Manual runs never default to prod.

**G3. Two jobs, one per target.**
- `sweep-dev` runs on schedule and on dispatch when `target == dev`.
- `sweep-prod` runs only when the repository variable `SWEEP_PROD_ENABLED == 'true'` (schedule), or on dispatch when `target == prod`. Prod switches on later without editing `main`.

**G4. Least privilege in the workflow itself.**
- `permissions: {}`: the `GITHUB_TOKEN` gets no rights.
- **No `uses:` steps at all**, so no third-party actions and no supply chain. One `run:` step on `ubuntu-latest` with `curl`.
- No `set -x`.
- `concurrency: meal-photo-sweep-${{ <target> }}` with `cancel-in-progress: false`, so runs never overlap.

**G5. The call.**
- `curl -sS --fail-with-body --max-time 120 -X POST <url> -H 'content-type: application/json' -H "x-sweep-secret: $SWEEP_SECRET" --data '{"dry_run": false}'`
- The secret is passed through `env:` from `secrets.SWEEP_SECRET_DEV` / `secrets.SWEEP_SECRET_PROD`, never inline in the command string.
- The URLs are not secret and live in the file:
  - dev: `https://zxwtxjjmssykhqrghouf.supabase.co/functions/v1/meal-photo-sweep`
  - prod: `https://parpauldmbetptkmdwbd.supabase.co/functions/v1/meal-photo-sweep`
- The body is always `{"dry_run": false}`. Whether a run is live is still decided by the function secret `SWEEP_LIVE` alone (C4).
- The step prints the response body, which is counts only, so the Actions log is the run record.

**G6. Failure means a red run and an email.**
- Any non-2xx fails the job (`--fail-with-body`).
- GitHub emails the person who last edited a scheduled workflow when a run fails. Dan confirms his Actions notification setting is on.

**G7. Secrets live in GitHub repository secrets, set by Dan in the web UI** (Settings → Secrets and variables → Actions):
- `SWEEP_SECRET_DEV` = dev's current `SWEEP_SECRET` (04:08 UTC 10-26, Bitwarden "Sweep secret: dev").
- `SWEEP_SECRET_PROD` = prod's own freshly generated secret, at prod rollout. **Never dev's value.**
- GitHub cannot show a secret back. The proof that it matches is the first manual run returning 200, not 401.
- Bitwarden notes gain a pointer line ("also set in GitHub secret SWEEP_SECRET_DEV").

**G8. The 071 cleanup.**
- 071 was never applied anywhere and has no ledger row. Remove `migrations/071_meal_photo_sweep_schedule.sql` with `git rm` (history keeps it), in a commit naming this amendment.
- **The number 071 is burned.** It appears throughout the docs, so the next migration is **072**.
- Delete the dev Vault secret `meal_photo_sweep_secret` in the Vault UI. Nothing reads it, and it is an orphaned copy of the secret.

**G9. The `main` push.** Adding the workflow to `main` triggers a Vercel production rebuild of unchanged `src/`. Confirm the served bundle name is unchanged (`main.5f734ba4.js`), or that only the deployment id moved. No promotion of `src/` rides this commit.

**G10. Repo visibility.**
- Claude Code reports whether `Velayo-ai/ourprovisions` is public or private.
- If public, GitHub pauses scheduled workflows after 60 days with no repository activity. Record it as a WATCH item.

## Rollout (replaces the amendment's 071 / prod steps)

**Dev**
1. Delete the dev Vault secret (G8). Set `SWEEP_SECRET_DEV` (G7).
2. Write the workflow; commit it to `dev`; commit the identical file to `main` (G1, G9). `git rm` 071 on `dev` (G8).
3. Run a manual dispatch with target `dev` → 200, counts JSON, a dry run (`SWEEP_LIVE` unset). Check the function log: one counts-only `POST 200`.
4. Observe the first scheduled 08:17 UTC run. Allow up to an hour of GitHub delay.
5. **Then** set `SWEEP_LIVE=true` on dev: one change at a time, after a clean scheduled dry run. Object B (created 10-26) is removed by the scheduled run around 2026-11-02 / 03. Read it back. This is the end-to-end live proof before prod.

**Prod**
1. Generate a fresh prod secret and set it on the prod function (Dan); set `SWEEP_SECRET_PROD` (G7); save both in Bitwarden.
2. Apply 070 on prod (Dan, SQL editor) and read back VERIFY.
3. Deploy `meal-photo-sweep` to prod from the repo.
4. Run a manual dispatch with target `prod` → a dry run Dan reads (expect orphans only, if any).
5. Set the repository variable `SWEEP_PROD_ENABLED=true`, so scheduled prod runs start dry.
6. **Prod live (`SWEEP_LIVE=true` on prod) only after dev's scheduled run has removed B.** Black n' Pumpkin's original (`8351467f…`) is permanently deleted about 30 days after that.

## Verification

- **V-G1** The workflow is identical on `main` and `dev`; it has no `uses:`, `permissions: {}`, and the secret appears only through `env:`.
- **V-G2** A manual dispatch to dev returns 200 with counts JSON. The Actions log shows the body and never the secret (masked `***` at most). The function log has one counts-only `POST 200`.
- **V-G3** The first scheduled run appears in Actions history and returns 200, dry.
- **V-G4** The prod job does not run on schedule while `SWEEP_PROD_ENABLED` is unset (the scheduled run shows it skipped).
- **V-G5** After `SWEEP_LIVE=true` on dev, the scheduled run around 11-02 / 03 reports `orphans_removed 1`, and B is gone on read-back.
- **V-G6** The Vercel prod bundle is unchanged after the `main` commit (G9).
- **V-G7** `pg_extension` on dev and prod holds no `pg_net` and no `pg_cron`.

## Principle

**A guard that stops is a success.** 071 refused to schedule around a revoke that didn't take, exactly as written. The fix was to change where the call comes from, not to loosen the guard.
