# SPEC — Swipe-right-to-close on latched catalog rows

**Scope:** OurProvisions
**Type:** Frontend (App.js) — `SwipeToRemove` internals only, single commit
**Component:** `SwipeToRemove` (App.js ~line 26)

---

## Problem

Catalog rows (the `onEdit` branch) latch open at `-REVEAL_WIDTH` after a left swipe. The only way to close is tapping an action button (which calls `close()`). A user who swipes a row open and then wants to dismiss it without acting naturally swipes **right** — but today that only closes if the drag crosses the halfway point (`offsetX < -REVEAL_WIDTH/2`). A short right-flick on an open row snaps back open, which feels broken.

## Fix (handleEnd only — direction-aware close)

`handleMove` already drags correctly: line ~54 uses `baseOffset.current + dx`, so an already-open row (`baseOffset = -240`) follows the finger back toward 0 on a right drag, clamped by `Math.min(0, ...)`. **No change to handleMove.**

The only change is the **release decision** in `handleEnd`, the `onEdit` branch (was ~lines 63–68). Replace the pure halfway-snap with a direction-aware rule using the net gesture delta (`offsetX - baseOffset.current`) and a fixed pixel threshold.

> ⚠️ **Grep-before-edit.** Line numbers are from a possibly-stale tree. Grep for the exact `if (onEdit) {` block inside `handleEnd` before editing. Do not trust line numbers.

### Constants
Reuse the existing module-level `SWIPE_THRESHOLD` (= 60) — no new constant needed. (A 60px net move to register intent; matches the delete branch's feel.)

### Replace this (the `onEdit` branch of handleEnd):
```js
    if (onEdit) {
      if (offsetX < -REVEAL_WIDTH / 2) {
        setOffsetX(-REVEAL_WIDTH);
      } else {
        setOffsetX(0);
      }
    } else {
```

### With this:
```js
    if (onEdit) {
      const delta = offsetX - baseOffset.current; // + = dragged right, - = dragged left
      const startedOpen = baseOffset.current <= -REVEAL_WIDTH / 2;
      if (startedOpen) {
        // open row: a right drag past threshold closes; otherwise stay open
        if (delta > SWIPE_THRESHOLD) setOffsetX(0);
        else setOffsetX(-REVEAL_WIDTH);
      } else {
        // closed row: a left drag past threshold opens; otherwise stay closed
        if (delta < -SWIPE_THRESHOLD) setOffsetX(-REVEAL_WIDTH);
        else setOffsetX(0);
      }
    } else {
```

## Behavior after

| starting state | gesture | result |
|---|---|---|
| closed | left swipe > 60px | latches open |
| closed | left swipe < 60px | snaps back closed |
| open | right swipe > 60px | latches closed |
| open | right swipe < 60px | snaps back open |

Short flicks in either direction now work; an incomplete drag returns to its prior state.

## Explicitly OUT of scope (deferred — "wait until users complain")

- **Tap-away to close** — not built. Dan will watch whether users naturally swipe-right vs. reach to tap; build only if observed.
- **Single-open-at-a-time** — not built. Requires shared/lifted state across instances; own session if wanted.
- **Velocity-based flick** — fixed pixel threshold ships first (KISS); velocity is an Exceptional Design horizon.
- The non-`onEdit` (delete) branch — unchanged.

## Test (deployed dev preview, not localhost)

1. Catalog row: swipe left → latches open (Edit/Staple/Hide revealed).
2. Open row: swipe right firmly → latches closed.
3. Open row: tiny right nudge (<60px) → snaps back open (no accidental close).
4. Closed row: tiny left nudge (<60px) → stays closed (no accidental open).
5. Action buttons still close the row on tap (existing `close()` path intact).
6. Applies on both Browse and search rows (both use the same `SwipeToRemove`).
7. Shop-list delete rows (non-`onEdit`) still swipe-to-delete unchanged.
