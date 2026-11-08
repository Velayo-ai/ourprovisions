import { useRef } from "react";
import { isGripTouch, pointerDistance } from "../lib/shopCheck";

// The Shop row's checkbox, and the ONLY thing on a Shop row that checks or unchecks it. A real
// <button role="checkbox"> so the keyboard (Enter / Space) and screen readers work; the 44×44 target
// wraps the 22px circle. Touch taps that look like a grip (held > 500 ms) or a scroll (moved > 10 px,
// or taken over by the browser) are ignored; mouse and keyboard clicks always count.
// The item name is spoken through .sr-only text, never an attribute (the replay recorder copies
// attributes verbatim). `filled` draws the gold In cart circle; an aisle row leaves it false and
// lets the row's .checking class draw the teal tick during its hold, as before.
export default function ShopCheckbox({ checked, name, onToggle, filled = false, className = "" }) {
  const p = useRef(null);
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  const onPointerDown = (e) => {
    p.current = { pointerType: e.pointerType, downAt: now(), start: { x: e.clientX, y: e.clientY }, maxMove: 0, cancelled: false };
  };
  const track = (e) => {
    const r = p.current;
    if (!r) return;
    r.maxMove = Math.max(r.maxMove, pointerDistance(r.start, { x: e.clientX, y: e.clientY }));
  };
  const onPointerUp = (e) => {
    track(e);
    if (p.current) p.current.upAt = now();
  };
  const onPointerCancel = () => { if (p.current) p.current.cancelled = true; };

  const onClick = (e) => {
    const r = p.current;
    p.current = null;
    // detail 0 = a keyboard or assistive-technology click: no pointer gesture to judge.
    if (e.detail !== 0 && isGripTouch(r)) return;
    onToggle();
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!checked}
      className={`shop-check${className ? ` ${className}` : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={track}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <span className={`checkbox${filled ? " checked" : ""}`} aria-hidden="true">
        {filled && <span className="checkmark">✓</span>}
      </span>
      <span className="sr-only">{name}</span>
    </button>
  );
}
