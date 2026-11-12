// Top-edge re-measure (2026-11-12, iOS 27): what the installed app actually reports about the
// status bar, read ON the phone — nothing off-device can see it. Dev host + home-screen app
// only (see InsetProbe in App.js); never on prod, never in a browser tab.
//
// The two questions it answers:
//   1. env(safe-area-inset-top) — a real number, or still 0 as on the 2026-10-17 device check?
//   2. Does the page start BELOW the status bar? screen.height − innerHeight is the gap: a
//      bar-sized gap means the viewport sits under the bar; 0 means the page runs behind it.
// Pure over the numbers it is handed — jest beside it.
export const DEV_HOSTS = ["dev.ourprovisions.velayo.ai", "localhost", "127.0.0.1"];

export function probeEnabled({ hostname, standalone }) {
  return standalone === true && DEV_HOSTS.includes(String(hostname || ""));
}

export function insetProbeLines({ envTop, opInsetTop, underBar, screenHeight, innerHeight, vvHeight, vvOffsetTop, landscape }) {
  const gap = Math.round(Number(screenHeight) - Number(innerHeight));
  const below = gap > 0
    ? `page starts BELOW the bar (gap ${gap}px)`
    : "page runs BEHIND the bar (gap 0)";
  return [
    `env(safe-area-inset-top): ${envTop}`,
    landscape ? `sideways — ${below}` : below,
    `--op-under-bar: ${underBar == null ? "n/a" : underBar} · --op-inset-top: ${opInsetTop}`,
    `screen ${screenHeight} · inner ${innerHeight}`,
    `visualViewport: ${vvHeight == null ? "n/a" : `${Math.round(vvHeight)} @ ${Math.round(vvOffsetTop || 0)}`}`,
  ];
}
