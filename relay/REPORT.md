Reported: 2026-11-23 08:26 ET · dev 56442ec · main 54d453c · re: Offline check-off slice 1 — 088 on dev, then the queue on dev; harness pre-walk; report to relay (2026-11-23) · prompt cdc6965

# Offline check-off slice 1 is on dev, and the harness pre-walk passed

**Status:** 088 is applied on dev. The slice 1 client is live on dev at `56442ec` (`main.5601c209.js`, `dpl_7mNn6e96ntxrV6rEZ8rbr1bzoSWt`).
**Pre-walk on the deployed dev preview:** `offline-walk.js` passed 29/29, covering Verify 1–8 and 10. The `shop-burst.js` revert mode ran 3 bursts with 0 reverts.
**Not touched:** prod and main (`54d453c`). Next: Dan walks it on the installed iPhone.

## 088 `status_changed_at` (applied on dev)

- **Event types:** confirmed on dev before writing the backfill: `checked` 1184, `unchecked` 311, `added_in_store` 31.
- **Column:** `list_items.status_changed_at timestamptz not null default now()`.
- **Backfill:** it runs once, only in the same step that adds the column. Each row takes its newest checked/unchecked event, else `updated_at`, else `created_at`. Result: 252 rows from an event, 202 from the fallback, 0 mismatched, 454 rows in all.
- **Trigger** `trg_list_items_status_changed_at`, BEFORE UPDATE:
  - It fires when the status changes, or when a deleted row is revived.
  - It stamps `now()` unless the update set the column itself (a client's tap time is kept).
  - A change to quantity, price or a meal doesn't move the column.
  - The function is SECURITY INVOKER with `search_path ""`, and EXECUTE is revoked from everyone. No grants changed.
- **Firing order** (BEFORE UPDATE triggers fire alphabetically): `trg_list_items_picked_by_guard` → `trg_list_items_resurrect` → `trg_list_items_status_changed_at`.
  - The guard only raises an error. The resurrect trigger writes `cycle_id` and `picked_by_labels`.
  - 088 runs last and reads only `status`, `deleted_at` and its own column. They don't conflict.
- **Parse check** through the CLI (`commit` swapped for `rollback`) left nothing behind. The canary copy failed with "17 checks passed, want 18", so every probe ran.
- **Fixture:** 17 probes. They cover the five cases the amendment lists, plus:
  - the revive edge, both the upsert revive and the 085 re-need;
  - a quantity +1 through 085 not moving the stamp;
  - an outsider, anon, and the column privileges.
- **Real apply** (after Dan's go): 2026-11-23 06:16 UTC through the CLI on `zxwtxjjmssykhqrghouf` (`system_identifier` 7642734024280108049).
  - Read back by object.
  - Stored body hash with CRs stripped: `ac36b001fc182d8ba1b06c82522135fb`, which equals the file.
  - Ledger row `20261123061608 088_status_changed_at`.
- **Rollback:** `088_rollback.sql` was parse-checked against the applied state. Its verify block passed, and it rolled back.
- **Not on prod.** At promotion, 088 must go on prod before the client: PostgREST refuses an update to a column it doesn't know.

## Commits on dev (pushed; every one green on Jest 1222/1222 and the `CI=true` build before the push)

- `dd84aed`: 088 plus its rollback. Also files `docs/specs/active/SPEC_offline_checkoff_amendment_2026-11-23.md`. That spec is also in this session's DROPPED_FILES; SESSION END shouldn't file it twice.
- `9f0cdcb` (1/n): every check write sends `status_changed_at = tap` and filters on `status_changed_at < tap`. This is A1, and it applies online too.
- `0779abd` (2/n): `lib/checkQueue`, pure and tested. It holds the queue and the cached list, both keyed `<clerkId>:<householdId>`; keys for anyone else are discarded on load.
- `57cb7ce` (3/n): `runCheckWrite` is the single write. A tap and the flush share it, on the same per-row chain.
  - A tap queues on any temporary failure, or without sending while `navigator.onLine` is false. It then returns `"queued"`.
  - The flush runs on the 2 s tick, on `visibilitychange` and on `online`, and publishes the waiting set once per batch.
  - Events are logged with their tap time, and a trip's session starts at the first queued check (R3).
  - The queue loads after `loadForHousehold`'s reset and before its first poll.
  - The cached list is restored after 2.5 s without a list.
- `6ed047f` (4/n): what you see.
  - The waiting row: compact, faded, struck through, with a clock, still in its aisle.
  - Offline taps skip the 3 s hold, and a waiting row unchecks in place.
  - Confirmed rows slide into In cart together.
  - The pill (R4), the offline All done card, the version notice hidden while checks wait (A8), and clearing at sign-out and on a switch to another place (A9).
  - Nothing was added to `LandscapeStaples.js`.
- `4542d5a` (5/n): fixes the harness pre-walk found.
  1. A flush that ran before the first list load logged nothing. Entries now carry the row's catalog id, and the flush waits until both the list and bootstrap are ready.
  2. The weak-signal restore found no place when none had been remembered by a switch. It now falls back to the place this person's cached list is for.
- `56442ec`: `tools/harness/offline-walk.js` plus a README line (Velayo OS).

## Pre-walk on dev.ourprovisions.velayo.ai (bundle `main.5601c209.js`): 29/29 PASS

- **V1** Three offline checks each collapse to a waiting row in place, and the tray stays at 0. The pill reads "Offline · 3 checks waiting to sync". Nothing reached the server. **PASS**
- **V2** Undo on one and a re-tap on another: both are full rows again, 1 is waiting, and the pill reads "Offline · 1 check waiting to sync". **PASS**
- **V3** After one more check, background, then return: the 2 waiting rows are still there, and 2 are stored. The pill reads 2. **PASS**
- **V4** Weak signal (online, all `*.supabase.co` requests aborted). **PASS**
  - The queue stays queued through failed sends.
  - The reload restores the list (6 rows) and the 2 waiting rows from the phone.
  - The pill reads "Syncing 2 checks…" (online, so R4's syncing copy).
  - Still nothing on the server.
- **V5** Reconnect. **PASS**
  - Both waiting rows leave in the same batch (Δ 0 ms) and land in In cart (tray 2).
  - The pill read "Syncing 2 checks…" on the way, then cleared.
  - The server has both as bought, each stamped with its exact tap time.
  - The second phone (tab B) shows both in its In cart.
- **V5b** Every item checked offline shows "All picked up · Will sync when you're back online.", with no Wrap up button. After reconnecting, the normal "All done." card shows. **PASS**
- **V6** A checks offline; afterwards B checks and unchecks. B wins: unchecked on both, no notice, no error, and the losing check logged nothing. **PASS**
- **V7** B changes the check first, then A taps offline. A wins: bought on the server and in A's cart. **PASS**
- **V7b** A checks offline; afterwards B does +1. The row stays checked with quantity 2 (R1). **PASS**
- **V8** B deletes the item while A has it checked offline. No error, and it's gone on both. **PASS**
- **V10** The trip's session `started_at` equals the first queued tap (`13:22:42.239`) to the millisecond. Each confirmed check is logged once, at its tap time. **PASS**
- **End state:** the queue is empty, and one cache key is stored, for this person at Cody Test House only. **PASS**
- **V11** `shop-burst.js` revert mode: 3 bursts, 0 reverts. **PASS**
  - Its fold mode fails one existing check ("Undo all puts all 6 back": 1 → 6 unchecked).
  - **It fails the same way on the pre-slice dev build** (run before the push), so slice 1 didn't cause it. Not investigated; queued as a finding.
- **V9:** not run. It needs a second account. Left for Dan's phone walk or Dan's call.
- **The walk cleans up after itself.** It adds six items of its own, ends open sessions first and its own last, and puts other rows back. Cody Test House is left with 0 live rows (as it started) and no stamps missing.

## Departures from the amendment, and things to rule on

1. **088 also stamps the revive edge, not only a status change.** `list_items` is one row per (household, catalog item) for good, so a removed item that's added again revives the same row id. Reviving a row that was deleted while pending changes no status. Without the revive stamp, an older queued check of that id would land on the newer need. Fixture probes 12 and 13 cover it.
2. **Queue entries also store the row's catalog id (`cid`),** so a confirmed check can be logged even when the list hasn't loaded yet (fix 1 above).
3. **When the API is unreachable while the phone reports itself online (one bar), the pill reads "Syncing N checks…" the whole time.** R4's copy keys on `navigator.onLine`. Rule whether "Syncing" should switch to the waiting copy after a failed send.
4. **The offline All done card has no Wrap up button** until the checks sync (a wrap-up can't succeed offline). The amendment didn't say; worth a ruling.
5. **An offline uncheck of a row that's already bought** isn't drawn as waiting. It shows as an ordinary unchecked row in its aisle, while the pill still counts it. Only the waiting check has an approved look.
6. **The Undo toast copy offline** still reads "✓ X checked", and the folded group reads "N items in cart", even for waiting checks. A copy nit for the design chat.
7. **After a weak-signal reload, the restored list shows the place's name from the cache.**
   - The landing tab isn't decided while bootstrap is held, so the app opens on the URL's tab or Home. The shopper may need to tap Shop.
   - Browse shows "Loading your catalog…" (the catalog isn't cached).
   - The first real list replaces the cached one.
8. **Clock skew:** online taps now carry the phone's clock. A phone whose clock runs behind can lose, silently, to another member's change made just before its tap. Measured on this desktop: local runs 1.2–1.6 s ahead of the server. The spec accepts drift.
9. **Session start and location (existing behaviour, noted):**
   - `startSession` waits for the geolocation answer, so a trip's first event waits until a location prompt is answered.
   - In the harness, the background tab B held tab A's geolocation request, so the trip's session landed only when tab B closed. That was fixed in the walk by bringing tab A to the front; it isn't an app change.

## For Dan's phone walk (installed iPhone, dev, Wi-Fi and cellular off)

1. V1–V3: the waiting row's look, the pill, Undo and re-tap, then background and return.
2. V5: reconnect, and watch the rows slide into In cart together (a second phone or the desktop shows them).
3. V5b: the offline All done card.
4. V9: sign out with checks waiting, then sign in as someone else. Only if a second account is at hand.

V4 (weak-signal reload) is harness-only on slice 1; with no signal, a phone reload can't load the app until slice 2.

Stopped here. Nothing is on prod; the dev → main promotion is a separate step, with 088 on prod before the client.
