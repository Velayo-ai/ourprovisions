Reported: 2026-11-22 00:21 ET · dev f66db6a · main 80cd739 · prompt be845aa · re: BUILD SPEC_app_version_check (Step 0 approved)

## App version check is on dev: harness pre-walk 20/20 PASS, phone part handed to Dan

### Built (as approved in Step 0)
- **V1, `useVersionCheck`** (`src/hooks/useVersionCheck.js`, helpers in `src/lib/versionCheck.js`):
  - Reads the running `main.*.js` `<script src>` once and compares it with `asset-manifest.json`'s `files["main.js"]`, fetched with `cache: 'no-store'`.
  - Checks at startup, on `visibilitychange → visible`, and every 10 minutes while visible and online.
  - A failed fetch changes nothing and sends nothing. A rollback to the running bundle clears the notice. `npm start` (`bundle.js`) never checks.
- **V2, `VersionNotice`:**
  - The toast's pill as its own element: no timer, Reload + ✕, in the bottom stack only when `!runAskId && !toastMessage`.
  - Reload = plain `location.reload()`. ✕ hides it until the next foreground. It never reloads by itself.
- **V3, `BuildTag`:**
  - `dev · <sha7>` from `REACT_APP_GIT_SHA`, under the Helm (`left: 28px; bottom: calc(3px + inset)`), `pointer-events: none`, z 901.
  - Gated on `BUILD_TAG_ON = REACT_APP_DEPLOY_ENV !== "production"`.
  - A local prod-mode build showed `op-build-tag` 0 and the version check present. That is the check to repeat on the prod bundle at promotion.
- **Commits, pushed with Dan's approval:**
  - `c3f9449`: the feature, one scoped commit, 1202 tests.
  - `a7d5bad`: the pre-walk fix (below), 1204 tests.
  - `f66db6a`: `tools/harness/version-walk.js` + README line.
  - Pushed as `289db56..c3f9449` and `c3f9449..f66db6a`. `CI=true` build clean each time. No promotion to main.

### Read back on dev
- `dpl_HmXupCB281N3fNKn4FXH5oeaykoV` (`f66db6a`). The deployment's manifest and `dev.ourprovisions.velayo.ai`'s both name `main.7fca574c.js`.
- Live bundle: version-check marker `A new version is ready.` ×1; build-tag marker `op-build-tag` ×1; the full sha `f66db6a…` ×1. (The literal `dev · ` reads 0 only because the minifier escapes the middle dot.)

### Harness pre-walk (the new rule): two signed-in runs as Cody Test on the dev URL, manifest stubbed by request interception
- **Run 1, on `c3f9449`: 11/14.** It found a real gap. With a new version already known, the notice re-showed on an offline foreground, and **Reload with no connection would leave the installed app on a "no internet" page.**
  - Fixed in `a7d5bad`: the notice hides while offline and re-checks on reconnect.
  - A failed fetch still keeps what was known. A transient error doesn't hide a real new version.
  - The other two "fails" were the walk's own: the "Ask Test" pill sits behind "+2 more", so the run uses "Ask Kid"; and a failed fetch is now tested from a clean state.
- **Run 2, on `f66db6a`: 20/20 PASS:**
  - V3 tag shows `dev · f66db6a`; it sits under the Helm (tag top 829 ≥ Helm bottom 826, bottom 841 ≤ 844), `pointer-events: none`, z 901.
  - V1 same bundle: no notice.
  - V1 newer manifest + foreground: the notice appears. V2 copy: "A new version is ready." with Reload and ✕.
  - V2 ✕ hides it; it stays hidden in the same foreground; the next foreground shows it again.
  - V2 Ask run open (Ask Kid) + foreground: no notice (held). The run closed by its 1 s hold, then the notice appears.
  - Offline with a newer bundle known: hides. Back online: returns.
  - From a clean state: offline foreground → no fetch, no notice. A failed (500) manifest fetch → no notice, no app error (only the browser's resource-load line).
  - V2 Reload reloads the page; the fresh page on the current bundle shows no notice; the tag is still there.
- **Harness Chrome stopped** (4 processes). Screenshots `tools/harness/out/version-notice.png` and `version-tag.png` (git-ignored).
- **Not driven by the harness:** the hand-back toast's 10 s wait at a run's end. The App gate `!toastMessage` is pinned by a source test, and the run → notice order passed above.

### For Dan's phone (needs eyes or real iOS)
1. **V1/V2 on the iPhone (installed app):** open dev, note the tag (`dev · f66db6a`), then background the app. Tell me, and I'll push a trivial dev commit (asking first, as always) and say when it's live. Bring the app forward: the notice shows within a few seconds. Tap Reload: the tag shows the new sha.
2. **The tag's spot:** under the Helm's left end, just above the home indicator (see `version-tag.png`). Approve it or move it.
3. **Optional:** ✕, background, foreground → it's back; Reload → it's gone.

### Note (no change made)
Splunk RUM auto-instruments `fetch`, so each manifest check is a RUM fetch span (startup, every foreground, every 10 minutes while open). The fix would be `ignoreUrls: [/asset-manifest\.json/]` in `rum.js`, outside this spec. Dan's call.
