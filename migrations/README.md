# Migrations

`000_canonical_baseline.sql` is the source of truth, validated against a clean dev rebuild on 2026-06-12. Files in `archive/` are historical, superseded by the baseline. Never run the baseline against production — prod is already in this state; it's for rebuilding empty environments only.

## ⚠️ The Supabase SQL editor does NOT surface `raise notice` output (found 2026-08-17)

Notices raised inside `do $$ … $$` blocks **never appeared in the editor's UI** in this
environment. A script whose only evidence is `raise notice` therefore runs **silently on
success** — indistinguishable, at a glance, from not having run at all.

**Do not read "no output" as failure, and do not read it as success either.**

The failure direction is safe: `raise exception` *does* surface, so a script that asserts its
preconditions and aborts will show you the abort. The success direction is the problem.

**Rule: every apply script must end with a row-returning `SELECT` that reports its own
after-state.** The editor renders the final statement's result set, so the proof arrives as
rows instead of notices. Keep the notices — they are useful in `psql` and in logs — but never
let them be the only evidence. Per the standing rule, no step is verified without output in
front of us.
