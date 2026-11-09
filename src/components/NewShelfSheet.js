import { useMemo, useRef, useState } from "react";
import {
  askDraftProblem, createAskFailure, findDuplicateAsk, pickLine,
  ASK_LABEL_MAX, ASK_NOUN_MAX, ASK_TARGET_MIN, ASK_TARGET_MAX, ASK_SHELF_MAX, ASK_TARGET_DEFAULT,
  ASK_SIMPLE_MAX, ASK_STYLE_DEFAULT,
} from "../lib/askCreate";

// + New shelf (SPEC_ask_slice2 C2; 078 create_ask). The body of the sheet: who's picking, an
// optional noun, how many to pick (1–6), the style, and the shelf, chosen from this place's catalog
// in tap order.
//
// THE STYLE (SPEC_ask_slice3 S3-5): Standard or Simple, set here and nowhere else in this slice.
// It belongs to the ask, not the person, so the copy never mentions age, ability or reading (A3,
// A4). Simple shows 4 tiles at most (S3-1): the shelf still takes a 5th, and the footer says
// "Simple shows 4 at most." until it is gone or the style is Standard.
//
// ONE ID PER DRAFT (K1): the id is made on the first Save and kept while the draft is unchanged,
// so a retry after a dropped connection returns the same ask instead of a second one. Any edit to
// what would be saved drops it; the next Save makes a new one.
//
// WHERE MESSAGES GO (C2.1, Dan's walk 2026-11-07): a name this place already uses is caught as it
// is typed, against the loaded asks, and said right under "Who's picking?" with the EXISTING
// ask's spelling; Save waits. create_ask's 23505 is the backstop (another member got there
// first): the hook re-reads the asks, the same line appears, and the name field comes into view.
// Every other message sits in the sticky footer, above Cancel / Save shelf, so it is on screen
// whatever the scroll; a server failure also brings the field it is about into view.
//
// ONE SCROLLER (the 11-05 Add-sheet rule): the sheet scrolls; the catalog list flows inside it and
// search narrows it. It is never a scroll box of its own.
//
// The name is a person's (K3): its input and the name inside any message carry .op-name, which
// both RUM pipelines exclude in every environment. The failure copy is ours, never the server's
// (create_ask's message names the label).
export function NewShelfSheet({ catalogItems, asks, onCreate, onClose, closeButton }) {
  const [label, setLabel] = useState("");
  const [noun, setNoun] = useState("");
  const [target, setTarget] = useState(ASK_TARGET_DEFAULT);
  const [style, setStyle] = useState(ASK_STYLE_DEFAULT);
  const [itemIds, setItemIds] = useState([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState(null);
  const [serverDup, setServerDup] = useState(null);   // the name create_ask refused with 23505
  const attemptId = useRef(null);
  const labelField = useRef(null);
  const shelfField = useRef(null);

  const edit = (set) => (value) => { attemptId.current = null; setFailure(null); set(value); };
  const onLabel = (value) => { setServerDup(null); edit(setLabel)(value); };
  const draft = { label, noun, target, itemIds, style };
  const problem = askDraftProblem(draft);
  const touched = label.trim() !== "" || itemIds.length > 0;
  const existing = findDuplicateAsk(label, asks);
  const dupName = existing ? existing.label : serverDup;

  const sorted = useMemo(
    () => [...catalogItems].filter((i) => i.id).sort((a, b) => a.name.localeCompare(b.name)),
    [catalogItems]);
  const nameById = useMemo(() => new Map(sorted.map((i) => [i.id, i.name])), [sorted]);
  const q = query.trim().toLowerCase();
  const results = q ? sorted.filter((i) => i.name.toLowerCase().includes(q)) : sorted;

  const toggle = (id) => edit(setItemIds)((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= ASK_SHELF_MAX ? prev : [...prev, id]);

  const bringIntoView = (field) => {
    const el = field === "label" ? labelField.current : field === "shelf" ? shelfField.current : null;
    el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  };

  const save = async () => {
    if (problem || dupName || saving) return;
    if (!attemptId.current) attemptId.current = crypto.randomUUID();
    setSaving(true);
    setFailure(null);
    const result = await onCreate(attemptId.current, draft);
    if (result?.ok) { onClose(); return; }
    setSaving(false);
    const f = createAskFailure(result?.code, draft);
    if (result?.code === "23505") setServerDup(label.trim());
    else setFailure(f);
    bringIntoView(f.field);
  };

  const targets = [];
  for (let n = ASK_TARGET_MIN; n <= ASK_TARGET_MAX; n++) targets.push(n);

  // The footer line: a failed save first, else what the draft still needs (once started).
  const footer = failure
    ? <div className={`modal-error${failure.hasName ? " op-name" : ""}`} role="alert" style={{ flexBasis: "100%", margin: 0 }}>{failure.message}</div>
    : problem && touched && !dupName
      ? <div className="picker-sub" style={{ flexBasis: "100%", margin: 0 }}>{problem}</div>
      : null;

  return (
    <>
      {closeButton}
      <h2>New shelf</h2>
      <p className="modal-subtitle">A shelf of things someone can pick for the list. They don't need an account.</p>

      <div className="modal-field" ref={labelField}>
        <label className="modal-label" htmlFor="new-shelf-label">Who's picking?</label>
        <input id="new-shelf-label" className="modal-input op-name" maxLength={ASK_LABEL_MAX} autoFocus autoComplete="off"
          placeholder="A first name" value={label} onChange={(e) => onLabel(e.target.value)}
          aria-invalid={dupName ? true : undefined} aria-describedby={dupName ? "new-shelf-dup" : undefined} />
        {dupName && (
          <div id="new-shelf-dup" className="modal-error" role="alert" style={{ margin: "6px 0 0" }}>
            You already have Ask <span className="op-name">{dupName}</span>.
          </div>
        )}
      </div>

      <div className="modal-field">
        <label className="modal-label" htmlFor="new-shelf-noun">What are they picking? (optional)</label>
        <input id="new-shelf-noun" className="modal-input" maxLength={ASK_NOUN_MAX} autoComplete="off"
          placeholder="snacks" value={noun} onChange={(e) => edit(setNoun)(e.target.value)} />
      </div>

      <div className="modal-field">
        <span className="modal-label" id="new-shelf-target">How many to pick</span>
        <div role="radiogroup" aria-labelledby="new-shelf-target" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {targets.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={target === n}
              className={`cat-pill${target === n ? " on" : ""}`} style={{ padding: "9px 14px" }}
              onClick={() => edit(setTarget)(n)}>{n}</button>
          ))}
        </div>
        <div className="picker-sub" style={{ margin: "8px 0 0" }}>{pickLine(target, noun)}</div>
      </div>

      <div className="modal-field">
        <span className="modal-label" id="new-shelf-style">How it looks</span>
        <div role="radiogroup" aria-labelledby="new-shelf-style" style={{ display: "flex", gap: "8px" }}>
          {[
            { key: "standard", name: "Standard", sub: `Words and up to ${ASK_SHELF_MAX} tiles` },
            { key: "simple", name: "Simple", sub: `Big pictures, up to ${ASK_SIMPLE_MAX} tiles` },
          ].map((o) => (
            <button key={o.key} type="button" role="radio" aria-checked={style === o.key}
              className={`cat-pill${style === o.key ? " on" : ""}`}
              style={{ flex: "1 1 0", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px", padding: "10px 12px", textAlign: "left", borderRadius: "14px" }}
              onClick={() => edit(setStyle)(o.key)}>
              <span style={{ fontWeight: 700 }}>{o.name}</span>
              <span style={{ fontSize: "0.8rem", fontWeight: 400 }}>{o.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="modal-field" ref={shelfField}>
        <span className="modal-label">The shelf · {itemIds.length} {itemIds.length === 1 ? "item" : "items"}</span>
        {itemIds.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
            {itemIds.map((id) => (
              <button key={id} type="button" className="cat-pill on" style={{ padding: "6px 12px" }}
                aria-label={`Take ${nameById.get(id) || "this item"} off the shelf`} onClick={() => toggle(id)}>
                {nameById.get(id) || "Item"} <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
        <input className="modal-input" type="search" autoComplete="off" placeholder="Find an item"
          aria-label="Find an item for the shelf" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div data-testid="new-shelf-catalog" style={{ marginTop: "8px", borderTop: "1px solid #E8D5B7" }}>
          {results.length === 0 ? (
            <div className="picker-sub" style={{ margin: "10px 0" }}>Nothing in your catalog matches that.</div>
          ) : results.map((item) => {
            const on = itemIds.includes(item.id);
            return (
              <button key={item.id} type="button" aria-pressed={on} onClick={() => toggle(item.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "10px", width: "100%", textAlign: "left",
                  padding: "10px 4px", border: "none", borderBottom: "1px solid #F0E4D2", background: "transparent",
                  fontFamily: "'Lato', sans-serif", fontSize: "0.95rem", color: "#2C1A0E", fontWeight: on ? 700 : 400, cursor: "pointer",
                }}>
                <span aria-hidden="true" style={{ width: "18px", textAlign: "center", color: "#A0724A" }}>{on ? "✓" : "+"}</span>
                {item.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* The sticky footer (.modal-actions): its message line sits above the buttons, so it is
          always on screen. */}
      <div className="modal-actions" style={{ flexWrap: "wrap", rowGap: "8px" }}>
        {footer}
        <button className="modal-cancel" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="modal-confirm" onClick={save} disabled={!!problem || !!dupName || saving}
          style={{ opacity: problem || dupName || saving ? 0.5 : 1 }}>{saving ? "Saving…" : "Save shelf"}</button>
      </div>
    </>
  );
}

export default NewShelfSheet;
