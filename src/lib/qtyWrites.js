// Quantity changes are deltas (SPEC_qty_increment §6.2; 085 adjust_list_item_quantity).
//
// The phone sends "+1" / "−1", never a total, and the server applies it under the household lock,
// so a concurrent Ask pick or another phone's tap is never overwritten. This queue keeps ONE request
// in flight per item; taps that arrive meanwhile ADD UP into one queued delta, sent when the
// in-flight request settles. Five fast taps become +1, then +4. Nothing is dropped or aborted:
// unlike a check, a delta that may already have reached the server can't be safely replaced.
//
// Keyed by catalog item id: the RPC's own identity for the row (household, catalog item). A row
// id appears only after the insert, so the display key can change mid-burst; this key can't.
//
//   createQtyQueue({ send, onSend, onDone })
//     send(key, delta)        → Promise<result>          the RPC (|delta| ≤ MAX_DELTA)
//     onSend(key, delta)      — just before each request  (stamp the row)
//     onDone(key, { ok, result, error, drained })
//                             — after each request settles. drained = nothing in flight or
//                               queued for this key any more: only then adopt the server's number.
//   queue.tap(key, delta) → Promise<{ ok, result } | { ok: false, error }>
//     resolves when the request that CARRIED this tap settles. A failure drops whatever was
//     queued behind it, and those taps resolve as failed too (no retry, Q9).
//   queue.busy(key) → a request is in flight or queued for key.

export const MAX_DELTA = 99;   // 085 refuses |delta| > 99 (Q2); a bigger queued sum goes in parts

export function createQtyQueue({ send, onSend = () => {}, onDone = () => {} }) {
  const rows = new Map();   // key → { inFlight, queued, waiters: [resolve] (queued taps) }

  const finish = (key, row) => {
    if (!row.inFlight && row.queued === 0 && row.waiters.length === 0) rows.delete(key);
  };

  const fire = (key, row) => {
    // Defensive: never send 0 (085 refuses it). The success path already treats a zero sum as drained.
    if (row.queued === 0) {
      const waiters = row.waiters.splice(0);
      waiters.forEach((w) => w({ ok: true, result: null }));
      finish(key, row);
      return;
    }
    const sign = row.queued > 0 ? 1 : -1;
    const delta = sign * Math.min(Math.abs(row.queued), MAX_DELTA);
    row.queued -= delta;
    // Every waiter so far rides this request, unless part of the sum is still queued: then they
    // ride the last part.
    const carried = row.queued === 0 ? row.waiters.splice(0) : [];
    row.inFlight = true;
    onSend(key, delta);
    Promise.resolve()
      .then(() => send(key, delta))
      .then(
        (result) => {
          row.inFlight = false;
          // Drained when nothing is left to send. Taps that netted to zero while this was in flight
          // (+1 then −1) send nothing and ride this answer.
          const drained = row.queued === 0;
          const riders = drained ? carried.concat(row.waiters.splice(0)) : carried;
          onDone(key, { ok: true, result, drained });
          riders.forEach((w) => w({ ok: true, result }));
          if (!drained) fire(key, row); else finish(key, row);
        },
        (error) => {
          row.inFlight = false;
          // Q9: no retry. What was queued behind a failure is dropped; the caller rolls back to
          // the server's last value.
          row.queued = 0;
          const dropped = row.waiters.splice(0);
          onDone(key, { ok: false, error, drained: true });
          carried.concat(dropped).forEach((w) => w({ ok: false, error }));
          finish(key, row);
        }
      );
  };

  return {
    tap(key, delta) {
      if (!Number.isInteger(delta) || delta === 0) return Promise.resolve({ ok: true, result: null });
      let row = rows.get(key);
      if (!row) { row = { inFlight: false, queued: 0, waiters: [] }; rows.set(key, row); }
      return new Promise((resolve) => {
        row.queued += delta;
        row.waiters.push(resolve);
        if (!row.inFlight) fire(key, row);
      });
    },
    busy(key) {
      return rows.has(key);
    },
  };
}

// The quantity shown before the server answers: each tap moves it by its delta at once, floored at
// 0 on screen (the server decides removal, Q3).
export function applyOptimisticDelta(prev, key, delta) {
  if (!key) return prev;
  const current = Number(prev[key]) || 0;
  return { ...prev, [key]: Math.max(0, current + delta) };
}

// The server's answer, adopted only once the item's queue has drained (the caller checks).
// removed / absent → the row is off the list: its entries read 0 (shown as "Add"). They are set to
// 0, NOT deleted: the poll merge can only keep a key that exists, so a deleted key let a snapshot
// requested before the removal put the old number back (found by qty-burst.js, V5, 2026-11-16).
// The next poll, requested after, drops the row and its entry. Otherwise the row's id carries the
// server's quantity; a pre:<catalog id> placeholder stays until the poll delivers the row (the
// reader falls back to it), and takes the same number.
export function adoptQtyResult(prev, { result, optKey, preKey }) {
  if (!result) return prev;
  const n = { ...prev };
  if (result.outcome === "removed" || result.outcome === "absent") {
    [result.list_item_id, optKey, preKey].forEach((k) => { if (k && k in n) n[k] = 0; });
    return n;
  }
  const q = Number(result.quantity) || 0;
  if (result.list_item_id) n[result.list_item_id] = q;
  if (optKey && optKey in n) n[optKey] = q;
  return n;
}

// A request revealed the row's id mid-burst (the first + on an item that wasn't on the list is keyed
// pre:<catalog id>). Seed the id with the number on screen, so the poll merge has a key to keep
// while taps are still landing: without it, a poll delivering the new row showed the server's
// partial count under that id (1, then back up to 5; qty-burst.js, V5, 2026-11-16).
export function seedRowKey(prev, { rowId, optKey }) {
  if (!rowId || rowId in prev || !optKey || !(optKey in prev)) return prev;
  return { ...prev, [rowId]: prev[optKey] };
}

// An item entered the live list (Q10): only a new row or a revived one, never a bump or renewal.
export function isListEntry(result) {
  return !!result && (result.outcome === "inserted" || result.outcome === "revived");
}
