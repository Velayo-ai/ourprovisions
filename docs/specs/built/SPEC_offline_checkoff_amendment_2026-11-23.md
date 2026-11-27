# SPEC amendment — Offline Check-off, 2026-11-23

**Amends:** `docs/specs/active/SPEC_offline_checkoff.md` (2026-11-08). Where they disagree, this wins.
**Scope:** OurProvisions · **Status:** ruled by Dan in the design chat, 2026-11-23. Ready to build slice 1 on dev.
**Source:** Claude Code's Step 0 report, `origin/relay` `ccce278` (prompt `2dcb05e`, dev `aacd5eb`).
**Migration:** 088 (dev first; prod only at promotion, before the client, per the migration discipline).

---

## Why this amendment

The 11-08 spec was written before the check-off fix (11-08), the poll-race hotfix (11-14) and
delta quantities (085). Step 0 found that its conflict rule names a column that doesn't exist
(`checked`) and a timestamp that today's check write never sets (`updated_at`), and that
Decision 2 (opening with no signal) can't be built without a service worker.

## Rulings (Dan, 2026-11-23)

| # | Ruling | Why |
|---|---|---|
| R1 (A2) | **Only check changes compete.** A quantity, price or meal change never cancels a queued check. New column `list_items.status_changed_at` (088). | A shopper's offline check of Milk shouldn't silently undo itself because someone bumped Milk +1. "Most recent tap wins" is about the check, not the row. |
| R2 (A6) | **Split into two slices.** Slice 1: the queue, plus the list restored on any reload that can load the app. Slice 2: a service worker for a true cold start with no signal. | A cold launch in a dead zone can't load the app shell today (no service worker; `index.html` is `max-age=0`), and Clerk can't confirm a session offline. That's its own slice, and it touches the version check. |
| R3 (A7) | **A trip started offline starts at its first tap.** The shopping session's start is backdated to the earliest queued tap. The store prompt shows once, at reconnect. | Trip timing feeds shopping-session learning later; it should be true. |
| R4 (A5) | **Two pill states.** Offline with checks waiting: "Offline · N checks waiting to sync". Back online while they send: "Syncing N checks…". The waiting copy takes over from "Reconnecting…" whenever the queue isn't empty. | Honest at every moment (the three-state principle). Today the pill reads "Reconnecting…" whenever `navigator.onLine` is false. |

Taken from the Step 0 report as written (no ruling needed): A1 (stamp every check write), A3
(no special ordering; the merge protects waiting rows), A4 (queue on any transient failure),
A8 (hide the version notice while checks wait), A9 (key and clear the stored queue).

## 088 — `status_changed_at`

- `list_items.status_changed_at timestamptz not null default now()`.
- **Backfill:** each row's newest `checked`/`unchecked` event time from `list_item_events` where
  one exists, else `updated_at`, else `created_at`. (Step 0: `updated_at` is stale on 183 of 184
  bought rows, so it is the fallback, not the source.) Claude Code: confirm the event-type names
  before writing the backfill.
- **Trigger** `trg_list_items_status_changed_at`, BEFORE UPDATE:
  - if `NEW.status IS DISTINCT FROM OLD.status` **and** the update didn't set the column itself
    (`NEW.status_changed_at IS NOT DISTINCT FROM OLD.status_changed_at`) → `NEW.status_changed_at = now()`.
  - otherwise leave it: a client-supplied tap time is kept; a qty-only change doesn't move it.
- **Why a trigger, not edits to each RPC:** every server path that changes status (085's re-need
  of a bought row, `land_ask_picks`, `add_meal_to_list` / `insert_list_item` upserts, the
  resurrect path) gets stamped without touching their bodies. It also closes Step 0's rollout
  caveat: a phone still on old JS that checks online changes `status` without setting the column,
  so the trigger stamps `now()` and that check correctly beats an older queued tap.
- **Interplay with existing triggers:** `trg_list_items_resurrect` and
  `trg_list_items_picked_by_guard` are also BEFORE UPDATE. Claude Code: state the firing order
  (alphabetical) and confirm none of them conflict. Inserts take the default.
- No grant changes (`authenticated` already has table-wide UPDATE under `list_items_update`).
- In-file fixture with a canary, as 085–087: a client-set value is kept; a status change without
  the column stamps `now()`; a qty-only update leaves it; an upsert-revive stamps it; the
  conditional update below returns 0 rows when a newer change won.

## The conflict rule (replaces "Most-recent-tap-wins: how")

