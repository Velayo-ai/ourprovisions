# SPEC — Offline Check-off

**Scope:** OurProvisions · 2026-11-08
**Goal:** Shoppers can keep checking items off in a store with weak or no signal.
Checks and unchecks are saved on the phone and sync when the connection returns.
**Depends on:** the accidental-check fix (`c3f3e37` + `5c0d5fb` + `5030a5b`) reaching prod first.
**Status:** spec and mockup approved by Dan, 2026-11-08. Ready to build.

---

## Why

Grocery stores often have poor signal. Under the June offline spec
(`SPEC_offline_retry.md`), a write that fails offline rolls back, so today a
shopper in a dead zone can't check anything off. That spec named an offline
queue as future work. This is the narrow slice of it that shopping needs.

## Principle this is the first slice of (Dan, 2026-11-08)

**Velayo apps don't depend on a good connection.** Across OurProvisions and
future Velayo apps, every list item is in one of three states, each with its
own look:

1. **Untouched:** nothing has happened to it.
2. **Done and shared:** the action reached the server; everyone sees it.
3. **Done, waiting to share:** saved on this phone and queued; it syncs on
   reconnect. Always visually distinct from state 2, so the app never implies
   something was shared when it wasn't.

This spec builds that model for **shopping-list check-off only**. Other actions
(add, quantity, remove) and other lists adopt it later, one at a time, each
with its own small conflict rule. The waiting style, queue and token handling
built here are meant to be reused, not rebuilt.

## Decisions (Dan, 2026-11-08)

| # | Decision | Why |
|---|---|---|
| 1 | Queue **only check and uncheck**. Add, quantity, price and delete keep June's behavior (roll back and re-tap). | Check-off is one yes/no value per item, so it's low-conflict and safe to replay. Keeps this to a session or two. |
| 2 | **Opening the app with no signal shows the last-loaded list.** | Otherwise the queue only helps if the app was opened before entering the store. |
| 3 | **Most recent tap wins, silently.** No notice to anyone when a conflict resolves. | By the time it syncs, the moment has passed. A notice would be noise. |
| 4 | **Offline checks stay in place.** A row checked offline doesn't move to In cart. It shrinks to a compact, faded line with a small "waiting" icon. The pill reads "Offline · N checks waiting to sync". On reconnect, the waiting rows sync and then slide into In cart together. | The list itself shows what hasn't been shared yet: a checked item that hasn't moved hasn't reached anyone else. Compact rows keep a long offline shop readable, so the eye goes to what's left. Keeps June's rule that nobody sees a saved-looking change that didn't save. |
| 5 | **All done works offline,** worded honestly: "All picked up · will sync when you're back online". | Finishing in a dead zone should still feel finished. |

## Behavior

**Online (unchanged):** check → struck through for 3s → moves to In cart.

**Offline tap:** the row checks and collapses in place to the compact, faded
"waiting" style. **No 3s hold and no move to In cart.** The Undo toast still
shows, for consistency. The change goes into the on-device queue instead of
rolling back.

**Undo or re-tap while offline:** tapping a waiting row's circle, or Undo,
unchecks it, restores the full row, and removes the change from the queue.
Nothing is sent.

**On reconnect, visually:** once a waiting check is confirmed by the server, it
slides into In cart. Batch the slide so the rows move together, not one by one.
A change that loses a conflict (decision 3) restores to the server's state with
no notice.

**Several taps on one item while offline:** collapse them to its final state.
If that matches the item's last-synced state, drop it from the queue.

**On reconnect:** send queued changes **before** applying any refetch or
realtime catch-up, so fresh server data doesn't erase the pending checks on
screen. Then refetch. Clear the pending marks as each change is confirmed.

**All done card:** works offline. It counts waiting checks as checked and reads
"All picked up · will sync when you're back online". After reconnecting and
syncing, it shows the normal card.

**Mockup approved (Dan, 2026-11-08):** compact faded waiting row with a clock
icon, struck-through name, still in its aisle; amber pill "Offline · N checks
waiting to sync"; offline All done card "All picked up · Will sync when you're
back online". Build to this; match OurProvisions' existing tokens.

## Most-recent-tap-wins: how

Each queued change carries the **time of the tap** (from the phone's clock).
When it's sent, the update applies only if the item hasn't changed on the
server since that tap:

    update list_items set checked = $state, <timestamp col> = $tap_at
    where id = $id and <timestamp col> < $tap_at

- Zero rows updated means a newer change won, or the item was deleted. Drop it
  silently and take the server state.
- The current `toggleChecked` already does a conditional update with a zero-row
  check. Extend that rather than adding a second write path.

⚠ **Verify first:** does `list_items` have a column recording when a row was
last changed, and is it set on **every** update (by trigger, not by client
code)? If not, this needs a migration. Treat it as a DB change: dev first, then
promote, following the migration discipline. **Stop and tell Dan before adding
one.**

Clock differences between phones are accepted. At grocery-trip scale, a few
seconds of drift doesn't matter.

## Stored on the phone

- **The queue:** pending changes as `{ item id, checked state, tap time }`.
  Survives the app closing and the phone locking.
- **The cached list:** the household's last-loaded list and the catalog fields
  it needs to display it. Shown under June's "Offline — showing last saved" pill.
- Both are keyed to the signed-in user and household. **Clear both on sign-out
  or a household switch.** A shared phone must never show the previous user's
  list or send their queue.
- A queue left over from a different user or household is discarded, never sent.

## Sign-in tokens

Clerk tokens last about a minute and can't be refreshed offline. A queued
change must **get a fresh token when it's sent** on reconnect, never reuse one
captured at tap time. If no token is available at send time:
- **Device still offline:** keep the change queued, send nothing.
- **Online, but Clerk has no session (signed out):** don't send. Follow the
  sign-out rule under "Stored on the phone" (discard the queue).

Builds on `5c0d5fb`, which classifies "no token while offline" as transient.

## Event log

Queued checks are logged when they're confirmed, with the **tap time**, not the
send time. Dropped changes (lost a conflict, or undone offline) log nothing.

## Out of scope

- Queuing add, quantity, price, delete or any other write
- A full offline-first app
- Any conflict notice or history (decision 3)

## Verify (real phones, Wi-Fi **and** cellular off)

1. Open the app with no signal: the last-loaded list appears with the Offline pill.
2. Check 3 items offline: each collapses in place to the compact waiting row and
   doesn't move. The pill reads "Offline · 3 checks waiting to sync".
3. Undo one, and re-tap another's circle: both restore to full rows, and the count drops to 1.
4. Check one more, force-close the app, reopen it offline: the 2 waiting rows are still there.
5. Reconnect: both sync, slide into In cart together, and the second phone shows them.
5b. Check every remaining item offline: "All picked up · will sync when you're
    back online" appears. Reconnect: the normal All done card replaces it.
6. Conflict: phone A goes offline and checks Milk. Phone B, online, unchecks Milk
   *after* A's tap. A reconnects: Milk ends unchecked on both, with no notice.
7. Reverse order (B changes first, then A taps offline): A's tap wins.
8. Item deleted on B while A checked it offline: A reconnects with no error, and
   the item is gone on both.
9. Sign out while checks are pending, then sign in as someone else: no list or
   queue from the first user, and nothing gets sent.
10. Online behavior is unchanged: tonight's walk still passes.
