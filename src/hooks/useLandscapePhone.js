import { useEffect, useState } from "react";

// Landscape = Staples (SPEC_landscape_staples): the phone gate and its listener.
//
// A PHONE held sideways — not a desktop (always landscape), not a tablet. Told apart by
// the short side, never the user agent: a landscape phone is ~320–450px tall, a tablet
// or an unfolded foldable ~600px+.
//
//   (pointer: coarse) AND (orientation: landscape) AND viewport height ≤ 500
//
// plus one guard the spec's query can't see: on Android an open keyboard in PORTRAIT
// shrinks the viewport until it is wider than tall, which reads as landscape. Where
// screen.orientation exists it must agree; where it doesn't, the media query stands.
export const LANDSCAPE_MAX_HEIGHT = 500;
export const LANDSCAPE_DEBOUNCE_MS = 300;

// Pure — jest beside it.
export function isLandscapePhone({ coarse, landscape, height, screenType }) {
  if (!coarse || !landscape) return false;
  if (!(Number(height) <= LANDSCAPE_MAX_HEIGHT)) return false;
  if (typeof screenType === "string" && screenType && !screenType.startsWith("landscape")) return false;
  return true;
}

export function readLandscapePhone(win) {
  if (!win || !win.matchMedia) return false;
  const so = win.screen && win.screen.orientation;
  return isLandscapePhone({
    coarse: win.matchMedia("(pointer: coarse)").matches,
    landscape: win.matchMedia("(orientation: landscape)").matches,
    height: win.innerHeight,
    screenType: so ? so.type : undefined,
  });
}

// true while the device passes the gate. Read once on mount (the gate already excludes
// desktops and tablets, so a phone that is already sideways counts), then re-read on every
// orientation / resize change after LANDSCAPE_DEBOUNCE_MS of quiet — a tilt-and-back
// inside that window never flips the value, in either direction.
export function useLandscapePhone(win = typeof window !== "undefined" ? window : undefined) {
  const [on, setOn] = useState(() => readLandscapePhone(win));
  useEffect(() => {
    if (!win || !win.matchMedia) return undefined;
    let timer = null;
    const schedule = () => {
      if (timer) win.clearTimeout(timer);
      timer = win.setTimeout(() => { timer = null; setOn(readLandscapePhone(win)); }, LANDSCAPE_DEBOUNCE_MS);
    };
    const mq = win.matchMedia("(orientation: landscape)");
    if (mq.addEventListener) mq.addEventListener("change", schedule);
    else if (mq.addListener) mq.addListener(schedule);   // Safari < 14
    win.addEventListener("resize", schedule);
    win.addEventListener("orientationchange", schedule);
    const so = win.screen && win.screen.orientation;
    if (so && so.addEventListener) so.addEventListener("change", schedule);
    return () => {
      if (timer) win.clearTimeout(timer);
      if (mq.removeEventListener) mq.removeEventListener("change", schedule);
      else if (mq.removeListener) mq.removeListener(schedule);
      win.removeEventListener("resize", schedule);
      win.removeEventListener("orientationchange", schedule);
      if (so && so.removeEventListener) so.removeEventListener("change", schedule);
    };
  }, [win]);
  return on;
}