Every check write, online or queued, is the existing `toggleChecked` `send`, plus a timestamp:

    update list_items
       set status = $want, status_changed_at = $tap_at
     where id = $id and household_id = $hh and deleted_at is null
       and status <> $want
       and status_changed_at < $tap_at

- Online taps stamp `tap_at` too (A1). Without it, V6 fails.
- Zero rows → read the row back and adopt the server's status (today's path). No notice (Decision 3).
- `$tap_at` is the phone's clock at the tap. Drift between phones is accepted (unchanged).

## Slice 1: what's in

1. **088 on dev**, read back by object and by fixture.
2. **The conflict rule** above on every check write.
3. **The queue** (`{ id, want, tapAt }`, localStorage), keyed `…:<clerkId>:<householdId>`; any
   non-matching key is discarded on load, never sent. Cleared at sign-out (`App.js` sign-out
   path) and in `switchHousehold`. Several taps on one item collapse to the final state; if that
   equals the last-synced state, drop it.
   - Queue on any **transient** write failure (`classifyFetchError`), and without sending when
     `navigator.onLine === false`. Non-transient failures keep today's rollback.
   - `toggleChecked` returns a fourth outcome, `"queued"`: the row stays in `pendingCheckRef`,
     keeps the Undo toast, and skips the 3 s hold and the move to In cart.
4. **The flush:** re-enqueue on the same `createRowWriteChain` with the stored `tapAt`, on the
   2 s poll tick, `visibilitychange` and `online` (iOS rarely delivers `online` to a resumed
   PWA). A fresh Clerk token at send time (unchanged rule). Rows leave `pendingCheckRef` only
   when their write settles. Confirmed rows slide into In cart together (one batch per flush).
5. **The cached list:** the last-loaded list and the catalog fields it needs, same key and same
   clearing as the queue. Restored **after** `loadForHousehold`'s state reset and **before** the
   first poll lands (`mergePolledById` only keeps ids already in `prev`). Covers a reload on weak
   signal where the app shell loads but the API fails.
6. **The look**, per the 11-08 approved mockup: the compact faded waiting row with the clock icon,
   in its aisle; the pill (R4); the offline All done card "All picked up · Will sync when you're
   back online" (counts waiting checks as checked).
7. **Events and the session (R3):** the confirmed event is recorded from the hook at flush time,
   with `created_at = tapAt`. The shopping session's start is the earliest queued tap. Dropped
   changes log nothing.
8. **Version notice:** hidden while the queue isn't empty (A8).
9. Keep queue code out of `LandscapeStaples.js` (its guard test forbids list-state names).

## Slice 2 (not now)

A service worker caching the shell, the bundle and clerk-js; a rule for showing the cached list
before Clerk confirms the session; the version check's Reload calls `registration.update()` +
`skipWaiting` first. Verify items 1 and 4 (true cold start) move here.

## Verify, slice 1 (replaces the 11-08 list for this slice)

Harness pre-walk first (`shop-burst.js` as the base; offline by `page.setOfflineMode`, weak
signal by blocking `*.supabase.co` with request interception; the second phone by direct
PostgREST writes, as `qty-race.js`). Then Dan on the installed iPhone on dev, Wi-Fi and cellular off.

1. With the app open, go offline. Check 3 items: each collapses in place to the waiting row,
   with no move. The pill reads "Offline · 3 checks waiting to sync".
2. Undo one and re-tap another's circle: both restore, and the count drops to 1.
3. Check one more, background the app, return: the 2 waiting rows are still there.
4. **Weak-signal reload** (harness: API blocked, shell loads): the list and the 2 waiting rows are restored.
5. Reconnect: "Syncing 2 checks…", then both slide into In cart together; the second phone shows them.
5b. Check every remaining item offline: the offline All done card. Reconnect: the normal card.
6. Conflict: A checks Milk offline; B unchecks Milk afterwards (online). A reconnects: Milk ends unchecked on both, no notice.
7. Reverse order (B changes first, then A taps offline): A's tap wins.
7b. **R1:** A checks Milk offline; B bumps Milk +1 afterwards. A reconnects: Milk is checked on both, quantity 2.
8. Item deleted on B while A checked it offline: no error; gone on both.
9. Sign out with checks waiting, sign in as someone else: no list, no queue, nothing sent (phone walk, or a second harness account, Dan's call).
10. The trip's shopping session starts at A's first offline tap (read on dev).
11. Online behaviour unchanged: the 11-14 burst walk still passes (`shop-burst.js`, 0 reverts).
