// Run: CI=true npx react-scripts test --watchAll=false src/lib/galleyDraft
import { isMalformedGalleyDraft, measureSteps, GALLEY_MIN_STEPS, GALLEY_MIN_CHARS } from "./galleyDraft";

const PESTO = "1. Boil pasta.\n2. Toss with pesto.";
const SEVEN = [
  "1. Preheat the oven to 400°F and line a sheet pan.",
  "2. Toss 2 lb chicken thighs with 2 tbsp olive oil, salt and pepper.",
  "3. Roast 25 minutes.",
  "4. Meanwhile simmer 1 cup rice in 2 cups water, covered, 18 minutes.",
  "5. Wilt 4 cups spinach in the chicken drippings.",
  "6. Squeeze a lemon over everything.",
  "7. Serve the chicken over the rice with the spinach.",
].join("\n");

test("the thresholds are the ruling's: 2 steps and 40 characters", () => {
  expect(GALLEY_MIN_STEPS).toBe(2);
  expect(GALLEY_MIN_CHARS).toBe(40);
});

test('"x" is malformed (1 unnumbered step, 1 character)', () => {
  expect(measureSteps("x")).toEqual({ steps: 1, chars: 1 });
  expect(isMalformedGalleyDraft("x")).toBe(true);
});

test("empty, whitespace-only and non-strings are malformed", () => {
  expect(isMalformedGalleyDraft("")).toBe(true);
  expect(isMalformedGalleyDraft("   \n\t ")).toBe(true);
  expect(isMalformedGalleyDraft(null)).toBe(true);
  expect(isMalformedGalleyDraft(undefined)).toBe(true);
  expect(measureSteps(undefined)).toEqual({ steps: 0, chars: 0 });
});

test("the pesto two-liner passes: two parsed steps, under 40 characters", () => {
  expect(measureSteps(PESTO)).toEqual({ steps: 2, chars: PESTO.length });
  expect(PESTO.length).toBeLessThan(GALLEY_MIN_CHARS);
  expect(isMalformedGalleyDraft(PESTO)).toBe(false);
});

test("a normal 7-step draft passes", () => {
  expect(measureSteps(SEVEN).steps).toBe(7);
  expect(isMalformedGalleyDraft(SEVEN)).toBe(false);
});

test("one long unnumbered step passes on characters alone; both floors must fail together", () => {
  const one = "Mix everything in a bowl, season well, and bake at 375°F until golden.";
  expect(measureSteps(one).steps).toBe(1);
  expect(one.length).toBeGreaterThanOrEqual(GALLEY_MIN_CHARS);
  expect(isMalformedGalleyDraft(one)).toBe(false);
  expect(isMalformedGalleyDraft("1. Stir.\n2. Eat.")).toBe(false);   // 2 steps, 16 chars
  expect(isMalformedGalleyDraft("Stir then eat it.")).toBe(true);      // 1 step, 17 chars
});
