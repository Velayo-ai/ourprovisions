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
// Scrolling sheets (2026-10-05, the Profile sheet at XXL on a 320px screen):
// a drag arms ONLY if the container's scrollTop was 0 when the press started.
// A press that starts scrolled down is a scroll, never a dismiss — even if it
// reaches the top during that same drag. `touch-action` is what makes the
// scroll real: with `none` the browser hands every touch to the pointer
// stream and never scrolls, so it is `none` only while the sheet sits at the
// top (the hook owns the gesture: down = dismiss, up = the hook scrolls the
// content by hand for that one drag) and `pan-y` once scrolled (the browser
// scrolls natively, with momentum, and cancels the pointer stream — which is
// fine, the press never arms). `onScroll` keeps the two in step. A sheet that
// does not scroll has scrollTop 0 forever and behaves exactly as before.
export function useSheetDrag(onClose, { threshold = 72 } = {}) {
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const press = useRef(null); // { id, x0, y0, t0, armed, canArm }

  const onPointerDown = (e) => {
    if (leaving) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const canArm = (e.currentTarget.scrollTop || 0) === 0;
    press.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), armed: false, canArm };
  };
  const onPointerMove = (e) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    const d = e.clientY - p.y0;
    if (!p.armed) {
      if (!p.canArm) return;
      if (d < 0) { e.currentTarget.scrollTop = -d; return; } // up from the top: scroll, by hand
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
  const onScroll = (e) => {
    const top = (e.currentTarget.scrollTop || 0) === 0;
    if (top !== atTop) setAtTop(top);
  };

  const handlers = { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onScroll };
  const style = {
    touchAction: atTop ? "none" : "pan-y",
    transform: leaving ? "translateY(110%)" : dy ? `translateY(${dy}px)` : "none",
    transition: dragging ? "none" : "transform 0.2s ease",
  };
  return { handlers, style, dragging, leaving };
}

export default useSheetDrag;
