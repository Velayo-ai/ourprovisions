// WrapUpBar — Shop's ONE Wrap Up control while a trip is under way
// (docs/mockups/mockup_shop_wrapup_bar.html, 2026-10-05). Pinned just above
// the Helm; the header row keeps list tools only (lens + "+ Add").
//
// Teal = celebrate, in proportion to progress: a SOFT teal tint fills the bar
// left-to-right to checked/total (animated ~200ms on every check / uncheck).
// Saturated teal (#0D9488) is reserved for the All done card, so this file
// never uses it as a fill — only as the action word's ink.
//   0 checked      — renders NOTHING (SPEC_one_list R4, 2026-11-26): the bar
//                    appears with the first item in the cart, because the
//                    first check-off is what starts the trip. The dashed
//                    "Leaving early?  Wrap up →" state is retired. Keyed on the
//                    household's checked count, so a partner sees a trip under way.
//   1+ not all     — fill = checked/total, "N of M · K carry forward  Wrap up".
//   all checked    — renders NOTHING: the All done card's "Wrap up trip →" is
//                    the one control (exactly one Wrap Up visible per state).
//   no list        — renders nothing (the empty state has nothing to wrap).
// Accepted (R4): a session opened by a check and then fully unchecked has no
// Wrap up until the 8 h expiry — there is nothing to finish.
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
//
// Replay (2026-10-19, SPEC_replay_labels_promotion2 A2): the session recorder
// copies every attribute verbatim, so the counts never sit in one. With a trip
// under way the bar names itself by aria-labelledby — its own visible "Wrap up"
// word plus its visible, masked count line — not by an aria-label template.
// Click text (above) is unchanged: it reads text nodes, not attributes.
export function WrapUpBar({ checked, total, onWrapUp, busy = false }) {
  if (!total || !checked || checked >= total) return null;
  const pct = Math.round((checked / total) * 100);
  const left = total - checked;
  return (
    <button
      type="button"
      className="wrapbar"
      onClick={onWrapUp}
      disabled={busy}
      aria-labelledby="wrapbar-word wrapbar-count"
    >
      <span className="wrapbar-fill" style={{ width: `${pct}%` }} aria-hidden="true" />
      <span id="wrapbar-count" className="wrapbar-t">
        <b>{checked} of {total}</b> · {left} carry forward
      </span>
      <span id="wrapbar-word" className="wrapbar-a">Wrap up</span>
    </button>
  );
}

export default WrapUpBar;
