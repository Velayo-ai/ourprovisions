import { AskIcon } from "./AskIcon";

// "+N more" (SPEC_ask_slice2 C4.2; Dan's rail ruling 2026-11-07): the asks past the rail's two
// pills, in the rail's own frozen order. A row IS an Ask pill (people pill, 2026-11-13) and behaves
// exactly like one: it opens that Ask's run (onOpen); the sheet then closes. It is never a filter
// and shows no selected state; `activeAskId` is the Ask whose run is open or being edited, drawn
// pressed. No "+ New ask" here: that lives in View & organize's Asks section.
// One add (SPEC_results_feeder_standard R3, flag-on hosts only): the rail's ONE Ask pill at 2+ asks
// ("Ask…") opens this sheet as the chooser of EVERY ask, titled "Ask…", with "+ New ask" at the end
// (onNew). Without those props it is the sheet above, unchanged.
//
// Privacy: each label is text inside .op-name (K3), never an attribute or a key — rows key on the
// ask's id.
export function MoreAsksSheet({ asks, activeAskId = null, onOpen, closeButton, title = "More asks", onNew = null }) {
  return (
    <div className="more-asks">
      {closeButton}
      <h2>{title}</h2>
      <div className="more-asks-list">
        {asks.map((ask) => (
          <button key={ask.id} type="button" className={`cat-pill people-pill more-asks-row${activeAskId === ask.id ? " on" : ""}`}
            onClick={() => onOpen(ask.id)}>
            <span className="cat-em"><AskIcon /></span>
            <span>Ask <span className="op-name">{ask.label}</span></span>
          </button>
        ))}
        {onNew && (
          <button type="button" className="cat-pill cat-pill-new more-asks-row" onClick={onNew}>
            <span className="cat-em">+</span>New ask
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
