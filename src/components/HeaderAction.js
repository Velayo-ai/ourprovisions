// HeaderAction — the ONE action pill at the top-right of a door's control row
// (Shop, This Week, Meals). One style everywhere (the deep-sand --op-add pill:
// "adding things"), so a new screen inherits it instead of styling its own.
//
// The verb is the design rule, not free copy (UI consistency pass, 2026-10-05):
//   verb="add" → "+ Add"  — bring an EXISTING thing into this view
//                           (Shop: the Add sheet; This Week: the library)
//   verb="new" → "+ New"  — CREATE something from scratch (Meals: New Meal sheet)
// A screen that wants "Add" to mean "create" cannot — it has to pick a verb.
// Row-level buttons (Browse "Add", card "Plan", "Add to Shop") are NOT this
// component: they are secondary outline buttons, and they stay that way.
//
// RUM: `.hdr-action` is on CHROME_ALLOW_LIST (src/rum.js) — the pill carries
// fixed copy only; never put a count, a name or anything per-household in it.
// `label` is the aria-label — the same string the Helm's compact + uses for the
// door (doorAdd), so the two affordances read identically to a screen reader.
const VERB_WORD = { add: "Add", new: "New" };

export function HeaderAction({ verb, label, onClick, disabled = false }) {
  const word = VERB_WORD[verb] || VERB_WORD.add;
  return (
    <button type="button" className="hdr-action" aria-label={label} onClick={onClick} disabled={disabled}>
      + {word}
    </button>
  );
}

export default HeaderAction;
