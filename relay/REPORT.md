Reported: 2026-11-23 00:41 ET · dev aacd5eb · main 54d453c · re: Offline check-off — Step 0, read-only on dev (2026-11-23) · prompt 2dcb05e

# Offline check-off: Step 0 findings

**Verdict: build with these amendments.** No migration is strictly required: `list_items.updated_at` already exists, the client can set it, and no trigger overwrites it. But no check write stamps it today, so the spec's rule doesn't work until every check write does (A1). Separately, **Decision 2 (opening the app with no signal) can't be built without a service worker,** and that is out of this spec's scope as written (A6).

Read-only throughout. No code edits, no migrations, no pushes except this relay commit, nothing on prod. SQL ran on dev only: `get_project_url` = `zxwtxjjmssykhqrghouf`, and `system_identifier` = `7642734024280108049`.

## 1. A last-changed column on `list_items`

- **Column:** `updated_at timestamptz`, default `now()`, nullable. 0 of 454 rows on dev are null.
- **Triggers:** none maintains it. `list_items` has two triggers, and neither touches `updated_at`:
  - `trg_list_items_picked_by_guard`: BEFORE INSERT OR UPDATE; it rejects client writes that add `picked_by_labels`.
  - `trg_list_items_resurrect`: BEFORE UPDATE when a deleted row comes back; it clears meal links, re-homes the cycle and nulls `picked_by_labels`.
- **Who writes check state:** the only writer of a `pending → bought` transition is the client's direct table update in `toggleChecked` (`src/hooks/useProvisions.js:1751-1759`, `.update({ status: newStatus })`). **It doesn't set `updated_at`.**
  - Proof on dev: of 184 bought rows with a `checked` event, 183 have `updated_at` older than that event by more than 2 s.
  - Every RPC that writes `list_items` sets `updated_at = now()` itself, inline; no trigger fires for it. Those that move a row to `pending`:
    - `adjust_list_item_quantity` (085): qty-only updates at its lines 55 and 101; revive or re-need of a bought row at lines 88-90 and 111-112.
    - `land_ask_picks`: lines 93-95, 104-112, 119-121.
    - `add_meal_to_list`: upsert, line 112.
    - `insert_list_item`: upsert, line 50.
    - `close_cycle`: insert, line 92.
    - `decrement_meal_from_list`: qty only, line 62.
  - Paths that **don't** stamp it:
    - `archive_trip_items` and `remove_list_item`, which set `deleted_at` only.
    - `delete_household`.
    - The client's `clearAll` (`useProvisions.js:1842`), price update (`:2270`) and remove (`:2470`).
- **Dead columns:** `checked_by`, `checked_sequence`, `checked_lat` and `checked_lng` exist but are never written by the check path (the comment at `useProvisions.js:218-220` calls `checked_by` dead). History lives in `list_item_events`.

## 2. Can a queued write carry its tap time?

**Case (c): a column the client can set.**
- `authenticated` has table-wide UPDATE on `list_items`, with no column grants. The `list_items_update` policy is `is_member_of(household_id)` for both USING and CHECK. No trigger forces `now()`.
- So `update … set status = $s, updated_at = $tap_at where id = $id and updated_at < $tap_at` works as written today, with one gap: the column isn't stamped on every change. Two holes follow from that:
  - An online check doesn't move `updated_at`. So phone B checking or unchecking Milk after phone A's offline tap leaves `updated_at` older than A's tap, and A's queued write wins. That's backwards: **V6 fails.**
  - Mixed clocks. Server paths stamp server `now()`; queued taps carry the phone's clock. The spec already accepts drift.
- The event log can carry the tap time too: `list_item_events` has INSERT for `authenticated`, no triggers, and an insert policy that checks only the household and `user_id`. So the client can supply `created_at`.

## 3. Today's check-off write path

1. **Tap:** `handleShopToggle` (`src/App.js:8053-8114`).
   - On a check, it marks the row `{dir:"out", phase:"mark"}` before the write (`:8085-8088`) and starts the `CHECK_HOLD_MS` hold. It offers the Undo toast on the tap, not on the server's answer (`:8091`).
   - It awaits `toggleChecked(name, listItemId, {to})` (`:8104`).
   - `false` (failed) drops the toast and the hold (`:8105-8111`). A truthy status records the event (`:8113`).
