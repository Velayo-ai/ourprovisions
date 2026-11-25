Reported: 2026-11-24 23:40 ET · dev 9c2eb3a · main 5098508 · re: promotion 088 → 089 → client · prompt d7180b4

# Live on prod: offline check-off + offline calm, Ask rev 3 and Ask off grid. 088 → 089 → main, each read back. Dan's prod walk is next.

**Prod now:** main **`5098508`**, a single-parent commit on `54d453c` whose **tree = dev `2b07573`** (`a247a845…`, proven equal before the push). Deployment **`dpl_3niRSygTFv6vT9RTQPhPz8Mrjpzc`**, bundle **`main.92d845f6.js`**, aliased to `ourprovisions.velayo.ai`.
**Rollback:** Instant Rollback to **`dpl_D5cbUAGqNdVdmFi81kEe8vMpq4tb`** (`54d453c`), never a redeploy. For the database, `089_rollback.sql` then `088_rollback.sql`, after the client is reverted.

## 1. Pre-checks (read only)
- **Dev head** was `6bcc05e`: the app Dan walked (`d65d795`) plus the harness commit. Jest 84 / **1313** green; `CI=true` build green.
- **Prod** was main `54d453c` on `dpl_D5cbUAGqNdVdmFi81kEe8vMpq4tb` (READY, rollback candidate), confirmed in Vercel.
- **Prod database**, by ref `parpauldmbetptkmdwbd`, system id `7606130613603586966`:
  - `land_ask_picks(uuid,uuid,uuid[])` = `1376af1f…` and `asks_stamp_deleted_by` = `50b66842…` (what 089's rollback assumes).
  - `edit_ask` = `39466771…`, `update_ask` = `bda189ca…`.
  - No 088 or 089 objects.
- **Unexpected, as recorded before:** prod has **no ledger** (`supabase_migrations.schema_migrations` doesn't exist), so the prompt's "ledger tops at 087" doesn't apply. Applied on prod = the object read-back, as with 072–087.

## 2. 088 on prod (Dan's OK) — 2026-11-25 04:27 UTC
- **How:** the committed file minus its fixture block, with a prod-only preflight (087's practice), through the CLI linked by ref and relinked to dev after.
- **Read-back:**
  - Committed; the column is there (not null, default `now()`), on all 709 rows.
  - The trigger is on, and BEFORE UPDATE runs `picked_by_guard → resurrect → status_changed_at`.
  - The function is invoker with `search_path ""` and ACL `''`; body **`ac36b001fc182d8ba1b06c82522135fb` = dev**.
  - `authenticated` may write the column; anon may not.
  - **Backfill:** 260 rows from a check event + 449 from the fallback = 709; 0 null, 0 stamped now.
  - Fixture rows 0.

## 3. 089 on prod (Dan's OK) — 04:34 UTC
- **How:** the same practice.
- **Read-back:**
  - Committed; **`land_3arg` 0, `land_5arg` 1**, 2 defaults, ACL `authenticated=EXECUTE`, secdef + `search_path ""`.
  - `land_ask_picks` **`9d80b8ab…`** and `asks_stamp_deleted_by` **`32ff20db…`**, both = dev.
  - `ask_landings`: RLS on, 0 policies, client grants `''`, service_role `DELETE,INSERT,SELECT,UPDATE`.
  - `edit_ask` and `update_ask` unchanged; fixture rows 0.
- **The live prod client (54d453c) against 089:** proven on prod in a **rolled-back transaction** with throwaway rows. The old client's **three named args**, run as `authenticated`, landed 1, labelled from the ask, and wrote no `ask_landings` row. Afterwards: 0 throwaway rows, `ask_landings` 0. No real household data was touched. (PostgREST's resolution of that shape was proven on dev: ask-offline-walk V9.)

## 4. dev → main (Dan's OK)
- **Dev `2b07573`, pushed first (docs only):**
  - The prod-apply header addenda for **087** (owed since 2026-11-22), **088** and **089**.
  - `SPEC_ask_offline` records slice 3 as built (a kept run is parked; no event on "Hold to finish", both accepted).
- **The promotion commit:** made as recent promotions were (tree identity, not a merge commit). `5098508` = `commit-tree dev^{tree} -p origin/main`; parent = `54d453c`; tree = origin/dev's tree; then pushed.
- **Vercel:** Production `dpl_3niRSygTFv6vT9RTQPhPz8Mrjpzc`, QUEUED → BUILDING → **READY** (~70 s).
- **Bundle read-back** (the domain and the deployment URL both serve `main.92d845f6.js`):
  - "Hold to give back" 1, "Off grid" 3, "Hold to finish" 3, `op_ask_queue:` 1, `p_run_id` 1, `p_tapped_at` 1, `op-ask:on` 1 (Ask on).
  - The build sha `509850869f…` (main) is embedded 1×; the old `54d453c` 0×.
  - **`op-build-tag` 0:** the build tag is dev-only by design, so prod has none. Its "dev sha" equivalent is the embedded main sha, whose tree is dev `2b07573`'s.

## 5. After it's live
- **"A new version is ready" on an old tab:** not observed here. No old prod tab was open, and the harness's test account is dev-only. Dan's installed app should show it the first time it comes to the foreground.
- **Harness prod check:** not run. The harness signs in only as the dev test account (never prod), and every useful prod check touches real household data. The bundle markers above are the read-only check; the rest is Dan's prod walk.
- **Docs, dev `9c2eb3a` (pushed, Dan's OK):**
  - ROADMAP: the three items move to **DONE (prod)** with ids and rollback; Last updated notes the promotion.
  - ARCHITECTURE: 088 / 089 **on prod**, and a new **Ask off grid** section (`ask_landings`, the 5-arg land, the client queue / flush / overlay, O4).
  - Specs **→ `built/`**: `SPEC_ask_offline`, `SPEC_ask_handback_hold`, `SPEC_offline_calm_2026-11-23`, `SPEC_offline_checkoff_amendment_2026-11-23`. **`SPEC_offline_checkoff.md` stays in `active/`**: its later slices (the service worker, quantity → add → remove → price) are open.
  - Next migration **090**.
  - **SESSION_LOG is not written:** that's SESSION END's job (Dan's).
- `main` = tree of dev `2b07573`; dev is one docs commit ahead (`9c2eb3a`), which rides the next promotion.

## Unexpected
- Prod has no ledger (expected from earlier sessions; the prompt assumed one).
- The recent promotions were tree-identity commits, not merges. I followed them, and the tree identity is proven.
- Nothing else. The database and client read-backs all matched dev.

**Dan's prod walk next:** offline check-off, OFF GRID + the beacon, an offline Wrap up, and an Ask run on and off grid (swipe, That's it! on the tub, hold to give back).
