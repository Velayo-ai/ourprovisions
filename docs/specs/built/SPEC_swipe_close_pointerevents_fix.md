# SPEC — Fix: swipe-right-to-close blocked by pointerEvents on latched row

**Scope:** OurProvisions
**Type:** Frontend (App.js) — one-line fix in `SwipeToRemove`, single commit
**Follows:** `212dfed` (swipe close-gesture). That commit's `handleEnd` logic is correct; this unblocks it.

---

## Problem

`212dfed` added direction-aware close in `handleEnd`, but swipe-right does nothing on a fully-open row. Root cause is the draggable content layer's `pointerEvents`:

```js
pointerEvents: offsetX <= -REVEAL_WIDTH ? "none" : "auto",
```

When fully latched open, `offsetX === -REVEAL_WIDTH`, so `pointerEvents` becomes `"none"` — the content div stops receiving pointer events, so `onMouseDown`/`onTouchStart` never fire and the swipe-right gesture cannot even **start**. The `handleEnd` close logic is never reached. This predates the close-gesture feature (it was there to let taps fall through to the action buttons behind the content) and now collides with it.

## Fix

> ⚠️ **Grep-before-edit.** Grep for the exact `pointerEvents:` line in the draggable content `<div>` of `SwipeToRemove` (was ~App.js:151). Do not trust the line number.

Change the content layer's `pointerEvents` from the conditional to unconditional `"auto"`:

### From:
```js
          pointerEvents: offsetX <= -REVEAL_WIDTH ? "none" : "auto",
```

### To:
```js
          pointerEvents: "auto",
```

### Why this is safe
The action buttons live in an absolutely-positioned panel (`position: absolute; right: 0`) underneath the content. When open, the content is `translateX(-240px)` — slid off the right edge, no longer overlapping the buttons. So the content layer keeping `pointerEvents: auto` does NOT re-block button taps; the buttons sit in the exposed gap. Removing the `none` only restores the content's ability to receive the start of a swipe-right.

## Test (deployed dev preview, hard-refresh first)

1. **The fix:** catalog row swipe left → open → swipe right firmly (>60px) → **latches closed.** (This was broken before.)
2. Open row: tiny right nudge (<60px) → snaps back open.
3. **Regression — buttons:** with a row open, tap Edit / Staple / Hide → each still fires and closes the row (the `close()` path). Confirm the content layer is NOT swallowing these taps.
4. Search rows: same open → swipe-right-close works (shared component).
5. Shop-list delete rows (non-`onEdit`) unchanged.

If test 3 reveals the content now blocks button taps (unexpected, given the translate), fall back to a narrower rule that allows pointer-start but not over the button region — but try the simple unconditional `"auto"` first.