2. **Write:** `toggleChecked` (`useProvisions.js:1712-1830`).
   - It adds the row to `pendingCheckRef`, calls `touchCheck` and sets the optimistic `checked` (`:1735-1737`).
   - Then `checkChainRef.current.enqueue(id, wantBought, send)` (`:1750`). This is `createRowWriteChain` (`src/lib/checkWrites.js:13-50`): one write per row at a time, and a newer intent aborts or cancels the older one.
   - **It's a direct table update, not an RPC:** `.update({status}).eq(id).eq(household_id).is(deleted_at,null).neq(status,newStatus).select("status")` (`:1751-1759`).
3. **Zero-row check: yes, still there.** Zero rows means it reads the row back and adopts the server's status (`:1783-1805`). The "conditional update" is `status <> newStatus` (made for duplicate-event suppression), not a timestamp compare.
4. **In cart** is just `checked[id] === true` once the row's motion clears. The All done card shows at `checkedCount === totalItems && !shopCheckSettling` (`App.js:12158`, `:8135`).

**Where a queue plugs in with one write path:** inside the existing `send` passed to `chain.enqueue`.
- **Online tap:** same `send`, plus `updated_at: tapAt` in the payload and `.lt("updated_at", tapAt)` in the filter. Keep `.neq("status", newStatus)`, so a replay that finds the row already there stays a no-op with no duplicate event.
- **Transient failure (or known offline):** persist `{id, want, tapAt}` instead of rolling back (`:1775`), and leave the id in `pendingCheckRef`.
- **Flush:** re-enqueue on the same chain with the stored `tapAt`. Per-row ordering and Undo cancellation then come free.
- **Changed return contract:** `toggleChecked` has to return a 4th value (e.g. `"queued"`), and the confirmed event must be recorded from the hook at flush time. `handleShopToggle` is gone by then.

## 4. The offline signal, and what happens today

- **Signals:**
  - `authHealth.online` comes from `navigator.onLine`, re-read at every poll gate and on `visibilitychange` (`src/lib/authHealth.js:54-67`, `:152-160`).
  - `ConnectivityContext` counts transient failures; 3 make "offline" (`src/contexts/ConnectivityContext.js:4`, `:20-30`).
  - **But while `navigator.onLine` is false, the context always reports `"reconnecting"`** (`:74`). "Offline — showing last saved" only appears when `onLine` reads true and 3 requests have failed, and only once `householdReady` is set (`src/lib/pillState.js`, `App.js:8981-8985`). On a real dead zone the pill says "Reconnecting…".
- **Token:** the fetch wrapper refuses with no Clerk token (`src/lib/supabaseClient.js:66-80`).
  - For about the first minute offline, Clerk hands back its cached token. The write then fails as `TypeError: Load failed`, which is transient.
  - After that, `getToken` returns null. `5c0d5fb` classifies that as `AuthTokenMissing(network)`, also transient (`src/lib/classifyFetchError.js` top).
- **An offline check today:** the optimistic check shows → the write fails transient → the row rolls back to unchecked if no newer intent is pending (`useProvisions.js:1775`) → `reportTransientFailure()`, no toast (`:1776`) → returns `false` → the Shop drops the Undo toast and the hold (`App.js:8105-8111`).
  - There's **no retry**. The shopper has to tap again.

## 5. The poll and reconnect

- **The reconnect tick:** `onlineTick = () => { listTick(); catalogTick(); }` on `window.online` (`useProvisions.js:1151-1156`). The 2 s list poll and the 20 s catalog/asks poll both pass `isPollingOpen()`.
  - iOS often doesn't deliver `online`/`offline` to a resumed PWA (`authHealth.js:46-53`). In practice, recovery is the next interval tick after `syncOnline()` flips.
  - So **the flush must hook the poll tick and `visibilitychange`, not only `online`.**
- **Can `mergePolledById` cover queued rows as it stands? Yes, unchanged** (`checkWrites.js:67-77`, called at `useProvisions.js:495`).
  - Any id in `pending` keeps its local value; so does any id stamped after the poll was requested.
  - If queued ids stay in `pendingCheckRef` until their flush write settles (and `touchCheck` stamps on settle, as it does today, `:1767`), no poll can wipe a waiting row, whatever order the flush and the refetch run in.
  - So the spec's "send before any refetch" isn't needed as an ordering rule. The merge already gives the guarantee.
- **One precondition:** `keep` only preserves ids already in `prev`. After a reload, the restored `checked` map must be seeded before the first poll lands.
- **Another wipe source:** `loadForHousehold` resets `checked` to `{}` at the start of every household load, including the A3 hold retries (`:948-967`). A queue restore has to happen after that reset, not before.

