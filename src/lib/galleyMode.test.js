// Run: CI=true npx react-scripts test --watchAll=false src/lib/galleyMode
import {
  galleyMode, looksLikeRecipe, inventTooLong,
  RECIPE_MIN_LINES, RECIPE_MIN_CHARS, RECIPE_MIN_QUANTITY_LINES, RECIPE_MIN_NUMBERED_LINES,
  INVENT_MAX_CHARS, TEXT_CAP,
  MODE_LABEL, MODE_ECHO, MODE_RUM, MODES, STARTER_PROMPTS,
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
  expect(RECIPE_MIN_QUANTITY_LINES).toBe(2);
  expect(RECIPE_MIN_NUMBERED_LINES).toBe(2);
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
  expect(galleyMode("2 eggs\n   \n\n3 strips bacon")).toBe("invent");                  // 2 real lines
  expect(galleyMode("2 eggs\n   \n\n3 strips bacon\n\ttoast  ")).toBe("readPaste");    // 3 (tab-led line trimmed)
  expect(galleyMode("2 eggs\r\n3 strips bacon\r\ntoast")).toBe("readPaste");           // CRLF too
});

// 2026-10-13 tightening — three lines alone no longer read; a signal is needed.
test("three plain lines with no recipe signal are a craving: Invent", () => {
  expect(galleyMode("something warm\nwith chicken\nnot too spicy")).toBe("invent");
  expect(galleyMode("eggs\nbacon\ntoast")).toBe("invent");
});

test("one quantity line among three is not enough: Invent", () => {
  expect(galleyMode("2 chicken breasts\nrice\nsomething spicy")).toBe("invent");
});

test("two quantity lines among three read as a recipe", () => {
  expect(galleyMode("2 cups flour\n1 tsp salt\n3 eggs")).toBe("readPaste");
});

test("a leading bullet (-, •, *) is stripped before the quantity is read", () => {
  expect(galleyMode("- 2 cups flour\n- 1 tsp salt\nbutter")).toBe("readPaste");
  expect(galleyMode("• 2 cups flour\n• 1 tsp salt\nbutter")).toBe("readPaste");
  expect(galleyMode("* 2 cups flour\n*1 tsp salt\nbutter")).toBe("readPaste");
});

test("fraction glyphs are quantities", () => {
  expect(galleyMode("½ cup sugar\n¼ tsp salt\nbutter")).toBe("readPaste");
});

test("N/N fractions are quantities", () => {
  expect(galleyMode("1/2 cup milk\n3/4 cup oats\nhoney")).toBe("readPaste");
});

test("a section header line reads as a recipe (any case, optional colon)", () => {
  expect(galleyMode("Ingredients:\nflour\nsugar")).toBe("readPaste");
  expect(galleyMode("flour\nsugar\nMETHOD")).toBe("readPaste");
  expect(galleyMode("Directions\nflour\nsugar")).toBe("readPaste");
  expect(galleyMode("instructions:\nflour\nsugar")).toBe("readPaste");
  expect(galleyMode("Steps:\nflour\nsugar")).toBe("readPaste");
  expect(galleyMode("Ingredients for tonight\nflour\nsugar")).toBe("invent");   // the whole line, not a prefix
});

test("two numbered lines read as a recipe", () => {
  expect(galleyMode("1. Preheat\n2. Mix\n3. Bake")).toBe("readPaste");
  expect(galleyMode("1) Preheat\n2) Mix\nserve")).toBe("readPaste");
});

test("only two lines is Invent whatever the signals (unchanged)", () => {
  expect(galleyMode("2 cups flour\n1 egg")).toBe("invent");
  expect(galleyMode("Ingredients:\n2 cups flour")).toBe("invent");
});

test("a long single line with no signal still reads at 280 characters (unchanged by design)", () => {
  const line = "a".repeat(300);
  expect(line).not.toMatch(/\n/);
  expect(galleyMode(line)).toBe("readPaste");
});

test("blank lines between the three plain lines change nothing: still Invent", () => {
  expect(galleyMode("something warm\n\nwith chicken\n\nnot too spicy")).toBe("invent");
  expect(galleyMode("2 cups flour\n\n1 egg\n\n")).toBe("invent");   // blank lines never make a third line
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

test("the two filling starter chips are cravings: Invent, well under the Galley's ceiling (G8)", () => {
  expect(STARTER_PROMPTS).toEqual(["Something cozy with chicken", "Quick weeknight dinner"]);
  for (const p of STARTER_PROMPTS) {
    expect(galleyMode(p)).toBe("invent");
    expect(inventTooLong(p)).toBe(false);
  }
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
