// Quantity rollback after a failed write (2026-11-08). The stepper's value goes
// back to what the server last said: a live row's quantity from the last poll,
// or no entry at all for a row that was never on the list (pre:<catalog id>).
// Deleting a live row's entry instead would read as 0 until the next poll —
// and offline the poll is closed, so 0 would stand until reconnect.
//
// Both failure classes roll back. There is no offline queue for quantity
// writes: a transient failure is never retried, and once the in-flight mark
// clears the next poll would quietly revert the number anyway. Keeping it on
// screen meanwhile is a save that never happened.
export function rollbackQty(prev, key, serverRows) {
  if (!key || !(key in prev)) return prev;
  const n = { ...prev };
  const row = (serverRows || []).find((r) => r.id === key);
  if (row) n[key] = row.quantity;
  else delete n[key];
  return n;
}
