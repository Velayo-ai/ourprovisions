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

export const LANDSCAPE_HEADER = "Staples · rotate back for full catalog";
export const LANDSCAPE_EMPTY = "No staples yet. Rotate back, swipe an item left and tap ⭐ Staple.";
export const QTY_HINT = "Edit quantity in portrait";

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

// What a tile tap does at this quantity. Off the list → add 1. On at exactly 1 → remove.
// On at 2+ → nothing but a hint: a stray thumb in a dense grid must not wipe a quantity
// someone set on purpose (Dan, 2026-11-11). Steppers stay in portrait.
export function tileTap(qty) {
  const q = Number(qty) || 0;
  if (q <= 0) return "add";
  if (q === 1) return "remove";
  return "hint";
}

// The toast on the way back to portrait; null = no toast.
export function staplesAddedLine(n) {
  if (!(n > 0)) return null;
  return n === 1 ? "1 staple added" : `${n} staples added`;
}
