// Run: CI=true npx react-scripts test --watchAll=false src/lib/displayTitle
import { displayTitle, SMALL_WORDS } from "./displayTitle";

// The five cases in SPEC_meal_library_visual_v2 (D11).
test("lower-cases a small word that is not the first word", () => {
  expect(displayTitle("Lemon Garlic Shrimp And Spinach Pasta")).toBe("Lemon Garlic Shrimp and Spinach Pasta");
});

test("handles the Italian small words", () => {
  expect(displayTitle("Chicken Penne Alla Vodka With Vegetables")).toBe("Chicken Penne alla Vodka with Vegetables");
});

test("leaves the first word alone", () => {
  expect(displayTitle("And Then There Was Pie")).toBe("And Then There Was Pie");
});

test("never touches an all-caps token", () => {
  expect(displayTitle("BLT With Avocado")).toBe("BLT with Avocado");
  expect(displayTitle("Chicken AND Rice")).toBe("Chicken AND Rice");
});

test("never up-cases anything", () => {
  expect(displayTitle("grandma's chili")).toBe("grandma's chili");
  expect(displayTitle("pasta with peas")).toBe("pasta with peas");
});

// Guard rails beyond the five.
test("matches whole words only", () => {
  expect(displayTitle("Andes Mint Brownies")).toBe("Andes Mint Brownies");
  expect(displayTitle("Chicken Oregano Bake")).toBe("Chicken Oregano Bake");
  expect(displayTitle("Tacos Al Pastor")).toBe("Tacos al Pastor");
});

test("ignores punctuation-bearing tokens and keeps spacing", () => {
  expect(displayTitle("Beans  And   Rice")).toBe("Beans  and   Rice");
  expect(displayTitle("Rice And, Beans")).toBe("Rice And, Beans");
});

test("is safe on empty and non-string input", () => {
  expect(displayTitle("")).toBe("");
  expect(displayTitle(null)).toBe(null);
  expect(displayTitle(undefined)).toBe(undefined);
});

test("the small-word list is the spec's", () => {
  expect(SMALL_WORDS).toEqual(["and", "or", "with", "of", "the", "a", "an", "in", "on", "to", "for", "alla", "al", "con", "de"]);
});
