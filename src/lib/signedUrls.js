// Signed URLs for private Storage objects — minted in batch, reused for the
// session (SPEC_meal_photos_v1, 2026-10-20 amendment R9). Every createSignedUrl
// mints a new token, and a new token is a new URL, so the browser cache never
// hits and the photo downloads again on every visit — which undoes the
// thumbnail's egress saving. So: one createSignedUrls call for every path not
// already held, a 1 h TTL, and a path keeps its URL until it is within 5 min
// of expiry. Same URL → the browser's HTTP cache (the objects are uploaded
// with cacheControl 3600) serves the repeat view.
// The cache holds URLs only, never bytes; a URL names an object in one
// household's folder and is useless after its TTL. Pure apart from the db
// call; jest-proven in signedUrls.test.js with a fake client and clock.
export const SIGNED_URL_TTL_S = 60 * 60;
export const SIGNED_URL_REFRESH_MS = 5 * 60 * 1000;

export function createSignedUrlCache({ bucket, ttlSeconds = SIGNED_URL_TTL_S, refreshWithinMs = SIGNED_URL_REFRESH_MS, now = () => Date.now() } = {}) {
  const held = new Map();        // path → { url, expiresAt }
  const inflight = new Map();    // path → Promise<void>

  const fresh = (path) => {
    const h = held.get(path);
    return !!h && h.expiresAt - now() > refreshWithinMs;
  };

  // paths → { [path]: url } for every path that could be signed. A path the
  // server refuses (not a member, gone) is simply absent; the caller shows the
  // tint, never a broken image.
  async function resolve(db, paths) {
    const want = [...new Set((paths || []).filter(Boolean))];
    const mint = want.filter((p) => !fresh(p) && !inflight.has(p));
    if (mint.length > 0 && db) {
      const job = (async () => {
        try {
          const { data, error } = await db.storage.from(bucket).createSignedUrls(mint, ttlSeconds);
          if (error) { console.warn("[signed urls] batch failed (non-fatal):", error.message); return; }
          const at = now();
          (data || []).forEach((d) => {
            if (d && d.path && d.signedUrl && !d.error) held.set(d.path, { url: d.signedUrl, expiresAt: at + ttlSeconds * 1000 });
          });
        } catch (e) {
          console.warn("[signed urls] batch threw (non-fatal):", e && (e.message || e));
        }
      })();
      mint.forEach((p) => inflight.set(p, job));
      try { await job; } finally { mint.forEach((p) => inflight.delete(p)); }
    }
    // Wait for any other caller's batch that covers a path we want.
    await Promise.all(want.map((p) => inflight.get(p)).filter(Boolean));
    const out = {};
    want.forEach((p) => { const h = held.get(p); if (h && h.expiresAt > now()) out[p] = h.url; });
    return out;
  }

  return { resolve, size: () => held.size, clear: () => held.clear() };
}
