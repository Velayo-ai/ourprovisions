# Phase A promotion plan — 072 → 076, then the client (written 2026-10-31 night, run 2026-11-01 morning)

Prod: `parpauldmbetptkmdwbd`, system_identifier **7606130613603586966**. Dev: `zxwtxjjmssykhqrghouf`, **7642734024280108049**.
Prod today: `main` b28900d, bundle `main.66e1e366.js`, none of 072–076. Prod has **no migration ledger**, so a migration
counts as applied on prod only when its own objects read back from a **separate connection** (Claude Code's
`supabase-prod-readonly` MCP), never from the editor's VERIFY output.

## Rules for the morning
- One migration per editor run. After each one: Claude Code runs the read-back (below) on prod and you check the row against
  the table. **Do not open the next file until the row matches.**
- Open the file from the repo, `C:\Users\mr_dh\ourprovisions\migrations\`, never a copy from anywhere else. Before you paste,
  check the line count, that line N reads exactly `commit;`, and that the file's sha256 starts with the value below.
  None of the five files has an uncommented `rollback;` (checked 2026-10-31 night). No `*.PARSE_CHECK.sql` exists
  anywhere on disk. If one turns up, it is not the file to run.
- Run as `postgres` in the prod SQL editor. **Check that the dashboard shows the prod slug `parpauldmbetptkmdwbd`** before
  each run (both projects show "main PRODUCTION"). Every file's preflight also refuses an unknown database.
- **Skip the trailing `-- LEDGER (dev only)` block.** Prod has no ledger table. It is commented out, so leave it that way.

| Step | File to open | Lines | `commit;` at | sha256 (first 12) |
|---|---|---|---|---|
| 1 | `migrations/072_meal_sharing_phase_a.sql` | 1072 | 982 | `8811cb38d392` |
| 2 | `migrations/073_set_photo_kind.sql` | 610 | 553 | `09ed3cd655f2` |
| 3 | `migrations/074_gift_photo_ext.sql` | 798 | 717 | `cd239f77b7a5` |
| 4 | `migrations/075_gift_giving_place.sql` | 377 | 331 | `7738cabc775d` |
| 5 | `migrations/076_household_showcase.sql` | 865 | 802 | `c9eb9ad06d84` |

Never open the `0NN_rollback.sql` files unless you are rolling back.

## Step 0 — before anything runs
1. `git status` clean; `git log origin/dev..dev` and `origin/main..main` both empty.
2. Re-run the files' sha256: `sha256sum migrations/07[2-6]_[a-z]*.sql` must match the table.
3. Prod read-back (below) must equal the **Before** row. Prod identity: `7606130613603586966`.
4. Capture prod's rollback deployment: the Vercel deployment id currently serving `ourprovisions.velayo.ai`
   (b28900d / `main.66e1e366.js`).

## The read-back (Claude Code runs it on prod after each step)
`qa/phase_a_readback.sql` is one row of markers plus `fn_fingerprint` (an md5 over the body and ACL of every Phase A
function, plus `add_meal_photo`). It was proven on 2026-10-31: dev reads every marker true and fingerprint
`f148b1a5df0436fd993671c3bafe04e1`, and prod reads the Before row.

| marker | Before | after 072 | after 073 | after 074 | after 075 | after 076 |
|---|---|---|---|---|---|---|
| m072_tables (meal_gifts + receipts) | f | **t** | t | t | t | t |
| m072_kind_col (meal_photos.kind) | f | **t** | t | t | t | t |
| m072_rpcs (give_meal, preview_meal_gift_public, accept_gift_photo) | f | **t** | t | t | t | t |
| m072_bucket (gift-photos) | f | **t** | t | t | t | t |
| m073_set_photo_kind | f | f | **t** | t | t | t |
| m073_cook_idx_cook_only | f | f | **t** | t | t | t |
| m074_photo_ext | f | f | f | **t** | t | t |
| m074_attach_gift_photo | f | f | f | **t** | t | t |
| m074_bucket_jpeg | f | f | f | **t** | t | t |
| m075_is_giving_place | f | f | f | f | **t** | t |
| m076_cols_of_3 | 0 | 0 | 0 | 0 | 0 | **3** |
| m076_per_meal_idx | f | f | f | f | f | **t** |
| m076_per_person_idx_gone | t | **f** | f | f | f | **t** |
| m076_add_showcase_gone | t | **f** | f | f | f | **t** |
| fn_fingerprint | cc47a145… | changes | changes | changes | changes | **= dev's** (`f148b1a5…`; Claude Code re-reads dev's value at the time) |

A row that doesn't match means stop. Don't run the next file, and don't run a rollback without reading why first.
After 076 the fingerprint must equal dev's. If it doesn't, Claude Code diffs per function before the client ships.
Extra read-backs after 076: `select count(*) from meal_photos where kind = 'showcase'` → 0 (prod has no showcases, so
no backfill), and a prod `get_advisors` security pass with no new findings on `meal_gifts` / `meal_gift_receipts`.

## Client promotion — **a tree copy of dev's `src/`, one commit on main** (ruled 2026-10-31; not `-x` picks, not a merge)
Dev-only check (done 2026-10-31 night, repeat before the commit): the added lines in the 24 files carry no `NODE_ENV`, deploy-env
or `isProd` switch, no `console.log` or `debugger`, and no hard-coded dev project. `supabaseAnon.js` reads the same
`REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_ANON_KEY` as `supabaseClient.js`. The share link uses
`window.location.origin`. The only dev URLs are fixtures inside `*.test.js` files.
Why: `git diff origin/main origin/dev -- src public package.json package-lock.json vercel.json` is 24 files, and every
one is Phase A, plus dev's deletion of the never-run CRA `src/App.test.js` (`830018e`, 10-23). `public/`,
`package*.json` and `vercel.json` are identical.
- **`-x` picks** would replay 15 commits that include states we threw away: Commit 0's `add_showcase_photo` path (076 drops
  that function), and `bf09477`'s re-encode, which `2a116ef` reverted. That is churn and conflict risk with no gain, and the
  result still has to be proven by tree diff.
- **A merge** would pull 320 dev-only commits of ancestry, including docs, migrations and handoff history, onto main, where
  earlier `-x` promotions already duplicate them. Expect conflicts in `docs/`, and a main that is no longer "dev's
  `src/`, promoted".
- **A tree copy** is the shape used on 09-28 ("dev `src/` whole"), and its proof is a single empty diff.

```
git checkout main && git pull --ff-only
git checkout --no-overlay origin/dev -- src/   # --no-overlay: plain checkout never removes files dev deleted
                                               # (2026-11-01 it left App.test.js behind → 23 paths, not 24)
