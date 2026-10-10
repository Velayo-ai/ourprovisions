// supabase/functions/recipe-import/steps.ts
//
// Server-side step numbering — a PURE function, no Deno, no I/O, so it is unit-testable
// with no token (`node --test steps_test.mjs`; Node 24 strips the types).
//
// WHY (ruling 2026-10-09): the function numbers the steps, the model doesn't. Chunk 2's
// `parseSteps` preamble rule renders any unnumbered lines before the first "1." as a
// preamble above the steps — so a recipe that arrived with no "N." at all would be
// swallowed whole into the preamble. This is the guarantee behind that rule: every
// draft that leaves this function has every step numbered 1..N, in order, with no gaps.
//
// WHAT IT DOES NOT DO: change the author's words, or decide where a step ends. It
// strips a leading marker ("3.", "3)", "Step 3:") if the model wrote one and writes
// "N. " in front. One line in, one step out. Nothing else is touched — byte-faithful
// steps (the 2026-10-09 ruling) are the words, not the digits.
//
// NO CONTINUATION HEURISTIC (Dan, 2026-10-09). An earlier draft joined a lowercase-led
// line onto the step above it, to re-stitch a sentence split across two screenshots.
// Removed: the model already returns such a sentence on one line (set4's "Blend the
// Crema" proved it), and a recipe whose author writes four lowercase steps with no
// full stops would have collapsed into one. Joining is the model's job; this function
// only numbers. The one line-shape rule kept is the bare marker — a line that is
// ONLY "3." takes the next line as its body — because that one is unambiguous.

const MARKER = /^(?:step\s*)?(\d{1,3})\s*[.):]\s*(.*)$/i;

/**
 * Normalise a block of instructions into "1. …\n2. …\n…".
 * - CRLF/CR → LF; blank lines dropped; each line trimmed.
 * - An existing marker is stripped and the step renumbered (gaps close: 1, 2, 4 → 1, 2, 3).
 * - Every other non-blank line is one step, whatever it starts with.
 * - A marker with no body ("3.") takes the next line as its body.
 * - Empty input → "".
 */
export function numberSteps(text: string): string {
  const src = String(text ?? "").replace(/\r\n?/g, "\n");
  const steps: string[] = [];
  let pendingEmptyMarker = false;

  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const m = line.match(MARKER);
    if (m) {
      const body = m[2].trim();
      if (body) {
        steps.push(body);
        pendingEmptyMarker = false;
      } else {
        // "3." alone — hold the slot; the next line is its body.
        steps.push("");
        pendingEmptyMarker = true;
      }
      continue;
    }

    if (pendingEmptyMarker) {
      steps[steps.length - 1] = line;
      pendingEmptyMarker = false;
      continue;
    }

    steps.push(line);
  }

  return steps
    .filter((s) => s.length > 0)
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");
}
