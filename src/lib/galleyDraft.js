// The Galley draft guard (Dan, 2026-10-12, walk B6): a draft that arrives with
// instructions like "x" is malformed and must FAIL LOUDLY — the plain "Couldn't
// get a suggestion. Try again." toast — never land as a meal. Mirrors the rule
// recipe-import already has on its side. meal-suggestion itself only checks
// that instructions are non-empty, and it is live on prod, so its own guard is
// a separate gated deploy (bundled with the body-first fix it owes); this is
// the client half, which also rides to prod with the composer.
//
// Malformed = BOTH hold: fewer than GALLEY_MIN_STEPS parsed steps AND fewer than
// GALLEY_MIN_CHARS trimmed characters. Requiring both keeps a terse-but-real
// draft ("1. Boil pasta.\n2. Toss with pesto.") alive; "x" fails on both.
// Pure; thresholds live here with the jest cases beside them.
import { parseSteps } from "./parseSteps";

export const GALLEY_MIN_STEPS = 2;
export const GALLEY_MIN_CHARS = 40;

// What the Steps field will render for this text: step count and trimmed length.
// The same measure is logged on landing, so the two reads are comparable.
export const measureSteps = (instructions) => {
  const text = typeof instructions === "string" ? instructions : "";
  return { steps: parseSteps(text).steps.length, chars: text.trim().length };
};

export const isMalformedGalleyDraft = (instructions) => {
  const { steps, chars } = measureSteps(instructions);
  return steps < GALLEY_MIN_STEPS && chars < GALLEY_MIN_CHARS;
};
