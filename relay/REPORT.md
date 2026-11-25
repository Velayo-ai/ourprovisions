Reported: 2026-11-24 21:23 ET · dev eb467a1 (local, push awaiting Dan's OK; origin/dev 1defd18) · main 54d453c · re: Ask off grid slice 1 — 089 on dev · prompt 69ea55d

# 089 is on dev and read back. All 30 fixture checks pass. Prod untouched.

**New body md5 for the record (CR stripped = the file):** `land_ask_picks(uuid,uuid,uuid[],uuid,timestamptz)` **`9d80b8abd9d784a9690b271d1b32c527`** · `asks_stamp_deleted_by()` **`32ff20db0b8d72379820786717238828`**. The rollback restores 087's `1376af1f…` / `50b66842…`.

## What's in it
- `migrations/089_ask_landings.sql` + `migrations/089_rollback.sql`, committed `eb467a1` together with the spec move to `docs/specs/active/SPEC_ask_offline.md` (copied from `69ea55d`; airlock clear).
- **`ask_landings`** (run_id pk, household_id → households ON DELETE CASCADE, landed 0–48, created_at). RLS on with no policies. Revoked from public / anon / authenticated / service_role; service_role then gets SELECT, INSERT, UPDATE, DELETE (077's pattern, no TRUNCATE). Indexed on (household_id, created_at) for the prune and the cascade.
- **`land_ask_picks`:** the 3-arg version is dropped and the 5-arg one built from 087's body. ACL `authenticated=EXECUTE`, secdef, `search_path ""`.
  - **The household lock moves up**, right after membership; 087 took it after the input checks. The run-id check then runs under the lock, *before the ask is read*. A same-household repeat returns the first count and does nothing else, even if the ask was deleted since. Another household's run id → `22023`. After landing: insert the run, then prune this household's runs older than 30 days.
  - **A:** a deleted ask lands only on a qualifying replay: run id + tap, tap within 7 days, at most 1 min ahead, and `deleted_at > tap − 5 min`. Every other call to a deleted ask is `P0002`.
  - **B:** with a tap time, inserted, revived and new-need rows get `status_changed_at = least(p_tapped_at, now())`. A pending +1 leaves it alone.
- **C:** `asks_stamp_deleted_by` also sets `new.deleted_at := now()` on the live → deleted edge. The trigger itself (087) is unchanged.

## How 088's trigger keeps B's stamp, branch by branch (088:90, 105, 116–117)
- **Insert:** there's no INSERT trigger ("Inserts take the default"), so the explicit column value replaces the default `now()`.
- **Revive:** the UPDATE fires on the revive edge. The trigger rewrites only when `NEW.status_changed_at IS NOT DISTINCT FROM OLD`. The update sets the tap time, which differs from the old stamp, so it's kept. The stamp is in the *first* update, the one that revives. The second update (labels only) fires nothing.
- **New need** (bought → pending): the status change fires the trigger, and the same distinct-from-OLD rule keeps it.
- **The one gap:** an old stamp exactly equal to the tap time, to the microsecond. The trigger then writes `now()`, which is 087's behaviour. That isn't reachable in practice.
- Fixture (21)/(22) read the kept value back, and (24) shows what it's for: Paige's check, tapped after the pick and sent after the replay, lands (1 row, bought).

## Two departures from the prompt, for a ruling
1. **B is `least(p_tapped_at, now())`, not the bare tap time.** A phone whose clock runs ahead would otherwise stamp a future time. Every check on that row from any phone (`status_changed_at < tap`) would then fail until the clock caught up. Fixture (26) covers it: a tap 30 s ahead stamps `now()`. Easy to drop if you'd rather have the bare value.
2. **The lock moved above the input checks** so the run-id short-circuit can sit under it, as the spec asks, and before the ask read, so a run that landed before its ask was deleted still answers (fixture 9). An invalid call now holds the household lock for the length of its own failed transaction. That's microseconds, and nothing else changes.

## Gates and read-back (dev only, ref `zxwtxjjmssykhqrghouf`, system id `7642734024280108049` probed before every run)
- **Parse check** (`commit;` → `rollback;`, CLI `db query --linked -f`): ran to the end. Closing row: `rolled back` · land_3arg 1 · land_5arg 0 · landings_table 0 · land_md5 `1376af1f…` · fixture_rows 0.
- **Canary** (wants 31): failed `089 fixture: 30 checks passed, want 31`, so every probe ran.
- **Apply** 2026-11-25 02:21 UTC (21:21 ET), through the CLI. Closing row:
  - `committed` · land_3arg 0 · land_5arg 1 · land_defaults 2 · land_acl `authenticated=EXECUTE` · land_secdef_sp true
  - land_md5 `9d80b8ab…` · trigger_md5 `32ff20db…` · trigger_fn_acl `''` · trigger_on true
  - landings_table 1 · landings_rls true · landings_policies 0 · landings_client_grants `''` · landings_service_grants `DELETE,INSERT,SELECT,UPDATE`
  - edit_ask `39466771…` and update_ask `bda189ca…` unchanged · fixture_rows 0
- **The file matches the database:** I computed the md5 of each function body in the file locally. Both equal the stored bodies.
- **Ledger:** `20261125022124 089_ask_landings`, read back as the newest row (above 088 `20261123061608`).
- **Standalone proof:** the fixture block re-run against the *committed* state in a fresh session (begin … rollback). 30/30 passed. Read back after: fixture users + households + ask_landings rows = **0**.
- **089_rollback.sql** parse-checked against the applied state: its VERIFY passed (land_ask_picks back to `1376af1f…`, asks_stamp_deleted_by back to `50b66842…`, 5-arg and table gone), then rolled back. Dev still holds 089.

## The prompt's proofs (fixture numbers; all PASS)
1. **3-arg named call, the prod client's shape, as `authenticated`:** lands, labelled, no ask_landings row (1). Positional 3-arg also lands (2).
2. **Same run_id twice:** returns 2 both times. The second call, sent with a different array, lands nothing: i1 is 2 (not 3), i3 is 1, no i4. Exactly one ask_landings row, landed 2 (3–5).
3. **Another household's run_id:** `22023`, and nothing landed (6).
4. **Deleted ask:**
   - A qualifying replay lands with the label "Easton" (10).
   - Non-replays are `P0002`: no run id and no tap, a run id without a tap, a tap without a run id (11–13).
   - A tap 30 min after a delete 1 h ago is `P0002` (14). A tap 4 min after it, inside the grace, lands as "Nina" (15).
   - An 8-day-old tap and a tap 2 min ahead are both `P0002` (16, 17). Another household's ask is `P0002` (18).
   - A run that landed before its ask was deleted returns its count (9).
5. **B:** one replay over insert / revive / new need / pending +1 plus a gone item (skipped): 4 landed (19). Insert, revive and new need each carry the tap time (20–22). The pending +1 keeps its 2001 stamp (23). The check tapped after the pick lands (24). With no tap, `now()`, as 087 (25). A future tap gives `now()` (26).
6. **C:** B deletes Easton the client's way with `deleted_at = now() − 1 h`. It reads back `now()`, with deleted_by = B (7). A later write to a deleted ask's `deleted_at` isn't restamped (8).
- **Also:** the prune removes this household's 31-day-old run and keeps another household's (27). `authenticated` can neither read nor write ask_landings (28, 29). `anon` can't execute land_ask_picks (30).

## Not done here (by design)
- **Push:** `eb467a1` is local. `origin/dev..dev` = that one commit. It waits for Dan's OK.
- **Not proven by SQL:** PostgREST resolving the prod bundle's 3-arg call. Verification 9 (harness) covers it in slice 4. In SQL, the named 3-arg call resolves through the defaults (fixture 1).
- No client change. **Prod untouched:** 089 reaches prod only in the promotion, after 088 and before the client (O6).
- Slice 2 (the client) waits for its own prompt.
