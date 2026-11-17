# handoff (orphan branch)

Airlock between the design chat and Claude Code. Holds ONE file: handoff/design_handoff.md.
- The design chat writes it here (this branch only, one commit, replaced each time).
- Claude Code reads it with `git show origin/handoff:handoff/design_handoff.md`, merges the CONTENT into docs on dev.
- Never merge or check out this branch into dev or main. It shares no history with them.
- vercel.json turns Vercel deployments off for this branch (it has no app to build).
