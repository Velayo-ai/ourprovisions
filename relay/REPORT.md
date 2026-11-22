Reported: 2026-11-21 23:15 ET · dev fb97941 · main 80cd739 · re: Part B to prod: 087 on prod through the CLI (relink, read back by object, no ledger, no fixtures), promote the client, read the markers, rollback plan; report after step 3 and stop

## Ask shelf sync Part B is live on prod: 087 applied first, then the client. Ready for Dan's prod walk

### 1. 087 on prod (Dan approved)
- **CLI link:** dev (`zxwtxjjmssykhqrghouf`) → **prod** (`parpauldmbetptkmdwbd`). A read-only probe showed sysid `7606130613603586966`, `postgres`, no `edit_ask`, and `land_ask_picks` still `0defbd6e…`.
- **The file:** the committed `087_ask_shelf_deltas.sql` with two changes, confirmed by diff (two hunks only):
  - the **fixture block removed** (lines 512–785; no fixtures on prod);
  - a **prod-only pre-flight**: any sysid other than `…586966` raises.
  - The function bodies are untouched.
- **Run:**
  - Parse check (ending in `rollback;`): VERIFY passed, closing row 'rolled back', nothing persisted.
  - **Applied 2026-11-22 04:09:12 UTC:** closing row `committed`.
- **Read back by object** (read-only prod MCP):
  - Bodies, CR stripped: `edit_ask` `394667711aef89e05675cc681623e0d2`, `land_ask_picks` `1376af1f060719ed42003b6faf08c662`, `asks_stamp_deleted_by` `50b66842d10482367343b322dd960d2c`. All three equal dev and the file.
  - All three SECURITY DEFINER with `search_path=""`, owner postgres.
  - ACLs via `aclexplode`: `edit_ask` **exactly** `authenticated=EXECUTE`; `land_ask_picks` `authenticated=EXECUTE`; trigger function no grantees.
  - Trigger `trg_asks_stamp_deleted_by`: enabled (`O`), `BEFORE UPDATE OF deleted_at … WHEN (old.deleted_at IS NULL AND new.deleted_at IS NOT NULL)`.
  - Column `deleted_by`: uuid, nullable. FK `FOREIGN KEY (deleted_by) REFERENCES users(id)`.
  - Client grants on `asks` unchanged: table `authenticated=SELECT`; column UPDATE only `deleted_at`, `updated_at`; `has_column_privilege(authenticated, deleted_by, UPDATE)` = false.
  - `update_ask` unchanged (`bda189ca…`), `create_ask` unchanged (`0d820ae1…`). Fixture rows 0.
  - No ledger on prod.
- **CLI relinked to dev:** `zxwtxjjmssykhqrghouf`, probe sysid `7642734024280108049`. The tracked `supabase/.temp/linked-project.json` is unchanged.

### 2. Client promoted (Dan approved the main push)
- **Main:** `80cd739`, a whole-tree copy of dev `fb97941`. `git diff --stat fb97941` was empty (working tree, index and committed tree). `origin/main..HEAD` = that one commit: the Part B client, the 087 files and CLAUDE.md (14 files).
- **Push:** `dac0fc3..80cd739`.

### 3. Prod deployment and markers
- **Deployment:** `dpl_HP8ebB3Mp2tzAyCjJPcLcqiQv9MR` (sha `80cd739`, production, READY). The `ourprovisions.velayo.ai` manifest and the deployment's own manifest both name **`main.4e6c5a9d.js`**.
- **Live bundle, fetched from the domain;** each marker found once:
  - `Someone else just changed this shelf. Check it and save again.` (B5)
  - `available any more.` (B7 / B9.3)
  - `rpc("edit_ask"` (B3)
  - `removed this ask.` (B8)
  - `setTimeout(e,1200))]).then` (Part A)

### Rollback plan (stated before the push)
1. **Client first:** Vercel Instant Rollback to `dpl_EpGMKkE64woPHjyHr43PmExqCD21` (`dac0fc3`). Never a redeploy.
2. **Then `087_rollback.sql`, only if needed.** 087 is additive (`update_ask` untouched), so the old client works against it.

### For SESSION END
- The 087 header records the dev apply only. The prod apply (04:09:12 UTC, the fixture-free prod copy, read back above) belongs in the SESSION_LOG and a header addendum. I didn't make that a separate commit, so main stayed tree-identical to dev.

**Next:** Dan walks prod.
