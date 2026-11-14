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

// At most this many per-row "✓ {item} checked · Undo" toasts; the next live check folds them (2026-11-14).
export const UNDO_CAP = 3;

// THE UNDO STACK (2026-11-07; the fold 2026-11-14). State: { entries, folded, groupKey }.
// entries — one per checked row still in its Undo window, newest last. A row checked again replaces its
//   old entry (new key), so one Undo never reverts a different check of the same row.
// folded — false: each entry is its own toast with its own UNDO_MS timer. Once a push makes more than
//   UNDO_CAP live entries, they fold into ONE group toast, "✓ {n} items in cart · Undo all", n = every
//   entry still there. The group stays folded until it is empty or its timer expires.
// groupKey — the group's one timer. Every push while folded bumps it (the caller restarts the timer);
//   a stale group timer (an old key) can't drop a newer group.
// Taking one id out (a tap on the row during its hold, Undo, a failed write) lowers n; the group stays
// folded. While folded, per-row timers no longer drop anything: the group's timer does.
export const EMPTY_UNDO = { entries: [], folded: false, groupKey: 0 };

export function pushUndo(state, entry, cap = UNDO_CAP) {
  const entries = [...state.entries.filter((u) => u.id !== entry.id), entry];
  const folded = state.folded || entries.length > cap;
  return { entries, folded, groupKey: folded ? state.groupKey + 1 : state.groupKey };
}
// Take one id out (any key, or only that key when given). An emptied group unfolds.
export function dropUndo(state, id, key) {
  const entries = state.entries.filter((u) => !(u.id === id && (key === undefined || u.key === key)));
  if (entries.length === state.entries.length) return state;
  return { ...state, entries, folded: entries.length > 0 && state.folded };
}
// A row's own timer ran out: it drops that entry only while the toasts are separate.
export function expireUndo(state, id, key) {
  return state.folded ? state : dropUndo(state, id, key);
}
// The group's timer ran out: the whole group drops — unless a newer check restarted it.
export function expireGroup(state, groupKey) {
  return state.folded && state.groupKey === groupKey ? { ...EMPTY_UNDO, groupKey: state.groupKey } : state;
}
// Undo all: the ids still checked, in check order. Each goes through the row's own undo (its own write
// chain), so there is no batch write; rows someone already unchecked are skipped.
export function undoAllIds(state, isChecked) {
  return state.entries.map((u) => u.id).filter((id) => isChecked(id));
}
// "All done" waits while any Undo is still up, separate or folded.
export const undoSettling = (state) => state.entries.length > 0;
