import { ASK_GLYPH } from "../lib/askRail";

// "+N more" (SPEC_ask_slice2 C4.2; Dan's rail ruling 2026-11-07): the asks past the rail's two
// pills, in the rail's own frozen order, then "+ New shelf" at the bottom. A row behaves exactly
// like its pill: it toggles the ask's selection (aria-pressed shows which are on); the sheet then
// closes so the Browse block it opened is in view.
//
// Privacy: each label is text inside .op-name (K3), never an attribute or a key — rows key on the
// ask's id.
export function MoreAsksSheet({ asks, selectedAsks, onToggle, onNewShelf, closeButton }) {
  return (
    <div className="more-asks">
      {closeButton}
      <h2>More shelves</h2>
      <div className="more-asks-list">
        {asks.map((ask) => {
          const on = selectedAsks.has(ask.id);
          return (
            <button key={ask.id} type="button" className={`cat-pill more-asks-row${on ? " on" : ""}`}
              aria-pressed={on} onClick={() => onToggle(ask.id)}>
              <span className="cat-em" aria-hidden="true">{ASK_GLYPH}</span>
              <span>Ask <span className="op-name">{ask.label}</span></span>
            </button>
          );
        })}
        {onNewShelf && (
          <button type="button" className="cat-pill cat-pill-new more-asks-row" onClick={onNewShelf}>
            <span className="cat-em">+</span>New shelf
          </button>
        )}
      </div>
      <style>{MORE_ASKS_CSS}</style>
    </div>
  );
}

const MORE_ASKS_CSS = `
.more-asks-list { display: flex; flex-direction: column; align-items: stretch; gap: 8px; margin-top: 14px; }
.more-asks-row { width: 100%; justify-content: flex-start; box-sizing: border-box; }
`;

export default MoreAsksSheet;
