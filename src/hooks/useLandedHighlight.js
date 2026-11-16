import { useCallback, useEffect, useRef, useState } from "react";

// useLandedHighlight — "See" after an Ask (2026-11-15, revised: more time, no bar).
// start(label, ids) when See is tapped (the caller switches to Shop in the same tap): every landed row
// (catalog item ids) gets the soft teal tint, and the first landed row (list order) is scrolled into view.
// The highlight's clock starts once that scroll SETTLES: the tint holds, then fades over the final
// FADE_MS, and is gone HIGHLIGHT_MS after the settle (double the old 2.6s). No bar, no controls.
// Leaving Shop clears it early; a row checked off drops its own tint. Under reduced motion the scroll jumps.
//
//   view            — the app's current view ("list" is Shop)
//   checkedIds      — a Set of catalog item ids whose list row is checked off
//   rowSelector     — how a tinted row is found on screen (in list order)
// Returns { hl: { label, ids, fading } | null, start }.
export const LANDED_ROW_SELECTOR = ".list-item.ask-landed-hl";
export const HIGHLIGHT_MS = 5200;
export const FADE_MS = 1200;
export const SETTLE_QUIET_MS = 150;   // no scroll for this long = settled
export const SETTLE_CAP_MS = 1500;    // a smooth scroll that never reports quiet still starts the clock

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Calls back once scrolling has been quiet for SETTLE_QUIET_MS (any scroller: capture phase), or at the
// cap. Returns a cancel.
export function whenScrollSettles(cb, { quiet = SETTLE_QUIET_MS, cap = SETTLE_CAP_MS } = {}) {
  let finished = false;
  let quietT = null;
  const stop = () => {
    finished = true;
    clearTimeout(quietT); clearTimeout(capT);
    window.removeEventListener("scroll", onScroll, true);
  };
  const finish = () => { if (finished) return; stop(); cb(); };
  function onScroll() { clearTimeout(quietT); quietT = setTimeout(finish, quiet); }
  window.addEventListener("scroll", onScroll, true);
  quietT = setTimeout(finish, quiet);
  const capT = setTimeout(finish, cap);
  return stop;
}

export function useLandedHighlight({ view, checkedIds, rowSelector = LANDED_ROW_SELECTOR }) {
  const [hl, setHl] = useState(null);
  const pendingFirst = useRef(false);
  const cancels = useRef([]);

  const clearTimers = useCallback(() => { cancels.current.forEach((c) => c()); cancels.current = []; }, []);
  const clear = useCallback(() => { clearTimers(); pendingFirst.current = false; setHl(null); }, [clearTimers]);
  const start = useCallback((label, ids) => {
    clearTimers();
    pendingFirst.current = true;
    setHl({ label, ids: new Set(ids), fading: false });
  }, [clearTimers]);
  useEffect(() => clearTimers, [clearTimers]);

  // Leaving Shop clears it.
  useEffect(() => { if (hl && view !== "list") clear(); }, [view, hl, clear]);
  // A row checked off drops its own tint; with none left, it's over.
  useEffect(() => {
    if (!hl || !checkedIds) return;
    const left = [...hl.ids].filter((id) => !checkedIds.has(id));
    if (left.length === hl.ids.size) return;
    if (left.length === 0) { clear(); return; }
    setHl((h) => (h ? { ...h, ids: new Set(left) } : h));
  }, [checkedIds, hl, clear]);
  // Once Shop shows the tinted rows: bring the first into view, wait for the scroll to settle, then run
  // the clock — hold, fade over the last FADE_MS, clear at HIGHLIGHT_MS.
  useEffect(() => {
    if (!hl || view !== "list" || !pendingFirst.current) return undefined;
    const t = setTimeout(() => {
      pendingFirst.current = false;
      const first = typeof document === "undefined" ? null : document.querySelector(rowSelector);
      if (first && typeof first.scrollIntoView === "function") {
        first.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
      }
      cancels.current.push(whenScrollSettles(() => {
        const fadeT = setTimeout(() => setHl((h) => (h ? { ...h, fading: true } : h)), HIGHLIGHT_MS - FADE_MS);
        const endT = setTimeout(() => { cancels.current = []; setHl(null); }, HIGHLIGHT_MS);
        cancels.current.push(() => { clearTimeout(fadeT); clearTimeout(endT); });
      }));
    }, 60);
    return () => clearTimeout(t);
  }, [hl, view, rowSelector]);

  return { hl, start };
}

export default useLandedHighlight;