## 6. Cold start with no signal (Decision 2)

- **Nothing in the list's data is cached on the phone today.** The localStorage keys are prefs and holds only:
  - `op_shop_lens`, `op_showPrices`, `op_list_text_size`, `op_meal_library_view`, `op_landscape_hint_visits`.
  - `op_ask_handover:<hh>:<ask>`.
  - `activeHouseholdId:<clerkId>`.
  - `pending_invite_code` / `pending_ref_code` / `pending_gift_code`.
  - sessionStorage: `op_ask_held` plus the join/sign-up flags.
- **Nothing renders the list before the first fetch.** `loadForHousehold` clears state, fetches household → members → cook log → sessions → hidden → catalog → list, and holds on any transient failure (`useProvisions.js:943-1166`).
- **There's no service worker** (none in `src/` or `public/`). `index.html` is served `Cache-Control: public, max-age=0, must-revalidate`; the bundle `s-maxage=31536000, immutable` (CDN only). Read from the dev domain tonight.
- **So on the installed iPhone PWA and in Safari, "opening with no signal" can only mean resuming an app iOS kept in memory.** That already shows the last list, because it's React state.
  - A cold launch, or a reload with no signal, can't load the app shell. Expected from the headers; I haven't seen it on a device.
  - Even with a cached shell, Clerk can't confirm the session offline, and the auth gating (D4a) renders nothing household-scoped without a live session.
  - Decision 2 as written needs a service worker caching the shell, the bundle and clerk-js, plus a rule for showing the cached list before Clerk confirms the session. That is a slice of its own, and it touches the version check (WATCH: `registration.update()` + `skipWaiting` before Reload).

## 7. User and household keying

- **Deliberate sign-out:** `markDeliberateSignOut(); storeHeldAsk(null); signOut(…)` (`App.js:13195`).
  - Any end of a live session (deliberate or not) runs the in-memory reset in `useProvisions.js:810-856+`. `ActiveHouseholdContext.js:149-164` clears its households.
  - **The only `op_*` key cleared on sign-out is `op_ask_held`** (sessionStorage). Every localStorage `op_*` key survives sign-out by design (prefs; `activeHouseholdId:<clerkId>` is per user).
- **Household switch:** `switchHousehold` (`ActiveHouseholdContext.js:247-251`) writes `activeHouseholdId:<clerkId>`, and `loadForHousehold` resets the in-memory state (`useProvisions.js:948-967`). **No storage is cleared.**
- **The queue and cache need new code at both places.** Keying them `…:<clerkId>:<householdId>` and discarding any non-matching key on load also covers the non-deliberate session end (no code runs before the next user signs in).

## 8. Interactions with shipped work

- **Ask run:**
  - No conflict on the check path. An Ask run isn't the Shop, and `land_ask_picks` never sets `bought`.
  - A landing that re-needs a bought row stamps `updated_at = now()`, so it correctly beats an older queued uncheck.
  - Landing picks offline is unchanged: it fails, and it isn't queued (Decision 1).
- **085 `adjust_list_item_quantity`:** a check touches only `status`. No quantity, contributor or meal rows. But adjust **stamps `updated_at = now()` on a qty-only change of a pending row** (its lines 55 and 101). Under the spec's rule, a `+1` on Milk by B after A's offline tap would **silently drop A's check**. See A2.
- **Version check:** `show = newer && !dismissed && online` (`src/hooks/useVersionCheck.js:56`). It's hidden offline, but not gated on a pending queue. A Reload with a queue in localStorage loses nothing, but a Reload that lands while the signal is flaky can't load the shell (§6). Suggest hiding the notice while the queue isn't empty (A8).
- **Landscape Staples:**
  - No overlap: it adds, and adds stay roll-back (Decision 1).
  - Its guard test forbids list-state names in the landscape component (`src/components/LandscapeStaples.test.js:274`, `/checked|toggleChecked|listRows|…/`). Keep the queue out of that file.
- **Event log and session start:** `recordListEvent` calls `ensureSession` (`useProvisions.js:2080`), and that opens the shopping session and the store prompt on the first event of a trip.
  - With checks queued, the session would start at reconnect (send time), and the store prompt would appear then.
  - The event needs `created_at = tapAt`. The session start time is a ruling (A7).

## 9. Harness

