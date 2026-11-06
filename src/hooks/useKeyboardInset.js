import { useEffect, useState } from "react";

// useKeyboardInset — how much of the bottom of the layout viewport the on-screen
// keyboard covers (2026-11-04, the Add sheet hidden behind the iOS keyboard).
//
// iOS Safari does not shrink the layout viewport when the keyboard opens: a
// position:fixed bottom sheet stays anchored to the layout bottom, which is now
// under the keyboard. The visual viewport is what the user actually sees, so the
// covered strip is innerHeight − (visible height + how far the visual viewport
// has been scrolled down inside the layout one). Lift the sheet by that much and
// it rides on top of the keyboard.
//
// Returns { inset, viewportHeight }: inset in px (0 with no keyboard, and always
// 0 where window.visualViewport is missing), viewportHeight = the visible height
// (null without the API) so a tall sheet can be capped to what is on screen.
// Listens only while `active` — a closed sheet costs nothing.

export function keyboardMetrics(win) {
  const vv = win && win.visualViewport;
  if (!vv) return { inset: 0, viewportHeight: null };
  const inset = Math.max(0, Math.round(win.innerHeight - vv.height - vv.offsetTop));
  return { inset, viewportHeight: Math.round(vv.height) };
}

const CLOSED = { inset: 0, viewportHeight: null };

export function useKeyboardInset(active = true) {
  const [metrics, setMetrics] = useState(CLOSED);

  useEffect(() => {
    if (!active || typeof window === "undefined") { setMetrics(CLOSED); return undefined; }
    const vv = window.visualViewport;
    let last = null;
    const update = () => {
      const next = keyboardMetrics(window);
      // A scroll tick that leaves the rounded numbers as they were is dropped here, before
      // setState (2026-11-05): no update queued, so the host (ProvisionsApp) does not re-render.
      if (last && last.inset === next.inset && last.viewportHeight === next.viewportHeight) return;
      last = next;
      setMetrics(next);
    };
    update();
    if (!vv) return undefined;
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [active]);

  return metrics;
}
