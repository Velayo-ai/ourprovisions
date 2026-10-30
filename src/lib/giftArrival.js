// THE SIGNED-IN ARRIVAL — pure rules (SPEC_meal_sharing_phase_a_client Commit 3; the 10-07 prefilled
// form with C6; SPEC_meal_sharing_v2 S24, S25, S36, S40; 072 preview_meal_gift / record_meal_gift_receipt /
// accept_gift_photo). jest-proven in giftArrival.test.js.
//   The snapshot (V3) is the recipe as it was at give time: name, base_servings, instructions, occasion,
//   attribution, ingredients [{ name, category, quantity_per_serving }], giver_first_name. Ingredients
//   carry NAMES, never catalog ids — the receiver's form resolves them against ITS OWN catalog through
//   the same landDraft every outside draft takes (import, Galley).
//   C6  From = attribution only when present; never the giver (who is "gave you", not "From").
//   10-07 name collision: a live meal with the same normalised name → "{name} (from {Giver})", editable.
//   10-07 errors, plain: not_found → "That link doesn't work."; revoked → the giver stopped giving;
//   already added → "Already in {place}'s meals" with Open it.

export const normName = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

// The landDraft-shaped draft from a gift's snapshot. existingNames: the target place's live meal
// names (normalised or not — both are normalised here).
export function giftDraft(snapshot, { existingNames = [], giverFirst = "" } = {}) {
  const s = snapshot || {};
  const base = (typeof s.name === "string" ? s.name : "").trim() || "A meal";
  const taken = new Set((existingNames || []).map(normName));
  const name = taken.has(normName(base)) && giverFirst ? `${base} (from ${giverFirst})` : base;
  const attribution = typeof s.attribution === "string" ? s.attribution.trim() : "";
  return {
    name,
    instructions: typeof s.instructions === "string" ? s.instructions : "",
    occasion: Array.isArray(s.occasion) ? s.occasion : [],
    attribution,                       // "" → the From field stays hidden (C6 / V35)
    ingredients: (Array.isArray(s.ingredients) ? s.ingredients : []).map((i) => ({
      name: typeof i.name === "string" ? i.name : "",
      category: typeof i.category === "string" ? i.category : null,
      quantity: Number(i.quantity_per_serving) || 1,
      unit: "each",
    })).filter((i) => i.name),
    servingsAssumed: false,
  };
}

// The banner over the form (10-07, SPEC words of record — not frame 6's "Shared by").
export function giftBanner(giverFirst) {
  return `${giverFirst || "Someone"} gave you this. It’s your copy to change.`;
}

// The note as a quote under the banner: the giver's own words, not editable, never saved on the meal.
export function giftNoteQuote(note, giverFirst) {
  const t = typeof note === "string" ? note.trim() : "";
  if (!t) return null;
  return { quote: `“${t}”`, by: giverFirst ? `— ${giverFirst}` : null };
}

// "Adding to {place}" — shown when the person has more than one place (10-07). Change is NEXT.
export function placeLine(placeName, placeCount) {
  return placeCount > 1 && placeName ? `Adding to ${placeName}` : null;
}

// preview_meal_gift's failures (072 §5): P0002 not_found, 55000 revoked, 42501 not a member.
export function arrivalFailure(err) {
  const code = err && err.code;
  const msg = ((err && err.message) || "").replace(/^preview_meal_gift:\s*/i, "").trim();
  if (code === "P0002") return { reason: "not_found", line: "That link doesn’t work. Ask for a new one." };
  if (code === "55000") return { reason: "revoked", line: "Whoever sent this stopped giving it." };
  if (code === "42501") return { reason: "forbidden", line: "You’re not a member of this place." };
  return { reason: "save", line: msg ? `Couldn’t open this gift: ${msg}` : "Couldn’t open this gift. Try again." };
}

export const alreadyAddedLine = (placeName) => `Already in ${placeName || "this place"}’s meals`;

// S24: the thank-you, once, from the receiver's own share sheet. No url — a message, not a link.
export function thankYouPayload(mealName, giverFirst) {
  return {
    ask: `Send ${giverFirst || "them"} a thank you?`,
    title: "Thank you",
    text: `Thank you for ${(mealName || "the meal").trim()}! Adding it to our meals.`,
  };
}

// The photo copy on accept (S36 / S40 / C8): both gift renditions, into the receiver's own folder in
// meal-photos with one fresh stem; webp (the gift bucket is webp-only). thumb first in the RPC's
// argument list (the 10-29 ruling).
export const giftSourcePaths = (giftId) => ({ view: `${giftId}/view.webp`, thumb: `${giftId}/thumb.webp` });
export function acceptCopyPaths(householdId, mealId, stem) {
  const base = `${householdId}/${mealId}/${stem}`;
  return { thumbPath: `${base}-thumb.webp`, viewPath: `${base}-view.webp` };
}
