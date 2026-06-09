# CLAUDE.md — OurProvisions

This file gives Claude Code standing context and routines for this repo. It is
read automatically at the start of every Claude Code session.

---

## Project

OurProvisions — a collaborative household grocery & provisioning app. Part of
Velayo Inc. ("Live Better. Live Smarter."). Founder/engineer: Dan Holmes.

**Stack:** React (Create React App), Supabase (Postgres + RLS), Clerk auth,
Vercel hosting, Anthropic Claude API.
**Branches:** `dev` → preview (dev.ourprovisions.velayo.ai); `main` → production
(ourprovisions.velayo.ai).
**Key files:** `src/App.js`, `src/hooks/useProvisions.js`.
**Docs:** `src/docs/SESSION_LOG.md`, `src/docs/ROADMAP.md`.

---

## Git discipline

- Commit before switching branches — uncommitted changes have been lost before.
- Workflow: commit → push dev → test → merge to main → push main.
- `CI=true` on Vercel treats ESLint warnings as errors — every declared variable
  must be used. Report unused vars; don't silently delete.

---

## SESSION END — Scribe routine

When I type "SESSION END", do all of the following in one pass:

1. Read the full session (everything we did this session).

2. **Update `src/docs/SESSION_LOG.md`** — prepend a NEW entry at the TOP of the
   `## LOG` section (most recent first). Use the SESSION LOG ENTRY FORMAT below.
   This is a single rolling file; do NOT create dated per-session files.

3. **Update `src/docs/ROADMAP.md`** — move completed items to DONE (stamp with
   today's date), add new immediate priorities to NOW, queue anything new under
   NEXT / LATER, record any model-level decisions in the DECISIONS LOG, and
   update the "Last updated" date at the top.

4. **Commit both files:**
   `git add src/docs/SESSION_LOG.md src/docs/ROADMAP.md`
   `git commit -m "docs: session log + roadmap — <YYYY-MM-DD> <short goal>"`
   Do NOT push automatically — leave the commit local for my review. I'll push.

5. **Tell me which Project Knowledge files to re-upload** to the web chat: the two
   docs, plus any source files that changed this session.

### Rules
- Infer today's date from the system date.
- Velayo voice: concise, action-verb led, honest about what's unfinished.
- Match the existing file formats exactly.
- Never claim work as done if it's half-finished — that goes in Unfinished.
- The "Next session" SESSION START block must include a clear "Done when".

### SESSION LOG ENTRY FORMAT
```
### [YYYY-MM-DD] — [GOAL]
**Goal:** [one sentence]
**Completed:**
- [past-tense, action-verb led, max 7 items]
**Unfinished:**
- [honest list, or "None"]
**Next session:**
SESSION START
Goal: [logical next goal]
State: [what's working, what's live, what's broken]
Done when: [clear success condition]
**Files updated:** [list or "None"]
**DB changes:** [list or "None"]
```

### ROADMAP STATUS KEY (do not change)
- NOW — actively building this week
- NEXT — clearly defined, ready to start
- LATER — planned but not yet spec'd
- DONE — shipped and live (always stamp with month/date)

---

## Notes for working in this repo

- Surgical edits beat large multi-file rewrites. Grep for the target
  function/variable, view the exact line range, then make the change.
- For Supabase function changes, verify the save with
  `select pg_get_functiondef(oid) from pg_proc where proname = '<name>'` — the
  SQL Editor has silently kept old versions before.
- After any deploy, hard-refresh (Ctrl+Shift+R) all clients before judging a
  multi-client fix — stale JS produces false negatives.