- **Offline:** `page.setOfflineMode(true)` (CDP network emulation) is already used and passing in `tools/harness/version-walk.js:86-99` (20/20 on 11-22). It flips `navigator.onLine` and fires the events.
- **Across a reload:** untested, and it doesn't matter yet. With no service worker, a reload while offline can't load the shell.
- **What can be tested today:** `page.setRequestInterception` (already in `version-walk.js:17`) can block only `*.supabase.co` (and Clerk) while the shell loads from the network. That tests a restore-from-cache-and-queue path across a reload, short of real cold-offline.
- **Closest base:** `tools/harness/shop-burst.js`. Shop check burst, Undo fold, All done; Cody Test (`dan+clerk_test@velayo.ai`) in Cody Test House.
- **Second phone (V6-V8):** direct PostgREST writes with the same account's token, as `qty-race.js` does.
- **V9 (sign in as someone else):** the harness has one account, ruled never to join another household. V9 stays a phone walk, or needs a second harness account (Dan's call).

## Spec lines today's code makes wrong or ambiguous, with suggested fixes

- **A1. "update … set checked = $state" / "The current `toggleChecked` already does a conditional update".** There is no `checked` column; it's `status` (`'bought'|'pending'`). The existing condition is `status <> newStatus`, not a timestamp compare.
  - **Fix:** the column is `updated_at`. **Every check write, online or queued, sets `updated_at = tapAt`** and filters `updated_at < tapAt` alongside the existing `neq status`.
  - Without the online half, V6 fails.
  - Rollout caveat: phones still on older JS don't stamp it, so until they update, a stale queued tap can beat their check.
- **A2. "applies only if the item hasn't changed on the server since that tap".** `updated_at` also moves on qty-only changes, meal adds and decrements. A qty bump after an offline check would silently drop the check. Two options to rule on:
  - **(i)** Accept it: any newer change wins. No migration.
  - **(ii)** A check-only timestamp column. That's 088, which needs Dan's go per the spec. Not proposed in detail here.
- **A3. "On reconnect: send queued changes before applying any refetch".** Not needed as an ordering rule: `mergePolledById` already protects any id held in `pendingCheckRef`.
  - **Fix:** queued ids stay in `pendingCheckRef` until their write settles, and the restored map is seeded before the first poll.
  - **The flush trigger** is the poll tick, `visibilitychange` and `online`, not `online` alone (iOS rarely delivers it to a resumed PWA).
- **A4. "Offline tap".** "Offline" is ambiguous: `navigator.onLine` is a hint, and one bar fails with `onLine` true.
  - **Fix:** queue on any **transient** write failure, the same `classifyFetchError` class that today rolls back. Also queue without sending when `navigator.onLine === false`.
- **A5. The "Offline · N checks waiting to sync" pill.** While `navigator.onLine` is false, today's pill always reads "Reconnecting…" (`ConnectivityContext.js:74`).
  - **Fix:** the waiting copy takes over whenever the queue isn't empty, whatever the connection state. Rule what it says while online but still flushing.
- **A6. Decision 2: "Opening the app with no signal shows the last-loaded list".** Needs a service worker (shell, bundle, clerk-js) and an auth-gating exception. "A full offline-first app" is out of scope, so this has no home in the spec. Split it:
  - **Slice 1:** the queue, plus a cached list restored on any reload that can load the shell (a resumed app already keeps its list).
  - **Slice 2:** a service worker, with the version check's `registration.update()` + `skipWaiting`.
  - V1 and V4 ("force-close, reopen offline") move to slice 2. Slice 1's V4 becomes "force-close, reopen on weak signal": the shell loads, the API is blocked, and the waiting rows are still there.
- **A7. "Queued checks are logged when they're confirmed, with the tap time".** Possible today: the client can set `list_item_events.created_at`. But the first event also opens the shopping session and the store prompt (`ensureSession`).
  - **Rule:** does a trip started offline get its session at reconnect, with `started_at` as send time? Or backdated to the first tap?
- **A8. Version notice.** Not in the spec. Suggest hiding "A new version is ready" while the queue isn't empty (`useVersionCheck.js:56`), the same as during an Ask run.
- **A9. "Clear both on sign-out or a household switch".** Neither place clears storage today.
  - **Fix:** key both as `…:<clerkId>:<householdId>`, discard any non-matching key on load, and clear at `App.js:13195` and in `switchHousehold`. The key check also covers a non-deliberate session end.

Stopped here. Slice 1 hasn't been started. Over to the design chat and Dan for rulings on A2, A5's copy, A6's split and A7.
