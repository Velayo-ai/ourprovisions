Reported: 2026-11-21 22:17 ET · dev 95f7013 (origin; local fb97941, 2 commits unpushed) · main dac0fc3 · re: B9 rulings approved; write 087, apply on dev only through the CLI with VERIFY + read-back + ledger, build the Part B client, report through the relay before the client push

## Ask shelf sync Part B: 087 is on dev, the client is built, nothing pushed

**Spec:** `handoff/SPEC_ask_shelf_sync.md` replaced from `origin/handoff` `22e7daf` (has B9).

### 087 on dev (not on prod)
- **Files:** `087_ask_shelf_deltas.sql` + `087_rollback.sql`, commit `330ec4d`, local.
- **Objects:**
  - `asks.deleted_by`, plus `trg_asks_stamp_deleted_by`, which stamps it from the JWT only when a live ask is deleted. No client grant on the column.
  - `land_ask_picks`, B7: 1–48 picks with no nulls or duplicates; a pick lands if its item is live and a seed or the place's own, on the shelf or not. FOR SHARE on each pick's catalog row (B9.2). A pick that can't land is skipped and the rest land. Same signature, still returns the count.
  - `edit_ask`, B1/B2/B9.1: the delta save under the ask lock with the ask row locked. Inputs raise `22023`, K2 `23505`, no live ask `P0002`. A resulting-shelf failure, or an add deleted mid-edit, raises **`P0409`** and the call rolls back whole.
- **Run, through the CLI only:**
  - Parse check (`commit;` swapped for `rollback;`) ran to the end, closing row 'rolled back'.
  - A canary copy wanting 36 checks failed with "35 checks passed, want 36", which proves every fixture probe ran.
  - Applied 2026-11-22 03:05:59 UTC on dev (`…108049`).
  - The rollback's own parse check against the applied state passed (it restores `0defbd6e…`) and rolled back.
- **Read back by object:**
  - `edit_ask`: `authenticated=EXECUTE`.
  - `land_ask_picks`: `authenticated=EXECUTE`.
  - Trigger function: no grantees.
  - All three: SECURITY DEFINER, `search_path=""`.
  - The trigger fires only on the live → deleted edge.
  - FK `deleted_by` → `users(id)`.
  - Client column UPDATE grants are still only `deleted_at`, `updated_at`.
  - `update_ask` untouched (`bda189ca…`).
  - Bodies match the file (CR stripped): `edit_ask` `39466771…`, `land_ask_picks` `1376af1f…`, `asks_stamp_deleted_by` `50b66842…`.
  - Fixture rows 0.
- **Ledger:** `20261122030559 087_ask_shelf_deltas`.
- **Fixture coverage (35 checks):**
  - V3 repro; V8 idempotence; adds in tapped order; untouched scalars kept; V6 scalars; K2.
  - Seven `22023` input refusals.
  - `P0409` for a soft-deleted add, a missing add, V5, Explorer over 4, and an empty shelf; dead tiles dropped on save.
  - `42501` and `P0002`.
  - V9a off-shelf pick lands; V9b hard-deleted, soft-deleted and foreign picks skipped, the rest land; all skipped returns 0; a seed lands; 0, 49, duplicate and null picks raise `22023`.
  - As authenticated: both calls work; V10 `deleted_by` stamped with the deleter; no restamp on a second delete; a client can't write `deleted_by`; anon can't call `edit_ask`.

### Client on dev (built, not pushed): commit `fb97941`, local
- **B3:** in edit mode the sheet tracks pending adds (tapped order), pending removes and touched scalars. Save sends `edit_ask` that delta only; untouched scalars are left out.
- **B4:** on refetch the shelf shown = the server's latest shelf − pending removes + pending adds. Untouched scalars follow the server, touched ones keep the draft. A pending add whose item left the catalog drops out.
- **B5:** on `P0409` the sheet shows "Someone else just changed this shelf. Check it and save again." The hook re-reads asks and catalog, and the editor's changes are kept.
- **B7:**
  - `landAskPicks` returns `{ landed, skippedIds }`. When fewer landed, one read of the picked catalog rows (the server's live rule) names the skipped ones.
  - Great picks shows only the landed tiles, plus "{Item} isn't available any more. The rest are on the list."
  - "{Label} added {N}" counts the landed ones.
- **B9.3 (nothing landed):** no celebration; "{Items} aren't available any more."; the dead picks leave the wagon and their tiles leave the run (the target follows); the run stays open. The line clears on the next tap.
- **B8:** the removed line names the remover ("{First} removed this ask.") via `asks.deleted_by` → member's first name. Falls back to "This ask was removed."
- **Tests:** 1192 pass (13 new: helpers, sheet delta/merge/P0409, run partial/zero-landed). `CI=true` build clean.

### Notes
- **Grammar:** with one skipped item the lines read "isn't"; with several, "aren't" (e.g. "Bananas isn't available any more.").
- **Fallback:** if the naming read fails, the line says "Some picks aren't available any more."
- **Old clients:** the current dev and prod clients still call `update_ask`, which is untouched. The relaxed `land_ask_picks` only accepts more than before, so V7 holds.
- **Line endings:** a Python edit had turned three source files CRLF and broke four source-pinning tests. Converted back to LF and checked with `git ls-files --eol`. The committed files are LF.

### Next (waiting on Dan)
- **Push dev:** `origin/dev..dev` = `330ec4d` (087 files) + `fb97941` (client). Then read the dev marker back.
- **Walk V3–V10 on two devices** (Dan walks V1–V5, V9, V10).
- **Then prod:** 087 on prod through the CLI, read back by object, BEFORE the client; then promote the client with a prod walk.
