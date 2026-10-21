// Meal photos v1 — the pure rules (SPEC_meal_photos_v1 + the 2026-10-13 / 10-20
// amendments; 065). jest-proven in mealPhotos.test.js.
//   D2   the newest live photo is the card, whoever added it
//   R1   at most 3 live photos per (meal, household) — the server enforces it;
//        the client hides "Add a meal photo" at the cap
//   R2   caption "Added {date}", plus " · {First name}" only in a household of
//        2+ current members and only while the uploader is still one (the
//        "Added by" rule); a cook-attached photo (slice 2) reads "Cooked {date}"
import { cookDate } from "./cookDate";

export const MEAL_PHOTO_CAP = 3;

// rows: live meal_photos rows, newest first (the read's own order) →
// { [meal_id]: rows } with each meal's rows newest first, at most the cap.
export function photosByMeal(rows) {
  const out = {};
  (rows || []).forEach((r) => {
    if (!r || !r.meal_id || r.deleted_at) return;
    const list = out[r.meal_id] || (out[r.meal_id] = []);
    if (list.length < MEAL_PHOTO_CAP) list.push(r);
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

// members: the household's current members; firstNameOf(member) → "Dan".
export function photoCaption(photo, members, firstNameOf, now = new Date()) {
  if (!photo) return "";
  const when = addedDate(photo.uploaded_at, now);
  if (!when) return "";
  const verb = photo.meal_cook_id && photo.cooked_at ? `Cooked ${cookDate(photo.cooked_at, now)}` : `Added ${when}`;
  const list = members || [];
  if (list.length < 2) return verb;
  const m = list.find((mb) => mb && mb.user_id && mb.user_id === photo.uploaded_by);
  const name = m ? (firstNameOf(m) || "") : "";
  return name ? `${verb} · ${name}` : verb;
}
