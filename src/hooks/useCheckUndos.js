import { useCallback, useEffect, useRef, useState } from "react";
import { UNDO_MS, EMPTY_UNDO, pushUndo, dropUndo, expireUndo, expireGroup } from "../lib/shopCheck";

// useCheckUndos — the timers behind Shop's "✓ {item} checked · Undo" toasts (2026-11-07; the fold
// 2026-11-14). The rules are pure (lib/shopCheck); this hook only owns the clocks:
//   separate (≤ UNDO_CAP entries) — each entry has its own UNDO_MS timer;
//   folded — the rows' timers stop, and ONE group timer of UNDO_MS restarts on every new check; when
//   it runs out the whole group drops.
// The state is mirrored in a ref, so a timer or a fast burst of taps always reads the latest stack.
// offer(id, name) on a check's tap; dismiss(id) when that id leaves (Undo, a tap during the hold, a
// failed write). Returns { undos, offer, dismiss, current } — current() reads the live stack.
export function useCheckUndos(ms = UNDO_MS) {
  const [undos, setUndos] = useState(EMPTY_UNDO);
  const ref = useRef(EMPTY_UNDO);
  const rowTimers = useRef({});
  const groupTimer = useRef(null);
  const keyRef = useRef(0);
  useEffect(() => () => {
    Object.values(rowTimers.current).forEach(clearTimeout);
    clearTimeout(groupTimer.current);
  }, []);

  const commit = useCallback(function commitUndos(next) {
    const prev = ref.current;
    if (next === prev) return;
    ref.current = next;
    setUndos(next);
    if (next.folded && !prev.folded) {
      // Folding: the rows' own timers stop counting; the group's timer does.
      Object.values(rowTimers.current).forEach(clearTimeout);
      rowTimers.current = {};
    }
    if (next.folded && next.groupKey !== prev.groupKey) {
      clearTimeout(groupTimer.current);
      const gk = next.groupKey;
      groupTimer.current = setTimeout(() => commitUndos(expireGroup(ref.current, gk)), ms);
    }
    if (!next.folded && prev.folded) clearTimeout(groupTimer.current);   // emptied or expired
  }, [ms]);

  const dismiss = useCallback((id) => {
    clearTimeout(rowTimers.current[id]);
    delete rowTimers.current[id];
    commit(dropUndo(ref.current, id));
  }, [commit]);

  const offer = useCallback((id, name) => {
    clearTimeout(rowTimers.current[id]);
    delete rowTimers.current[id];
    const key = ++keyRef.current;
    const next = pushUndo(ref.current, { id, name, key });
    commit(next);
    if (!next.folded) {
      rowTimers.current[id] = setTimeout(() => {
        delete rowTimers.current[id];
        commit(expireUndo(ref.current, id, key));
      }, ms);
    }
  }, [commit, ms]);

  const current = useCallback(() => ref.current, []);
  return { undos, offer, dismiss, current };
}

export default useCheckUndos;
