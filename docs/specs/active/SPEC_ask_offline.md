# SPEC — Ask off grid: the wagon sends, the picks wait on this phone, and the adult can always get out

**Status:** Design-ruled 2026-11-24 (design chat, Dan). Step 0 done (relay `608fdd4`, no stop); rulings A, B, C, 2a and 2c agreed 21:11. Build on dev in slices. **Migration 089.**

**Build slices (Step 0's plan, agreed):**
1. 089 on dev.
2. The client, one commit each: (a) `askQueue` lib; (b) the D1 send + the tap-order flush; (c) the D3 overlay.
3. O4 / D6.
4. The harness pre-walk, then Dan's phone walk.

Promotion after: 088 → 089 → dev → main (O6).
**Scope:** OurProvisions. Amends `SPEC_ask_handback_hold.md` (H9), extends `SPEC_offline_checkoff.md` + `SPEC_offline_calm_2026-11-23.md` (the queue, C1, C3) to the first offline **add**.
**Found by:** Dan, 2026-11-24 ~20:30 ET, on dev `763686c`: Ask Easton → Your turn → airplane mode → pick 2 → swipe → *"That didn't reach the list. Swipe the wagon again."* Swiping again fails. Holding Done doesn't finish. You're stuck until the connection returns or the app is hard-reset.

---

## Why it sticks (read on dev `763686c`)

1. **Sending is online-only.** The swipe, the tub tap, Done held full and "Send the wagon" all call `send()` → `confirm()` → `onLand` → `landAskPicks` → `rpc("land_ask_picks")` at once. Off grid the call throws. `confirm()` sets `failed`, the wagon rolls back in, and the run stays on the shelf. Unlike check-off, Ask has no queue.
2. **Done can't get you out.** Since rev 3 (H9), **Done held with a full wagon = send**. "Hold to finish" (abandon) only appears when the wagon isn't full. So off grid the adult's one exit fails the same way, and the only way out is to empty the wagon first. **This trap is new in rev 3, which is on dev only.** Prod's Ask still abandons on Done, so promoting rev 3 without this fix would ship the trap to prod.
3. **A replay isn't safe today.** `land_ask_picks` (087) adds +1 to a live pending row. If a weak signal sends the land but loses the reply, a retry counts every pick twice. Airplane mode fails before anything leaves the phone; one bar can fail after. One bar counts as off grid (C-rules), so this case is real.

---

## Rulings (Dan, 2026-11-24)

**O1 — Off grid, the send behaves exactly as it does online.** The wagon rolls off, Great picks rolls it in, the hand-back hold, then the toast. Easton never knows. (C1 "offline behaves exactly as online", A13 "no second-class experience".)

**O2 — An Ask pick *is* the runner's add.** In Dan's words: Easton adding Apples is the same as Paige adding Apples. It's Paige adding them; Easton just gets the experience and a chance to choose. So off grid:
- The picks show on **Paige's** list at once, as waiting rows with the small dot (the same dot as an offline check), "Picked by Easton" included.
- The rest of the household sees them when Paige's phone is back on grid and the queue flushes.
- The hand-back toast is the online one, word for word: **"Easton added 2 · See"**, and See works (it goes to the list and highlights the waiting rows).
- Nothing extra is said anywhere: no "will send later", nothing on reconnect (C3).

This is **the first offline add**. It's built so a manual add can take the same path later, but this spec builds the Ask path only.

**O3 — Replays land once: migration 089, a run id.** The phone mints a `run_id` (uuid) when the wagon is sent. `land_ask_picks` records it and returns the first result for any repeat. This is the same pattern as `create_ask`'s caller-supplied id.

**O4 — The adult can always get out.** After a send fails for a reason that **isn't** the connection (a real server error), Done changes to **"Hold to finish"**. Holding it closes the run and **keeps the picks**: `op_ask_held` survives the exit, and the next hand-over of the same ask reopens on the shelf with the wagon full. Off grid, O1 means the send never fails, so this exit is for real errors only.

**O5 — A queued landing lands even if the ask changed while Paige was off grid** (Dan, 2026-11-24 20:42). The ask may have been deleted, or its shelf or target edited on another phone. Either way, Paige has already seen these picks on her list, and they're her adds (O2). So each pick whose item is still live lands with the usual `land_ask_picks` rules. The label is read from the ask row, deleted or not; asks are soft-deleted, so the row is still there. Picks whose item is gone are skipped, as 087 does. Only the count and shelf checks are relaxed, and only for a qualifying replay (see 089).

**O6 — This ships before the promotion** (Dan, 2026-11-24). Rev 3 doesn't reach prod without this fix. The promotion runs **088 → 089 → dev → main** once this is built and walked on dev.

---

## Design

### D1 — When a send goes to the queue
- **Known off grid** (ConnectivityContext says offline, i.e. the same signal behind OFF GRID; one bar counts): don't attempt the call. Queue it and go straight to Great picks.
- **Thought online, but the call fails with a transient error** (`classifyFetchError` → `transient`, `isOfflineSkip`, a missing token for network reasons): queue it, keeping the same `run_id`. No red line. The roll-off continues into Great picks.
- **A real error** (any other class): today's behaviour. The wagon rolls back and shows the red line, and Done becomes "Hold to finish" (O4).
- Every path sends the same `run_id` on the first try and on every replay.
- **Where this lives (Step 0 #1):** in `landAskPicks`, not AskRun. "Known off grid" = `navigator.onLine === false || offlineRef.current`, the Wrap up's expression (useProvisions.js:2514). A queued send resolves `{ landed: ids.length, skippedIds: [], queued: true }`, so `onLand` and `confirm()` see an ordinary success.
- **A missing token while OFF GRID is transient (ruling 2a)**, for the Ask send only. On iOS, `navigator.onLine` can read true on one bar while Clerk returns null (class `clerk` → real). When `offlineRef.current` is true, the Ask send treats that as transient and queues.
- **An 8 s timeout on the land (ruling 2c).** An `AbortSignal` timeout on the `land_ask_picks` request. A hang on one bar becomes an `AbortError` (transient) → queued with the same `run_id`. The request may have committed anyway; O3 makes the retry safe.

### D2 — The queued landing (on this device)
- **Storage:** `op_ask_queue:<clerkId>:<householdId>`, an ordered list of `{ runId, askId, ids, tapAt, label, style }`. `label` is only for the local overlay, never sent; the server still reads the label from `asks` (A22). Keying, foreign-key discard, sign-out and household-switch clearing all follow `checkQueue.js` exactly. Storage calls are wrapped (memory-only fallback).
- **The run itself** reaches Great picks with `landed = ids.length` and no skips. Great picks shows what Easton picked. 087's skip line can't be known off grid, and it isn't needed.
- **Telemetry:** `ask_land_queued` (count + style only, no label). `ask_completed` fires once, **when the replay lands** (count from the server), never twice.

### D3 — The overlay: Paige's list shows the picks now
For each queued landing, the list Paige sees is the server rows (or the cached list) with the picks applied the way `land_ask_picks` would apply them:
- live **pending** row for that catalog item → quantity +1, the label appended once (cap 8), dot;
- live **not pending** (bought / skipped / deferred) → shown as a new pending need at 1, the label reset to this one, dot;
- **no row / a tombstone** → a new pending row at 1, `added_by` = Paige, the open cycle, dot.

The overlay is display only. The server is the truth. Each overlay entry goes when its landing has replayed **and** the list read after it has come in, so a row never blinks out and back. These rows stay out of the list cache's signature (the cache keeps server truth plus the queue, and the overlay is rebuilt from both on reload).

### D4 — The flush: one queue, in tap order
The Ask queue replays on the **same flush** as checks and the queued Wrap up (`flushQueuedChecks`, same triggers: online, visible, the 2 s tick). Ask landings replay **in tap order** with the checks and the Wrap up:
checks tapped before the landing → the landing → checks after it → the Wrap up, if it came later.

Why the order matters:
- If Paige checked Apples off and Easton then picked Apples, it must land as a new need, just as it would online.
- If Easton picked Bananas (a new row) and Paige later checked them off, that check has **no server row id yet**. It's held against the landing by catalog item and resolved to the new row's id after the landing's list read, then sent with its original `tapAt`.
- A Wrap up after the landing carries the unchecked picks forward. They're pending on the server by then and not in `dropIds`, so C6's keep rule already holds them.

### D5 — A replay the server refuses
- Transient failure → stays queued (same rule as checks).
- The ask was deleted meanwhile, or its shelf or target changed: **the picks land anyway (O5)**. The server handles this case (089), so the client never sees `P0002` / `22023` for a replay that qualifies.
- `42501` (no longer a member), or any other real error: drop the entry, remove its overlay, emit `ask_land_dropped` with the code only, and say nothing (C3).

### D6 — The Done button (amends H9)
| Wagon | Last send | Done says | Holding it |
|---|---|---|---|
| not full | — | Hold to finish | abandon (today) |
| full | none / queued | Hold to send | send (H9, today) |
| full | **failed (real error)** | **Hold to finish** | close the run, **keep `op_ask_held`**; the next hand-over of this ask resumes on the shelf, wagon full |

**The D4 synthetic key (Step 0 #3):** a check on an overlay-only row is queued under `ask:<runId>:<cid>` and re-keyed to the real row id by `cid` after its landing's list read. **A synthetic key never reaches the network**: online or off, a check on it always goes to the queue. The flush generalizes `splitAroundWrap` into a split at every boundary (the queued landings and the Wrap up), sorted by `tapAt`. The `op_ask_queue:` prefix joins `ownKeys` / `discardForeign` / `clearCheckStorage`.

**The D3 seam (Step 0 #4):** one `useMemo` at `useProvisions`' return derives the shown `listRows` / `quantities` / `checked` / unsynced ids. `listRowsRef`, the cache and its signature never see the overlay. Jest case: a Browse +1 online on an item that exists only in the overlay inserts a row, and the replay then adds +1 (correct per O2).

Changing the wagon after a failure (take a card out, put one back) clears the failed state, and Done goes back to the table's first two rows.

---

## Migration 089 — `land_ask_picks` with a run id

- **The replay path (O5, narrowed by ruling A, 2026-11-24 21:11).** Step 0 found that 087 already dropped the count-vs-target and on-shelf checks (087:167–168, 186–193), so an off-shelf pick or a changed target already lands. The **only** thing a replay needs is a deleted ask. A fifth arg is added: `p_tapped_at timestamptz default null`. A call is a **qualifying replay** when:
  - `p_run_id` and `p_tapped_at` are both given;
  - `p_tapped_at` falls within the last 7 days and isn't in the future (1 min grace);
  - the ask is deleted, with `deleted_at > p_tapped_at - interval '5 minutes'` (ruling C's grace, for skew between Paige's phone and the server).

  In a qualifying replay, a deleted ask isn't `P0002`, and the label is still read from the ask row. Every other 087 rule stands, for every call. **Accepted cost:** a member could attach a deleted ask's label to live items they could already add as themselves.
- **Replayed rows keep the tap time (ruling B).** Whenever `p_tapped_at` is given (any replay, not just a qualifying one), each row the landing inserts, revives or turns into a new need gets `status_changed_at = least(p_tapped_at, now())` (**as built and ruled, Dan 2026-11-24 21:32**: never a future stamp; a phone whose clock runs ahead would otherwise block every check on that row until its clock caught up), set explicitly so 088's trigger doesn't stamp `now()`. A +1 on a live pending row changes no status, so it leaves `status_changed_at` alone. **Why:** without this, a check Paige tapped *after* the pick (earlier `tapAt` than the replay time) fails 088's `status_changed_at < tapAt` test and is quietly lost. Her bought Bananas would go back to pending.
- **The server stamps `deleted_at` (ruling C).** Today the deleting phone's own clock writes `deleted_at` (`deleteAsk`, useProvisions.js:1727–1731). In 089, the trigger `asks_stamp_deleted_by` (087) also sets `new.deleted_at := now()` whenever `deleted_at` goes from null to non-null. The client keeps sending it; the server overrides.
- **New table** `public.ask_landings (run_id uuid primary key, household_id uuid not null references public.households(id) on delete cascade, landed integer not null, created_at timestamptz not null default now())`. RLS on, **no policies** (read and written only by the definer function). Revoke all from `anon`, `authenticated` and `public`.
- **`land_ask_picks(p_household_id uuid, p_ask_id uuid, p_catalog_item_ids uuid[], p_run_id uuid default null, p_tapped_at timestamptz default null)`.** Drop the 3-arg function and create the 5-arg one, with the same body as 087 plus the replay path above, plus:
  - after membership and **inside the household advisory lock** (**as built and ruled, Dan 2026-11-24 21:32**: the lock is taken right after membership, above the input checks, so a repeat run id answers before the ask is even read, even if the ask has since been deleted): if `p_run_id` is not null and a row exists for it **in this household**, return its `landed` and do nothing else. A `run_id` held by another household raises `22023`;
  - after landing, insert `(p_run_id, p_household_id, v_count)` when `p_run_id` is not null;
  - prune rows older than 30 days for this household in the same call (cheap and bounded).
- **Grants:** same as 087 (execute to `authenticated` only; revoke `public`, `anon`, `service_role`). `security definer`, `search_path ''`.
- **Compatibility:** the old prod client calls with three named args. Once the 3-arg function is gone, PostgREST resolves those to the 5-arg one through the defaults. So **089 can go on prod before the new client, and must**: the new client sends `p_run_id` on every send and `p_tapped_at` on every replay from the queue.
- **Rollback file** `089_rollback.sql`: restore 087's 3-arg `land_ask_picks` (body md5 `1376af1f060719ed42003b6faf08c662`, CR-stripped, the same on dev and prod) and its grants, restore 087's `asks_stamp_deleted_by` body, and drop `ask_landings`.
- Dev first, ledger read-back by object and body hash, per `principles-and-verification`.
- **On dev (slice 1, 2026-11-25 02:21 UTC, relay `a5e7a1b`, commit `eb467a1`):** ledger `20261125022124 089_ask_landings`. Body md5s (CR stripped): `land_ask_picks(uuid,uuid,uuid[],uuid,timestamptz)` `9d80b8abd9d784a9690b271d1b32c527`, `asks_stamp_deleted_by()` `32ff20db0b8d72379820786717238828`. Fixture 30/30; rollback parse-checked. Not on prod.

---

## Step 0 (Claude Code, read-only, report before building)

1. **The connectivity signal.** Which export of `ConnectivityContext` / `offlineMode.js` does the check path use to skip the network? Can AskRun (or App's `onLand`) read the same one without new plumbing?
2. **Transient classification.** Does `landAskPicks`'s thrown error, in airplane mode on iOS (WebKit "Load failed", status 0) and on a dropped token fetch, classify as `transient` through `classifyFetchError`? List anything that would come out `real`.
3. **Tap-order replay.** How does `flushQueuedChecks` order checks against the Wrap up today (`splitAroundWrap`, `earliestCheckTap`)? Propose the smallest change that slots Ask landings in by `tapAt` (D4), and say whether checks keyed by list-item id can hold a "pending a landing, by catalog item" entry without changing the queue's shape.
4. **The overlay seam.** Where is the Shop / list model built from `listRows` (+ cache)? Name the one place D3 can apply, and confirm `useLandedHighlight` (See) can highlight overlay rows (what ids does `landed.start` take: catalog or list-item?).
5. **Resume on next hand-over (O4).** Today the run's end clears `op_ask_held` (App ~7022) and resume only happens on a reload. Confirm the smallest change: a "keep" flag on the exit, and `handoverAsk` reading the held key for the same ask.
6. **The 087 body hash on dev and prod** (should match), so 089's rollback restores exactly that.
7. **The shelf-change time (O5).** Does `edit_ask` (087) and `update_ask` (083) set `asks.updated_at` on every shelf, target or style change? Is `deleted_at` set on delete? If `updated_at` also moves on a label-only edit, say so; that's acceptable (it only widens the replay path).

Stop and report if Step 0 finds a second write path for Ask picks, or if anything comes out of #2 as `real`.

---

## Verification (dev, then the phone walk)

1. **Airplane mode, Explorer (Everett):** pick to full → swipe → roll-off → Great picks → hold to give back → the toast "Everett added N · See" → See shows the rows with the dot. No red line anywhere.
2. **Airplane mode, Shopper (Easton):** the same with That's it! on the tub, and again with Done held full.
3. **Back on grid:** the dots clear, nothing else is said, and the second phone shows the picks with "Picked by" within one poll.
4. **Replay once:** drop the reply after the server commits (harness: block the response, not the request). The retry with the same `run_id` returns the first count. Quantities are +1 per pick, not +2. Read back `ask_landings` for one row.
5. **Tap order:** offline, check Apples off, then Ask-pick Apples → lands as a new need at 1. Offline, Ask-pick Bananas (new), then check Bananas off → on reconnect the row exists and is bought, with `status_changed_at` = the check's tap time.
6. **Offline Wrap up after a pick:** the unchecked pick is carried forward, not archived.
7. **Real error (O4):** force `land_ask_picks` to raise (e.g. delete the ask on the other phone while online). Red line → Done reads "Hold to finish" → hold → the run closes → hand over the same ask → the shelf with the wagon full.
8. **O5:** offline, pick Apples + Bread on Ask Easton; on the other phone, delete Ask Easton (and, in a second pass, take Bread off its shelf); reconnect → both land, "Picked by Easton" on each. A non-replay call to a deleted ask is still `P0002`. A replay whose `p_tapped_at` is more than 5 minutes after the server's `deleted_at` is `P0002`. The deleting phone's clock set back 1 h still yields a server `deleted_at` of `now()`.
9. **Old client vs 089:** the 3-arg call from the prod bundle shape still lands (harness against dev).
10. Jest: AskRun (D1 paths, D6 table), the queue (keying, order, collapse, the held check by catalog item), the overlay rules (D3's three cases). `CI=true` build green. The harness pre-walk (`wagon-walk.js` + an offline pass) before the phone.

---

## As built — slice 2, the client (dev `542771d` → `222063e`, 2026-11-24; relay `a0d703d`)

Five departures, **accepted by Dan 2026-11-24**:
1. **The queue entry carries `items`**: the picks' `{ id, name, category }` from the ask's shelf at send time. Display only, like `label`; never sent. An overlay row for an item not on the list needs a name, the shelf can hold items hidden from Browse, and a deleted ask is gone from the asks list.
2. **A fresh run id after any send that resolved** (landed or queued); the same one is reused only after a send that threw. A run id recorded with `landed 0` (B9.3) would answer every later That's it! with 0.
3. **A check is held only if it was tapped after a covering landing.** One tapped before the pick goes first, so check-then-pick lands as a new need (D4).
4. **A landing restored from storage already landed retires at once**, so a cached list that already holds it never shows it twice.
5. **The 8 s limit uses its own `AbortController`**, not `AbortSignal.timeout()` (that rejects with a `TimeoutError`, which `classifyFetchError` calls real).

Known gaps — **NOT BUILT** (rare, off grid only; Dan rules them later; ROADMAP NEXT):
- **(i) One intent per row.** A check tapped both before and after a pick on the same row keeps only the later one, so the server sees a +1 where it would have seen a new need (the quantity differs).
- **(ii) A checked overlay-only row after an offline Wrap up** stays on this phone's list until the replays land (the Wrap up's `hideIds` don't know overlay rows; an unchecked pick is carried forward, as verification 6 wants).
- **(iii) Browse − / remove on an overlay-only item** online changes nothing on the server, and the overlay keeps showing it until its replay.

---

## Open

None in design. Ruled 2026-11-24: Q1 → O5 (land anyway), promotion → O6 (this first). Step 0 may raise build questions.
