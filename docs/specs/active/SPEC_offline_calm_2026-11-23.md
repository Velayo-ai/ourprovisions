# SPEC amendment 2 — Offline is calm: as resilient as paper (2026-11-23, evening)

**Amends:** `SPEC_offline_checkoff.md` (11-08) and `SPEC_offline_checkoff_amendment_2026-11-23.md`.
Where they disagree, this wins.
**Scope:** OurProvisions (the principle applies across the Velayo fleet).
**Status:** ruled by Dan in the design chat, 2026-11-23 20:43–20:50 ET; confirmed in full on reading the spec. App only, no migration. Dev only.
**Supersedes:** 11-08 Decision 4 (offline checks stay in place) and its approved mockup's waiting row,
pill and offline All done card; amendment R4 (the two pill states); and tonight's departure rulings
3, 5 and 6 in prompt `4ec4683` (that prompt was never taken).

---

## The principle (Dan, 2026-11-23)

> For an average person to embrace an AI-powered app in place of a piece of paper, it has to be at
> least as resilient as paper: to the internet connection, and to the weather. Grocery stores have
> poor signal. Losing it must not feel like a limitation or a worry.

What that means in practice, for this and every later Velayo app:

1. **Offline is a mode, not a problem.** The app tells you once, calmly, that it has switched, then
   gets out of the way. Shopping looks and works the same.
2. **A simple offline / online indicator** is the only standing sign. It can explain why something
   isn't available or why a change hasn't shared yet, when you ask (tap). No alarms, counts or progress
   copy.
3. **Keep the list of things that need a connection short,** and shrink it slice by slice. Queue
   actions rather than block them. Where an action genuinely needs the network, say so through the
   indicator, plainly and once.
4. **Sharing happens on its own** when signal returns, with no announcement.
5. **You can always get the job done.** Some features and some collaboration may wait for signal; the core task never does. (Dan, 20:50)
6. **Still honest:** the app never implies something was shared when it wasn't (the 11-08 principle),
   but it says so quietly: a small mark, not a different screen.

## Rulings

| # | Ruling |
|---|---|
| C1 | **A check offline behaves exactly as online:** struck through, the 3 s hold, then the move to In cart. Same toast ("✓ Milk checked"), same grouped toast, same Undo. The only difference is a **small neutral dot** on the In cart row (and on an unchecked row's circle, for an offline uncheck) until the change is confirmed. The dot clears silently. |
| C2 | **The indicator:** a small, neutral offline icon in the header (no amber, no words beyond "Offline", no counts). Tap → a short sheet: "You're offline. Everything you do is saved on this phone and shares with your household when you're back in signal." If changes are waiting, one plain line: "3 changes will share when you're back." *(Confirmed by Dan on reading the spec, 20:50.)* |
| C3 | **One calm note per trip** on the first switch to offline: "Shopping offline · everything's saved", for about 3 s, then gone. Flaky signal dropping in and out doesn't repeat it. |
| C4 | **Signal returning:** nothing appears. Dots clear as each change is confirmed. The indicator goes away. |
| C5 | **One bar counts as offline,** quietly: after a failed send the indicator shows; it clears after the next successful request. Never flick back and forth (hold the offline state at least ~10 s). |
| C6 | **All done works offline exactly as online,** including **Wrap up**: it's queued after the checks and finishes the trip on the server when signal returns. *(Confirmed by Dan, 20:50: worth the extra work to set the precedent that you're never at the mercy of a connection.)* |
| C7 | **Removed:** the amber pill, "Reconnecting…" while checks are waiting, "Offline · N checks waiting to sync", "Syncing N checks…", the compact faded waiting row, and the offline All done copy ("All picked up · will sync…"). |
| C8 | **Unchanged from slice 1:** the queue, 088's conflict rule, tap-time events, a trip's session starting at its first tap, the cached list, keying and clearing, the version notice hidden while changes wait. |

## Known gap this principle opens (next slices, not this one)

Slice 1 queues only check and uncheck. **Adding an item, changing a quantity, removing an item and
editing a price still roll back offline,** which is exactly the limitation this principle rules out.
Next slices, in order: quantity changes (085's deltas replay cleanly), add, remove, price. Until then,
when one of those fails offline, the indicator's sheet says plainly "Adding items needs signal for
now"; no error toast.

## Verify (harness first, then Dan on the installed iPhone, Wi-Fi and cellular off)

1. Go offline: the calm note shows once, then the indicator. Drop and regain one bar repeatedly: no
   repeat note, no flicker.
2. Check 3 items: each looks and moves exactly as online, with a small dot in In cart. Toasts read as online.
3. Undo, re-tap, and an offline uncheck of a bought row: as online, the dot on the uncheck's circle.
4. Tap the indicator: the sheet, with "3 changes will share when you're back".
5. Background and return; a weak-signal reload (harness): the dots and the list are still there.
6. Reconnect: no message; the dots clear; the second phone shows the checks.
7. Finish the list offline and tap Wrap up: the normal All done card and Wrap up; the trip closes on
   the server after reconnect.
8. Slice 1's conflict cases (V6, V7, V7b, V8) and V10 still pass; online unchanged (`shop-burst.js`).
