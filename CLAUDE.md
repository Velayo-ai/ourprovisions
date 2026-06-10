# CLAUDE.md — OurProvisions

This file gives Claude Code standing context and routines for this repo. It is
read automatically at the start of every Claude Code session.

---

## Project

OurProvisions — a collaborative household grocery & provisioning app. Part of
Velayo Inc. ("Live Better. Live Smarter."). Founder/engineer: Dan Holmes.

**Stack:** React (Create React App), Supabase (Postgres + RLS), Clerk auth,
Vercel hosting, Anthropic Claude API.
**Branches:** `dev` -> preview (dev.ourprovisions.velayo.ai); `main` -> production
(ourprovisions.velayo.ai).
**Key files:** `src/App.js`, `src/hooks/useProvisions.js`, `src/supabaseClient.js`.
**Docs (all in `src/docs/`):** `SESSION_LOG.md`, `ROADMAP.md`, `ARCHITECTURE.md`,
and feature specs (`SPEC_*.md`).

---

## Git discipline

- Commit before switching branches — uncommitted changes have been lost before.
- Workflow: commit -> push dev -> test -> merge to main -> push main.
- `CI=true` on Vercel treats ESLint warnings as errors — every declared variable
  must be used. Report unused vars; don't silently delete.

---

## Architectural facts to respect (see src/docs/ARCHITECTURE.md for detail)

- **`catalog_items.is_global`** is the ownership discriminator. `true` = seed item
  (system-owned; members can Hide but never Delete). `false` = custom item
  (household-owned; any member can add/Delete; can also Hide).
- **All foreign keys referencing `catalog_items` are `NO ACTION`** — Postgres blocks
  deletion of any referenced row. Deletes that touch referenced catalog rows must be
  multi-step SECURITY DEFINER RPCs (or soft-delete via `deleted_at`), never a plain
  `delete`.
- **The shared list is sacred** — no per-user view preference (Hide, filter) ever
  suppresses what's on the shared list. Hide lives in the browse layer only.
- **SHOP list renders from the RPC**, not from `catalogMap` (the `listRows` pattern).

---

## SESSION END — Scribe routine

When I type "SESSION END", do all of the following in one pass:

### Step 0 — Check for a design handoff file (do this FIRST)

Look for `handoff/design_handoff.md`.

- **If it exists**, it contains design/decision context from a separate Claude
  CHAT session that you (Claude Code) could not see. It uses delimited sections.
  Parse and route each, MERGING with your own session's notes — do not create
  duplicate entries:
  - `## SESSION_LOG` block → fold into THIS session's SESSION_LOG.md entry
    (combine design rationale + what was built into ONE entry).
  - `## ROADMAP_DECISIONS` block → append to the DECISIONS LOG in
    `src/docs/ROADMAP.md`, and apply any NOW/NEXT/LATER/DONE moves it specifies.
  - `## ARCHITECTURE` block → apply to `src/docs/ARCHITECTURE.md` (new tables,
    constraints, patterns, principles); bump its "Last updated" date.
  - After merging, **DELETE `handoff/design_handoff.md`** so it can't be
    double-applied. The content now lives in the committed docs.
- **If it does not exist**, proceed normally — log only what you witnessed.

### Step 1 — Update `src/docs/SESSION_LOG.md`
Prepend a NEW entry at the TOP of the `## LOG` section (most recent first), using
the SESSION LOG ENTRY FORMAT below. Single rolling file; do NOT create dated
per-session files. If a handoff was found in Step 0, this entry combines its
design notes with your implementation notes.

### Step 2 — Update `src/docs/ROADMAP.md`
Move completed items to DONE (stamp with today's date), add new immediate
priorities to NOW, queue anything new under NEXT / LATER, record any model-level
decisions in the DECISIONS LOG (including any from the handoff), and update the
"Last updated" date.

### Step 3 — Conditionally update `src/docs/ARCHITECTURE.md`
Update ONLY if this session (or the handoff) changed the architecture: a new or
changed table/column, a new RPC, a schema constraint finding, a new cross-cutting
pattern, or a new design principle. If nothing architectural changed, LEAVE IT
UNTOUCHED. When you do update it, bump its "Last updated" date. If unsure whether
a change is "architectural enough," ASK me rather than guessing.

### Step 4 — Do NOT modify `src/docs/SPEC_*.md`
Unless I am explicitly building from a spec this session and ask you to update it.
Specs are episodic, not per-session.

### Step 5 — Commit the changed docs
`git add src/docs/ handoff/` (stage doc changes and the handoff deletion)
`git commit -m "docs: session log + roadmap [+ architecture] — <YYYY-MM-DD> <short goal>"`
Do NOT push automatically — leave the commit local for my review. I'll push.

### Step 6 — Report
Tell me which Project Knowledge files to re-upload to the web chat: every doc you
changed this session, plus any source files (`App.js`, `useProvisions.js`, etc.)
that changed.

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

## Handoff format reference (what design chats produce)

A design chat session produces `handoff/design_handoff.md` with these delimited
sections (any may be omitted if nothing applies):
- `## SESSION_LOG` — session-log entry focused on decisions/design.
- `## ROADMAP_DECISIONS` — DECISIONS LOG rows + any roadmap moves.
- `## ARCHITECTURE` — structural changes (tables, constraints, patterns, principles).

Step 0 of SESSION END consumes this file and then deletes it.

---

## Notes for working in this repo

- Surgical edits beat large multi-file rewrites. Grep for the target
  function/variable, view the exact line range, then make the change.
- For Supabase function changes, verify the save with
  `select pg_get_functiondef(oid) from pg_proc where proname = '<name>'` — the
  SQL Editor has silently kept old versions before.
- After any deploy, hard-refresh (Ctrl+Shift+R) all clients before judging a
  multi-client fix — stale JS produces false negatives.
- When catalog rows are soft-deleted (`deleted_at`), every catalog read path must
  filter `deleted_at IS NULL` (list RPC, browse load, catalogMap build).
