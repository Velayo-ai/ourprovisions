# SPEC — Landscape = Staples (Browse shortcut)

**Scope:** OurProvisions · app-wide on phones (originally Browse only) · UI only
**Status:** Decided 2026-11-11 (design chat) — ready for Claude Code
**DB changes:** None. Uses the existing Staples flag + pill.

## The idea
Anywhere in the app, turning the phone sideways **is** the Staples shortcut. Open the app, rotate, tap the basics, rotate back to add the one or two extras. No buttons, no filter fiddling.

## Decision (the "why")
Landscape is a **separate, fixed view**, not a filter state.

- Landscape always shows **Staples only**. It ignores the portrait filter pills and search entirely: it doesn't read them, change them or restore them.
- Portrait is the normal experience and is **untouched** by rotation. Rotate back → the same filters, search text and scroll position as before.
- Landscape has **no filter or search UI**. To leave, rotate back. That's deliberate: it keeps the shortcut a one-purpose tool.
- Chosen over a "save/restore filters" model (discussed and rejected) because two independent views remove that state logic and edge cases completely.

The view's contents come from a single constant, `LANDSCAPE_PRESET = ['staples']`, so a future "configure your landscape filter" setting stays a small change. **Not building that now.** Waiting to see if users ask for it.

## Principle (decided 2026-11-11)
**Landscape belongs to Staples unless a screen claims it.** It's opt-out, not opt-in. Turning the phone is OurProvisions' signature gesture for "what do we always need?" from anywhere in the app. As staples move from pinned to learned (Phase 2 shopping-session learning), this becomes the app's view of what the household needs. No current tab needs landscape space for itself.

**Accessibility:** the portrait Staples pill is the accessible, non-rotation path to the same items. It must never be removed.

**Guardrail (from Elly's testing):** new users confuse *building* the list with *shopping* from it when they see two views of the same list. So the landscape view must stay purely an **add palette**: it never shows list state such as checked-off or in-cart status, and it is never a second view of the list. Rotating in Shop is allowed because adding a forgotten staple mid-trip is the right outcome. **Test with Elly in Shop**; if it confuses, excluding Shop is a one-line opt-out.

## Trigger rules (must hold)
| Condition | Landscape Staples view? |
|---|---|
| Phone, **any tab** (Home / Plan / Browse / Shop), rotated to landscape | **Yes**. App-wide since 2026-11-11 (originally Browse-only) |
| Ask Easton run in progress | No (kids rotate constantly; mid-task flow) |
| A text input focused (edit sheet, search) | No (keyboard guard) |
| A future screen that claims landscape (e.g. ourChef cook mode, video) | No. It sets an opt-out flag |
| Desktop or laptop browser (always landscape) | **No** |
| Tablet (incl. unfolded foldables) | **No, by design.** Phones only |
| Phone with portrait orientation lock | No. The Staples pill still works as today |

**Phones only (decided 2026-11-11).** Tablets have room for a full catalog in landscape and are often used propped up in landscape, so rotating them isn't a deliberate gesture. They keep the normal Browse in both orientations and may get their own landscape behavior later. Detect a phone by the screen's short side, not by the user agent: landscape phones are ~320–450px tall, while tablets and unfolded foldables are ~600px+.

**Phone gate:** `(pointer: coarse)` AND landscape AND viewport height ≤ 500px. Evaluate on orientation/resize **change**, never just "is landscape" on load. Otherwise every desktop session opens in Staples view.

**Debounce:** ~300ms before switching, so a half-tilt doesn't flicker.

## Landscape layout
- Flat grid of tiles, sorted by category, **no category headers** (the height is limited).
- Tiles **auto-size to fill the screen**: with few staples they grow; they shrink to a minimum (~120px wide × 48px tall, ≥ 44px tap target) and only then does the grid scroll vertically.
- **Tap toggles your own adds; hold removes existing items** (decided 2026-11-11).
  - Tap a tile not on the list → add qty 1.
  - Tap a tile added during *this* landscape visit → remove it (undo your own tap).
  - Tap a tile that was already on the list when the visit began → no write; hint "Hold to remove".
  - Press-and-hold any listed tile → remove at any qty, with the same gesture, duration and fill as the Ask Easton "Done" pill.
  - Each rotation into landscape starts a new visit.
  - Why decide by visit, not quantity: a qty-based rule would let one mis-tap delete a qty-1 item another household member added, and its behavior would be invisible to the user. The visit rule makes "tap again" a natural undo and puts protection where it matters. It replaced, in order, a "remove only at qty 1" guard, an undo-toast idea, and a tap-adds/hold-removes-only rule.
- Listed tiles use the same on-list treatment as portrait rows (lighter background + tan/gold border, 2px), plus a gold qty badge. Dark brown is reserved for active filters and tabs. Quantity steppers stay in portrait.
- Header: the shared `CategoryHeader` component, the same one portrait category headers (PRODUCE, DAIRY) use: **⭐ STAPLES** in tracked uppercase with the gold rule spanning the grid width. 18px above, 14px from the rule to the first row. No instructions on how to leave: the gesture is learned after one use.
- First-run hint "Tap to add · Hold to remove" at the right end of the header line (the "+ New item" slot), shown for the first 3 landscape visits per device, then hidden for good.
- When the grid is scrolled, tiles fade out just under the rule.
- Empty state (no staples): three centered lines, max-width ~440px, no emoji, button or illustration: "Your everyday essentials" (header color, bold 17px) / "Star the items you buy most, and they'll be one turn of your phone away." (muted 15px) / "In Browse, swipe left on any item and tap Staple." (muted 13px). It's the first impression of the gesture for new households. Test: it should feel like opening a familiar drawer, even when empty.
- Bottom nav may be hidden in landscape to give the grid the room.

## Return to portrait
- Restore the portrait view exactly as it was (it never changed).
- Toast: **"N staples added"**, counting only what was added during that landscape visit. Skip the toast if N = 0.
- Adds are real list writes (same path as the Add button): realtime, offline queue, all unchanged.

## Platform notes
- **Web (now):** `matchMedia('(orientation: landscape)')` + the phone gate above. No Screen Orientation lock API needed (iOS Safari doesn't support it anyway).
- **Expo (later):** `expo-screen-orientation` listener; same rules.

## Verify (done when)
1. Phone, Browse, rotate → Staples grid appears; Produce/other pills ignored.
2. Set filters + search in portrait, rotate in and out → portrait identical to before.
3. Add 3 staples in landscape, rotate back → "3 staples added"; items on the list (and live on a second device).
4. Desktop browser at any width → never shows the landscape view.
4b. iPad / tablet rotated to landscape in Browse → normal Browse, no Staples view.
5. Rotate on Home / Plan / Shop → Staples view; rotate back → the same tab and state. Ask Easton run in progress → no Staples view.
6. Quick tilt-and-back (<300ms) → no flicker.
