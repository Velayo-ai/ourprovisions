// Meal photos v1 — the pure rules (SPEC_meal_photos_v1 + the 2026-10-13 / 10-20
// amendments; 065). jest-proven in mealPhotos.test.js.
//   D2   the newest live photo is the card, whoever added it
//   R1   at most 3 live photos per (meal, household) — the server enforces it;
//        the client hides "Add a meal photo" at the cap
//   R2   caption "Added {date}", plus " · {First name}" only in a household of
//        2+ current members and only while the uploader is still one (the
//        "Added by" rule); a cook-attached photo (slice 2) reads "Cooked {date}".
//        The viewer's own photo reads " · You" (Dan, 2026-10-21: two members can
//        share a first name — both test accounts are "Dan")
//   S26  (SPEC_meal_sharing_v2; 072) a SHOWCASE photo (kind = showcase) sits outside
//        the cap: the cap and "Add a meal photo" count cook photos only, and every
//        live showcase row is kept. One per person per meal — the server replaces.
//   S28  one pick: the newest live cook photo; none → the newest live showcase; else
//        none. The card and the hero's first slide both take list[0], so the pick is
//        list[0] and the rest follow newest-first.
import { cookDate } from "./cookDate";

export const MEAL_PHOTO_CAP = 3;

// kind: 'cook' (the column default; every row before 072 is a cook photo) or 'showcase'.
export const isShowcase = (p) => !!p && p.kind === "showcase";
// The cap counts cook photos only (S26). list: one meal's live rows.
export const liveCookCount = (list) => (list || []).filter((p) => !isShowcase(p)).length;
export const atPhotoCap = (list) => liveCookCount(list) >= MEAL_PHOTO_CAP;

// rows: live meal_photos rows, newest first (the read's own order) →
// { [meal_id]: rows } with each meal's rows as the S28 pick first, then the rest
// newest first; at most the cap of COOK photos, every showcase photo kept.
export function photosByMeal(rows) {
  const out = {};
  (rows || []).forEach((r) => {
    if (!r || !r.meal_id || r.deleted_at) return;
    const list = out[r.meal_id] || (out[r.meal_id] = []);
    if (isShowcase(r) || liveCookCount(list) < MEAL_PHOTO_CAP) list.push(r);
  });
  Object.keys(out).forEach((mealId) => {
    const list = out[mealId];
    const pick = list.find((p) => !isShowcase(p)) || list[0];   // newest cook, else newest showcase
    if (pick !== list[0]) out[mealId] = [pick, ...list.filter((p) => p !== pick)];
  });
  return out;
}

// A stable fingerprint of the live set, so a poll that read the same rows
// does not re-render the library.
export function photosFingerprint(rows) {
  return (rows || []).map((r) => `${r.id}@${r.uploaded_at}`).join("|");
}

// "today" for an upload made today: cookDate's "tonight" is a cook's word.
export function addedDate(iso, now = new Date()) {
  const d = cookDate(iso, now);
  return d === "tonight" ? "today" : d;
}

// members: the household's current members; firstNameOf(member) → "Dan";
// viewerUserId: the viewer's users.id — their own photo reads "You".
export function photoCaption(photo, members, firstNameOf, now = new Date(), viewerUserId = null) {
  if (!photo) return "";
  const when = addedDate(photo.uploaded_at, now);
  if (!when) return "";
  const verb = photo.meal_cook_id && photo.cooked_at ? `Cooked ${cookDate(photo.cooked_at, now)}` : `Added ${when}`;
  const list = members || [];
  if (list.length < 2) return verb;
  const m = list.find((mb) => mb && mb.user_id && mb.user_id === photo.uploaded_by);
  const name = !m ? "" : (viewerUserId && photo.uploaded_by === viewerUserId ? "You" : (firstNameOf(m) || ""));
  return name ? `${verb} · ${name}` : verb;
}

// PHOTO DETAILS (SPEC_photo_menu DAN-2, 2026-10-25) — the photo credit's home now that the
// line under the hero is gone. A calendar date ("Oct 24", the year only when it is not this
// year), never a relative word: "From the cook on tonight" would not read. Lines:
//   "Added by {First} · {date}" — the name under the "Added by" rule (2+ current members, the
//     uploader still one); otherwise "Added {date}". Always the first name, the viewer included.
//   "From the cook on {date}" — a cook-attached photo only (its cook's cooked_at).
export function detailsDate(iso, now = new Date()) {
  if (iso == null || iso === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear()
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" });
}

export function photoDetails(photo, members, firstNameOf, now = new Date()) {
  if (!photo) return [];
  const when = detailsDate(photo.uploaded_at, now);
  if (!when) return [];
  const list = members || [];
  const m = list.length >= 2 ? list.find((mb) => mb && mb.user_id && mb.user_id === photo.uploaded_by) : null;
  const name = m ? (firstNameOf(m) || "") : "";
  const lines = [name ? `Added by ${name} · ${when}` : `Added ${when}`];
  const cooked = photo.meal_cook_id ? detailsDate(photo.cooked_at, now) : "";
  if (cooked) lines.push(`From the cook on ${cooked}`);
  // S13's fact, where the photo's other facts live: a showcase photo can leave the household.
  if (isShowcase(photo)) lines.push("Showcase photo · can be seen by anyone you give this meal to");
  return lines;
}

// REPLACE (SPEC_photo_menu DAN-1, ruled 2026-10-25) — the order of the steps, by the photo being
// replaced and the meal's live count. add_meal_photo AGES OUT past the cap rather than refusing,
// so at the cap an add before the remove would drop the OLDEST photo, not this one.
//   cook-attached → upload, saveCook (the RPC's per-cook replace retires the old row atomically)
//   under the cap → upload, save, remove   (no loss window; at worst both stay)
//   at the cap    → upload, remove, save   (only the final save can fail after a good upload)
// liveCount is the meal's live COOK count (S26). A showcase photo has no Replace: the menu
// hides it (RecipePhotos), because add_meal_photo would turn the replacement into a cook photo
// and add_showcase_photo replaces only the caller's own — remove and add instead.
export function replaceSteps(old, liveCount) {
  if (old && old.meal_cook_id) return ["upload", "saveCook"];
  return liveCount >= MEAL_PHOTO_CAP ? ["upload", "removeOld", "save"] : ["upload", "save", "removeOld"];
}
