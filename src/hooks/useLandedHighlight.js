import { useCallback, useEffect, useRef, useState } from "react";

// useLandedHighlight — "See" after an Ask (2026-11-15): a highlight that waits for her.
// start(label, ids) when See is tapped (the caller switches to Shop in the same tap): every landed row
// (catalog item ids) gets a soft teal tint that stays — no timed fade — and the pinned bar reads
// "{Label}'s {N} picks · Next ↓ · Done". The first landed row is scrolled into view once Shop shows it.
// next() scrolls to the next landed row in LIST order (the rows' order on screen) and wraps around.
// done() clears the tint and the bar. Leaving Shop clears them; a row checked off drops its own tint,
// and when none is left the bar goes too. Under reduced motion the scrolls jump (no smooth animation).
//
//   view            — the app's current view ("list" is Shop)
//   checkedIds      — a Set of catalog item ids whose list row is checked off
//   rowSelector     — how a tinted row is found on screen (in list order)
// Returns { hl: { label, total, ids } | null, start, next, done }.
export const LANDED_ROW_SELECTOR = ".list-item.ask-landed-hl";

// The row Next goes to: the one after the cursor, wrapping to the first (−1 = none shown yet → the first;
// a cursor past the end after rows dropped wraps too). −1 when there is nothing to go to.
export function nextLandedIndex(cursor, count) {
  if (count <= 0) return -1;
  return (Math.max(cursor, -1) + 1) % count;
}

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function scrollTo(el) {
  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
}

export function useLandedHighlight({ view, checkedIds, rowSelector = LANDED_ROW_SELECTOR }) {
  const [hl, setHl] = useState(null);
  const cursor = useRef(-1);
  const pendingFirst = useRef(false);

  const start = useCallback((label, ids) => {
    cursor.current = -1;
    pendingFirst.current = true;
    setHl({ label, total: ids.length, ids: new Set(ids) });
  }, []);
  const done = useCallback(() => { cursor.current = -1; pendingFirst.current = false; setHl(null); }, []);
  const rows = useCallback(() => (typeof document === "undefined" ? [] : [...document.querySelectorAll(rowSelector)]), [rowSelector]);
  const next = useCallback(() => {
    const list = rows();
    const i = nextLandedIndex(cursor.current, list.length);
    if (i < 0) return null;
    cursor.current = i;
    scrollTo(list[i]);
    return list[i];
  }, [rows]);

  // Leaving Shop clears it.
  useEffect(() => { if (hl && view !== "list") done(); }, [view, hl, done]);
  // A row checked off drops its own tint; with none left, the bar goes too.
  useEffect(() => {
    if (!hl || !checkedIds) return;
    const left = [...hl.ids].filter((id) => !checkedIds.has(id));
    if (left.length === hl.ids.size) return;
    if (left.length === 0) { done(); return; }
    setHl((h) => (h ? { ...h, ids: new Set(left) } : h));
  }, [checkedIds, hl, done]);
  // Once Shop shows the tinted rows, bring the first into view (once per See).
  useEffect(() => {
    if (!hl || view !== "list" || !pendingFirst.current) return undefined;
    const t = setTimeout(() => {
      pendingFirst.current = false;
      const list = rows();
      if (list.length) { cursor.current = 0; scrollTo(list[0]); }
    }, 60);
    return () => clearTimeout(t);
  }, [hl, view, rows]);

  return { hl, start, next, done };
}

export default useLandedHighlight;
