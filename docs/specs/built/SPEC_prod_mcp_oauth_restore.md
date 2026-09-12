# SPEC: Restore scoped Supabase MCP URLs (resolve P1 OAuth workaround)

## Status
**BUILT AND VERIFIED 2026-09-03** (`42d85fd`). Scoped URLs restored, OAuth re-established from a
plain terminal, and all four verification items below confirmed green from the VS Code panel on
terminal-issued tokens. The `_comment` block in `.mcp.json` has been updated to the verified
state. Root cause confirmed via GitHub issue research (2026-09-03).

## Background
`.mcp.json` currently has both `supabase-dev` and `supabase-prod-readonly` pointed at the bare
`https://mcp.supabase.com/mcp` with no query string. This was a workaround for Claude Code
issue [#34880](https://github.com/anthropics/claude-code/issues/34880): the OAuth flow was
failing with `{"message":"resource: Resource must be a valid MCP endpoint"}` whenever the MCP
server URL carried query params (`?project_ref=...&read_only=true`).

Stripping the query string unblocked authentication, but had an unintended second effect:
`read_only=true` and `project_ref` were both removed. The two server entries became identical.
`supabase-prod-readonly` has been read-only in name only since 2026-08-31 — which database a
call reaches is decided entirely by the `project_id` argument passed per call, not by which
server it's addressed to. This has been tracked as a P1 in ROADMAP NOW.

## Root cause (confirmed)
Issue #34880 is **closed as "not planned"** — Anthropic is not fixing it under this issue.
Critically, the bug is scoped specifically to **the Claude Code panel inside the VS Code
extension**, not Claude Code generally. The reporter's own reproduction steps confirm the
**terminal CLI (`claude` command) works correctly with the full query-string URL** — only the
VS Code extension panel fails.

Root cause per the issue: the VS Code extension double-encodes the URL's `?` when constructing
the OAuth `resource` parameter (`?` → `%3F` → `%253F`), which the OAuth server correctly
rejects. The terminal CLI does not have this encoding bug.

**Implication:** the fix is not "wait for Anthropic to patch this" — it's "authenticate from an
actual terminal window instead of the VS Code Claude Code panel." The scoped URLs can be
restored safely as long as the OAuth handshake itself happens outside the VS Code panel.

## Change

Restore scoped URLs in `.mcp.json`:

```json
{
  "mcpServers": {
    "supabase-dev": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=zxwtxjjmssykhqrghouf"
    },
    "supabase-prod-readonly": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=parpauldmbetptkmdwbd&read_only=true"
    }
  }
}
```

Remove the workaround `_comment` block once this is verified working, and log the resolution
in ROADMAP.md (move P1 item to DONE).

## Execution steps

1. Edit `.mcp.json` to the scoped URLs above (both servers).
2. Fully quit VS Code (not just reload window — the OAuth cache and MCP client state need a
   clean restart).
3. Open a **plain terminal window** (PowerShell, Terminal.app, or equivalent) — explicitly
   *not* the VS Code integrated terminal or the Claude Code side panel, since the VS Code
   extension host is the thing with the encoding bug, and it's not yet confirmed whether the
   VS Code integrated terminal runs inside that same extension host.
4. Run `claude` to start Claude Code in that terminal.
5. Run `/mcp` and step through OAuth for both `supabase-dev` and `supabase-prod-readonly`.
   Confirm the browser redirect and auth completion succeed for both — this is the actual test
   of the fix, not an assumption.
6. Re-open VS Code and check whether the MCP servers show as authenticated in the Claude Code
   panel there too (OAuth tokens are typically cached under `~/.claude/` and shared across
   surfaces, but this needs to be observed, not assumed).
7. **If step 6 shows the VS Code panel still failing** even with valid terminal-issued tokens,
   that's a distinct, smaller problem (token-sharing between surfaces) — fall back to doing all
   Supabase MCP work from the terminal for now, keeping the scoped URLs, rather than
   re-stripping the query string. Do not silently revert to the bare-URL workaround without
   flagging it back to design chat first, since that quietly re-breaks the prod read-only
   guarantee.

## Verification (required before calling this resolved)

- [x] Both servers authenticate successfully via terminal `/mcp`.
- [x] A read query against `supabase-prod-readonly` succeeds.
      `select count(*) from catalog_items` → `364`, with **no `project_id` argument passed** —
      the ref now comes from the URL.
- [x] A deliberate write-shaped query against `supabase-prod-readonly` is rejected (confirms
      `read_only=true` is actually being enforced by the OAuth grant, not just present in the
      URL for show). Use a low-risk write, e.g. attempting to `INSERT` into a scratch/test row,
      or `UPDATE ... WHERE false` if a truly no-op write is preferred.
      **Result:** `update catalog_items set id = id where false` →
      `ERROR:  25006: cannot execute UPDATE in a read-only transaction`.
      `25006` is a Postgres SQLSTATE (`read_only_sql_transaction`) and the wording is Postgres's
      own, not the MCP server's — the statement reached the database and was refused inside a
      transaction the server had already opened `READ ONLY`. Enforcement is downstream of the
      OAuth grant. `where false` is the strongest form of the test: an empty row set gives
      Postgres nothing to object to except the write-shaped statement itself, and it still refused.
- [x] `supabase-dev` still works for normal read/write dev work as before.
      Read → `117`; the same `where false` update succeeded (empty result, zero rows). The
      `364` vs `117` divergence from an identical query is also direct evidence `project_ref`
      is routing the two servers to different databases.

### Additional finding — the `deploy_edge_function` hole is closed too
The 2026-09-02 session flagged, "confirmed live, not theorised," that the "read-only" prod server
exposed `deploy_edge_function` and could push executable code to prod. With `read_only=true`
restored, **the prod server no longer advertises it.** Seven mutating tools present on
`supabase-dev` are absent from `supabase-prod-readonly`: `apply_migration`, `deploy_edge_function`,
`create_branch`, `delete_branch`, `merge_branch`, `rebase_branch`, `reset_branch`. The flag shrinks
the **tool surface**, not just transaction mode — the executable-code path to prod is shut at the
same time as the SQL write path.

### Step 6/7 outcome
Step 6 resolved in the affirmative and step 7's fallback was not needed: terminal-issued tokens
are shared with the VS Code panel, and every verification query above was run *from* that panel.
Only the OAuth **handshake** must happen outside the VS Code panel; ordinary use need not.

## Risk if skipped
Until this is done, `supabase-prod-readonly` is writable via MCP exactly like `supabase-dev` —
there is no technical guardrail against an accidental write to prod through this path, only the
discipline of which `project_id` argument gets passed. This spec exists specifically to close
that gap.
