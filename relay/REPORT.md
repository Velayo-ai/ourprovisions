Reported: 2026-11-24 22:05 ET · dev 222063e · main 54d453c · re: Ask off grid slice 2 — the client (queue, send, flush, overlay) · prompt 56ad49e

# Slice 2 is on dev: an Ask send off grid now carries on to Great picks, and Paige's list shows it. Prod untouched.

## Shas, all pushed to origin/dev with Dan's OK
| | sha | Jest | `CI=true` build |
|---|---|---|---|
| push of slice 1 | `eb467a1` | — | — |
| spec: 089 recorded as built (both departures ruled 21:32, md5s `9d80b8ab…` / `32ff20db…`, ledger `20261125022124`) | `93ca0fe` | — | — |
| (a) `lib/askQueue` + `checkQueue.splitAtTaps` | `542771d` | 84 suites / **1293** green | green |
| (b) the send + the flush | `7538d1d` | 84 / **1297** green | green |
| harness: `wagon-walk.js` fix (Velayo OS) | `b42ab45` | — | — |
| (c) the overlay | `222063e` | 84 / **1301** green | green |

## What's built
- **(a) `src/lib/askQueue.js`:**
  - The queue `op_ask_queue:<clerkId>:<householdId>` with wrapped storage. Its prefix joins `ownKeys` / `discardForeign` / `clearCheckStorage`, so sign-out and a household switch clear it.
  - `splitAtTaps`: `splitAroundWrap` is now its one-boundary case, unchanged.
  - The synthetic key `ask:<runId>:<cid>` and `rekeySynth`.
  - `askSendIsTransient` (D1 + 2a + 2c).
  - `applyAskOverlay` with 087's three branches in tap order, and `liveLandings` (no blink).
- **(b) `landAskPicks(askId, ids, style, runId)`:**
  - Every send carries `p_run_id`.
  - **Known off grid** (`navigator.onLine === false || offlineRef.current`) → queued, no request.
  - A **transient error**, a **missing token while off grid (2a)** or the **8 s limit (2c)** → queued with the same run id.
  - A queued send resolves `{ landed: ids.length, skippedIds: [], queued: true }`. Real errors still throw; AskRun is untouched.
  - **Telemetry:** `ask_land_queued` (count + style); `ask_completed` once, when the replay lands, with the server's count; `ask_land_dropped` (code only) when D5 drops one, silently.
  - **The flush** walks boundaries in tap order (`planFlushStep`): the checks before → the landing (`p_run_id` + `p_tapped_at`) or the Wrap up → a fresh list read → the re-key of the held checks → on to the next.
  - **A synthetic key never reaches the network:**
    - `runCheckWrite` holds it, along with any check of a row a queued landing covers when that check was tapped after the landing.
    - `sendQueuedChecks` never sends one.
    - `planFlushStep` never plans one (Jest).
  - The flag gate stays first in the one request site (`callLandAskPicks`), pinned in `featureFlags.test.js`.
- **(c) One `useMemo` at the hook's return** (`shownListState`) derives the shown `listRows` / `quantities` / `checked` / `queuedChecks`, and the overlay rows get the dot. `listRowsRef`, the list cache and its signature, and the queued Wrap up keep server truth. A landing leaves the overlay only after its replay landed **and** a read that started after it was applied, in the same render as its row arrives. See highlights overlay rows (catalog ids). A tap's intent starts from the shown state.
- **Jest (c), as asked:** the three branches, no blink (before and after the read: same quantity, the dot goes with the read), a Browse +1 online on an overlay-only item (the server row it makes gets the pick on top: one row, qty 2), a check and its Undo on an overlay row cancelling out, plus two landings of one new item and the tap-order cases.

## Smoke (local build, Ask on, dev database, Cody Test)
- **`wagon-walk.js`: ALL PASS** with (b), and again with (c). Online sends are unchanged: Shopper (4) and Explorer (1), Great picks, give back, See.
- **First run failed twice; both were stale walk checks, not the app.** The 120px drag started at 75% of the wagon, so the release fell off the 375px screen and no `land_ask_picks` was ever sent. The fade check waited 3.7 s against See's 5.2 s highlight. Fixed in `b42ab45`. This was the rev 3 walk's first run since the rev 3 harness change.
- **Off-grid probe** (a throwaway script, not committed), all PASS:
  1. CDP offline → Explorer swipe → Great pick, no red line, no request, `op_ask_queue` = 1.
  2. The toast reads "Kid added 1".
  3. See → Apples highlighted, with the dot and "Picked by Kid".
  4. Back on grid → exactly one `land_ask_picks` carrying `p_run_id` and `p_tapped_at`, answered 200. The queue empties, the dot clears, and the row stays.

  Its Apples was taken back off the test list after.
- **Not yet checked:** the dev deployment's bundle isn't read back here, and there's no harness offline pass or phone walk. Those belong to slice 4 (verification 1–10).

## Departures from the spec, for a ruling
1. **The queue entry carries `items`**, the picks' `{ id, name, category }` from the ask's shelf at send time. It's display only, like `label`, and never sent. Why: an overlay row for an item not on the list needs a name. The Ask shelf can include items hidden from Browse, so the catalog map can't always name them, and a deleted ask is gone from the asks list.
2. **The run id is fresh after any send that resolved; it's reused only after a send that threw.** The spec says "the caller passes it in, so a retry from the same run reuses it". A real error rolls back, so reuse is safe. But a run id recorded with `landed 0` (B9.3: nothing landed, the run stays open) would answer every later That's it! with 0 for ever. App keeps the id in a ref per run.
3. **A check is held only if it was tapped after a covering landing.** A check tapped *before* the pick goes first, so check-then-pick lands as a new need (D4).
4. **A landing restored from storage already landed retires at once** instead of waiting for a read. The cached list may already hold it, and it must not show twice.
5. **The 8 s limit uses its own `AbortController`,** not `AbortSignal.timeout()`. That one rejects with a `TimeoutError`, which `classifyFetchError` would call real.

## Known gaps, not built (say if any should be)
- **(i) One intent per row:** a check tapped both before and after a pick on the same row keeps only the later one (the queue's existing collapse). The server then gets a +1 instead of a new need, so the quantity differs.
- **(ii) A queued Wrap up after an offline pick:** overlay rows aren't in its roll choice or `hideIds`. An unchecked pick is always carried forward, which matches verification 6. A *checked* overlay-only row stays visible on this phone until the replays land.
- **(iii) Browse − / remove online on an overlay-only item** changes nothing on the server, and the overlay keeps showing it until its replay.

Slice 3 (O4 / D6, AskRun's Done) waits for its own prompt. Prod untouched.
