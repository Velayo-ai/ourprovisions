import { AskIcon } from "./AskIcon";

// "+N more" (SPEC_ask_slice2 C4.2; Dan's rail ruling 2026-11-07): the asks past the rail's two
// pills, in the rail's own frozen order. A row IS an Ask pill (people pill, 2026-11-13) and behaves
// exactly like one: it opens that Ask's run (onOpen); the sheet then closes. It is never a filter
// and shows no selected state; `activeAskId` is the Ask whose run is open or being edited, drawn
// pressed. No "+ New ask" here: that lives in View & organize's Asks section.
//
// Privacy: each label is text inside .op-name (K3), never an attribute or a key — rows key on the
// ask's id.
export function MoreAsksSheet({ asks, activeAskId = null, onOpen, closeButton }) {
  return (
    <div className="more-asks">
      {closeButton}
      <h2>More asks</h2>
      <div className="more-asks-list">
        {asks.map((ask) => (
          <button key={ask.id} type="button" className={`cat-pill people-pill more-asks-row${activeAskId === ask.id ? " on" : ""}`}
            onClick={() => onOpen(ask.id)}>
            <span className="cat-em"><AskIcon /></span>
            <span>Ask <span className="op-name">{ask.label}</span></span>
          </button>
        ))}
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