git status --short            # expect the 24 paths above, App.test.js as D
git commit -m "Phase A client to prod: main src/ = dev <sha> src/ (…)"
git diff origin/dev HEAD -- src public package.json package-lock.json vercel.json   # expect EMPTY
git log --oneline origin/main..main                                                  # expect exactly 1
git push origin main
git checkout dev
```

## Bundle proof on ourprovisions.velayo.ai
Watch the deploy through the Vercel MCP (`list_deployments` filtered by sha, then aliases), not a curl loop, which triggers
the Vercel checkpoint. Then fetch the asset manifest **once** and count markers in the new `main.*.js`:

| marker | prod before (`main.66e1e366.js`) | dev today (`main.495e2dfd.js`) = expected |
|---|---|---|
| `pending_gift_code` | 0 | 1 |
| `rv-give` | 0 | 5 |
| `is_giving_place` | 0 | 1 |
| `attach_gift_photo` | 0 | 1 |
| `showcased_by` | 0 | 4 |
| `preview_meal_gift_public` | 0 | 1 |
| `gift-photos` | 0 | 4 |
| `set_photo_kind` | 0 | 3 |

Also check that the prod bundle carries the `.gift-add` / `.give-go` allow-list rows, and that its `deploymentEnvironment`
is `production`.
Rollback: Vercel instant rollback to the Step 0 deployment. The DB stays, because 072–076 are safe under the old client
(it never calls the new RPCs, and `add_meal_photo` keeps its signature).

## The real-gift walk on prod
**Ruled 2026-10-31 (design chat, 23:18):** the walk runs in DT's test places only. **Madbury is not touched.**
DH = Daniel Holmes, DT = Dan Test User. On prod the two share no household: DT is in GSL Home (`e6f8d14c`, 1 member,
1 meal) and NewLeaf (`d3a6ac17`, 1 member, 1 meal). The first names differ on prod ("Daniel" vs "Dan"), so the
"Dan H" / "Dan T" disambiguation will not show there. That is expected, not a fail.

0. **DH joins GSL Home:** DT invites from GSL Home, and DH accepts. Read back DH's `household_members` row in GSL Home.
1. **DT makes the showcase in GSL Home:** DT adds a photo to GSL Home's meal → ⋯ → Make showcase (the S48 prompt). Read
   back `showcased_by` = DT and `kind` showcase.
2. **DH gives it:** DH opens the meal in GSL Home → share icon → B1 reads "The meal's showcase photo goes with it ·
   Made showcase by Dan." → Give → B3 → B4 → Copy link. Read back `meal_gifts.photo_ext` (jpg or webp) and the two
   `gift-photos/{id}/` objects.
3. **Signed out** (private window): the link shows A1 with the photo and no Helm. **Capture the prod HAR here** (below).
4. **DT accepts into NewLeaf** (switch the active place to NewLeaf first): the prefilled form with the photo at the top
   ("Comes with the meal.") → Add → read back a receipt for NewLeaf, the copy in NewLeaf, and a `meal_photos` row with
   `received_at` set, `uploaded_by` = DH, and `kind` showcase.
5. **The giving place:** with GSL Home active, the same link → C11 "Already one of GSL Home's meals · Open it" (the
   source meal is live here).
6. **Stop giving** (DH, GSL Home) → the link reads A3.
7. **DH leaves GSL Home.** Read back that DH's GSL Home membership is soft-deleted and that DH's other places are unchanged.
8. **Clear the prod test data** after listing it first, the same way as on dev: the gift (its receipt goes with it), the
   NewLeaf copy (its received row goes with it), and the four storage objects (2 in `gift-photos`, 2 under the copy in
   `meal-photos`). Keep or remove DT's GSL Home photo, your call at the time.

## After the promotion (not part of it)
- **G, ruling (b)** (design chat 2026-11-01, replaces (a)): when the giving place opens a link whose source meal is deleted
  (`preview_meal_gift` returns `is_giving_place` true and `source_meal_id` null), it gets C11's sheet with the single line
  "Sorry, the meal {Place} gave has since been deleted." and OK. No form and no "Open it". Dev on 2026-11-01 showed C11
  "Already one of Madbury's meals", which is a **FAIL against (b)**. The fix is client-only (the giving branch at
  `App.js` `if (r.isGivingPlace)` plus `giftArrival.js`), with no migration, built and walked on dev after prod is live. Prod
  ships with this known fail, and the prod walk does not exercise it.

## Prod HAR after
Same method as V22: 90 s in the foreground on the signed-out card. Decode both pipelines with `qa/har_scan.js`
against **prod's** gift codes. Expect 0 codes / `ref=` / `invite=` / `token=` /
`/g/` in spans and replay. The scan passes only on `VERDICT: PASS` with `DECODED: spans ≥ 1 · replay ≥ 1`. Zero decoded
payloads in either pipeline is a FAIL (exit 1), not a clean result. Delete the HAR afterwards.
