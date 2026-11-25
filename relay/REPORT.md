Reported: 2026-11-24 21:02 ET · dev 1defd18 · main 54d453c · re: Ask off grid Step 0 (SPEC_ask_offline items 1–7) · prompt db35f87

# Ask off grid, Step 0: no stop. Two findings change 089.

**No stop.** There is one write path for Ask picks: the client's `landAskPicks` (useProvisions.js:1594) calls `land_ask_picks`, and that function is the only server code that writes `picked_by_labels` with a label. In the migrations, 078/085/086 touch the column only in fixtures or to null it on a new need. Airplane mode and a network-caused token failure both classify as `transient`. Read-only throughout: no edits, no migration, no push except this relay commit. Prod was only read, with one SELECT.

**Two findings that change 089 (they need a ruling before the build):**

- **A. 087 already removed the checks O5 relaxes.** In 087, `land_ask_picks` no longer checks the count against the target or that picks are on the shelf (087_ask_shelf_deltas.sql:167–168, 186–193). An off-shelf pick already lands. The only replay case 087 still refuses is a **deleted ask** (`P0002`, :159–165). So 089's replay path only needs "a deleted ask is allowed on a qualifying replay". The "shelf/target change time" half has nothing left to relax, and #7's `updated_at` question doesn't matter for landing.
- **B. A check tapped after an offline landing loses to the landing on replay (D4, verification 5).** 088 sets `status_changed_at` to the default `now()` on insert. Its trigger sets `now()` on any status change or revive that didn't set the column itself (088_status_changed_at.sql:90, 105, 116–117). A replayed landing therefore stamps the new, revived or new-need row with the *replay* time. The check Paige tapped after the pick has an earlier `tapAt`, so its `.lt("status_changed_at", tapAt)` (useProvisions.js:1928) matches no rows. The flush then quietly sets the row back to pending, and the check is lost. **Proposed fix in 089:** on a qualifying replay, the rows the landing (re)creates get `status_changed_at = p_tapped_at`. That covers the new row, the revive and the new need, but not the +1 on a pending row, because a +1 doesn't change status.

**A smaller one for 089 (C):** an ask's `deleted_at` is stamped with the *deleting phone's clock*: `deleteAsk` sends `new Date().toISOString()` (useProvisions.js:1727–1731), and nothing on the server restamps it. So O5's "`deleted_at` later than `p_tapped_at`" compares two different phones' clocks. If the deleting phone's clock runs behind, a replay reads as a non-replay, gets `P0002`, D5 drops it, and the picks disappear from Paige's list. Two ways to fix it: (1) the 087 trigger `asks_stamp_deleted_by` also sets `new.deleted_at := now()`; or (2) give the comparison a grace window. I'd take (1). It's the same trigger and a one-line change.

---

## 1. The connectivity signal
- **The check path doesn't read ConnectivityContext to skip.** It skips on `navigator.onLine === false` → `throw OFFLINE_SKIP` (useProvisions.js:1921; flush gate :2045). Everything else falls through to `classifyFetchError` (:1942).
- **The Wrap up uses both:** `navigator.onLine === false || offlineRef.current` (useProvisions.js:2514). `offlineRef` mirrors `useConnectivity().offline` (:149–151). That's the OFF GRID state: the device reports offline, or the last request failed for want of a network, and it holds for 10 s of steady signal after (ConnectivityContext.js:37–45, offlineMode.js:10).
- **It's readable as-is.** `landAskPicks` sits in the same hook, next to `offlineRef` and `reportTransientFailure`, so the D1 decision needs no new plumbing. App also has `offline` already (App.js:5472), and AskRun renders inside the provider. **Recommendation:** use the Wrap up's expression in `landAskPicks` and return `{ landed: ids.length, skippedIds: [], queued: true }`. Then `onLand` (App.js:12801–12806) and AskRun's `confirm()` (AskRun.js:487–520) see an ordinary success and roll on to Great picks. The D1 change stays out of AskRun entirely.

## 2. Transient classification
`landAskPicks` throws the raw postgrest error (useProvisions.js:1601). postgrest-js 2.100.1 turns a rejected fetch into `{ message: "<name>: <message>", code: "", status: 0 }` (node_modules/@supabase/postgrest-js/dist/index.cjs:168–207).
- **Airplane mode, WebKit:** `"TypeError: Load failed"` → `splitErrorMessage` → the "Load failed" phrase → **transient** (classifyFetchError.js:28, 35; transientPhrases.js:16, 33–42).
- **Airplane mode, no cached token:** Clerk throws or returns null, and `classifyTokenFailure` returns `network` because `navigator.onLine === false` (authHealth.js:74–75). The wrapper throws `AuthTokenMissing("network")`, which reaches us wrapped as `"AuthTokenMissing: no Clerk token (network)…"`. `isAuthTokenMissing` / `authTokenMissingClass` parse that as **transient** (supabaseClient.js:34–47, 66–80; classifyFetchError.js:23).
- **A token fetch rejected for a network reason while navigator.onLine is true:** a TypeError, a network phrase or `/network/i` → `network` → **transient** (authHealth.js:79–82).
- **A reply lost after the server committed** (the body read dies): the same "Load failed" path → **transient**. O3's run id makes the retry safe.
- **Abort:** **transient** (classifyFetchError.js:30).

