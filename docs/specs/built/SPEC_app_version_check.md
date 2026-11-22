# SPEC_app_version_check.md: every device knows when it's running old code

**Status:** DONE, LIVE ON PROD 2026-11-22: main `54d453c` / `main.65cdbe49.js` (notice present, build tag absent, RUM ignores the manifest). Harness pre-walk 20/20 (found and fixed the offline-Reload gap, `a7d5bad`); walked on the installed iPhone on dev.
**Scope:** OurProvisions · app shell (dev and prod)

---

## Why

On 2026-11-21, the V10 walk failed on the first try because the iPhone was still running the previous bundle after a dev deploy; it passed after the app was restarted. An installed home-screen app can hold old JavaScript for days. That causes false fails in walks and, on prod, households running old code (tonight's shelf-sync fix only helps a phone once it reloads).

## What

**V1. The app notices a new version.**
- On `visibilitychange → visible`, and every **10 minutes** while the app is open and online, fetch `/asset-manifest.json` with `cache: 'no-store'`.
- Compare its `files["main.js"]` with the script the page is actually running (read it once at startup from the `<script>` tag, or a build-time constant). Different means a new version.
- A failed fetch (offline, error) does nothing and sends no event.

**V2. It offers a reload and never forces one.**
- A toast in the existing toast style: **"A new version is ready."** with a **Reload** button. Reload does `location.reload()`.
- The toast can be dismissed. It comes back on the next foreground (V1) if the version still differs. Never more than once per foreground.
- **Never during an Ask run:** while a run is open, hold the toast and show it after That's it! or Done.
- No automatic reload, ever. A reload under someone mid-edit loses their work.

**V3. The build tag (dev only).**
- A small, low-contrast `dev · <short sha>` in a corner that doesn't cover controls (Claude Code proposes the spot; Dan approves on the phone).
- The sha comes from the build environment (`VERCEL_GIT_COMMIT_SHA`, passed in as a `REACT_APP_*` variable at build time).
- Gated on `REACT_APP_DEPLOY_ENV !== "production"` as a direct comparison the minifier removes, like the 11-17 search readout. It must be **absent from the prod bundle** (read back).

## Step 0 (report, then stop if anything surprises)
1. **Service worker:** does the app register one (CRA's `serviceWorkerRegistration`, Workbox)? If so, a plain reload may still serve cached files. Report how it caches, and propose how Reload gets fresh code (for example `registration.update()` then `skipWaiting`, or unregistering if the app doesn't need offline caching). Offline check-off depends on what works without a connection, so say whether the service worker matters to it.
2. How `index.html` and `asset-manifest.json` are cached by Vercel (headers). The manifest must not be served stale.
3. The existing toast component and how the Ask run's open state can be read.

## Verification
- **V1/V2, dev:** open the app on the iPhone and leave it in the background. Claude Code pushes a trivial dev commit. Bring the app forward: the toast shows within a few seconds. Tap Reload: the build tag shows the new sha.
- **Dismiss:** dismiss the toast, background, foreground: it shows again (still old). After Reload it never shows.
- **Run:** with an Ask run open, a new deploy shows no toast until That's it! / Done.
- **Offline:** airplane mode, foreground: no toast, no error, no event.
- **Prod bundle:** the build-tag code is absent (read back); the version check is present.

## Decisions (for the DECISIONS LOG)
| 2026-11-21 | **The app offers "A new version is ready · Reload" and never reloads itself.** It checks `asset-manifest.json` on foreground and every 10 minutes, and never interrupts an Ask run. Reason: a stale installed app caused a false walk failure tonight, and on prod households keep old code until they happen to restart. |
| 2026-11-21 | **Dev shows a build tag (`dev · <sha>`); prod never does.** |
