// Code-bearing URLs are cleared BEFORE Splunk starts (SPEC_meal_sharing_v2 S29 /
// S33, SPEC_rum_clerk_id_scrub Amendment 2026-10-26 R1–R3).
//
// Session replay records the page's full location.href on its first event and
// has no attribute hook; the documentLoad span can read the original URL from
// PerformanceNavigationTiming. Both agents initialise in src/rum.js, which
// index.js imports — and ES imports are hoisted, so inline code at the top of
// index.js runs AFTER both inits. This module is therefore index.js's FIRST
// import (a test reads the file to keep it so): its side effect runs before
// rum.js's module body, and the recorder's first pageUrl is already clean.
//
// What it holds: ?invite= and ?ref=, in sessionStorage, under TWO keys (R1).
// They are different species and are deliberately not merged into one slot:
// invite grants membership and is single-use, ref grants nothing and only
// attributes. Losing a ref code costs attribution; losing an invite code costs
// access. sessionStorage, not memory, because a brand-new user goes through
// Clerk's sign-up redirect and comes back to the same tab — memory doesn't
// survive that round trip (S33). A held value is never overwritten with
// nothing: a later clean load must not erase a code the app has yet to read.
// Readers (useProvisions bootstrap) read these keys only, never the URL.
//
// What it clears: the two params and a /g/<code> gift path, with every other
// param and the hash kept. The gift code is held under a THIRD key (Phase A,
// Commit 1 — SPEC_meal_sharing_phase_a_client; S33): a bearer key for one
// meal's preview card, a different species again from invite and ref. The
// signed-out card reads it at mount; the signed-in arrival consumes it after
// bootstrap. The span-side /g/[code] mask lives in rum.js.
export const INVITE_KEY = "pending_invite_code";
export const REF_KEY = "pending_ref_code";
export const GIFT_KEY = "pending_gift_code";
const GIFT_PATH = /^\/g\/([^/]+)\/?$/;

// Pure: (href, storage) → the cleaned absolute URL, or `href` itself (same
// string) when there was nothing to clear. `storage` is anything with
// getItem / setItem (sessionStorage in the app, a stub in tests). A storage
// that throws (private mode, blocked) never stops the URL from being cleaned —
// replay protection must not depend on storage.
export function cleanEntryUrl(href, storage) {
  let url;
  try {
    url = new URL(href);
  } catch (e) {
    return href;
  }
  const hadInvite = url.searchParams.has("invite");
  const hadRef = url.searchParams.has("ref");
  const gift = url.pathname.match(GIFT_PATH);
  if (!hadInvite && !hadRef && !gift) return href;

  const hold = (key, value) => {
    if (!value) return;
    try { storage.setItem(key, value); } catch (e) { /* storage unavailable — the URL is still cleaned */ }
  };
  hold(INVITE_KEY, url.searchParams.get("invite"));
  hold(REF_KEY, url.searchParams.get("ref"));
  if (gift) {
    let code = gift[1];
    try { code = decodeURIComponent(code); } catch (e) { /* hold it as written */ }
    hold(GIFT_KEY, code);
  }

  url.searchParams.delete("invite");
  url.searchParams.delete("ref");
  if (gift) url.pathname = "/";
  return url.toString();
}

// The side effect: runs once, at import, before src/rum.js. replaceState, so
// no history entry and no navigation; the app's hash route is untouched.
try {
  const cleaned = cleanEntryUrl(window.location.href, window.sessionStorage);
  if (cleaned !== window.location.href) window.history.replaceState(null, "", cleaned);
} catch (e) {
  /* never block boot */
}
