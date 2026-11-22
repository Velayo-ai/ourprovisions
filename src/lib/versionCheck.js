// EVERY DEVICE KNOWS WHEN IT'S RUNNING OLD CODE (SPEC_app_version_check V1; Step 0 approved 2026-11-22).
// An installed home-screen app resumes the page already in memory, so it can run an old bundle for
// days. The page compares the bundle it is running — the main.*.js <script src>, read once at startup
// (CRA has no build-time constant for its own hash) — with the manifest's files["main.js"], fetched
// with cache: 'no-store'. Vercel serves both index.html and asset-manifest.json with max-age=0,
// must-revalidate and purges its edge on each deploy, so the manifest is never stale. There is no
// service worker, so Reload is a plain location.reload(). A failed fetch is no answer: null, no event.
export const VERSION_CHECK_INTERVAL_MS = 10 * 60 * 1000;
export const MANIFEST_URL = "/asset-manifest.json";

// The running bundle's path ("/static/js/main.<hash>.js"), or null (no such tag — e.g. `npm start`,
// which serves bundle.js: then the check never offers anything).
export function runningMainScript(doc) {
  const el = doc && typeof doc.querySelector === "function" ? doc.querySelector('script[src*="/static/js/main."]') : null;
  const src = el ? el.getAttribute("src") : null;
  if (!src) return null;
  try { return new URL(src, "https://op.invalid").pathname; } catch (_e) { return null; }
}

// The manifest's main bundle path, or null.
export function manifestMain(json) {
  const m = json && json.files ? json.files["main.js"] : null;
  return typeof m === "string" && m ? m : null;
}

// A new version is a different main bundle. Unknown on either side is never "new".
export function isNewVersion(running, latest) {
  return !!running && !!latest && running !== latest;
}

// The deployed main bundle's path, or null on any failure (offline, an error status, bad JSON).
export async function fetchLatestMain(fetchImpl = (url, opts) => fetch(url, opts)) {
  try {
    const res = await fetchImpl(MANIFEST_URL, { cache: "no-store" });
    if (!res || !res.ok) return null;
    return manifestMain(await res.json());
  } catch (_e) {
    return null;
  }
}
