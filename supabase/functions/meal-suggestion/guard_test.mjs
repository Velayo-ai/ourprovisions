// supabase/functions/meal-suggestion/guard_test.mjs
//
// Unit tests for the server-side draft guard — no token, no network, no Deno.
//   node --test supabase/functions/meal-suggestion/guard_test.mjs
// (Node 24 strips the types from guard.ts on import. Not part of the deploy bundle:
// the CLI uploads index.ts's import graph only, and nothing imports this file.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_CHARS, MIN_LINES, instructionsUnusable, measureInstructions } from "./guard.ts";

const unusable = (s) => instructionsUnusable(measureInstructions(s));

test("thresholds match the client guard (galleyDraft.js: 2 steps / 40 chars)", () => {
  assert.equal(MIN_LINES, 2);
  assert.equal(MIN_CHARS, 40);
});

test('the prod stub "x" is rejected', () => {
  assert.deepEqual(measureInstructions("x"), { lines: 1, chars: 1 });
  assert.equal(unusable("x"), true);
});

test("a two-line draft is accepted even when it is short", () => {
  const draft = "1. Boil pasta.\n2. Toss with pesto.";
  assert.equal(measureInstructions(draft).lines, 2);
  assert.ok(measureInstructions(draft).chars < MIN_CHARS, "the case must be short to be meaningful");
  assert.equal(unusable(draft), false);
});

test("a long one-liner is accepted", () => {
  const draft = "1. Simmer the lentils with the stock and cumin for 25 minutes, then season and serve.";
  assert.equal(measureInstructions(draft).lines, 1);
  assert.equal(unusable(draft), false);
});

test("a short one-liner is rejected", () => {
  assert.equal(unusable("1. Serve."), true);
});

test("blank lines and whitespace do not count as lines or characters", () => {
  assert.deepEqual(measureInstructions("  x  \n\n   \n"), { lines: 1, chars: 1 });
  assert.equal(unusable("\n\n x \n\n"), true);
});

test("CRLF line endings count the same as LF", () => {
  assert.equal(measureInstructions("1. Boil.\r\n2. Drain.").lines, 2);
});

test("a non-string measures as empty", () => {
  assert.deepEqual(measureInstructions(undefined), { lines: 0, chars: 0 });
  assert.equal(instructionsUnusable(measureInstructions(null)), true);
});
