// THE PUBLIC GIFT CARD — pure rules (SPEC_meal_sharing_phase_a_client C5–C8; mockup_gift_preview
// A1–A3; SPEC_meal_sharing_v2 S43). jest-proven in giftCard.test.js.
//   C5  the S43 fields and nothing else: title, attribution, ingredient count, has_photo and (S47)
//       photo_ext — gift_id only to sign the photo. No giver name, no note.
//   C6  no From line when attribution is empty — and no placeholder.
//   C7  unknown and revoked codes are one screen (A3): the RPC returns no row for both.
//   C8  photo_ext decides the photo slot (S47: has_photo = photo_ext is not null, the server's mark
//       after both renditions were checked): "webp" | "jpg" → the signed view.{ext}; null → the sand
//       band. Never a guess from a URL, never a probe.

// The RPC's row → what the card renders, or null for A3.
export function giftCardModel(row) {
  if (!row || !row.gift_id) return null;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const from = fromLine(row.attribution);
  const n = Number(row.ingredient_count);
  const photoExt = giftPhotoExt(row.photo_ext);
  return {
    giftId: row.gift_id,
    title: title || "A meal",
    from,                                   // "From Easton" or null (C6)
    count: ingredientCount(n),              // "7 ingredients"
    photoExt,                               // C8 / S47: "webp" | "jpg" | null — the name to sign
    hasPhoto: photoExt !== null,            // = has_photo on the server (photo_ext is not null)
  };
}

// The two formats the gift-photos bucket admits (074). Anything else reads as no photo.
export function giftPhotoExt(value) {
  return value === "webp" || value === "jpg" ? value : null;
}

// "From {attribution}" — never possessive, never a person who is not in the data (C6).
export function fromLine(attribution) {
  const a = typeof attribution === "string" ? attribution.trim() : "";
  return a ? `From ${a}` : null;
}

export function ingredientCount(n) {
  const k = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  return `${k} ${k === 1 ? "ingredient" : "ingredients"}`;
}

// The B4 "What they'll see" line and the card's meta, in one place: "From Easton · 7 ingredients"
// or just the count.
export function giftMetaLine(model) {
  if (!model) return "";
  return [model.from, model.count].filter(Boolean).join(" · ");
}
