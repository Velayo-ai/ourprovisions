Reported: 2026-11-21 23:36 ET · dev 289db56 · main 80cd739 · prompt cbc9d9a · re: BUILD SPEC_app_version_check — Step 0 only

## App version check, Step 0: no surprises. No service worker, the manifest can't go stale, and the sha is already in the build

**Noted:** Ask shelf sync Part B walked on prod by Dan at 23:23 (V4, V9, V10 pass on `main.4e6c5a9d.js`). Done, and dropped from pending.
**Spec:** `SPEC_app_version_check.md` pulled from `origin/handoff` (`3d68070`) into `handoff/` (Step 0.5's first bullet). No code, no commits.

### 1. Service worker: none, so a plain `location.reload()` is enough
- **No service worker, now or ever:**
  - No `serviceWorker` / Workbox / `caches.` anywhere in `src/`; no `sw.js` or `service-worker.js` in `public/`; `src/index.js` registers nothing.
  - `git log -S serviceWorker -- src public` is empty, so no installed phone can be holding an old registration from us.
  - `public/manifest.json` + `apple-mobile-web-app-*` meta only (home-screen install, not offline).
- **Why phones run old code:** an installed iOS web app resumes the page that's already in memory and doesn't reload it on foreground. HTTP caching isn't the cause (see 2).
- **What `location.reload()` does:** re-requests `index.html`, which must revalidate, so the ETag check gets the new page naming the new hashed `main.<hash>.js`. That fetches the new immutable bundle.
- **Proposal:** Reload = plain `location.reload()`. No service worker work.
- **Offline check-off:** doesn't depend on a service worker. It isn't built yet (`docs/specs/active/SPEC_offline_checkoff.md`, still NEXT). Constraint for that spec: if it ever adds a service worker (for example to launch offline), the version check's Reload must then do `registration.update()` + `skipWaiting` before reloading, or it would serve the cached shell. Worth one line in that spec.

### 2. Caching headers (read tonight with `curl -sI`)
| | `/` and `/index.html` | `/asset-manifest.json` | `/static/js/main.<hash>.js` |
|---|---|---|---|
| prod `ourprovisions.velayo.ai` | `public, max-age=0, must-revalidate` + ETag | `public, max-age=0, must-revalidate` + ETag | `s-maxage=31536000, immutable` |
| dev `dev.ourprovisions.velayo.ai` | the same | the same | (same build rules) |
- `vercel.json` sets only `Referrer-Policy`. These are Vercel's defaults for a CRA build.
- **Edge cache:** prod showed `X-Vercel-Cache: HIT` with Age about 17–20 min, but `Last-Modified` 04:15 UTC is after tonight's deploy. That's consistent with Vercel purging its edge cache on each deployment. The edge copy is current, not stale.
- **Browser cache:** `max-age=0, must-revalidate` means the browser must revalidate every time. The check will also fetch with `cache: 'no-store'` (V1), which skips the browser cache entirely.
- **Verdict:** the manifest can't be served stale. No `vercel.json` change needed.
- **The compare is like-for-like:** the manifest's `files["main.js"]` is `/static/js/main.4e6c5a9d.js`, and `index.html` loads `<script defer src="/static/js/main.4e6c5a9d.js">`. So "what's running" = that script tag's `src`, read once at startup (CRA has no build-time constant for its own hash). Under `npm start` the page runs `bundle.js`, the two match, and no toast shows.

### 3. The toast, and "an Ask run is open"
- **Toast:** `showToast(message, action, { ms, line })` (`App.js` ~5927) is **one slot**:
  - a new toast replaces the current one;
  - every toast auto-hides on a timer (2.5 s, 4 s with an action, `ms` to override);
  - there's no dismiss control (the action button clears it).
  - The hand-back toast is `showToast(<>{Label} added {N}</>, { label: "See", … }, { ms: 10000 })`, fired from `onHandBack` right as the run closes.
- **Run open:** `runAskId` (App state, ~6954). Non-null while a run is up; set to null by That's it!/Great picks' hand-back, Done/Close, and a tab or household switch.
- **Proposal:**
  - The version notice is **its own small element in the toast's style** (same dark pill, Lato, same anchor), not `showToast`. It has to stay until Reload or ✕ (no timer), carry two controls (Reload, ✕), and not be clobbered by, or clobber, a timed toast.
  - Show it only when `!runAskId && !toastMessage`. So at the end of a run it waits out the 10 s hand-back toast ("{Label} added {N} · See") instead of replacing it, then appears.
  - ✕ dismisses it for this foreground; the next `visible` (V1) re-checks and may show it again.

### Proposals for V3, the dev build tag
- **The sha needs no new wiring.** `.env.production` (tracked) already maps `REACT_APP_GIT_SHA=$VERCEL_GIT_COMMIT_SHA` (dotenv-expand; Vercel's env wins). `rum.js` already uses it for the RUM version. Both of tonight's bundles carry their full sha (dev `fb97941…`, prod `80cd739…`).
  - **Least fragile:** reuse `REACT_APP_GIT_SHA` and slice it to 7 characters. It's already proven on every Vercel build, and needs no `vercel.json`, build script or Vercel env entry to drift.
  - A Vercel env reference (a dashboard variable set to `$VERCEL_GIT_COMMIT_SHA`) would be the most fragile: it lives outside the repo, per environment.
- **Gate:** `process.env.REACT_APP_DEPLOY_ENV !== "production"`, the same constant as the 11-17 `ASK_SEARCH_DEBUG`. That readout is confirmed absent from tonight's prod bundle and present in dev's, so the minifier drops it. A local build shows `local · <none>`.
- **Spot:** the band under the Helm. The Helm is a fixed pill, `left/right: 24px`, `bottom: calc(18px + var(--op-inset-bottom))`, 56px tall, z-index 900. The 18px strip under it holds nothing.
  - Proposal: `dev · fb97941`, 10px Lato at about 40% espresso, `position: fixed; left: 28px; bottom: calc(3px + var(--op-inset-bottom))`, `pointer-events: none`, z-index 901 (above page content, below sheets and the Ask run at 2000, which cover it).
  - On an iPhone it sits just above the home indicator, under the Helm's left end. It covers no control and can't take a tap. Dan approves the spot on the phone.

### Surprises
None that change the spec. The one design point is the toast's own element (it outlives a 2.5 s slot and has to avoid the hand-back toast), already covered under 3.

**Ready for BUILD** of `SPEC_app_version_check` on Dan's go. Nothing pending from Ask shelf sync.
