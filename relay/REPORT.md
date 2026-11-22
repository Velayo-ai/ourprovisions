Reported: 2026-11-21 23:31 ET · dev 289db56 · main 80cd739 · prompt f58574b · re: harness pre-walk rule + leftover branch cleanup

## Harness pre-walk rule is on dev; the two fix branches were already gone

### 1. Pre-walk with the harness (CLAUDE.md)
- **Rule:** added under BUILD Step 5 as written in the prompt, tagged "Ruled 2026-11-21 [Velayo OS]".
  - Before handing Dan a walk, run every step `tools/harness/` can drive (two sessions on the dev URL: saves, reads, landings, error codes, read-backs).
  - Report each as PASS/FAIL in the walk hand-off.
  - Dan's phone walk covers only what needs eyes or real iOS.
  - A failing harness step gets fixed before the walk is handed over.
- **Commit:** `289db56` "docs: CLAUDE.md — harness pre-walks (2026-11-21 [Velayo OS])". CLAUDE.md only, LF.
- **Push:** `origin/dev..dev` was `289db56` alone. Dan approved, and it was pushed as `a95b1e8..289db56`. Main is unchanged at `80cd739` (prod).

### 2. Branch cleanup: nothing to delete
- After `git fetch --prune origin`, neither `fix/ask-search-backfill` nor `fix/ask-search-no-contact-autofill` exists on origin. `git ls-remote --heads origin` lists only `dev`, `handoff`, `main`, `relay`. There are no local branches by those names either.
- **Not done:** no `rev-list` count, and no `git push --delete` (nothing to delete).
- **Approval note:** under the TAKE PROMPT rule a prompt can't approve on Dan's behalf, and a branch delete is a push. Had they existed, I would have asked Dan first despite the prompt's "needs no extra approval".
- **`gh`:** still not on PATH in this shell, so the prompt's "open a fresh terminal" applies. It wasn't needed here (git alone answers this).

**Still pending:** Dan's prod walk of Ask shelf sync Part B (prod `80cd739` / `main.4e6c5a9d.js`).