**What would come out `real`** (none is a named #2 case, so this is not a stop):
- (a) **Clerk returns null while `navigator.onLine` is true.** iOS can report online before the radio is up, or on one bar. The class is `clerk` → real (authHealth.js:76; supabaseClient.js:73). The check path has the same exposure today (it rolls back with an error), so this isn't new. Off grid, though, the run would hit O4's exit instead of queueing. My suggestion: treat a null token as transient when `offlineRef.current` is true, in the Ask send only.
- (b) **A gateway answer with a non-JSON body**, such as a 502/503/504 HTML page or a captive portal's 200 HTML. It becomes `{ message: body }` or a `SyntaxError` → real (postgrest index.cjs:121, 141–151). Real is arguably correct: something answered.
- (c) **A request that hangs.** Neither the wrapper nor postgrest sets a timeout (supabaseClient.js:66–85 passes no signal). On one bar the swipe can sit rolled off-screen until iOS gives up. That isn't `real`, but it breaks O1. **Proposed:** an AbortSignal timeout of about 8 s on the land. It becomes an `AbortError`, which is transient, so the send queues with the same run id. O3 makes that safe.

## 3. Tap-order replay
- **Today:** `flushQueuedChecks` (useProvisions.js:2034–2061) runs `splitAroundWrap` (checkQueue.js:227–235), which puts every check tapped at or before the Wrap up in `before` and the rest in `after`. Then: send `before` in parallel (`sendQueuedChecks`, :2065–2086; the events go sorted by tap time) → stop unless all of them settled → `replayQueuedWrap` → send `after`. `earliestCheckTap` (checkQueue.js:128–135) only dates a trip's start. It doesn't order anything.
- **Smallest change:** generalize `splitAroundWrap` into `splitAtTaps(entries, boundaries)`, where the boundaries are the queued landings plus the Wrap up, sorted by `tapAt`. The flush walks the segments: the segment's checks (parallel, as today; checks on different rows don't interact), then require them all settled, then that boundary's replay (one landing, or the Wrap up), then the next segment. Two boundaries, landings and Wrap up, need a single sort. Each Ask landing gets its own boundary because each one reads the list after it lands.
- **Holding a check on an overlay-only row:** the queue's shape already fits. The entries are `{ [key]: { want, tapAt, cid } }`, `cid` is already stored (checkQueue.js:68–70, 95–100), and `readQueue` accepts any string key. Use the key `ask:<runId>:<cid>`, and after its landing's list read, re-key it to the real row id by `cid`. **Guard needed:** a synthetic key must never reach the network. Online, `runCheckWrite` would send `.eq("id", "ask:…")`, get 22P02, classify it real, and roll the row back with an error (useProvisions.js:1922–1929, 1960–1974). So a synthetic id always goes to the queue. Sync state for an overlay row is "pending" (`syncedWant = false`), so check followed by Undo still cancels out (putEntry).
- **Also:** the Ask queue key's prefix has to join `ownKeys` and `discardForeign`'s keep set (checkQueue.js:46, 55). Then `clearCheckStorage` clears it on sign-out (App.js:13306) and on a household switch.

## 4. The overlay seam
- **The one place is the hook's return** (useProvisions.js:5002–5004: `quantities, checked, … listRows`). App builds Shop only from what comes back: `shoppingList` reads `row.quantity`, `row.catalogItemId`, `row.id` and `row.pickedByLabels` from `listRows` (App.js:8548–8586). The check state comes from `checked[listItemId]`, and the dot from `queuedChecks[id]` (App.js:8883). Browse's stepper reads `listRows` too (App.js:8602).
- **Proposed:** one `useMemo` before the return derives the shown `listRows` / `quantities` / `checked`, plus queued-add ids for `unsynced`, from server state + the Ask queue, using D3's three rules. Those rules match 087's branches (087:217–258). Internal state stays server truth: `listRowsRef`, the cache write and its signature (useProvisions.js:579, 620–623, 2411–2412) never see the overlay, as D3 asks.
- **Not one place today:** the queued Wrap up applies `hideForWrap` in three spots (cache restore :418, the list read :471, the queued Wrap up itself :2405). The Ask overlay shouldn't copy that.
- **See:** `landed.start(label, ids)` takes **catalog item ids**. The ids come from AskRun's Great-picks tiles (AskRun.js:613 → App.js:12816), and the tint matches `item.catalogItemId` (App.js:12310, 12339; useLandedHighlight.js:9, 49–53). An overlay row carrying `catalogItemId` highlights with no change.
- **Build note:** paths inside the hook that read `listRowsRef` won't see overlay rows. The case that matters is a Browse +1 online on an item that is still only in the overlay: it inserts a row, and then the replay adds +1 on top. That's correct per O2, just worth one Jest case.

