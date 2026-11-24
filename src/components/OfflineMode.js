// Offline is a mode, not a problem (SPEC_offline_calm_2026-11-23): the Harbor connection light in the
// header (C9 — the Velayo dots), the offline lines at the top of the Velayo menu it opens, and the one
// calm note per trip (C3). All neutral: no amber, no red, no counts on screen. Fixed copy only, so the
// RUM unmask rule never meets a name here.
import { useEffect, useRef, useState } from "react";
import {
  NOTE_COPY, SHEET_COPY, changesLine, needsSignalLine, BEACON_MS, HARBOR_LABEL, lowPowerFromFrames,
} from "../lib/offlineMode";

const reducedMotion = () => {
  try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; }
};

// ~100 ms of frames: Low Power Mode caps them at 30 fps (lib/offlineMode lowPowerFromFrames).
function sampleLowPower() {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.requestAnimationFrame) { resolve(true); return; }
    const deltas = [];
    let last = null;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(lowPowerFromFrames(deltas)); } };
    const step = (t) => {
      if (done) return;
      if (last !== null) deltas.push(t - last);
      last = t;
      if (deltas.length >= 6) finish(); else window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
    setTimeout(finish, 400);   // a hidden page runs no frames: unmeasurable, no sweep
  });
}

// C9: the Velayo dots, steady when connected; the word OFFLINE (the household name's gold small caps)
// when the Harbor core is unreachable (C5's rules). `beacon` is a counter: each increase asks for one
// sweep — two passes, then rest. A request during a sweep is ignored (it never loops); none plays
// offline, with Reduce Motion, or in Low Power Mode where detectable. data-beacon is for the harness.
export function HarborLight({ offline, beacon = 0, onOpen }) {
  const [sweep, setSweep] = useState(0);   // > 0 while a sweep plays; its value keys the restart
  const activeRef = useRef(false);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);
  const offlineRef = useRef(offline);
  offlineRef.current = offline;
  useEffect(() => () => { mountedRef.current = false; clearTimeout(timerRef.current); }, []);
  useEffect(() => {
    if (!beacon || offline || activeRef.current || reducedMotion()) return;
    activeRef.current = true;   // a request arriving while this one samples or plays is ignored
    sampleLowPower().then((lowPower) => {
      if (!mountedRef.current) return;
      if (lowPower || offlineRef.current) { activeRef.current = false; return; }
      setSweep(beacon);
      timerRef.current = setTimeout(() => { activeRef.current = false; setSweep(0); }, BEACON_MS + 100);
    });
  }, [beacon, offline]);
  useEffect(() => { if (offline) { clearTimeout(timerRef.current); activeRef.current = false; setSweep(0); } }, [offline]);

  return (
    <button
      type="button"
      className={`harbor-light${offline ? " is-offline" : ""}`}
      onClick={onOpen}
      aria-label={offline ? HARBOR_LABEL.offline : HARBOR_LABEL.connected}
      data-beacon={sweep ? "on" : "off"}
    >
      {offline ? (
        <span key="word" className="harbor-word" aria-hidden="true">Offline</span>
      ) : (
        <svg key={`dots-${sweep}`} className={`harbor-dots${sweep ? " beacon" : ""}`} width="28" height="24" viewBox="0 0 28 24" fill="none" aria-hidden="true">
          <circle className="hd hd1" cx="5" cy="4" r="3.5" fill="#C9A97A" />
          <circle className="hd hd2" cx="14" cy="16" r="3.5" fill="#C9A97A" />
          <circle className="hd hd3" cx="23" cy="4" r="3.5" fill="#C9A97A" />
        </svg>
      )}
    </button>
  );
}

// C9 / C2: offline, the Velayo menu opens with these lines at its top. One plain line for changes waiting;
// one for the known gap (an add, a quantity, a removal or a price that needed signal), never a toast.
export function OfflineLines({ changes = 0, needsSignal = null }) {
  const waiting = changesLine(changes);
  const gap = needsSignalLine(needsSignal);
  return (
    <div className="offline-lines">
      <p className="offline-lines-copy">{SHEET_COPY}</p>
      {waiting && <p className="offline-lines-line">{waiting}</p>}
      {gap && <p className="offline-lines-line">{gap}</p>}
    </div>
  );
}

// C3: "Shopping offline · everything's saved", about 3 s, in the bottom status stack. Not a button.
export function OfflineNote() {
  return (
    <div className="offline-note" role="status" aria-live="polite">
      <span>{NOTE_COPY}</span>
    </div>
  );
}
