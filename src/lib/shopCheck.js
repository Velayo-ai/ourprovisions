// Shop check-off guards (accidental check-offs while shopping, 2026-11-07). The phone is in one hand
// and the other is grabbing items, so a thumb or palm brushing the list must not check anything off,
// and a check that does land by accident must be one tap to take back.

// A touch held longer than this is a grip, not a tap.
export const GRIP_HOLD_MS = 500;
// A touch that travelled further than this between down and up is a scroll or a swipe, not a tap.
export const GRIP_MOVE_PX = 10;
// A checked row stays in its aisle, struck through, this long before it moves to the In cart tray.
export const CHECK_HOLD_MS = 3000;
// How long each "✓ {item} checked · Undo" toast stays up.
export const UNDO_MS = 5000;

// A pointer record: { pointerType, downAt, upAt, maxMove, cancelled }. Only TOUCH is filtered:
// a mouse click or a keyboard activation always counts. A cancelled touch (the browser took it over
// for a scroll) never counts. upAt is missing when the click arrived without a pointerup we saw.
export function isGripTouch(p) {
  if (!p || p.pointerType !== "touch") return false;
  if (p.cancelled) return true;
  const end = typeof p.upAt === "number" ? p.upAt : p.downAt;
  if (end - p.downAt > GRIP_HOLD_MS) return true;
  return (p.maxMove || 0) > GRIP_MOVE_PX;
}

export const pointerDistance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

// The undo stack: one entry per checked row, newest last. A row checked again replaces its old entry,
// so one Undo never reverts a different check of the same row.
export function pushUndo(list, entry) {
  return [...list.filter((u) => u.id !== entry.id), entry];
}
export function dropUndo(list, id, key) {
  return list.filter((u) => !(u.id === id && (key === undefined || u.key === key)));
}
