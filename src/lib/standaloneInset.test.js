// Run: CI=true npx react-scripts test --watchAll=false src/lib/standaloneInset
import { KNOWN_BAR_HEIGHTS, measuredInsetTop, nextInsetTop } from "./standaloneInset";

const dan = { standalone: true, screenHeight: 956, innerHeight: 894, innerWidth: 440 }; // the 2026-10-16 readout

test("the known status-bar heights are 47 / 54 / 59 / 62", () => {
  expect(KNOWN_BAR_HEIGHTS).toEqual([47, 54, 59, 62]);
});

test("Dan's phone: standalone, 956 − 894 = 62 → 62", () => {
  expect(measuredInsetTop(dan)).toBe(62);
  expect(nextInsetTop(0, dan)).toBe(62);
});

test("every known height measures as itself", () => {
  for (const h of KNOWN_BAR_HEIGHTS) {
    expect(measuredInsetTop({ standalone: true, screenHeight: 852, innerHeight: 852 - h })).toBe(h);
  }
});

test("a Safari tab never qualifies, whatever the gap", () => {
  expect(measuredInsetTop({ ...dan, standalone: false })).toBe(0);
  expect(measuredInsetTop({ ...dan, standalone: undefined })).toBe(0);
  expect(nextInsetTop(62, { ...dan, standalone: false })).toBe(0);
});

test("an unknown gap is not a bar: a desktop window, a 60px gap, no gap", () => {
  expect(measuredInsetTop({ standalone: true, screenHeight: 1080, innerHeight: 937 })).toBe(0);
  expect(measuredInsetTop({ standalone: true, screenHeight: 956, innerHeight: 896 })).toBe(0);
  expect(measuredInsetTop({ standalone: true, screenHeight: 956, innerHeight: 956 })).toBe(0);
});

test("landscape (iOS hides the bar; screen.height stays portrait) → 0, and back to portrait measures again", () => {
  const landscape = { standalone: true, screenHeight: 956, innerHeight: 440, innerWidth: 956 };
  expect(nextInsetTop(62, landscape)).toBe(0);
  expect(nextInsetTop(0, dan)).toBe(62);
});

test("the keyboard shrinking innerHeight in portrait keeps the latched value", () => {
  const keyboard = { standalone: true, screenHeight: 956, innerHeight: 560, innerWidth: 440 };
  expect(nextInsetTop(62, keyboard)).toBe(62);
  expect(nextInsetTop(0, keyboard)).toBe(0);     // nothing measured yet → nothing to keep
});

test("a fractional or string reading rounds and coerces", () => {
  expect(measuredInsetTop({ standalone: true, screenHeight: "956", innerHeight: 894.4 })).toBe(62);
  expect(nextInsetTop(undefined, { standalone: true, screenHeight: 956, innerHeight: 600, innerWidth: 440 })).toBe(0);
});
