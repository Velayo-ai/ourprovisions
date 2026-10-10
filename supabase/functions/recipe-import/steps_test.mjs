// supabase/functions/recipe-import/steps_test.mjs
//
// Unit tests for numberSteps — no token, no network, no Deno.
//   node --test supabase/functions/recipe-import/steps_test.mjs
// (Node 24 strips the types from steps.ts on import. Not part of the deploy bundle:
// the CLI uploads index.ts's import graph only.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { numberSteps } from "./steps.ts";

test("an unnumbered preamble becomes step 1 and the rest renumber", () => {
  const input = "Roast the fish\n1. Preheat your oven to 425°F.\n2. Bake for 12–14 minutes.";
  assert.equal(
    numberSteps(input),
    "1. Roast the fish\n2. Preheat your oven to 425°F.\n3. Bake for 12–14 minutes.",
  );
});

test("steps already numbered come back unchanged", () => {
  const input = "1. Mix dry.\n2. Mix wet.\n3. Combine.\n4. Bake at 425 in a greased 8-inch pan for 20-25 minutes.";
  assert.equal(numberSteps(input), input);
});

test("a gap in the numbering closes", () => {
  assert.equal(numberSteps("1. A\n2. B\n4. C"), "1. A\n2. B\n3. C");
});

test("a sentence split across screens arrives already joined by the model and stays one step", () => {
  // The model stitches the two screenshots (set4's "Blend the Crema", 2026-10-09); the
  // function must not re-split a long line, and must not join lines on its own either.
  const input =
    "Blend the Crema: While the fish bakes, add the avocados, cottage cheese, avocado oil, lime juice, fresh parsley, and cumin to a blender or food processor. Blend on high until the sauce is incredibly smooth.\n" +
    "Mix the Slaw: In a medium bowl, toss the shredded green and red cabbage.";
  assert.equal(
    numberSteps(input),
    "1. Blend the Crema: While the fish bakes, add the avocados, cottage cheese, avocado oil, lime juice, fresh parsley, and cumin to a blender or food processor. Blend on high until the sauce is incredibly smooth.\n" +
    "2. Mix the Slaw: In a medium bowl, toss the shredded green and red cabbage.",
  );
});

test("four all-lowercase steps with no terminal punctuation come back as four steps", () => {
  const input = "pat the thighs dry\nbrown them skin side down\nadd the garlic and the stock\nslide into the oven";
  assert.equal(
    numberSteps(input),
    "1. pat the thighs dry\n2. brown them skin side down\n3. add the garlic and the stock\n4. slide into the oven",
  );
});

test("wholly unnumbered lines are numbered in order (the preamble-rule guarantee)", () => {
  assert.equal(numberSteps("Mix dry.\nMix wet.\nCombine."), "1. Mix dry.\n2. Mix wet.\n3. Combine.");
});

test("other marker shapes are stripped: 'N)', 'Step N:'", () => {
  assert.equal(numberSteps("1) First\nStep 2: Second\n3: Third"), "1. First\n2. Second\n3. Third");
});

test("a bare marker takes the next line as its body", () => {
  assert.equal(numberSteps("1.\nPreheat the oven.\n2.\nBake."), "1. Preheat the oven.\n2. Bake.");
});

test("the author's words are untouched: a step that starts with a number is not a marker", () => {
  const input = "1. Comb. flour - salt w/ whisk.\n2\" apart - ungreased cookie sheet.\n375° 13-14 mins.";
  assert.equal(
    numberSteps(input),
    "1. Comb. flour - salt w/ whisk.\n2. 2\" apart - ungreased cookie sheet.\n3. 375° 13-14 mins.",
  );
});

test("CRLF, blank lines and stray whitespace are normalised; empty input is empty", () => {
  assert.equal(numberSteps("1. A\r\n\r\n  2. B  \r\n"), "1. A\n2. B");
  assert.equal(numberSteps(""), "");
  assert.equal(numberSteps("   \n\n"), "");
});
