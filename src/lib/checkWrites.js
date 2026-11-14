// Per-row check-off writes (2026-11-08, Undo on tap). One row's writes run one at a time, and the
// newest intent wins:
//   * a write still waiting its turn when a newer intent arrives is never sent (cancelled);
//   * a write already in flight is aborted, so if the server never saw it nothing changed, and if it
//     did, the next write (a conditional update to the other status) puts the row right.
// So "check, then Undo before the check reached the server" ends unchecked, in order, on every device.
//
// enqueue(id, want, send) resolves to one of:
//   { skipped: true }                      — superseded before it was sent; nothing was written
//   { value, latest }                      — send(signal) resolved with value
//   { error, aborted, latest }             — send rejected; aborted = superseded mid-flight
// latest = no newer intent arrived for this row while it ran.
export function createRowWriteChain() {
  const rows = {};
  return {
    // The row's newest intent while writes are pending, else the fallback (the rendered state).
    intent(id, fallback) {
      return Object.prototype.hasOwnProperty.call(rows, id) ? rows[id].want : fallback;
    },
    pending(id) {
      return Object.prototype.hasOwnProperty.call(rows, id);
    },
    enqueue(id, want, send) {
      const row = rows[id] || (rows[id] = { want, seq: 0, tail: Promise.resolve(), ctrl: null });
      row.want = want;
      const seq = ++row.seq;
      if (row.ctrl) row.ctrl.abort();
      const run = row.tail
        .then(async () => {
          if (row.seq !== seq) return { skipped: true };
          const ctrl = new AbortController();
          row.ctrl = ctrl;
          try {
            const value = await send(ctrl.signal);
            return { value, latest: row.seq === seq };
          } catch (error) {
            return { error, aborted: ctrl.signal.aborted, latest: row.seq === seq };
          } finally {
            if (row.ctrl === ctrl) row.ctrl = null;
          }
        })
        .then((res) => {
          if (row.seq === seq && rows[id] === row) delete rows[id];
          return res;
        });
      row.tail = run;
      return run;
    },
  };
}

// THE POLL VS. A JUST-SETTLED WRITE (2026-11-14). The list poll (every ~2 s) must not put back a row's
// status from a snapshot taken before that row's last write settled. Guarding only rows with a write IN
// FLIGHT left a gap: a poll requested just before a check committed, answered just after the write
// finished (and cleared its guard), flipped the row back to unchecked — on screen, while it was checked
// on the server; the next tap during its hold then really unchecked it (found in the 2026-11-14 burst
// walk). So every check write stamps its row with a sequence number when it starts and when it settles,
// and the poll remembers the sequence number when it was REQUESTED: a row stamped after that keeps its
// local value; the next poll, requested after the write, brings the server's.
//   prev      — the rendered { id: bought } map
//   polled    — the snapshot's map
//   pending   — ids with a write in flight
//   lastTouch — { id: seq } of each row's newest write start / settle
//   seqAtStart — the sequence number when the poll was requested
export function mergePolledChecked(prev, polled, pending, lastTouch, seqAtStart) {
  let merged = null;
  const keep = (id) => {
    if (!(id in prev)) return;
    if (!merged) merged = { ...polled };
    merged[id] = prev[id];
  };
  pending.forEach(keep);
  Object.keys(lastTouch).forEach((id) => { if (lastTouch[id] > seqAtStart) keep(id); });
  return merged || polled;
}
