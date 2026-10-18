// displayTitle — title casing normalised FOR DISPLAY, never written back
// (SPEC_meal_library_visual_v2 D11). The database row keeps whatever the person
// typed; this runs where a meal name is rendered as a title (the library card,
// the list row, the recipe-card title in the meal sheet).
//
// The rule is deliberately narrow so it cannot mangle a name someone typed on
// purpose:
//   - a fixed small-word list is LOWER-cased when it is not the first word;
//   - nothing is ever upper-cased ("grandma's chili" stays as typed);
//   - an all-caps token is never touched ("BLT" stays "BLT");
//   - only whole words match — "Andes" is not "and", "Oregano" is not "or".
// Pure; jest cases beside it. The same rule is stated in the recipe-import
// prompt so new imports arrive clean.
export const SMALL_WORDS = ["and", "or", "with", "of", "the", "a", "an", "in", "on", "to", "for", "alla", "al", "con", "de"];
const SMALL = new Set(SMALL_WORDS);

export function displayTitle(name) {
  if (typeof name !== "string" || !name) return name;
  let first = true;
  // Words are runs of non-whitespace; the first run is left alone whatever it is.
  return name.replace(/\S+/g, (word) => {
    if (first) { first = false; return word; }
    const lower = word.toLowerCase();
    if (!SMALL.has(lower)) return word;             // not a small word (or carries punctuation)
    if (word === lower) return word;                // already lower — nothing to do
    if (word === word.toUpperCase() && word.length > 1) return word; // all-caps token: never touched
    return lower;
  });
}

export default displayTitle;
