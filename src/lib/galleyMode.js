// Ask the Galley — which way the Galley works, read from what it was given
// (SPEC_galley_composer G3, G4, G6). One composer, no mode picker: the inputs are
// the instruction, and the button label confirms the mode before anyone taps.
//
//   photos staged            → readPhotos  (recipe-import, faithful: copy, don't improve)
//   recipe-shaped text       → readPaste   (recipe-import, faithful)
//   anything else, or the
//   "Want ideas instead?"    → invent      (meal-suggestion, creative)
//
// Pure. Every threshold the composer needs lives HERE so a tuning after the walk
// is one edit with the jest cases beside it, and so the copy the mode drives
// (label, echo, RUM enum) cannot drift from the decision.

// G6 — text is a recipe when it has at least this many non-empty lines OR at
// least this many characters (measured on the trimmed text). Short text defaults
// to the Galley, long or structured text to Read; the one-tap override covers
// the misses. Report these if walk evidence argues otherwise.
export const RECIPE_MIN_LINES = 3;
export const RECIPE_MIN_CHARS = 280;

// The functions' own ceilings, mirrored so the client never sends what will be
// refused. recipe-import: MAX_TEXT_CHARS 20_000 (the box's hard cap, every mode).
// meal-suggestion: MAX_REQUEST_CHARS 600 ("a spoken craving; anything longer is
// not a craving") — a 400 past that. The override can now steer a long paste to
// the Galley, so Invent is gated here with honest copy rather than truncated.
export const TEXT_CAP = 20000;
export const INVENT_MAX_CHARS = 600;

export const MODES = Object.freeze({ invent: "invent", readPhotos: "readPhotos", readPaste: "readPaste" });

// A non-empty line is one with any non-whitespace in it.
const countNonEmptyLines = (text) => text.split(/\r?\n/).filter((l) => l.trim().length > 0).length;

export const looksLikeRecipe = (text) => {
  const t = (text || "").trim();
  if (!t) return false;
  return countNonEmptyLines(t) >= RECIPE_MIN_LINES || t.length >= RECIPE_MIN_CHARS;
};

// `override` is the one-tap "Want ideas instead?": "invent" forces the creative
// path for recipe-shaped text (the caller clears it when the text is cleared, G6).
// Photos win outright — while they are staged the text box is hidden and nothing
// typed is sent (G7), so neither the text nor the override can change the mode.
export const galleyMode = (text, photoCount = 0, override = null) => {
  if ((Number(photoCount) || 0) > 0) return MODES.readPhotos;
  if (override === MODES.invent) return MODES.invent;
  return looksLikeRecipe(text) ? MODES.readPaste : MODES.invent;
};

// G3 — verb + outcome, never "Submit", never the heading's words.
export const MODE_LABEL = Object.freeze({
  invent: "Create a meal",
  readPhotos: "Read these",
  readPaste: "Read this recipe",
});

// G4 — the one-line echo above the button: the two contracts, kept visible.
export const MODE_ECHO = Object.freeze({
  invent: "The Galley will create a new meal for you.",
  readPhotos: "Read as written — nothing changed. Up to 4, in any order.",
  readPaste: "Looks like a recipe — it'll be copied as written.",
});

// The investor-story measure ("Galley vs by hand, and mode mix"): the primary
// button's data-galley-mode carries THIS enum, never text.
export const MODE_RUM = Object.freeze({
  invent: "invent",
  readPhotos: "read_photos",
  readPaste: "read_paste",
});

// Invent past the function's ceiling: the echo says so and the button is inert.
// Nothing is cut — the person decides what to trim.
export const inventTooLong = (text) => (text || "").trim().length > INVENT_MAX_CHARS;
export const INVENT_TOO_LONG_ECHO =
  `That's a lot for an ask — the Galley takes up to ${INVENT_MAX_CHARS} characters. Trim it, or paste a recipe to read instead.`;
