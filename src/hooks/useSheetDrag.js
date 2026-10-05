import { useRef, useState } from "react";

// useSheetDrag — swipe-down-to-dismiss for a bottom sheet (2026-10-05).
//
// Why a hook and not a component: there is no shared sheet component in this
// app — every sheet is an inline scrim > container pair with its own markup
// (the Profile sheet is bespoke, the Shop Add sheet is .add-sheet-scrim >
// .add-sheet). Wrapping them all in a new <BottomSheet> would be a rewrite of
// a dozen call sites for one gesture; a hook is the cheap "one pattern": the
// sheet spreads `handlers` on its container and `style` on the same element,
// and that is the whole integration. The Add sheet can adopt it the same way.
//
// Gesture: pointer events (mouse, pen, touch alike). A press records the
// start; the drag ARMS only once the finger has moved ≥ 8px and more down
// than across — so a tap on a button or an input inside the sheet is still a
// tap (nothing is captured until the drag is real, because pointer capture
// retargets the pointerup and would eat the button's click). Dragging up does
// nothing. Once armed, the sheet follows the finger (translateY, no
// transition); on release past `threshold` px, or a quick flick (> 0.6 px/ms),
// the sheet slides off (200ms) and then `onClose` runs — the same close the
// backdrop tap and the Close button run, so focus return and everything else
// on unmount are untouched. Under the threshold it springs back.
//
// The container needs `touch-action: none` (in `style`): otherwise the browser
// claims a vertical touch as a scroll gesture and cancels the pointer stream.
// The sheets this is for do not scroll internally; a sheet that does should
// arm only at scrollTop 0 (not needed yet, so not built).
export function useSheetDrag(onClose, { threshold = 72 } = {}) {
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const press = useRef(null); // { id, x0, y0, t0, armed }

  const onPointerDown = (e) => {
    if (leaving) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    press.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), armed: false };
  };
  const onPointerMove = (e) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    const d = e.clientY - p.y0;
    if (!p.armed) {
      if (d < 8 || Math.abs(e.clientX - p.x0) > d) return;
      p.armed = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_err) { /* capture is best-effort */ }
      setDragging(true);
    }
    setDy(Math.max(0, d));
  };
  const onPointerEnd = (e) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    if (!p.armed) return;
    setDragging(false);
    const d = Math.max(0, e.clientY - p.y0);
    const v = d / Math.max(1, performance.now() - p.t0);
    if (e.type !== "pointercancel" && (d > threshold || v > 0.6)) {
      setLeaving(true);
      setTimeout(onClose, 200);
    } else {
      setDy(0);
    }
  };

  const handlers = { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd };
  const style = {
    touchAction: "none",
    transform: leaving ? "translateY(110%)" : dy ? `translateY(${dy}px)` : "none",
    transition: dragging ? "none" : "transform 0.2s ease",
  };
  return { handlers, style, dragging, leaving };
}

export default useSheetDrag;
