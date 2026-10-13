// Steps read-mode parser. `meals.instructions` stays free text (043); this is a
// pure render over it, never a data change. Lifted out of App.js on 2026-10-10 so
// the preamble rule below could be unit-tested with no DOM (SPEC_recipe_import,
// chunk 2 slice A). Never throws.
//
// A step begins at a line starting "N." or "N)" — continuation lines fold into
// the step above, blank lines are dropped. Text with no numbered line at all
// (someone typed a paragraph) comes back as one unnumbered step so the card
// always has something to show — that branch is byte-identical to the pre-lift
// parser, which is what keeps every existing meal and every pre-v5 Galley draft
// rendering exactly as it did.
//
// THE PREAMBLE RULE (ruled 2026-10-09, built 2026-10-10). If the text contains a
// line starting "1." (or "1)"), every line before it is a PREAMBLE: returned
// separately, rendered above the numbered steps, never as step 1 and never
// numbered. Before this rule those lines became step 1 and shifted the author's
// numbering by one. The rule exists for the import's "As written" block — the
// verbatim ingredient lines the client writes above the function's steps — and
// it is safe because `recipe-import` numbers every step 1..N itself (steps.ts):
// the only preamble in the system is the one the client built. The boundary is
// literally the first "1."/"1)" line: text whose numbering starts at "2." keeps
// the old behaviour (its lead-in is step 1), and "10." never opens a preamble.

const STEP_MARKER = /^(\d+)[.)]\s*(.*)$/;
const FIRST_STEP = /^1[.)](?:\s|$)/;

export function parseSteps(text) {
  const src = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!src) return { preamble: [], steps: [], numbered: false };
  const lines = src.split("\n");

  const firstIdx = lines.findIndex((raw) => FIRST_STEP.test(raw.trim()));
  const preamble = firstIdx > 0
    ? lines.slice(0, firstIdx).map((raw) => raw.trim()).filter(Boolean)
    : [];
  const body = firstIdx > 0 ? lines.slice(firstIdx) : lines;

  const steps = [];
  let current = null;
  let numbered = false;
  for (const raw of body) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(STEP_MARKER);
    if (m) {
      numbered = true;
      if (current) steps.push(current);
      current = m[2].trim();
    } else if (current !== null) {
      current = `${current} ${line}`.trim();
    } else {
      current = line;
    }
  }
  if (current) steps.push(current);
  if (!numbered) return { preamble: [], steps: [src], numbered: false };
  return { preamble, steps: steps.filter(Boolean), numbered: true };
}
