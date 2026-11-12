// Landscape = Staples (SPEC_landscape_staples): what the sideways view shows and what a
// tap does. Pure, no DOM — jest beside it.
//
// The view is a SEPARATE, FIXED view, not a filter state: its contents come from this
// preset alone. It takes the whole catalog and never the portrait filters, search or
// scroll, so there is nothing to save or restore. A future "configure your landscape
// filter" setting changes LANDSCAPE_PRESET and nothing else.
export const LANDSCAPE_PRESET = ["staples"];

// preset key → does this catalog entry belong?
export const PRESET_FILTERS = {
  staples: (entry) => !!(entry && entry.is_staple),
};

// The header is the portrait pill's star + this word, and nothing else — no exit instructions.
export const LANDSCAPE_HEADER = "Staples";
export const LANDSCAPE_EMPTY = "No staples yet. Rotate back, swipe an item left and tap ⭐ Staple.";
export const HOLD_HINT = "Hold to remove";

// The flat tile list: every catalog item any preset filter accepts, in category order
// (the order `categories` already carries), no headers. `categories` is Browse's
// UNFILTERED category list — [{ rawName, items: [{ name }] }].
export function landscapeItems(categories, catalogMap, preset = LANDSCAPE_PRESET) {
  const filters = preset.map((k) => PRESET_FILTERS[k]).filter(Boolean);
  if (!filters.length) return [];
  const out = [];
  (categories || []).forEach((cat) => {
    (cat.items || []).forEach((item) => {
      const entry = catalogMap ? catalogMap[item.name] : null;
      if (filters.some((f) => f(entry))) out.push({ name: item.name, rawCategory: cat.rawName });
    });
  });
  return out;
}

// What a TAP on a tile does (final, 2026-11-11).
//   not on the list                       → "add" (quantity 1)
//   on the list, added during THIS visit  → "remove" (an undo of this visit's own tap)
//   on the list before the visit began    → "hint": nothing is written; "Hold to remove"
// A stray thumb in a dense grid can therefore only ever undo what it just did. Taking
// something off that was already on the list is a press-and-hold, at any quantity — that
// lives in the component (useHold), not here. Steppers stay in portrait.
export function tileTap({ qty, addedThisVisit }) {
  const q = Number(qty) || 0;
  if (q <= 0) return "add";
  return addedThisVisit ? "remove" : "hint";
}

// The toast on the way back to portrait, for the visit's NET adds; null = no toast.
export function staplesAddedLine(n) {
  if (!(n > 0)) return null;
  return n === 1 ? "1 staple added" : `${n} staples added`;
}
