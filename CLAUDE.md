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
**Docs (`docs/`):** Canonicals `SESSION_LOG.md`, `ROADMAP.md`, `ARCHITECTURE.md`
(plus `DEV_SETUP.md`) stay at `docs/` root. Feature specs (`SPEC_*.md`) live in
`docs/specs/{active,built,retired}/` — NOT `docs/` root (lifecycle folders since
2026-07-11, commit `0303397`).

---

## Git discipline

- Commit before switching branches — uncommitted changes have been lost before.
- Workflow: commit -> push dev -> test -> merge to main -> push main.
- `CI=true` on Vercel treats ESLint warnings as errors — every declared variable
  must be used. Report unused vars; don't silently delete.

---

## Architectural facts to respect (see docs/ARCHITECTURE.md for detail)

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

## BUILD — implement a spec from the airlock (mid-session)

When I type "BUILD" (optionally naming a spec, e.g. "BUILD swipe parity"):

### Step 1 — Locate the spec
List `handoff/`. Find the `SPEC_*.md` payload to build:
- If I named one, use it.
- If exactly one `SPEC_*.md` payload is present, use it.
- If several are present and I did not name one, list them and ASK which —
  do not guess.
- If none are present, say so and stop.

### Step 2 — Read it fully before touching code
Read the entire spec. Note its stated scope, its out-of-scope carve-outs, and
any warnings (especially grep-before-edit notes — line numbers in specs drift).

### Step 3 — Grep before edit
Specs reference line numbers from a possibly-stale tree. ALWAYS grep for the
exact current strings before authoring any `str_replace`. Never trust a spec's
line numbers.

### Step 4 — Implement as ONE scoped commit
Make only the change the spec describes. Separate logical changes = separate
commits — if the spec carves out follow-on work, do NOT bundle it. Respect the
"one tested change before the next" rule.

### Step 5 — Test on the deployed dev preview
Commit + push dev, then verify on dev.ourprovisions.velayo.ai — NOT localhost.
Local edits don't reach the deployed domain. Report what you verified.

### Step 6 — Stop at dev unless told otherwise
Do NOT merge dev->main as part of BUILD. The dev->main gate is a separate,
explicit step I trigger once I've verified the deployed preview.

### What BUILD does NOT do
- Does NOT route the spec to `docs/specs/` — it stays in `handoff/` for SESSION END.
- Does NOT write SESSION_LOG / ROADMAP / ARCHITECTURE — that's SESSION END.
- Does NOT clear the airlock.
BUILD is implement-and-stop. Bookkeeping is SESSION END's job.

---

## SESSION END — Scribe routine

When I type "SESSION END", do all of the following in one pass:

### Step 0 — Check for a design handoff file (do this FIRST)

Look for `handoff/design_handoff.md`. State out loud whether it exists before
doing anything else.

**HARD GATE:** If `handoff/design_handoff.md` exists, you MUST produce a new
SESSION_LOG entry from it. "Nothing new to log" is FORBIDDEN whenever a handoff
file is present — its presence is itself unmerged work. Reaching Step 6 without
having (a) created/merged an entry AND (b) deleted the handoff file is a failure;
stop and report it rather than committing.

- **If it exists**, it contains design/decision context from a separate Claude
  CHAT session that you (Claude Code) could not see. It uses delimited sections.
  Parse and route each, MERGING with your own session's notes — do not create
  duplicate entries:
  - `## SESSION_LOG` block → fold into THIS session's SESSION_LOG.md entry
    (combine design rationale + what was built into ONE entry).
  - `## ROADMAP_DECISIONS` block → append to the DECISIONS LOG in
    `docs/ROADMAP.md`, and apply any NOW/NEXT/LATER/DONE moves it specifies.
  - `## ARCHITECTURE` block → apply to `docs/ARCHITECTURE.md` (new tables,
    constraints, patterns, principles); bump its "Last updated" date.
  - After merging, **DELETE `handoff/design_handoff.md`** so it can't be
    double-applied. The content now lives in the committed docs.
- **If it does not exist**, proceed normally — log only what you witnessed.

### Step 0.5 — Route any payload files dropped in `handoff/`

The `handoff/` folder is an AIRLOCK, not a home. It has exactly TWO permanent
baseline files — `.gitignore` and `DESIGN_CHAT_handoff_prompt.md` — which you
NEVER move, modify, or delete. `design_handoff.md` is the reserved merge-and-delete
file handled in Step 0. EVERYTHING ELSE in `handoff/` is **payload**: files the
design chat produced for this build (specs, etc.) that must be filed to their
home and cleared out.

- List the contents of `handoff/`. For every file that is NOT one of the two
  baseline files and NOT `design_handoff.md`, treat it as payload.
- The handoff's `## DROPPED_FILES` manifest (if present) tells you each payload
  file's destination and what it is. Follow it: e.g. move `SPEC_*.md` to
  `docs/specs/active/`.
- If a payload file is present but the manifest does not list it, do NOT guess
  and do NOT delete it — surface it to me and ask where it goes.
