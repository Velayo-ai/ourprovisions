# qa/ — OurProvisions Test Artifacts

Agent-runnable DB test harness, manual prod verification plan, and fixture-gathering SQL.

## Files

| File | What it is |
|---|---|
| `agent_test_harness.md` | Three-part test suite: Part A (read-only prod gate, run before every `dev→main`), Part B (destructive behavioral suite, DEV only, self-rolling-back), Part C (static repo checks, no DB needed). |
| `prod_test_plan.md` | Manual verification checklist for post-merge prod smoke-testing. Sections 0–6; Section 3 (Layer 2 removal notice) is the highest-value lane. |
| `fixture_gathering.dev.sql` | SQL to run on DEV to collect the real IDs that replace `<PLACEHOLDERS>` in Part B of the test harness. |

## What lives outside the repo

`test_fixture.dev.json` — the actual clerk_ids, user UUIDs, and household IDs collected by running `fixture_gathering.dev.sql`. Kept outside the repo for secrets hygiene (same location as Supabase credentials / Bitwarden). It is gitignored; never commit real IDs.

## Run order

1. **Part C** (static checks) — no DB, no fixture, run today against the repo.
2. **Part A** (read-only prod gate) — paste queries into the prod SQL editor before any `dev→main` merge.
3. **Part B** (destructive suite) — run on DEV after any migration; requires the fixture JSON.
4. **`prod_test_plan.md`** — human-driven; run after each deploy, prioritizing Section 3.
