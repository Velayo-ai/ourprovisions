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
| C2 | **Superseded 23:07 by C9 (the Harbor dots).** ~~A small neutral cloud-off icon in the header.~~ The tap sheet's copy stands, moved behind the dots (C9). |
| C3 | **One calm note per trip** on the first switch to offline: "Shopping offline · everything's saved", for about 3 s, then gone. Flaky signal dropping in and out doesn't repeat it. |
| C4 | **Signal returning:** nothing appears. Dots clear as each change is confirmed. The indicator goes away. |
| C5 | **One bar counts as offline,** quietly: after a failed send the indicator shows; it clears after the next successful request. Never flick back and forth (hold the offline state at least ~10 s). |
| C6 | **All done works offline exactly as online,** including **Wrap up**: it's queued after the checks and finishes the trip on the server when signal returns. *(Confirmed by Dan, 20:50: worth the extra work to set the precedent that you're never at the mercy of a connection.)* |
| C7 | **Removed:** the amber pill, "Reconnecting…" while checks are waiting, "Offline · N checks waiting to sync", "Syncing N checks…", the compact faded waiting row, and the offline All done copy ("All picked up · will sync…"). |
| C8 | **Unchanged from slice 1:** the queue, 088's conflict rule, tap-time events, a trip's session starting at its first tap, the cached list, keying and clearing, the version notice hidden while changes wait. |

## C9 — The Velayo dots are the Harbor connection light (Dan, 2026-11-23 22:58–23:07)

The three dots in the header (top right) are the household's way into the Harbor (Brand Addendum,
March 2026: "not a generic overflow menu"). They now also say whether you're connected to it.
Replaces C2's cloud icon, which is removed.

| State | What shows |
|---|---|
| **Connected** | The dots, **steady**. |
| **Beacon** | A slow lighthouse sweep (each dot brightens in turn, ~1.5 s), **2 passes, then rest**. Plays: on app open, when the connection returns, on a tap of the dots, and **on every tab switch, only after that tab's first successful fetch** (it is a verified check, never decoration). Never loops. |
| **Not connected to the Harbor core** (sign-in + household data unreachable, C5's rules) | The dots are replaced by the word **OFFLINE**, in the same gold small caps as the household name. A label, never a badge: no red, no amber. |
| **Reduce Motion / Low Power Mode** | No sweep; steady dots. |

- **Tap (either state)** opens the household menu as today. Offline, its top carries C2's copy ("You're
  offline. Everything you do is saved on this phone and shares with your household when you're back in
  signal." plus "N changes will share when you're back." when changes wait). If the menu doesn't exist
  as described, Claude Code reports what the dots do today before building.
- Accessible name: "Connected to the Harbor" / "Offline". The fade between dots and word is one soft
  transition, once.
- **Why:** the brand carries the function, the same across every Velayo app; motion only when something
  just happened, so the shopping screen stays still (the calm principle); the beacon on a tab is a
  promise that tab's services just answered.

## Recorded, not built: partial service health (Harbor architecture, Dan 23:07)

As the fleet grows, one service can be down while the core is fine (OurChef, a calendar, receipt AI,
price comparison). Ruled design, to build when a second outside service exists:
- **The core** (sign-in + household data) down → OFFLINE (C9). Built now.
- **One service** down, core fine → the dots stay, **one dot becomes a hollow ring** ("something's
  limited, tap to see"). Dots never map to specific services.
- **The dots menu lists services** with a plain state each ("Recipe ideas · back soon", "Calendar · can't
  reach right now").
- **Where the feature lives**, it says so calmly in place; no error toasts. The core task never depends
  on an outside service.
- Mechanics: each service reports its last success or failure; each tab declares which services it
  needs; the tab's beacon waits on those.

## Known gap this principle opens (next slices, not this one)

Slice 1 queues only check and uncheck. **Adding an item, changing a quantity, removing an item and
editing a price still roll back offline,** which is exactly the limitation this principle rules out.
Next slices, in order: quantity changes (085's deltas replay cleanly), add, remove, price. Until then,
when one of those fails offline, the indicator's sheet says plainly "Adding items needs signal for
now"; no error toast.

## Verify (harness first, then Dan on the installed iPhone, Wi-Fi and cellular off)

1. Go offline: the calm note shows once, then OFFLINE replaces the dots. Drop and regain one bar repeatedly: no
   repeat note, no flicker.
2. Check 3 items: each looks and moves exactly as online, with a small dot in In cart. Toasts read as online.
3. Undo, re-tap, and an offline uncheck of a bought row: as online, the dot on the uncheck's circle.
4. Tap the dots offline (the word OFFLINE): the menu's offline lines, with "3 changes will share when you're back".
5. Background and return; a weak-signal reload (harness): the dots and the list are still there.
6. Reconnect: no message; the dots return with one beacon; the item dots clear; the second phone shows the checks.
7. Finish the list offline and tap Wrap up: the normal All done card and Wrap up; the trip closes on
   the server after reconnect.
8. Slice 1's conflict cases (V6, V7, V7b, V8) and V10 still pass; online unchanged (`shop-burst.js`).
9. Switch tabs online: one beacon after each tab's first fetch, none if the fetch fails; none with Reduce Motion.
