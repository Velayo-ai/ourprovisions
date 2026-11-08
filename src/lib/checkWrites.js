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
