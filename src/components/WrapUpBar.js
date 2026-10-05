// WrapUpBar — Shop's ONE Wrap Up control while a trip is under way
// (docs/mockups/mockup_shop_wrapup_bar.html, 2026-10-05). Pinned just above
// the Helm; the header row keeps list tools only (lens + "+ Add").
//
// Teal = celebrate, in proportion to progress: a SOFT teal tint fills the bar
// left-to-right to checked/total (animated ~200ms on every check / uncheck).
// Saturated teal (#0D9488) is reserved for the All done card, so this file
// never uses it as a fill — only as the action word's ink.
//   0 checked      — empty bar, dashed border, "Leaving early?  Wrap up →".
//                    Reachable (the store closed), not celebrated.
//   1+ not all     — fill = checked/total, "N of M · K carry forward  Wrap up".
//   all checked    — renders NOTHING: the All done card's "Wrap up trip →" is
//                    the one control (exactly one Wrap Up visible per state).
//   no list        — renders nothing (the empty state has nothing to wrap).
// The whole bar is the tap target (a <button>) and runs the SAME flow as the
// retired header chip did (openWrapUp); `busy` = a wrap-up is in flight.
//
// It is its own `position: fixed` surface, NOT a .bottom-stack child: the stack
// is the centred, pointer-events-none column for transient status (toasts,
// the connectivity pill); this is a full-width page control that lives and
// dies with the Shop list. It copies the Helm's geometry (bottom 18px + 56px
// + a 10px gap, + the safe-area inset), and the Shop list pads for it with
// .wrapbar-spacer so the last rows scroll clear.
//
// RUM: `.wrapbar` is on CHROME_ALLOW_LIST (src/rum.js). It unmasks counts only
// ("4 of 11 · 7 carry forward") — the same class of number the Helm's Shop
// badge already shows — never an item name. Keep names out of it.
export function WrapUpBar({ checked, total, onWrapUp, busy = false }) {
  if (!total || checked >= total) return null;
  const pct = Math.round((checked / total) * 100);
  const left = total - checked;
  const empty = checked === 0;
  return (
    <button
      type="button"
      className={`wrapbar${empty ? " p0" : ""}`}
      onClick={onWrapUp}
      disabled={busy}
      aria-label={empty ? "Wrap up the trip early" : `Wrap up: ${checked} of ${total} in cart, ${left} carry forward`}
    >
      <span className="wrapbar-fill" style={{ width: `${pct}%` }} aria-hidden="true" />
      <span className="wrapbar-t">
        {empty
          ? "Leaving early?"
          : <><b>{checked} of {total}</b> · {left} carry forward</>}
      </span>
      <span className="wrapbar-a">{empty ? "Wrap up →" : "Wrap up"}</span>
    </button>
  );
}

export default WrapUpBar;
