import { useMemo, useRef, useState } from "react";
import { photoNudge } from "../lib/askManage";
import {
  askDraftProblem, createAskFailure, findDuplicateAsk, pickLine, cleanAskLabel,
  ASK_LABEL_MAX, ASK_NOUN_MAX, ASK_TARGET_MIN, ASK_TARGET_MAX, ASK_SHELF_MAX, ASK_TARGET_DEFAULT,
  ASK_SIMPLE_MAX, ASK_STYLE_DEFAULT, ASK_SIMPLE_CAP_MESSAGE,
} from "../lib/askCreate";

// + New shelf (SPEC_ask_slice2 C2; 078 create_ask). The body of the sheet: who's picking, an
// optional noun, how many to pick (1–6), the style, and the shelf, chosen from this place's catalog
// in tap order.
//
// THE STYLE (SPEC_ask_slice3 S3-5): set here and nowhere else in this slice. On screen the two are
// Shopper and Explorer (Dan, 2026-11-09); the stored values stay standard / simple. It belongs to
// the ask, not the person, so the copy never mentions age, ability or reading (A3, A4). Explorer
// shows 4 tiles at most (S3-1): pick targets above 4 are greyed out and choosing Explorer drops a
// higher target to 4. The shelf still takes a 5th item and nothing is removed for you: the shelf
// header reads "6 of 4" in the error colour and, right under the chips, "Explorer shows 4 at most.
// Remove 2." counts down to nothing at 4. That line replaces the footer's copy of the message.
//
// EDIT (SPEC_ask_slice4 S4-2): the same sheet, so create and edit can't drift apart. With `edit`
// it is "Edit Ask {Label}", prefilled from the ask's LIVE shelf rows in order (S4-9: the names
// come with the rows, so a tile this person hid in Browse still shows as a chip; the catalog list
// below is still this person's Browse, so such a tile can be taken off but not put back). Save
// calls onUpdate(draft) → update_ask (083), the whole form, last write wins; the codes and copy
// are create's. The ask's own name is never a duplicate of itself. Delete is not here: it lives on
// the ask's row in Manage categories & asks (Dan, 2026-11-10).
//
// THE SHELF IS A TILE GRID (Dan, 2026-11-10): the shelf's items in shelf order, three across on a
// phone (~96 px), each the item's household thumb, else a dashed box with a muted camera; the name
// under it; a small × in the corner takes it off. Tapping a photo-less tile runs Browse's own photo
// flow (onPhoto → setItemPhoto, the item-photos bucket; the phone's chooser, "Photograph the item,
// not a person."); tapping a photo tile does nothing. The same grid on Shopper and Explorer, in
// create and edit. Search and the ✓ list below remain the way to add.
//
// THE EXPLORER PHOTO NUDGE (S4-7): on Explorer only, under the grid, in muted text: "Explorers
// pick by picture. Add a photo for {A} and {B}." A hint, never a block: the parent may have a
// reader at the Explorer stage. The photo is the household's item's (A23), so it can be taken
// before the ask exists.
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
// edit: null for + New shelf, else { id, label, shelfNoun, pickTarget, screenStyle, tiles: [{ id, name }] }
// (the live tiles, in shelf order). onUpdate(draft) resolves to { ok } or { ok: false, code }.
// photoIds: the catalog item ids with a live household photo; photoUrl(id) → the signed thumb, or null
// while it is still being minted; onPhoto(itemId, file) → { ok, reason }.
export function NewShelfSheet({ catalogItems, asks, onCreate, onUpdate, onClose, closeButton, edit: editing = null, photoIds = null, photoUrl = null, onPhoto = null }) {
  const [label, setLabel] = useState(editing ? editing.label : "");
  const [noun, setNoun] = useState(editing ? editing.shelfNoun || "" : "");
  const [target, setTarget] = useState(editing ? editing.pickTarget : ASK_TARGET_DEFAULT);
  const [style, setStyle] = useState(editing && editing.screenStyle === "simple" ? "simple" : ASK_STYLE_DEFAULT);
  const [itemIds, setItemIds] = useState(editing ? editing.tiles.map((t) => t.id) : []);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState(null);
  const [serverDup, setServerDup] = useState(null);   // the name create_ask refused with 23505
  const [photoFor, setPhotoFor] = useState(null);       // the tile the chooser is open for
  const [photoBusy, setPhotoBusy] = useState(null);
  const [photoFailed, setPhotoFailed] = useState(null);  // "decode" | "upload" | "save"
  const photoInput = useRef(null);
  const attemptId = useRef(null);
  const labelField = useRef(null);
  const shelfField = useRef(null);

  const edit = (set) => (value) => { attemptId.current = null; setFailure(null); set(value); };
  const onLabel = (value) => { setServerDup(null); edit(setLabel)(value); };
  // The label as it will be saved (cleanAskLabel): the field keeps what was typed.
  const cleanLabel = cleanAskLabel(label);
  const draft = { label: cleanLabel, noun, target, itemIds, style };
  const problem = askDraftProblem(draft);
  const touched = label.trim() !== "" || itemIds.length > 0;
  const existing = findDuplicateAsk(cleanLabel, editing ? (asks || []).filter((a) => a.id !== editing.id) : asks);
  const dupName = existing ? existing.label : serverDup;

  const sorted = useMemo(
    () => [...catalogItems].filter((i) => i.id).sort((a, b) => a.name.localeCompare(b.name)),
    [catalogItems]);
  // Names for the chips: the shelf's own rows first (a tile hidden from this Browse has no catalog
  // row here), then the catalog.
  const nameById = useMemo(() => new Map([...(editing ? editing.tiles : []), ...sorted].map((i) => [i.id, i.name])), [editing, sorted]);
  const q = query.trim().toLowerCase();
  const results = q ? sorted.filter((i) => i.name.toLowerCase().includes(q)) : sorted;

  const explorer = style === "simple";
  const overBy = explorer ? Math.max(0, itemIds.length - ASK_SIMPLE_MAX) : 0;
  const chooseStyle = (key) => {
    edit(setStyle)(key);
    if (key === "simple" && target > ASK_SIMPLE_MAX) setTarget(ASK_SIMPLE_MAX);
  };

  const hasPhoto = (id) => !!(photoIds && photoIds.has(id));
  // The nudge (S4-7): Explorer only, with a photo flow to offer; the photo-less tiles in shelf order.
  const nudgeIds = explorer && onPhoto ? itemIds.filter((id) => !hasPhoto(id)) : [];
  const openPhoto = (id) => {
    if (photoBusy) return;
    setPhotoFor(id);
    setPhotoFailed(null);
    if (photoInput.current) { photoInput.current.value = ""; photoInput.current.click(); }
  };
  const pickPhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    const id = photoFor;
    if (!file || !id) return;
    setPhotoBusy(id);
    const r = await onPhoto(id, file);
    setPhotoBusy(null);
    if (!r || !r.ok) setPhotoFailed(r ? r.reason : "save");
  };

  const toggle = (id) => edit(setItemIds)((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= ASK_SHELF_MAX ? prev : [...prev, id]);

  const bringIntoView = (field) => {
    const el = field === "label" ? labelField.current : field === "shelf" ? shelfField.current : null;
    el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  };

  const save = async () => {
    if (problem || dupName || saving) return;
    if (!editing && !attemptId.current) attemptId.current = crypto.randomUUID();
    setSaving(true);
    setFailure(null);
    const result = editing ? await onUpdate(draft) : await onCreate(attemptId.current, draft);
    if (result?.ok) { onClose(); return; }
    setSaving(false);
    const f = createAskFailure(result?.code, draft);
    if (result?.code === "23505") setServerDup(cleanLabel);
    else setFailure(f);
    bringIntoView(f.field);
  };

  const targets = [];
  for (let n = ASK_TARGET_MIN; n <= ASK_TARGET_MAX; n++) targets.push(n);

  // The footer line: a failed save first, else what the draft still needs (once started).
  const footer = failure
    ? <div className={`modal-error${failure.hasName ? " op-name" : ""}`} role="alert" style={{ flexBasis: "100%", margin: 0 }}>{failure.message}</div>
    : problem && touched && !dupName && problem !== ASK_SIMPLE_CAP_MESSAGE
      ? <div className="picker-sub" style={{ flexBasis: "100%", margin: 0 }}>{problem}</div>
      : null;

  return (
    <>
      {closeButton}
      {editing ? (
        <h2>Edit Ask <span className="op-name">{editing.label}</span></h2>
      ) : (
        <>
          <h2>New shelf</h2>
          <p className="modal-subtitle">A shelf of things someone can pick for the list. They don't need an account.</p>
        </>
      )}

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
          {targets.map((n) => {
            const off = explorer && n > ASK_SIMPLE_MAX;
            return (
              <button key={n} type="button" role="radio" aria-checked={target === n} disabled={off}
                className={`cat-pill${target === n ? " on" : ""}`}
                style={{ padding: "9px 14px", ...(off ? { opacity: 0.4, cursor: "not-allowed" } : null) }}
                onClick={() => edit(setTarget)(n)}>{n}</button>
            );
          })}
        </div>
        <div className="picker-sub" style={{ margin: "8px 0 0" }}>{pickLine(target, noun)}</div>
      </div>

      <div className="modal-field">
        <span className="modal-label" id="new-shelf-style">How it looks</span>
        <div role="radiogroup" aria-labelledby="new-shelf-style" style={{ display: "flex", gap: "8px" }}>
          {[
            { key: "simple", name: "Explorer", sub: `Big pictures, up to ${ASK_SIMPLE_MAX}` },
            { key: "standard", name: "Shopper", sub: `Names and pictures, up to ${ASK_SHELF_MAX}` },
          ].map((o) => (
            <button key={o.key} type="button" role="radio" aria-checked={style === o.key}
              className={`cat-pill${style === o.key ? " on" : ""}`}
              style={{ flex: "1 1 0", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px", padding: "10px 12px", textAlign: "left", borderRadius: "14px" }}
              onClick={() => chooseStyle(o.key)}>
              <span style={{ fontWeight: 700 }}>{o.name}</span>
              <span style={{ fontSize: "0.8rem", fontWeight: 400 }}>{o.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="modal-field" ref={shelfField}>
        <span className="modal-label">
          The ask · {overBy > 0
            ? <span style={{ color: "#e05c5c" }}>{itemIds.length} of {ASK_SIMPLE_MAX}</span>
            : <>{itemIds.length} {itemIds.length === 1 ? "item" : "items"}</>}
        </span>
        {itemIds.length > 0 && (
          <div className="shelf-tiles" role="list" aria-label="On the ask">
            {itemIds.map((id) => {
              const name = nameById.get(id) || "this item";
              const url = hasPhoto(id) && photoUrl ? photoUrl(id) : null;
              const busy = photoBusy === id;
              return (
                <div key={id} className="shelf-tile" role="listitem">
                  {hasPhoto(id) ? (
                    // A photo tile: the thumb (an empty box while the signed URL is still coming); a tap does nothing.
                    <div className="shelf-tile-art shelf-tile-photo" aria-hidden="true">
                      {url && <img className="op-replay-block op-photo" src={url} alt="" draggable="false" />}
                    </div>
                  ) : onPhoto ? (
                    <button type="button" className="shelf-tile-art shelf-tile-empty" disabled={!!photoBusy}
                      aria-label={`Add a photo of ${name}`} onClick={() => openPhoto(id)}>
                      <span className="shelf-tile-camera" aria-hidden="true">{busy ? "…" : "📷"}</span>
                    </button>
                  ) : (
                    <div className="shelf-tile-art shelf-tile-empty" aria-hidden="true"><span className="shelf-tile-camera">📷</span></div>
                  )}
                  <button type="button" className="shelf-tile-remove" aria-label={`Take ${name} off the ask`} onClick={() => toggle(id)}>
                    <span aria-hidden="true">×</span>
                  </button>
                  <span className="shelf-tile-name">{nameById.get(id) || "Item"}</span>
                </div>
              );
            })}
            <style>{SHELF_TILES_CSS}</style>
          </div>
        )}
        {overBy > 0 && (
          <div className="modal-error" role="status" style={{ margin: "0 0 10px" }}>{ASK_SIMPLE_CAP_MESSAGE} Remove {overBy}.</div>
        )}
        {(nudgeIds.length > 0 || photoFailed) && (
          <div className="picker-sub" style={{ margin: "0 0 10px" }}>
            {photoFailed
              ? (photoFailed === "decode" ? "Couldn't read that photo. Try another." : "That photo didn't save. Try again.")
              : photoNudge(nudgeIds.map((id) => nameById.get(id)))}
          </div>
        )}
        {onPhoto && <input ref={photoInput} type="file" accept="image/*" hidden onChange={pickPhoto} />}
        <input className="modal-input" type="search" autoComplete="off" placeholder="Find an item"
          aria-label="Find an item for the ask" value={query} onChange={(e) => setQuery(e.target.value)} />
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
          style={{ opacity: problem || dupName || saving ? 0.5 : 1 }}>{saving ? "Saving…" : "Save ask"}</button>
      </div>
    </>
  );
}

// Three across on a phone (~96 px tiles in a ~330 px sheet), more on a wider screen. The art box
// is square; a photo covers it, the dashed box carries a muted camera. The × is a 32 px target
// riding the top-right corner; the name sits under the art, two lines at most.
const SHELF_TILES_CSS = `
.shelf-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 12px 10px; margin: 2px 0 12px; }
.shelf-tile { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; }
.shelf-tile-art { width: 100%; aspect-ratio: 1 / 1; border-radius: 14px; overflow: hidden; background: #F3E6CF; display: grid; place-items: center; padding: 0; }
.shelf-tile-photo { border: 1px solid #E8D5B7; }
.shelf-tile-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.shelf-tile-empty { border: 1px dashed #C9A97A; cursor: pointer; font-family: inherit; }
.shelf-tile-empty:disabled { cursor: default; opacity: 0.7; }
.shelf-tile-camera { font-size: 26px; opacity: 0.45; filter: grayscale(1); }
.shelf-tile-remove { position: absolute; top: -6px; right: -6px; width: 32px; height: 32px; border-radius: 50%; border: 1px solid #E8D5B7;
  background: #FFFDF9; color: #2C1A0E; font: 700 16px/1 'Lato', sans-serif; cursor: pointer; display: grid; place-items: center;
  box-shadow: 0 1px 3px rgba(44,26,14,0.18); }
.shelf-tile-name { font: 400 calc(12.5px * var(--op-text-scale, 1)) 'Lato', sans-serif; line-height: 1.2; color: #2C1A0E; text-align: center;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
`;

export default NewShelfSheet;
