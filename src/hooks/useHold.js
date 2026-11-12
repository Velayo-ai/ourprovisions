import { useEffect, useRef, useState } from "react";

// Press-and-hold. Lifted out of the Ask run's Done pill (A17) so the landscape Staples tiles
// use the SAME hold: one duration, one fill animation (scaleX 0 → 1, linear, over HOLD_MS).
//
//   const { holding, bind } = useHold({ onHold, onRelease });
//   <button className={holding ? "holding" : ""} {...bind}> <span className="…-fill" /> … </button>
//
// onHold    — the press lasted HOLD_MS.
// onRelease — the press ended early (lifted, left, cancelled). Optional.
// `holding` is true while the press is running: the caller's CSS drives the fill off it.
export const HOLD_MS = 1000;

// The fill's two rules, for a caller's stylesheet: `fill` is the fill element's selector,
// `holding` the same element under the pressed host.
export const holdFillCss = (fill, holding) =>
  `${fill} { position: absolute; inset: 0; background: #E8D5B7; transform: scaleX(0); transform-origin: left; transition: transform 0.2s; }
${holding} { transform: scaleX(1); transition: transform ${HOLD_MS}ms linear; }`;

export function useHold({ onHold, onRelease, ms = HOLD_MS }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef(null);
  const cb = useRef({ onHold, onRelease });
  cb.current = { onHold, onRelease };
  useEffect(() => () => { clearTimeout(timer.current); }, []);
  const start = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => { timer.current = null; setHolding(false); if (cb.current.onHold) cb.current.onHold(); }, ms);
  };
  const stop = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    if (cb.current.onRelease) cb.current.onRelease();
  };
  return {
    holding,
    bind: {
      onPointerDown: start, onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop,
      onKeyDown: (e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) start(e); },
      onKeyUp: (e) => { if (e.key === "Enter" || e.key === " ") stop(); },
      onContextMenu: (e) => e.preventDefault(),
    },
  };
}
