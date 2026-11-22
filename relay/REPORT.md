Reported: 2026-11-22 00:38 ET · dev 8cdc8e2 · main 54d453c · prompt a616225 · re: version check walked on iPhone; RUM ignore + promote to prod

## App version check is live on prod: the notice ships, the build tag stays out, the manifest fetch is untraced

**Noted:** Dan walked the version check on the installed iPhone (dev). The tag `dev · f66db6a` showed under the Helm (spot approved). With the app backgrounded, I pushed the empty commit `529ecbc` (Dan approved). On foreground: "A new version is ready." → Reload → tag `dev · 529ecbc`, notice gone. With the 20/20 harness pre-walk, SPEC_app_version_check is walked on dev.

### 1. RUM ignore (on dev)
- **Change:** `SplunkOtelWeb.init` gets `ignoreUrls: [/asset-manifest\.json/]` in both environments, so the version check's fetches make no RUM span.
- **Test:** pinned in `rum.test.js`. The manifest matches; a Supabase RPC and `/manifest.json` don't.
- **Commit:** `8cdc8e2`, its own commit. 1205 tests pass, `CI=true` build clean.
- **Push:** Dan approved; pushed as `529ecbc..8cdc8e2`.
- **Read back:** `dpl_2uMPWdkA7rHhup2dTDNzqKnBGMQS`; the deployment and `dev.ourprovisions.velayo.ai` both name `main.71efef34.js`, and the bundle carries `ignoreUrls:[/asset-manifest\.json/]` and the full sha `8cdc8e2…`.

### 2. Promoted to prod (client only, no migration, Ask flag untouched, so no prod walk under the standing rule)
- **Main:** `54d453c`, a whole-tree copy of dev `8cdc8e2`. `git diff --stat 8cdc8e2` was empty (working tree, index and committed tree). `origin/main..HEAD` = that one commit, 11 files: the version check, BuildTag, VersionNotice, the RUM ignore, `tools/harness/version-walk.js` + README, and CLAUDE.md (take prompt, harness pre-walks). Nothing under `migrations/` or `supabase/`.
- **Push:** Dan approved; pushed as `80cd739..54d453c`.
- **Deployment:** `dpl_D5cbUAGqNdVdmFi81kEe8vMpq4tb` (sha `54d453c`, production, READY). The `ourprovisions.velayo.ai` manifest and the deployment's own manifest both name **`main.65cdbe49.js`**.
- **Live prod bundle** (fetched from the domain):
  - `A new version is ready.` ×1 and `op-version-notice` ×1: **present**.
  - `op-build-tag`: **0, absent**. Prod never shows the tag.
  - `ignoreUrls:[/asset-manifest\.json/]`: **present**.
  - Also checked: `ask-search-debug` 0 (the 11-17 dev readout is still out); `Someone else just changed this shelf.` ×1 (Part B still in); the full sha `54d453c…` ×1.
- **Rollback:** Vercel Instant Rollback to `dpl_HP8ebB3Mp2tzAyCjJPcLcqiQv9MR` (`80cd739`). Never a redeploy.

### State
- Prod = main `54d453c` / `main.65cdbe49.js`. Dev = `8cdc8e2`. Both pushed; local matches origin; I'm on dev.
- **From now on, prod phones see "A new version is ready." after every promotion.**
- **For SESSION END:** the 087 header addendum for its prod apply (2026-11-22 04:09:12 UTC) is still owed. `SPEC_app_version_check.md` and `SPEC_ask_shelf_sync.md` are still in `handoff/`; both features are now live on prod, so both specs go to `docs/specs/built/`.
