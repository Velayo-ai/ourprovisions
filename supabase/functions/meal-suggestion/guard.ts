// supabase/functions/meal-suggestion/guard.ts
//
// The server-side draft guard — the half of the "x" fix that lives in the function.
// SPEC_meal_suggestion_fix.md C4 (2026-10-16).
//
// A draft whose instructions are a stub ("x") passed validateAndNormalizeDraft, which
// only checks non-empty, and landed on prod as a one-letter recipe (2026-10-12). The
// client guard (src/lib/galleyDraft.js, GALLEY_MIN_STEPS 2 / GALLEY_MIN_CHARS 40)
// already refuses that shape; this is the same threshold on the server, so a stub is
// a 502 before it ever reaches a phone.
//
// Unusable = BOTH hold: fewer than MIN_LINES non-empty lines AND fewer than MIN_CHARS
// trimmed characters. Requiring both keeps a terse-but-real two-liner and a long
// one-line recipe alive; "x" fails on both. The client counts parsed numbered steps
// where this counts non-empty lines — they differ only on unnumbered multi-line text
// under 40 characters, which the client then catches as its second line of defence.
//
// Pure, no Deno imports, so `node --test guard_test.mjs` proves it without a token or
// a deploy (the recipe-import steps.ts precedent). Imported by index.ts, so it ships.

export const MIN_LINES = 2;
export const MIN_CHARS = 40;

export type InstructionMeasure = { lines: number; chars: number };

/** Non-empty trimmed lines, and the trimmed length. Counts only — never the text. */
export function measureInstructions(instructions: unknown): InstructionMeasure {
  const text = typeof instructions === "string" ? instructions : "";
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length;
  return { lines, chars: text.trim().length };
}

export function instructionsUnusable(m: InstructionMeasure): boolean {
  return m.lines < MIN_LINES && m.chars < MIN_CHARS;
}
