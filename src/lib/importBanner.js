// The import banner's second sentence (SPEC_recipe_import, 2026-10-11 addition):
// a count of the rows still carrying a "Check this" chip, or the plain "Check it
// over." when there are none. Pure, so the count and its copy are testable.
//
// Counts ingredient rows ONLY. The servings chip fires on most imports and would
// make the number noise. Advisory: nothing here gates Save.

// Rows with an active chip — `check` is the reason string the landing sets and the
// row's edits clear (quantity, I have this, Need it). Null or '' means no chip.
export const countFlaggedRows = (rows) => (rows || []).filter((r) => r && r.check).length;

// 0 → "Check it over." · 1 → "1 thing to check." · N → "N things to check."
// Never "0 things to check."
export const bannerCheckLine = (count) => {
  const n = Number(count) || 0;
  if (n <= 0) return "Check it over.";
  return n === 1 ? "1 thing to check." : `${n} things to check.`;
};
