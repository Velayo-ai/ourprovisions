// "The viewport has stopped changing."
//
// A rotation is not one event. iOS animates it for ~300ms and reports sizes along the way:
// resize, orientationchange, screen.orientation change and visualViewport resize can each
// fire, in any order, some of them with numbers from the middle of the animation. Anything
// that MEASURES the viewport (an inset) or MOVES the page (a scroll restore) off one of
// those events can act on a half-rotated viewport — and on iOS a programmatic scroll during
// the animation is one way position: fixed chrome ends up drawn away from the bottom edge.
//
// onViewportSettled runs `fn` once, `ms` after the LAST of those events — never during the
// burst. Returns the unsubscribe. No DOM beyond the window it is handed — jest beside it.
export const VIEWPORT_SETTLE_MS = 300;

export function onViewportSettled(win, fn, ms = VIEWPORT_SETTLE_MS) {
  if (!win || !win.addEventListener) return () => {};
  let timer = null;
  const bump = () => {
    if (timer) win.clearTimeout(timer);
    timer = win.setTimeout(() => { timer = null; fn(); }, ms);
  };
  const so = win.screen && win.screen.orientation;
  const vv = win.visualViewport;
  win.addEventListener("resize", bump);
  win.addEventListener("orientationchange", bump);
  if (so && so.addEventListener) so.addEventListener("change", bump);
  if (vv && vv.addEventListener) vv.addEventListener("resize", bump);
  return () => {
    if (timer) win.clearTimeout(timer);
    win.removeEventListener("resize", bump);
    win.removeEventListener("orientationchange", bump);
    if (so && so.removeEventListener) so.removeEventListener("change", bump);
    if (vv && vv.removeEventListener) vv.removeEventListener("resize", bump);
  };
}