## 5. Resume on the next hand-over (O4)
- **Today:** any change of `runAskId` from set to null clears the key (App.js:7022–7025). `onExit`, the hand-back (App.js:12807, 12812) and the view/household reset (App.js:7011) all go that way. Resume happens only on a reload (App.js:7026–7033). `handoverAsk` opens fresh (App.js:7051). AskRun rewrites the key on every screen/picks change (AskRun.js:404–406), so a fresh run overwrites a held one when it mounts.
- **Smallest change (confirmed):**
  - (1) `onExit({ keep: true })` sets a one-shot `keepHeldRef`, and the clearing effect skips `storeHeldAsk(null)` once.
  - (2) `handoverAsk(askId)` reads `heldAskRead(loadHeldAsk(), asks)` (askRun.js:97–124). For the same ask it calls `setRunResume({ screen, ids })` before `setRunAskId`. Any other ask clears the key.
  - (3) AskRun: `failed` comes only from a real error now. When it's true, the full-wagon Done becomes `HoldDone onDone={() => onExit({ keep: true })} hold="Hold to finish"` (AskRun.js:603–605). `takeOut` and `tapTile` already clear `failed` (AskRun.js:480), which gives D6's last line.
- **Notes:** the key is `sessionStorage` (askRun.js:116–125), so "keep" lasts as long as the tab. An iOS app kill loses it. The resumed run emits `ask_resumed`, not `ask_started` (AskRun.js:414). `heldAskRead` caps the picks at the current live target, so a shelf edited in the meantime can't overfill the wagon.

## 6. The 087 body hash, dev and prod (read only, CLI as postgres, a single SELECT)
Supabase MCP (dev and prod-readonly) was timing out, so I used `supabase db query --linked`. I linked prod only for this read, relinked dev straight after and restored the tracked link file; `supabase/` is clean. `md5(replace(prosrc, E'\r', ''))`:

| | dev `7642734024280108049` | prod `7606130613603586966` |
|---|---|---|
| `land_ask_picks(uuid,uuid,uuid[])` | `1376af1f060719ed42003b6faf08c662` | `1376af1f060719ed42003b6faf08c662` |
| `edit_ask(…8 args)` | `394667711aef89e05675cc681623e0d2` | `394667711aef89e05675cc681623e0d2` |
| `update_ask(…7 args)` | `bda189ca6f7c1b0af6a5dd26855ad4c8` | `bda189ca6f7c1b0af6a5dd26855ad4c8` |

All three are secdef with `search_path=""` and ACL `postgres=X, authenticated=X` on both databases. `land_ask_picks` matches 087's applied note (087:67–68), so 089's rollback restores `1376af1f…`.

## 7. The shelf-change time (O5)
- `update_ask` (083) sets `updated_at = now()` on every call, a label-only save included (083_ask_edit_and_short_shelves.sql:304–306).
- `edit_ask` (087) also sets `updated_at = now()` on every call, a label-only or no-op delta included (087_ask_shelf_deltas.sql:397–403).
- Delete sets `deleted_at`, as a client column update: `{ deleted_at: now, updated_at: now }` from the phone's clock (useProvisions.js:1727–1731; 077 grants UPDATE on those columns, 077_ask.sql:291). The 087 trigger stamps only `deleted_by`. Because of finding A, landing only needs `deleted_at`. See C for the clock.
- **Note:** `authenticated` can also write `asks.updated_at` directly (077_ask.sql:291). That doesn't matter once the replay path keys on `deleted_at` alone.

---

## The slices I'd build (not started)
1. **089 on dev:** `ask_landings` + the 5-arg `land_ask_picks`. The replay path is "a deleted ask is allowed" (A), and replayed rows get `status_changed_at = p_tapped_at` (B). The deleted_at restamp (C, option 1) goes in the same file. Parse-check `commit;` → `rollback;`, apply through the CLI, read back the ledger + object + hash, and test the old 3-arg call shape through the harness.
2. **Client, one commit per piece:**
   - (a) `askQueue` lib + Jest: keying, foreign discard, the order split, synthetic-key re-keying.
   - (b) `landAskPicks` D1 (offline → queue; transient → queue; the 8 s timeout) + the flush in tap order.
   - (c) The D3 overlay at the hook's return, with the dot.
3. **O4 / D6:** keep on exit + resume on hand-over, with AskRun Jest for the D6 table.
4. **Harness pre-walk** (`wagon-walk.js` + an offline pass), then Dan's phone walk. Promotion order stays 088 → 089 → client (O6).

Spec left in `handoff/`, not routed. Rulings needed on A (narrow the replay path), B (stamp the tap time) and C (restamp `deleted_at` on the server), plus 2(a) (null token while OFF GRID = transient) and the 8 s timeout in 2(c).
