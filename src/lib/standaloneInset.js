// iOS standalone status bar — the MEASURED inset (2026-10-16 → 17; device evidence in
// handoff/STATUS_BAR_EVIDENCE.md, the fourth cut).
//
// On Dan's iPhone the home-screen app gets a FULL-HEIGHT WebView under a transparent
// status bar, env(safe-area-inset-top) reads 0, and the only honest signal is
// screen.height − innerHeight = the bar's height (62 on a Dynamic Island Pro Max;
// 47 / 54 / 59 on other notched iPhones). So the inset is measured, not read:
//
//   • ONLY when navigator.standalone === true — a Safari tab never qualifies, so a
//     tab stays pixel-identical (the variable stays 0px there).
//   • ONLY when the gap is a known status-bar height. Anything else (a desktop
//     window, an unknown device, landscape where iOS hides the bar) is 0.
//   • LATCHED through keyboard resizes: in portrait, a gap that is no longer a bar
//     height means the keyboard (or a sheet) shrank innerHeight — keep the last
//     measured value rather than yanking the header around while typing. Landscape
//     (innerWidth > innerHeight) drops it to 0; rotating back measures again.
//
// Pure, no DOM — jest beside it. The effect that writes --op-inset-top lives in
// App.js (useStandaloneInset). Known caveat, by design: a device that lays the page
// out BELOW an opaque bar reports the same gap and would get a redundant band; the
// evidence says this device does not, and the readout shows the geometry either way.
export const KNOWN_BAR_HEIGHTS = [47, 54, 59, 62];

export function measuredInsetTop({ standalone, screenHeight, innerHeight }) {
  if (standalone !== true) return 0;
  const gap = Math.round(Number(screenHeight) - Number(innerHeight));
  return KNOWN_BAR_HEIGHTS.includes(gap) ? gap : 0;
}

export function nextInsetTop(prev, { standalone, screenHeight, innerHeight, innerWidth }) {
  if (standalone !== true) return 0;
  const measured = measuredInsetTop({ standalone, screenHeight, innerHeight });
  if (measured) return measured;
  const landscape = Number(innerWidth) > Number(innerHeight);
  return landscape ? 0 : (Number.isFinite(prev) ? prev : 0);
}
