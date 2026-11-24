Reported: 2026-11-23 22:45 ET · dev 4cc626a · main 54d453c · re: Offline check-off — make offline calm (SPEC_offline_calm), dev only (2026-11-23 evening) · prompt 871a167

# Offline is calm: built on dev, harness 47/47, ready for Dan's iPhone walk

**Deployed:** dev `4cc626a` (`dpl_8yzc2MMAcimEkxkBkVNM84232A4t`, `main.bbc043ef.js`, build tag `dev · 4cc626a`). App only, no migration. Prod untouched (`54d453c`).
**Commits:** `f2e9045` the build (C1–C7 + the queued Wrap up; spec copied to `docs/specs/active/SPEC_offline_calm_2026-11-23.md`), `4cc626a` harness. `b9803e8` (two harness-only fixes, below) is **local, not pushed**.
**Gates:** Jest 83 suites / 1236 tests green; `CI=true` build green, before the push.

## What's built
- **C1:** an offline check behaves exactly as online: the 3 s hold, the move to In cart, the same toast, grouped toast and Undo. A small neutral dot sits at the circle's shoulder: on the In cart row for a check, on the aisle row's circle for an offline uncheck. Each dot clears silently when its change is confirmed.
- **C2:** a small neutral cloud-off icon in the header beside the avatar, icon only (there's no room for the word beside a centred place name at 390 px). Tapping it opens a sheet with the ruled copy, plus "N changes will share when you're back." when changes wait. A queued Wrap up counts as one change.
- **C3:** "Shopping offline · everything's saved" shows about 3 s in the bottom status stack, once per trip. The trip is stamped in localStorage, cleared at Wrap up, and treated as a new trip after 8 h.
- **C4:** nothing appears on the way back. The dots clear and the icon goes.
- **C5:** one failed request counts as offline. The icon clears only after the next successful request plus **10 s of steady signal since the last drop**. I counted the hold from the last drop rather than from when the icon appeared: counted from onset, a long flaky spell flicked the icon off during any good second.
- **C6:** Wrap up works offline (below).
- **C7:** removed, not left unreachable:
  - `ConnectivityPill.js` and `pillState.js` (+ test) are deleted.
  - Gone: the waiting row and its CSS, the clock, the "Offline · N checks waiting to sync" / "Syncing N checks…" copy, the slide-together effect, and the offline All done card.
- **C8:** unchanged: the queue, 088's rule, tap-time events, a trip starting at its first tap, the cached list and its keying/clearing, and the version notice hidden while changes wait (now also while a Wrap up waits).
- **Known gap (spec "until then"):** a transient failure of an add, a quantity change, a removal or a price no longer toasts. It reports offline and the sheet says "Adding items / Changing quantities / Removing items / Editing prices needs signal for now." Non-transient failures still toast as before.

## C6: what Wrap up writes today (online, unchanged), and the queued version
Online `wrapUpTrip`, in order:
1. If there's no open cycle, insert one (`provision_cycles`, via `ensureOpenCycle`).
2. `shopping_sessions.ended_at = now()` on this person's open session.
3. Select the household's pending `list_items` to turn the roll-forward names into ids.
4. RPC `archive_trip_items(household, keep = roll ids)`. This soft-deletes **every** bought row and every pending row not in keep, and deletes contributor rows except for keep.
5. RPC `close_cycle(cycle, roll ids)`. This sets `closed_at`, `item_count`, `sessions_count`, stamps `meal_placements.ready_at`, opens a new cycle and upserts the rolled rows into it.
6. Read the new cycle, then reload the list.

**Queued version: the same tables and the same two RPCs; no migration, no new RPC.**
- A Wrap up is queued when tapped offline, or online while checks still wait. It stores `{ tapAt, dropIds, hideIds }`, keyed per person and place like the queue, and cleared the same way.
- On the phone the trip is over at once: the same trip summary, the list wrapped up, and the store prompt held back. The verdict fetch fails offline, so the summary shows in its plain state.
- On the next flush, the checks tapped **before** the Wrap up go first, then their events (the trip's session starts at the first tap, R3).
- Then the replay runs, in order:
  1. Adopt this person's open session and end it at the **Wrap up tap time**.
  2. Read the open cycle fresh, or create one if a partner wrapped up meanwhile.
  3. Read the server's pending rows; `archive_trip_items`; `close_cycle`; reload.
- Checks tapped **after** the Wrap up wait until it has landed (they belong to the next trip).
- **One difference from replaying literally:** keep and the roll list are every row pending on the server at replay time, minus the rows the person chose not to carry (`dropIds`). Replaying `archive_trip_items` as is would archive a partner's add made during the offline trip. You approved this before the push.
- **Not exact:** `close_cycle` stamps `closed_at` and `ready_at` with the server's `now()`, so the cycle closes at the reconnect, not at the tap. Only `ended_at` carries the tap time. Making them match needs a new RPC parameter, which means a migration. I didn't do it; your call.
- **Small risk:** if `close_cycle` commits but its answer is lost, the replay retries. It would close the new cycle too: an extra empty cycle, with the carried rows rolled again. No rows are lost.
- A household switch clears a queued Wrap up, as A9 already clears queued checks.

## Harness pre-walk: `offline-walk.js` on the dev preview (`main.bbc043ef.js`): 47/47 PASS
- **V1:** the note shows once, then the icon. Six device drops plus a spell of API failures: the note showed once, and the icon never flicked off.
- **V2:** three offline checks hold in place, struck through, then move to In cart (tray 1→4). There's a dot on exactly those three rows. Toasts read "✓ Apples checked" and so on. No old copy anywhere, and nothing on the server.
- **V3:** a re-tap from In cart and an Undo on a toast both put the item back with no dot. An offline uncheck of a server-bought row moves back with the dot on its circle. Three changes stored.
- **V4:** the sheet shows the ruled copy and "3 changes will share when you're back."
- **V5:** after background and return, then a weak-signal reload (device online, API blocked), the list and all three dots are restored. The icon shows on one bar. Nothing on the server.
- **V6:** on reconnect the dots clear, nothing stays queued, the icon goes, and no status message appears. The server has the checks stamped with their tap times. Tab B shows them. The session starts at the first offline tap, and each check is logged once at its tap time.
- **V8:** slice 1's V6, V7, V7b and V8 all pass.
- **V7:** every item checked offline gives the normal "All done." card with Wrap up. Wrap up offline shows the trip summary, and the Wrap up waits on the phone behind 2 checks. The list on the phone is empty while the server still has all 6 rows.
  - On reconnect the trip's rows are archived and the cycle is closed.
  - The session ended at the tap (03:38:37.6 vs the tap ≈ 03:38:36.6 UTC).
  - The partner's add made during the trip stayed on the list, carried forward and shown to find.

Runs: the 1st failed at setup because Cody Test House's list was empty at load, so the landing rule opened Home (slice 1 always had rows). The 2nd was 46/47: the Wrap up button text is uppercased by CSS. Both are harness fixes, in `b9803e8`; the 3rd run was 47/47. A 4th run went by mistake with its output discarded. Read back on dev, it completed and tidied: Cody Test House has 0 live rows and 0 open sessions. The 1st run crashed before tidying; I soft-deleted its 7 rows and their contributor rows on dev. The test house now holds 3 extra closed cycles and 3 ended trips from the walks.

**`shop-burst.js` revert mode** (`OP_BURST_REVERTS=5`): 5 bursts of 6 checks, 0 reverted. Online is unchanged.

## For your iPhone walk (things the harness can't see)
- How the icon looks in the header next to a long place name.
- The dot's size and colour on a real screen.
- The note's look, and that it doesn't come back on flaky signal.
- The offline hold feeling exactly like online.
- Airplane mode on a resumed installed app: the icon, then the dots clearing on return.
- Wrap up in airplane mode, then the trip closing after reconnect (second phone).

## Open
- `b9803e8` (harness only) is local on dev. It rides the next dev push or goes alone: your call.
- At SESSION END, add to ROADMAP NEXT as the prompt asks: `shop-burst.js` fold mode fails "Undo all puts all 6 back" (1 of 6); it predates offline check-off.
- One judgement to confirm: the connectivity pill is gone **app-wide**, not only in Shop. That includes "Reconnecting…" during a token hold and "Back online". The header icon is now the only sign, per principle 2 and C4.

Stopped. Not merged to main.
