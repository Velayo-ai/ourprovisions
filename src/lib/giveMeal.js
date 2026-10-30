// GIVE THIS MEAL — the pure rules of the give sheet (SPEC_meal_sharing_phase_a_client C1–C4;
// mockup_gift_preview B1–B5; SPEC_meal_sharing_v2 S12, S34, S41, S44, S46). jest-proven in
// giveMeal.test.js.
//   C1  the sheet pre-checks for a showcase photo: the viewer's own live showcase row on the meal.
//       The client predicts; give_meal's server-side pick (S12) decides; B4 shows the truth.
//   C3  Give is two taps: Give (the RPC + the photo copy), then Send it (navigator.share from a
//       fresh tap — iOS only opens the share sheet from a direct gesture).
//   C4  the copy is view.webp FIRST, then thumb.webp, both without upsert; any failure = B5, no
//       retry, no delete. Bytes are copied, never re-encoded (Dan, 2026-10-29): a JPEG rendition
//       is refused by the webp-only bucket and reads as B5.
//   10-07  share text "I'm giving you {meal} on OurProvisions."; url /g/{CODE}?ref={referral}.
import { isShowcase } from "./mealPhotos";

export const NOTE_MAX = 280;

// C1: the viewer's own live showcase photo on this meal (list: the meal's live rows), or null.
export function myShowcase(photos, viewerUserId) {
  if (!viewerUserId) return null;
  return (photos || []).find((p) => isShowcase(p) && p.uploaded_by === viewerUserId && !p.deleted_at) || null;
}

// The note as the RPC wants it: trimmed, empty → null; over the cap → false (the sheet never sends it).
export function noteForGive(text) {
  const t = (text || "").trim();
  if (t.length > NOTE_MAX) return false;
  return t || null;
}

// The order of the two gift-photo uploads (C4): view first, then thumb.
export const GIFT_RENDITIONS = ["view", "thumb"];
export const giftObjectPath = (giftId, rendition) => `${giftId}/${rendition}.webp`;

// The share payload (10-07): the link rides `url`, never the prose. ref is optional on paper, but
// every in-app share carries it (08-25 rule) — the caller passes referralCode when it has one.
export function giftShareText(mealName) {
  return `I’m giving you ${(mealName || "a meal").trim()} on OurProvisions.`;
}
export function giftUrl(origin, code, referralCode) {
  const base = `${(origin || "").replace(/\/+$/, "")}/g/${encodeURIComponent(code)}`;
  return referralCode ? `${base}?ref=${encodeURIComponent(referralCode)}` : base;
}
export function giftSharePayload({ mealName, code, origin, referralCode }) {
  return { title: "A meal, given to you", text: giftShareText(mealName), url: giftUrl(origin, code, referralCode) };
}

// B4 / B5's "What they'll see" line: From {attribution} · {n} ingredients — mirrors the public card.
export function whatTheySee(meal) {
  const n = (meal && meal.meal_ingredients ? meal.meal_ingredients.length : 0);
  const count = `${n} ${n === 1 ? "ingredient" : "ingredients"}`;
  const a = (meal && typeof meal.attribution === "string" ? meal.attribution.trim() : "");
  return a ? `From ${a} · ${count}` : count;
}

// The sheet's phases, in order. Give runs "giving" (RPC) then, with a photo, "copying" (the two
// uploads); it lands on "ready" (B4) or "ready" with photoFailed (B5). The ✕ is disabled while
// giving or copying — the link is in nobody's hands yet (S34).
export const GIVE_PHASES = ["compose", "giving", "copying", "ready"];
export const closeDisabled = (phase) => phase === "giving" || phase === "copying";

// give_meal's failure, as a line (072 §5 error vocabulary): 42501 not a member, 22023 kind / note,
// anything else the RPC's own message with the function prefix dropped. Never swallowed.
export function giveFailure(err) {
  const code = err && err.code;
  const msg = ((err && err.message) || "").replace(/^give_meal:\s*/i, "").trim();
  if (code === "42501") return { reason: "forbidden", line: "Only members of this place can give its meals." };
  if (code === "22023" && /note/i.test(msg)) return { reason: "note", line: "The note is too long (280 characters at most)." };
  if (code === "22023") return { reason: "kind", line: "Only meals can be given." };
  return { reason: "save", line: msg ? `Couldn’t give this meal: ${msg}` : "Couldn’t give this meal. Try again." };
}
