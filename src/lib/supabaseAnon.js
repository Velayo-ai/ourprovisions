// THE ANON CLIENT — for the signed-out gift card only (SPEC_meal_sharing_phase_a_client,
// Commit 1; SPEC_meal_sharing_v2 S43 / S35; ruled by Dan 2026-10-29).
//
// The app's own client (src/lib/supabaseClient.js) REFUSES to query without a Clerk token —
// that is D1's "no silent anon downgrade", and it is why useProvisions can say the app makes
// zero anon queries. A signed-out visitor at /g/{CODE} has no token and still needs two things
// the server grants to `anon` by design (072 §6, §9): the preview card's five fields and a
// signed URL for the gift's photo. So this is a THIRD client, with its own storageKey
// ("op-gift" — two GoTrue clients without distinct keys collide), apikey-only, built lazily.
//
// It may be used for EXACTLY two calls, both here, and nothing else imports this module
// except the gift card (src/lib/supabaseAnon.test.js greps src/ to keep both true):
//   1. rpc  preview_meal_gift_public(p_code)             → one row, or none (unknown = revoked)
//   2. storage.from("gift-photos").createSignedUrls(...)  → the card's view.{photo_ext}
// No table reads, no other RPC, no other bucket. The gift code travels in the POST body, never
// the URL (spans keep a REST path's query only on /rest/v1/, and there is no query here).
import { createClient } from "@supabase/supabase-js";
import { createSignedUrlCache } from "./signedUrls";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

let client = null;
function anon() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionFromUrl: false, storageKey: "op-gift" },
    });
  }
  return client;
}

// Call 1. → { row } with the S43 fields, { row: null } for an unknown OR revoked code (the RPC
// returns the same empty set for both — the client cannot tell them apart either, C7), or
// { error } when the request itself failed (offline), which is NOT a dead link.
export async function previewMealGiftPublic(code) {
  try {
    const { data, error } = await anon().rpc("preview_meal_gift_public", { p_code: String(code || "").trim() });
    if (error) return { error };
    const row = Array.isArray(data) ? data[0] : data;
    return { row: row && row.gift_id ? row : null };
  } catch (e) {
    return { error: e };
  }
}

// Call 2. The gift's view rendition: gift-photos/{gift_id}/view.{ext}, ext = the row's photo_ext
// ("webp" or "jpg" — S47 / 074: the format the giver stored it in), signed by anon under the S35
// SELECT policy (readable only while the gift is live AND marked). Same cache as meal-photos (1 h
// TTL, re-minted near expiry), bucket parameterised — no second bucket name hard-coded anywhere else.
export const giftPhotoPath = (giftId, ext) => `${giftId}/view.${ext}`;
const giftUrls = createSignedUrlCache({ bucket: "gift-photos" });
export async function giftPhotoUrl(giftId, ext) {
  if (!giftId || !ext) return null;
  const path = giftPhotoPath(giftId, ext);
  const got = await giftUrls.resolve(anon(), [path]);
  return got[path] || null;
}
