# END-OF-DESIGN-CHAT PROMPT
# Paste this at the end of any Claude CHAT session where design / decisions happened.
# It produces ONE handoff file you save to repo/handoff/design_handoff.md
# Claude Code then merges it on its next SESSION END.

---

Produce a design handoff file capturing everything from THIS chat session that
should reach the repo docs. Output it as a single downloadable .md file named
`design_handoff.md`, using EXACTLY these delimited sections (omit a section only
if truly nothing applies):

## SESSION_LOG
[A session-log entry in our standard format — Goal / Completed / Unfinished /
Next session (SESSION START block with Done when) / Files updated / DB changes.
Focus on DECISIONS and DESIGN made here. Note that implementation details will
be merged in by Claude Code from its own session.]

## ROADMAP_DECISIONS
[Any model-level or architectural decisions, in DECISIONS LOG format:
| date | decision + rationale |. Also list any roadmap moves:
"Move X to DONE", "Add Y to NEXT", etc. Omit if no decisions this session.]

## ARCHITECTURE
[Any structural changes to capture: new/changed tables or columns, new RPCs,
schema constraints discovered, new cross-cutting patterns, new design
principles. Omit if nothing architectural changed.]

## DROPPED_FILES
[A manifest of EVERY other file this chat produced that I am dropping into
`repo/handoff/` alongside this handoff (specs, etc.) — NOT counting
`design_handoff.md` itself or the two baseline files (`.gitignore`,
`DESIGN_CHAT_handoff_prompt.md`). One row per file:
| filename | destination | what it is |
e.g. | SPEC_create_household_from_template.md | docs/specs/active/ | build spec
for the clone-catalog-on-create feature |.
Omit this section ONLY if no payload files were dropped. If present, Claude Code
files each listed file to its destination during SESSION END, then clears it
from `handoff/`.]

Rules:
- Infer today's date.
- Be concise, Velayo voice, honest about what's unfinished.
- This file is a HANDOFF, not the final doc — Claude Code merges it into the
  canonical SESSION_LOG.md / ROADMAP.md / ARCHITECTURE.md and then deletes it.
- Do not include anything you're unsure about; flag open questions in the
  Unfinished / Next session area instead of inventing resolution.

After generating, remind me to: save it to repo/handoff/design_handoff.md AND
drop any payload files listed in DROPPED_FILES into repo/handoff/ alongside it,
then run SESSION END in Claude Code.
