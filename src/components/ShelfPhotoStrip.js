import { useRef, useState } from "react";
import { tileFace } from "../lib/askRun";

// Shelf photos (A23; SPEC_ask_slice2 C3b.2), under an ask's section header in Browse. One slot per
// tile, in shelf order: the item's photo when it has one, else the ITEM's own glyph if the catalog
// has one, else an empty slot with its ＋ — never the aisle's glyph (tileFace, C3b.1). A tap picks a
// photo (camera or library, the phone's own chooser) and replaces the item's photo; the same
// photo then shows on every ask that shelves the item. A grown-up's surface: the run itself never
// changes photos.
//
// Guidance (the base spec): "Photograph the item, not a person."
//
// Privacy: each <img> is .op-replay-block .op-photo, draggable="false" (the ReplayLabels rule).
// The slots carry item names only, never the ask's name.
//
// items: [{ id, name, glyph, photoUrl, hasPhoto }]. onPick(itemId, file) → { ok, reason }.
export function ShelfPhotoStrip({ items, onPick }) {
  const fileRef = useRef(null);
  const [target, setTarget] = useState(null);     // the item the chooser is open for
  const [busyId, setBusyId] = useState(null);
  const [failed, setFailed] = useState(null);     // { itemId, reason }

  const open = (id) => {
    if (busyId) return;
    setTarget(id);
    setFailed(null);
    if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); }
  };
  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    const id = target;
    if (!file || !id) return;
    setBusyId(id);
    const r = await onPick(id, file);
    setBusyId(null);
    if (!r || !r.ok) setFailed({ itemId: id, reason: r ? r.reason : "save" });
  };

  return (
    <div className="shelf-photos">
      <div className="shelf-photos-row">
        {items.map((item) => (
          <button key={item.id} type="button" className="shelf-photo-slot" onClick={() => open(item.id)} disabled={!!busyId}
            aria-label={`${item.hasPhoto ? "Change the photo of" : "Add a photo of"} ${item.name}`}>
            <span className="shelf-photo-art" aria-hidden="true">
              {busyId === item.id ? <span>…</span>
                : tileFace(item) === "photo" ? <img className="op-replay-block op-photo" src={item.photoUrl} alt="" draggable="false" />
                : tileFace(item) === "glyph" ? <span>{item.glyph}</span>
                : null}
              {!item.hasPhoto && busyId !== item.id && <span className="shelf-photo-plus">＋</span>}
            </span>
            <span className="shelf-photo-name">{busyId === item.id ? "Adding…" : item.name}</span>
          </button>
        ))}
      </div>
      <div className="shelf-photos-hint">
        {failed
          ? (failed.reason === "decode" ? "Couldn't read that photo. Try another." : "That photo didn't save. Try again.")
          : "Tap one to add its photo. Photograph the item, not a person."}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
      <style>{SHELF_PHOTOS_CSS}</style>
    </div>
  );
}

const SHELF_PHOTOS_CSS = `
.shelf-photos { margin: -4px 0 14px; }
.shelf-photos-row { display: flex; gap: 10px; overflow-x: auto; padding: 2px 0 6px; scrollbar-width: none; }
.shelf-photos-row::-webkit-scrollbar { display: none; }
.shelf-photo-slot { flex: 0 0 auto; width: 72px; display: flex; flex-direction: column; align-items: center; gap: 4px;
  background: none; border: none; padding: 0; cursor: pointer; font-family: 'Lato', sans-serif; color: #8A5F3A; }
.shelf-photo-slot:disabled { cursor: default; opacity: 0.7; }
.shelf-photo-art { position: relative; width: 64px; height: 64px; border-radius: 12px; overflow: hidden; background: #F3E6CF;
  border: 1px dashed #C9A97A; display: grid; place-items: center; font-size: 28px; }
.shelf-photo-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
.shelf-photo-plus { position: absolute; right: 3px; bottom: 1px; font-size: 13px; color: #8A5F3A; }
.shelf-photo-name { font-size: calc(12px * var(--op-text-scale, 1)); line-height: 1.2; max-width: 72px; text-align: center;
  overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.shelf-photos-hint { font-family: 'Lato', sans-serif; font-size: calc(12.5px * var(--op-text-scale, 1)); color: #8a7a60; font-style: italic; }
`;

export default ShelfPhotoStrip;
