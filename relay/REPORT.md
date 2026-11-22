Reported: 2026-11-21 21:51 ET · dev 95f7013 · main dac0fc3 · re: Velayo OS ruling: reports travel by a relay branch (CLAUDE.md rule, push dev after asking, then this report through the relay as the first test)

## Reports via origin/relay: the rule is on dev, and this is the first relay report

- **CLAUDE.md:** new Git discipline bullet, after the origin/handoff rule. Every report that would otherwise be pasted into the design chat also goes to `origin/relay` as `relay/REPORT.md`, one ordinary commit per report.
  - Header line: `Reported: <YYYY-MM-DD HH:MM ET> · dev <sha> · main <sha> · re: <prompt>`.
  - Only `relay/REPORT.md` is written on that branch, and it is never merged or checked out (temporary worktree or `git commit-tree`).
  - Relay pushes need no approval; every other push rule stands.
  - The report is still shown in Claude Code as usual.
- **Commit:** `95f7013` "docs: CLAUDE.md — reports via origin/relay (2026-11-21 [Velayo OS])". CLAUDE.md only, no code.
- **Push:** `origin/dev..dev` was `95f7013` alone. Dan approved, and it was pushed as `69a26f7..95f7013`. Main is unchanged at `dac0fc3` (prod).
- **Relay, first use:** `origin/relay` didn't exist. It is created as an orphan whose first commit holds only `relay/REPORT.md` (this file). It was built with `git mktree` + `git commit-tree`, so the working tree never left dev.

Still open from earlier tonight: Part B's four rulings before 087 is written (P0409 for resulting-shelf failures; P0409 for an add whose item was deleted mid-edit; the zero-landed case; dropping the optional "Updated just now by {First}" line).