- Default destination for a new `SPEC_*.md` with no explicit manifest destination
  is `docs/specs/active/` — a fresh spec hasn't shipped yet, so it is always
  `active/` (it graduates to `built/` on ship; see Step 4).
  Moving = `git mv handoff/<file> docs/specs/active/<file>` so history is preserved.
- Before `git mv`, ensure the destination folder exists — if the manifest names a
  destination path that isn't present yet, `mkdir -p` it first, then move. A
  `git mv` into a missing directory fails; don't let a new bucket (or a typo'd
  path) silently break routing.
- After routing, `handoff/` must contain ONLY the two baseline files. That clean
  state is the signal that nothing is pending.

### Step 1 — Update `docs/SESSION_LOG.md`
Prepend a NEW entry at the TOP of the `## LOG` section (most recent first), using
the SESSION LOG ENTRY FORMAT below. Single rolling file; do NOT create dated
per-session files. If a handoff was found in Step 0, this entry combines its
design notes with your implementation notes.

Tag each entry with its [SCOPE]: OurProvisions (app work in this repo) /
Velayo OS (the Harbour / company operating system) / Platform (shared product
infra) / Cross (more than one). This single log is the company journal for now;
the tag makes a future per-repo split a filter, not a migration. When a session
spans app and OS work, use Cross and note both in Completed.

### Step 2 — Update `docs/ROADMAP.md`
Move completed items to DONE (stamp with today's date), add new immediate
priorities to NOW, queue anything new under NEXT / LATER, record any model-level
decisions in the DECISIONS LOG (including any from the handoff), and update the
"Last updated" date.

### Step 3 — Conditionally update `docs/ARCHITECTURE.md`
Update ONLY if this session (or the handoff) changed the architecture: a new or
changed table/column, a new RPC, a schema constraint finding, a new cross-cutting
pattern, or a new design principle. If nothing architectural changed, LEAVE IT
UNTOUCHED. When you do update it, bump its "Last updated" date. If unsure whether
a change is "architectural enough," ASK me rather than guessing.

### Step 4 — Do NOT modify spec CONTENT; DO move specs on lifecycle change
Do not edit the content of a `docs/specs/**/SPEC_*.md` unless I am explicitly
building from a spec this session and ask you to update it. Specs are episodic,
not per-session.

But their FOLDER tracks lifecycle, so relocate on state change — in the SAME
commit as the state change:
- When this session marks a feature **DONE** in ROADMAP, `git mv` its spec
  `docs/specs/active/ → docs/specs/built/`.
- When a spec is **superseded** (design changed), `git mv` it to
  `docs/specs/retired/`.
Moving a spec is a lifecycle bookkeeping move, not a content edit — it does not
violate the "do not modify" rule above.

### Step 5 — Verify, then commit the changed docs

Before committing, verify the handoff was consumed:
- If a handoff existed in Step 0, confirm `handoff/design_handoff.md` no longer
  exists and its entry is now at the top of `docs/SESSION_LOG.md`. If the file is
  still present, you did NOT complete the merge — go back to Step 0; do not commit.
- Confirm the AIRLOCK is clear: `handoff/` now contains ONLY the two baseline
  files (`.gitignore`, `DESIGN_CHAT_handoff_prompt.md`). If any payload file
  remains, Step 0.5 is incomplete — finish routing it (or ask me) before committing.
- Confirm no spec drift: if this session moved any feature to DONE in ROADMAP,
  verify its spec was `git mv`'d from `docs/specs/active/` to `docs/specs/built/`
  (per Step 4). A shipped feature with its spec still in `active/` means the
  lifecycle move was missed — fix before committing.

Then:
`git add docs/ handoff/` (stage doc changes, the handoff deletion, and any
payload files moved into `docs/specs/` — `docs/` covers its subfolders)
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
- Scope discipline: do NOT file Velayo OS / Platform work as OurProvisions
  history. If a session is purely OS/Platform (e.g. building the Harbour), tag
  it [Velayo OS] and flag to me that it likely belongs in the velayo-os log,
  not this app's, once that repo's docs exist.
- ONE-TIME REPAIR: if `docs/SESSION_LOG.md` still has the old header
  ("Maintained by Session Scribe") or an old FORMAT block lacking `[SCOPE]` and
  `**DB changes:**`, update the header to "One entry per session. Most recent at
  top." and replace the FORMAT block with the SESSION LOG ENTRY FORMAT below.
  Do this without touching existing log entries. Remove this rule once done.

### SESSION LOG ENTRY FORMAT
```
### [YYYY-MM-DD] — [SCOPE] — [GOAL]
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
- `## DROPPED_FILES` — manifest of payload files (specs, etc.) dropped into
  `handoff/` alongside the handoff, with each file's destination.

Step 0 consumes `design_handoff.md` (merge + delete). Step 0.5 routes the payload
files named in `## DROPPED_FILES` to their homes. `handoff/` is an AIRLOCK: its
only permanent residents are `.gitignore` and `DESIGN_CHAT_handoff_prompt.md`;
everything else passes through and is cleared each SESSION END.

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
