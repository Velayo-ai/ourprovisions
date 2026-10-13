// Run: CI=true npx react-scripts test --watchAll=false src/lib/galleyMode
import {
  galleyMode, looksLikeRecipe, inventTooLong,
  RECIPE_MIN_LINES, RECIPE_MIN_CHARS, INVENT_MAX_CHARS, TEXT_CAP,
  MODE_LABEL, MODE_ECHO, MODE_RUM, MODES,
} from "./galleyMode";

const SHORT_CRAVING = "chicken tacos with lime";
const LONG_CRAVING = "Something cozy with chicken that I can get on the table in about thirty minutes, "
  + "nothing too spicy because the kids are eating, and ideally something that uses the rice we already have.";
const INGREDIENT_LIST = "1 lb shrimp\n1 cup stone-ground grits\n4 cups water";
const IG_CAPTION = "Tidewater shrimp & grits — from @tidewatercooks\n"
  + "Ingredients: 1 lb shrimp, 1 cup grits, 4 cups water, 2 cloves garlic, 1 lemon\n"
  + "1. Simmer grits in the water 25 min, stirring.\n"
  + "2. Toss shrimp with salt and the garlic.\n"
  + "#shrimpandgrits #weeknight";
const EXACTLY_280 = "x".repeat(RECIPE_MIN_CHARS);

test("the thresholds are the spec's (G6) and the functions' ceilings are mirrored", () => {
  expect(RECIPE_MIN_LINES).toBe(3);
  expect(RECIPE_MIN_CHARS).toBe(280);
  expect(INVENT_MAX_CHARS).toBe(600);   // meal-suggestion MAX_REQUEST_CHARS
  expect(TEXT_CAP).toBe(20000);         // recipe-import MAX_TEXT_CHARS
});

test("a short craving is Invent", () => {
  expect(looksLikeRecipe(SHORT_CRAVING)).toBe(false);
  expect(galleyMode(SHORT_CRAVING, 0, null)).toBe("invent");
});

test("a long one-line craving under 280 characters is still Invent", () => {
  expect(LONG_CRAVING.length).toBeLessThan(RECIPE_MIN_CHARS);
  expect(LONG_CRAVING.length).toBeGreaterThan(150);
  expect(galleyMode(LONG_CRAVING)).toBe("invent");
});

test("a 3-line ingredient list reads as a recipe", () => {
  expect(looksLikeRecipe(INGREDIENT_LIST)).toBe(true);
  expect(galleyMode(INGREDIENT_LIST, 0, null)).toBe("readPaste");
});

test("an IG caption with the recipe in it reads as a recipe", () => {
  expect(galleyMode(IG_CAPTION)).toBe("readPaste");
});

test("exactly 280 characters on one line is a recipe; 279 is not", () => {
  expect(galleyMode(EXACTLY_280)).toBe("readPaste");
  expect(galleyMode("x".repeat(RECIPE_MIN_CHARS - 1))).toBe("invent");
});

test("characters are measured on the trimmed text", () => {
  expect(galleyMode(`   ${"x".repeat(RECIPE_MIN_CHARS - 1)}   \n\n`)).toBe("invent");
  expect(galleyMode(`\n  ${EXACTLY_280}  `)).toBe("readPaste");
});

test("empty and whitespace-only are Invent (the button is inert anyway)", () => {
  expect(looksLikeRecipe("")).toBe(false);
  expect(looksLikeRecipe("   \n \t \n")).toBe(false);
  expect(looksLikeRecipe(null)).toBe(false);
  expect(galleyMode("")).toBe("invent");
  expect(galleyMode("   \n\n  ")).toBe("invent");
  expect(galleyMode(undefined)).toBe("invent");
});

test("a non-empty line is one with any non-whitespace; blank lines never count", () => {
  expect(galleyMode("eggs\n   \n\nbacon")).toBe("invent");                // 2 real lines
  expect(galleyMode("eggs\n   \n\nbacon\n\ttoast  ")).toBe("readPaste");   // 3
  expect(galleyMode("eggs\r\nbacon\r\ntoast")).toBe("readPaste");          // CRLF too
});

test("photos win: any staged photo is Read these, whatever the text or override says", () => {
  expect(galleyMode("", 1)).toBe("readPhotos");
  expect(galleyMode(SHORT_CRAVING, 2)).toBe("readPhotos");
  expect(galleyMode(IG_CAPTION, 4, "invent")).toBe("readPhotos");
  expect(galleyMode("", "3")).toBe("readPhotos");
  expect(galleyMode(SHORT_CRAVING, 0)).toBe("invent");
  expect(galleyMode(SHORT_CRAVING, NaN)).toBe("invent");
});

test("the override flips recipe-shaped text to Invent and is a no-op otherwise", () => {
  expect(galleyMode(IG_CAPTION, 0, "invent")).toBe("invent");
  expect(galleyMode(EXACTLY_280, 0, "invent")).toBe("invent");
  expect(galleyMode(SHORT_CRAVING, 0, "invent")).toBe("invent");
  expect(galleyMode(IG_CAPTION, 0, "readPaste")).toBe("readPaste");   // only "invent" means anything
  expect(galleyMode(IG_CAPTION, 0, null)).toBe("readPaste");
});

test("Invent past meal-suggestion's 600 is flagged, never cut", () => {
  expect(inventTooLong("x".repeat(INVENT_MAX_CHARS))).toBe(false);
  expect(inventTooLong("x".repeat(INVENT_MAX_CHARS + 1))).toBe(true);
  expect(inventTooLong(`  ${"x".repeat(INVENT_MAX_CHARS)}  `)).toBe(false);   // trimmed
  expect(inventTooLong("")).toBe(false);
});

test("label, echo and RUM enum cover every mode and are fixed copy (G3, G4)", () => {
  for (const m of Object.values(MODES)) {
    expect(typeof MODE_LABEL[m]).toBe("string");
    expect(typeof MODE_ECHO[m]).toBe("string");
    expect(typeof MODE_RUM[m]).toBe("string");
  }
  expect(MODE_LABEL.invent).toBe("Create a meal");
  expect(MODE_LABEL.readPhotos).toBe("Read these");
  expect(MODE_LABEL.readPaste).toBe("Read this recipe");
  expect(Object.values(MODE_LABEL)).not.toContain("Submit");
  expect(Object.values(MODE_LABEL)).not.toContain("Ask the Galley");
  expect(MODE_RUM).toEqual({ invent: "invent", readPhotos: "read_photos", readPaste: "read_paste" });
});
