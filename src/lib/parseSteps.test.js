// Run: CI=true npx react-scripts test --watchAll=false src/lib/parseSteps
import { parseSteps } from "./parseSteps";

// The parser as it stood in App.js before the lift (690c64c), copied verbatim.
// Every input with NO "1."/"1)" line must come back from the new parser with the
// same { steps, numbered } — that is the "byte for byte" guarantee for existing
// meals and pre-v5 Galley drafts. Kept here, not exported, so nothing can use it.
function legacyParseSteps(text) {
  const src = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!src) return { steps: [], numbered: false };
  const steps = [];
  let current = null;
  let numbered = false;
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^\d+\.\s*(.*)$/);
    if (m) {
      numbered = true;
      if (current) steps.push(current);
      current = m[1].trim();
    } else if (current !== null) {
      current = `${current} ${line}`.trim();
    } else {
      current = line;
    }
  }
  if (current) steps.push(current);
  if (!numbered) return { steps: [src], numbered: false };
  return { steps: steps.filter(Boolean), numbered: true };
}

const ASWRITTEN = "As written\n2¼ c. flour\n4 teas. B.P.\nJuice of 1 lime\n\n1. Cream the butter.\n2. Fold in the flour.\n3. Bake 13-14 mins.";

test("an As-written block above numbered steps is a preamble, never step 1", () => {
  const r = parseSteps(ASWRITTEN);
  expect(r.numbered).toBe(true);
  expect(r.preamble).toEqual(["As written", "2¼ c. flour", "4 teas. B.P.", "Juice of 1 lime"]);
  expect(r.steps).toEqual(["Cream the butter.", "Fold in the flour.", "Bake 13-14 mins."]);
});

test("the old parser made that same block step 1 — the defect the rule fixes", () => {
  const old = legacyParseSteps(ASWRITTEN);
  expect(old.steps[0]).toBe("As written 2¼ c. flour 4 teas. B.P. Juice of 1 lime");
  expect(old.steps.length).toBe(4);
});

test("numbered steps only: no preamble, steps unchanged", () => {
  const text = "1. Whisk.\n2. Fold.\n3. Bake.";
  expect(parseSteps(text)).toEqual({ preamble: [], steps: ["Whisk.", "Fold.", "Bake."], numbered: true });
  expect(legacyParseSteps(text)).toEqual({ steps: ["Whisk.", "Fold.", "Bake."], numbered: true });
});

test("no numbering at all: one unnumbered step, byte-identical to the old parser", () => {
  for (const text of [
    "x",                                        // the dev/prod junk meals
    "Mix everything and bake.",
    "Mix everything\nand bake.\n\nServe warm.",
    "  padded  \r\nwindows\r\nendings ",
    "10. not a first step on its own",          // "10." is not "1."
  ]) {
    const r = parseSteps(text);
    expect(r.preamble).toEqual([]);
    expect({ steps: r.steps, numbered: r.numbered }).toEqual(legacyParseSteps(text));
  }
});

test("empty input is empty", () => {
  expect(parseSteps("")).toEqual({ preamble: [], steps: [], numbered: false });
  expect(parseSteps(null)).toEqual({ preamble: [], steps: [], numbered: false });
  expect(parseSteps("  \n\n ")).toEqual({ preamble: [], steps: [], numbered: false });
});

test("continuation lines still fold into the step above; blank lines dropped; CRLF ok", () => {
  const text = "1. Whisk the eggs\r\nuntil pale.\r\n\r\n2. Fold.";
  expect(parseSteps(text).steps).toEqual(["Whisk the eggs until pale.", "Fold."]);
});

test("'1)' opens the preamble and 'N)' lines are steps", () => {
  const r = parseSteps("Grandma's card\n1) Cream.\n2) Fold.");
  expect(r.preamble).toEqual(["Grandma's card"]);
  expect(r.steps).toEqual(["Cream.", "Fold."]);
  expect(r.numbered).toBe(true);
});

test("numbering that starts at 2. keeps the old behaviour: the lead-in is step 1", () => {
  const text = "Preheat the oven.\n2. Mix.\n3. Bake.";
  const r = parseSteps(text);
  expect(r.preamble).toEqual([]);
  expect({ steps: r.steps, numbered: r.numbered }).toEqual(legacyParseSteps(text));
  expect(r.steps).toEqual(["Preheat the oven.", "Mix.", "Bake."]);
});

test("a '1.' on the first line means no preamble", () => {
  const r = parseSteps("1. Only step.");
  expect(r.preamble).toEqual([]);
  expect(r.steps).toEqual(["Only step."]);
});

test("blank lines inside the preamble are dropped, lines are trimmed", () => {
  const r = parseSteps("  As written  \n\n  2 eggs  \n1. Beat.");
  expect(r.preamble).toEqual(["As written", "2 eggs"]);
});

test("the old parser and the new agree on every numbered input without a lead-in", () => {
  for (const text of ["1. a\n2. b", "1. a\nmore a\n2. b\n\n3. c", "1.\n2. b", "1. a"]) {
    const r = parseSteps(text);
    expect({ steps: r.steps, numbered: r.numbered }).toEqual(legacyParseSteps(text));
  }
});
