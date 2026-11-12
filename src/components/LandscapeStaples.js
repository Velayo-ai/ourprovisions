import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LANDSCAPE_HEADER, LANDSCAPE_EMPTY, HOLD_HINT, tileTap } from "../lib/landscapeStaples";
import { useHold } from "../hooks/useHold";
import { HINT_TEXT } from "../lib/landscapeHint";

// Landscape = Staples (SPEC_landscape_staples): the sideways view itself. A flat grid of
// tiles; no filters, no search, no steppers, no nav. To leave, rotate back.
// The tiles size themselves: few staples grow (to a cap), many hold at ~120×48 and the grid
// scrolls. The hint / error slot is a sibling of the grid, so it never scrolls away.
//
// What a tile does (final, 2026-11-11; rules in lib/landscapeStaples.js):
//   tap, not on the list            → add 1
//   tap, added during THIS visit    → take it back off
//   tap, on the list before         → nothing written; "Hold to remove"
//   press and hold, on the list     → remove, whatever the quantity
// The hold is the Ask run's Done pill's (useHold): same second, same fill.
//
// An ADD PALETTE, on every tab: its whole interface is items and their quantities in,
// onAdd / onRemove out. It is handed no portrait state and no setter for any — it CAN'T touch
// the Staples pill, the category pills, search or scroll — and no list state beyond quantity:
// it never knows, so never shows, what is checked off or in the cart
// (LandscapeStaples.test.js holds both lines on the source too).
//
// Portalled to <body>: a sideways phone is wider than COLUMN_MIN_WIDTH, so the desktop
// phone-frame is live and its transform would pin a fixed child to a 430px column. For the
// same reason the hint is drawn here — the app's toast stack is inside that frame,
// underneath this view. The app's error toast is under here too, so while this view is up
// the same error shows in the hint slot, with its Dismiss; an error outranks the hint.
// (A network failure is not an error: it goes to the offline queue, as in portrait.)
// Styles: the .ls-* rules in App.js's style block.
function StapleTile({ item, qty, onTap, onHoldRemove }) {
  // A hold that fired is followed by the browser's click for the same press: swallow that one.
  const held = useRef(false);
  const { holding, bind } = useHold({ onHold: () => { held.current = true; onHoldRemove(item); } });
  const on = qty > 0;
  const press = on ? { ...bind, onPointerDown: (e) => { held.current = false; bind.onPointerDown(e); } } : {};
  return (
    <button
      type="button"
      className={`ls-tile${on ? " on" : ""}${holding ? " holding" : ""}`}
      aria-pressed={on}
      {...press}
      onClick={() => { if (held.current) { held.current = false; return; } onTap(item); }}
    >
      {on && <span className="ls-fill" aria-hidden="true" />}
      <span className="ls-name">{item.name}</span>
      {on && <span className="ls-badge" aria-label={`Quantity ${qty}`}>{qty}</span>}
    </button>
  );
}

export function LandscapeStaples({ items, qtyOf, addedThisVisit, onAdd, onRemove, glyph = null, showHint = false, error = null, onDismissError }) {
  const [hint, setHint] = useState(false);
  // The grid has moved off its top: the header's fade comes on (.ls-root.scrolled, App.js's style block).
  const [scrolled, setScrolled] = useState(false);
  const hintTimer = useRef(null);
  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);

  const tap = (item) => {
    const action = tileTap({ qty: qtyOf(item), addedThisVisit: !!(addedThisVisit && addedThisVisit(item)) });
    if (action === "add") onAdd(item);
    else if (action === "remove") onRemove(item);
    else {
      setHint(true);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(false), 1800);
    }
  };

  return createPortal(
    <div className={`ls-root${scrolled ? " scrolled" : ""}`} role="region" aria-label="Staples">
      <div className="ls-head">{glyph && <span className="ls-em" aria-hidden="true">{glyph}</span>}{LANDSCAPE_HEADER}{showHint && <span className="ls-sub">{HINT_TEXT}</span>}</div>
      {items.length === 0 ? (
        <div className="ls-empty">{LANDSCAPE_EMPTY}</div>
      ) : (
        <div className="ls-grid" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}>
          {items.map((item) => (
            <StapleTile key={item.name} item={item} qty={qtyOf(item)} onTap={tap} onHoldRemove={onRemove} />
          ))}
        </div>
      )}
      {error ? (
        <div className="ls-hint ls-error" role="alert">
          <span>⚠ {error}</span>
          {onDismissError && <button type="button" className="ls-dismiss op-chrome" onClick={onDismissError}>Dismiss</button>}
        </div>
      ) : hint && <div className="ls-hint" role="status">{HOLD_HINT}</div>}
    </div>,
    document.body
  );
}
