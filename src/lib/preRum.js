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
// What it holds: ?invite= and ?ref=, under TWO keys (R1). They are different
// species and are deliberately not merged into one slot: invite grants
// membership and is single-use, ref grants nothing and only attributes. Losing
// a ref code costs attribution; losing an invite code costs access. A held
// value is never overwritten with nothing: a later clean load must not erase a
// code the app has yet to read. Readers (useProvisions bootstrap, the gift
// card) read these keys only, never the URL — through readHeld / clearHeld.
//
// Where: localStorage, as {code, heldAt} (SPEC_durable_invite_hold A1–A2,
// 2026-11-08). It was sessionStorage, which is per TAB: the one tab the link
// opened had to survive until bootstrap ran after sign-up, and on an iPhone it
// often doesn't (Mail for the code, retries, a new tab, an evicted tab). Twice
// on prod a new user's code never reached the server and bootstrap made a solo
// "My Household". localStorage is origin-wide, so any tab of this browser
// finishes the sign-up with the code. Each species expires (readHeld): a code
// tapped last month must not enroll someone today.
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
const DAY_MS = 24 * 60 * 60 * 1000;
export const INVITE_MAX_AGE_MS = 7 * DAY_MS;    // an invite's own expires_at
export const REF_MAX_AGE_MS = 30 * DAY_MS;
export const GIFT_MAX_AGE_MS = 7 * DAY_MS;
const GIFT_PATH = /^\/g\/([^/]+)\/?$/;

// Pure: (href, storage, now) → the cleaned absolute URL, or `href` itself (same
// string) when there was nothing to clear. `storage` is anything with
// getItem / setItem (localStorage in the app, a stub in tests). A storage
// that throws (private mode, blocked) never stops the URL from being cleaned —
// replay protection must not depend on storage.
export function cleanEntryUrl(href, storage, now = Date.now()) {
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
    try { storage.setItem(key, JSON.stringify({ code: value, heldAt: now })); } catch (e) { /* storage unavailable — the URL is still cleaned */ }
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

// The held code for `key`, or null. Clears the key when the value is older
// than maxAgeMs or isn't a hold this module wrote, so a stale or garbled code
// can never be used later. Never throws.
export function readHeld(key, maxAgeMs, storage, now = Date.now()) {
  let raw = null;
  try { raw = storage.getItem(key); } catch (e) { return null; }
  if (!raw) return null;
  let held = null;
  try { held = JSON.parse(raw); } catch (e) { held = null; }
  const ok = held && typeof held.code === "string" && held.code
    && typeof held.heldAt === "number" && now - held.heldAt <= maxAgeMs;
  if (!ok) { clearHeld(key, storage); return null; }
  return held.code;
}

export function clearHeld(key, storage) {
  try { storage.removeItem(key); } catch (e) { /* storage blocked */ }
}

// The app's store, or null when even reaching it throws (blocked storage).
export function heldStore() {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch (e) { return null; }
}

// invite_held (A6) can't be emitted here: this runs before src/rum.js starts
// the tracer. The app reads this once, after, and emits the span (a boolean
// fact, never the code).
let inviteHeldThisLoad = false;
export function takeInviteHeld() {
  const was = inviteHeldThisLoad;
  inviteHeldThisLoad = false;
  return was;
}

// The side effect: runs once, at import, before src/rum.js. replaceState, so
// no history entry and no navigation; the app's hash route is untouched.
try {
  const hadInvite = !!new URL(window.location.href).searchParams.get("invite");
  const cleaned = cleanEntryUrl(window.location.href, heldStore());
  // Held = the link carried a code AND storage kept it.
  inviteHeldThisLoad = hadInvite && !!readHeld(INVITE_KEY, INVITE_MAX_AGE_MS, heldStore());
  if (cleaned !== window.location.href) window.history.replaceState(null, "", cleaned);
} catch (e) {
  /* never block boot */
}
