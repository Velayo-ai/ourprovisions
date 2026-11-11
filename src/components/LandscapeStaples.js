import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LANDSCAPE_HEADER, LANDSCAPE_EMPTY, QTY_HINT, tileTap } from "../lib/landscapeStaples";

// Landscape = Staples (SPEC_landscape_staples): the sideways view itself. A flat grid of
// tiles, one tap each; no filters, no search, no steppers, no nav. To leave, rotate back.
//
// Its whole interface is items in, onAdd / onRemove out. It is handed no portrait state
// and no setter for any — it CAN'T touch the Staples pill, the category pills, search or
// scroll (LandscapeStaples.test.js holds that line on the source too).
//
// Portalled to <body>: a sideways phone is wider than COLUMN_MIN_WIDTH, so the desktop
// phone-frame is live and its transform would pin a fixed child to a 430px column. For the
// same reason the 2+ hint is drawn here — the app's toast stack is inside that frame,
// underneath this view. The app's error toast is under here too, so while this view is up
// the same error shows in the hint slot, with its Dismiss; an error outranks the hint.
// (A network failure is not an error: it goes to the offline queue, as in portrait.)
// Styles: the .ls-* rules in App.js's style block.
export function LandscapeStaples({ items, qtyOf, onAdd, onRemove, error = null, onDismissError }) {
  const [hint, setHint] = useState(false);
  const hintTimer = useRef(null);
  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);

  const tap = (item) => {
    const action = tileTap(qtyOf(item));
    if (action === "add") onAdd(item);
    else if (action === "remove") onRemove(item);
    else {
      setHint(true);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(false), 1800);
    }
  };

  return createPortal(
    <div className="ls-root" role="region" aria-label="Staples">
      <div className="ls-head op-chrome">{LANDSCAPE_HEADER}</div>
      {items.length === 0 ? (
        <div className="ls-empty">{LANDSCAPE_EMPTY}</div>
      ) : (
        <div className="ls-grid">
          {items.map((item) => {
            const qty = qtyOf(item);
            return (
              <button
                key={item.name}
                type="button"
                className={`ls-tile${qty > 0 ? " on" : ""}`}
                aria-pressed={qty > 0}
                onClick={() => tap(item)}
              >
                <span className="ls-name">{item.name}</span>
                {qty > 0 && <span className="ls-badge" aria-label={`Quantity ${qty}`}>{qty}</span>}
              </button>
            );
          })}
        </div>
      )}
      {error ? (
        <div className="ls-hint ls-error" role="alert">
          <span>⚠ {error}</span>
          {onDismissError && <button type="button" className="ls-dismiss op-chrome" onClick={onDismissError}>Dismiss</button>}
        </div>
      ) : hint && <div className="ls-hint" role="status">{QTY_HINT}</div>}
    </div>,
    document.body
  );
}
