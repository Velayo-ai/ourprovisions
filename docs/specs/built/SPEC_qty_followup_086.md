# SPEC — Quantity follow-up: a fresh need drops old pick labels (086), and the phone guesses what the server will do

**Scope:** OurProvisions · DB (migration 086, replaces one function body) + client (`useProvisions` / `qtyWrites`) · **Status:** design-final 2026-11-15, found in the V6 walk of `SPEC_qty_increment.md`
**Environment:** dev only. 086 is the next free number; confirm at build. Prod gets 085 and 086 together at the Ask launch.
**Owner of the build:** Claude Code (Cody), on `dev`. Ends at "report and stop".

---

## 1. What the walk found

**F1: "Picked by" survives a fresh need.** Carrots were picked by Easton, then checked off in Shop. Dan added Carrots from the Shop add sheet. 085's new-need branch (Q4) correctly made a fresh need at 1, but the row still read **"Picked by Easton"**. Easton's pick was the Carrots already bought, so the label now describes units in the cart, not the new need.

`land_ask_picks`' matching branch (R1) replaces the labels with the new picker's. 085 copied that branch "without the label", which left the old labels in place. **The spec's gap, not the build's.**

**F2: the number flashes 3 → 1 on a bought row.** Greek yogurt at 2, checked. In Browse, + showed **3** for a moment, then **1**. The phone's instant guess was "old + 1"; the server's rule (Q4) is "a fresh need at the amount added". The server was right; the guess was wrong. The row also stays in **In cart** until the response or poll moves it, for the same reason.

## 2. Rulings

| # | Ruling | Why |
|---|---|---|
| F1 | **On 085's new-need branch (live, not pending, `p_delta > 0`), set `picked_by_labels = null`.** Nothing else in the function changes. Revive already gets null from `trg_list_items_resurrect`. `bumped` / `lowered` keep their labels. | "Picked by" means someone picked what is **still needed** (A20: the label dies with what it labelled). A manual fresh need was picked by nobody. Matches `land_ask_picks` R1, which never keeps old labels on a new need. |
| F2 | **The phone's instant guess follows the server's rules.** For a row whose **server** status (`listRowsRef`) is not `pending`: `+delta` → show **delta**, and show the row **unchecked** at once. `−delta` → show `old − delta` (floored at 0), status unchanged. Every other row stays as built (`old ± delta`). The check change is stamped with `touchCheck`, so a poll requested before the write can't put the row back in the cart (`mergePolledById`). When the queue drains, the RPC's returned `quantity` **and `status`** are adopted, so if the guess was wrong the server's answer wins as before. | What you see should never disagree with what will happen, even for a second. The guess uses server state, not the optimistic map, so a row checked moments ago (still in its undo hold) is guessed the same way the server will decide it. |

## 3. Migration 086 — `086_new_need_clears_labels.sql` (+ `086_rollback.sql`)

- `create or replace function public.adjust_list_item_quantity(…)`, **085's body, byte for byte, plus one assignment** on the new-need branch's `update`: `picked_by_labels = null`. Same signature, `security definer`, `search_path ''`, ACL re-stated (`authenticated = EXECUTE` only).
- **Header:** what changed and why (F1), and the 085 body hash it replaces (`e1efdee7…`, LF).
- **In-file fixture** (savepoint, rolled back): (a) a labelled bought row + `+1` → `renewed`, quantity 1, pending, **labels null**; (b) a labelled pending row + `+1` → `bumped`, **labels kept**; (c) a labelled bought row − `1` from 2 → `lowered`, still bought, **labels kept**; (d) every 085 fixture probe still passes.
- **Closing SELECT:** as 085's, plus `md5(replace(prosrc, E'\r', ''))` (the CLAUDE.md watch-out).
- **Rollback:** `086_rollback.sql` restores **085's body exactly** (its `\r`-stripped md5 must read `e1efdee7…` after a rollback). Don't just drop the function.
- **Diff check before handing it over:** `085`'s body vs `086`'s body differs by **one line**. Paste the diff in the report.

## 4. Client

- In the `adjustQty` path (`useProvisions` / `src/lib/qtyWrites.js`), compute the instant guess from the row's **server** status per F2. Apply the unchecked guess through the same stamped path as a check write, so the poll merge protects it.
- On drain, adopt `quantity` and `status` from the RPC result. A `renewed` outcome sets checked = false; anything else sets checked from the returned `status`.
- **Jest:** a bought row at 2, `+1`: the first render after the tap shows **1** and unchecked, never 3. A poll requested before the write and answered after it doesn't put the row back in the cart. A bought row at 2, `−1`: shows 1, still checked. A pending row is unchanged from today's tests. A wrong guess is corrected on drain.

## 5. Verification (dev only)

| # | Check | Pass |
|---|---|---|
| V1 | 086 applied on dev by Dan; ledger row inserted and read back; `\r`-stripped md5 = the file's; ACL exact. | All match. |
| V2 | The 086 fixture (§3) passes and rolls back; the one-line diff against 085 is in the report. | Both. |
| V3 | `qty-race.js` reruns (all four cases + `--legacy`). | 0 losses in 80; legacy still loses ≥ 1. |
| V4 | Jest (§4) green; `CI=true` build compiles; `qty-burst.js` still 0 drops mid-burst. | All. |
| V5 | **Dan's walk on dev (one phone):** check off Carrots (labelled "Picked by Easton") and wait out the undo hold; in Browse tap **+**. The number shows **1 straight away** (no 3), the row leaves In cart at once, and Shop shows Carrots unchecked with **no "Picked by Easton"**. Then Greek yogurt at 2, check it off, Browse **−**: shows 1 and stays in In cart. | Dan confirms. |
| V6 | Prod untouched: `main` head unchanged; no 086 on prod. | Both. |

## 6. Promotion note
At the Ask launch, apply 085 then 086 on prod **through the CLI**, so prod stores the files' own bytes (LF). Then the client merge (tree identity proven), then the flag, then `meal-photo-sweep`.

## 7. Files
`migrations/086_new_need_clears_labels.sql` (new), `migrations/086_rollback.sql` (new), `src/hooks/useProvisions.js`, `src/lib/qtyWrites.js` (+test).
