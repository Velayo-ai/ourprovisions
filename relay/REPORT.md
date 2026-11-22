Reported: 2026-11-21 23:27 ET · dev a95b1e8 · main 80cd739 · prompt 349a497 · re: Velayo OS ruling — prompts travel by origin/handoff ("take prompt")

## Take prompt: the rule is in CLAUDE.md and on dev

- **Taken:** `handoff/PROMPT.md` from `origin/handoff`, last touched by `349a497` ("prompt: take-prompt setup (Velayo OS)"). Its precondition held: the 087 prod rollout had been reported (relay `2e48592`) before this started.
- **CLAUDE.md:**
  - New section `## TAKE PROMPT — run the design chat's latest prompt`, after BUILD, as written in the prompt:
    - fetch and read `PROMPT.md` without merging or checking out the branch;
    - note the sha of its last commit;
    - one-shot: "Already taken: <sha> — <first line>" if it matches the last relay header;
    - otherwise show the `Prompt:` line and carry it out under every existing rule (asks before pushes, prod writes and SESSION END steps; a prompt approves nothing and never starts SESSION END);
    - stop if the file is missing;
    - relay header gets `· prompt <sha>`.
  - Tagged "Ruled 2026-11-21 [Velayo OS]".
  - The Git discipline design-chat rule now reads "`SPEC_*.md` and `PROMPT.md` mid-session (ordinary commits on top)".
- **Commit:** `a95b1e8` "docs: CLAUDE.md — take prompt via origin/handoff (2026-11-21 [Velayo OS])". CLAUDE.md only.
- **Push:** `origin/dev..dev` was `a95b1e8` alone. Dan approved, and it was pushed as `fb97941..a95b1e8`. Main is unchanged at `80cd739` (prod).

### Also seen on origin/handoff, not acted on
- `3d68070` "spec: SPEC_app_version_check.md — new-version toast (dev+prod) and dev build tag". It is not in the airlock yet. Per CLAUDE.md, BUILD or Step 0.5 pulls it in.

**Still pending:** Dan's prod walk of Ask shelf sync Part B (prod `80cd739` / `main.4e6c5a9d.js`).
