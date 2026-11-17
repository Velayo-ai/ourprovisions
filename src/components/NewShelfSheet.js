import { useEffect, useMemo, useRef, useState } from "react";
import { photoNudge } from "../lib/askManage";
import {
  askDraftProblem, createAskFailure, findDuplicateAsk, pickLine, cleanAskLabel, askLook, ASK_LOOKS,
  ASK_LABEL_MAX, ASK_NOUN_MAX, ASK_TARGET_MIN, ASK_TARGET_MAX, ASK_SHELF_MAX, ASK_TARGET_DEFAULT,
  ASK_STYLE_DEFAULT, ASK_SIMPLE_CAP_MESSAGE,
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
// not a person."); tapping a photo tile replaces its photo through the same flow (SPEC_ask_setup_polish
// F1: no Replace / Remove sheet, Manage's strip's rule; the chooser's Cancel undoes a stray tap; the
// photo is the household's item's, A23, so it changes on every ask and in Browse). The same grid on
// Shopper and Explorer, in create and edit. Search and the ✓ list below remain the way to add.
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
// embedded (2026-11-13): the form inside the full-screen New ask / Edit ask screen (AskScreen) — the
// host draws the heading, the preview pill and the close button, so this renders none of them; the
// one-line intro stays, as the form's own lead. onDraftChange(draft), when given, hears every change
// to the name, the noun, the count and the look, so the host's preview can follow the form.
// photoIds: the catalog item ids with a live household photo; photoUrl(id) → the signed thumb, or null
// while it is still being minted; onPhoto(itemId, file) → { ok, reason }.
// onCreateItem(name, rawCategory) → the catalog row ({ id, name, … }) or null on a failure;
// createCategories: [{ rawName, label, glyph }] for its aisle pills. Without onCreateItem a search with
// no match says "Nothing in your catalog matches that." as before.
export function NewShelfSheet({ catalogItems, asks, onCreate, onUpdate, onClose, closeButton, edit: editing = null, photoIds = null, photoUrl = null, onPhoto = null, embedded = false, onDraftChange = null, onCreateItem = null, createCategories = [] }) {
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
  const [creating, setCreating] = useState(false);       // F3: a create in flight
  const [createFailed, setCreateFailed] = useState(false);
  const [createdNames, setCreatedNames] = useState(() => new Map());   // id → name for items made here
  const photoInput = useRef(null);
  const attemptId = useRef(null);
  const labelField = useRef(null);
  const shelfField = useRef(null);
  const searchField = useRef(null);
  const pressing = useRef(false);   // a press is in progress (see onSearchBlur)
  const [searchFocus, setSearchFocus] = useState(false);
  const [liftMin, setLiftMin] = useState(0);   // the catalog's min-height while the search field has focus

  // THE SEARCH FIELD RISES (SPEC_ask_setup_polish F2): with the keyboard and iOS's form-assistant bar up,
  // "Find an item" sat low and only ~2 results showed. On focus, wait for the keyboard (the first
  // visualViewport resize, else 350 ms), then bring the field to the top of the screen's one scroller
  // (scroll-margin-top 8px under the header); the results fill the space down to the keyboard. While it
  // has focus the catalog keeps a min-height of the scroller's height less the field, so a narrowed list
  // can't shrink the page and drop the field back down; blur releases it. The field moves; the results
  // never get a scroll box of their own (the 11-14 one-scroller rule). Reduced motion: no smooth scroll.
  // On the screen (AskScreen) the editor itself follows visualViewport, so the scroller IS the visible
  // area under the header: the min-height is measured from it, a frame after the editor resizes, and the
  // sticky Save footer is hidden while the field has focus (iPhone walk, IMG_6884/6885). Outside the
  // screen it falls back to the visible height.
  useEffect(() => {
    if (!searchFocus) return undefined;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const field = searchField.current;
    const measure = () => requestAnimationFrame(() => {
      const scroller = field?.closest?.(".ask-editor-body");
      const visible = scroller && scroller.clientHeight ? scroller.clientHeight : vv ? vv.height : window.innerHeight;
      setLiftMin(Math.max(0, Math.round(visible - (field ? field.offsetHeight : 0))));
    });
    const reduced = !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let lifted = false;
    const lift = () => {
      if (lifted) return;
      lifted = true;
      requestAnimationFrame(() => field?.scrollIntoView?.({ block: "start", behavior: reduced ? "auto" : "smooth" }));
    };
    const onResize = () => { measure(); lift(); };
    measure();
    const timer = setTimeout(lift, 350);
    if (vv) vv.addEventListener("resize", onResize);
    // A press in progress (pointerdown until just after its click): see onSearchBlur.
    const down = () => { pressing.current = true; };
    const done = () => { setTimeout(() => { pressing.current = false; }, 0); };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("click", done, true);
    document.addEventListener("pointercancel", done, true);
    return () => {
      clearTimeout(timer);
      if (vv) vv.removeEventListener("resize", onResize);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("click", done, true);
      document.removeEventListener("pointercancel", done, true);
    };
  }, [searchFocus]);

  // THE BLUR WAITS FOR THE TAP THAT CAUSED IT (found on dev 2026-11-17: a real click on a result in a
  // narrowed list missed). A press blurs the field before its click; releasing at once brought the
  // footer back and let go of the catalog's min-height, the page shrank, the scroller clamped and the
  // row moved out from under the pointer. So when a press is what blurred it, the release waits until
  // that press's click has run (or 1 s); a blur with no press (tap out, the keyboard's ✓) releases at
  // once. A refocus in the meantime keeps it. Result rows no longer blur at all (they keep the focus);
  // this stays for every other press that takes it away.
  const onSearchBlur = () => {
    const release = () => { if (document.activeElement !== searchField.current) setSearchFocus(false); };
    if (!pressing.current) { release(); return; }
    let guard = null;
    const after = () => {
      window.removeEventListener("click", after, true);
      window.removeEventListener("pointercancel", after, true);
      clearTimeout(guard);
      setTimeout(release, 0);
    };
    window.addEventListener("click", after, true);
    window.addEventListener("pointercancel", after, true);
    guard = setTimeout(after, 1000);
  };

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
  const nameById = useMemo(() => new Map([...createdNames, ...[...(editing ? editing.tiles : []), ...sorted].map((i) => [i.id, i.name])]), [editing, sorted, createdNames]);
  const q = query.trim().toLowerCase();
  const results = q ? sorted.filter((i) => i.name.toLowerCase().includes(q)) : sorted;

  // THE LOOK'S CAPACITY (2026-11-13): read from the look's config (askLook), never a literal here. The
  // count chips above pickCap are disabled; choosing a look whose pickCap is under the current count
  // clamps the count down, and the "Pick N for our list." line follows. The "N of M" header and the
  // "Remove k." line count against tileCap.
  const look = askLook(style);
  const explorer = style === "simple";
  const overBy = Math.max(0, itemIds.length - look.tileCap);
  const chooseStyle = (key) => {
    edit(setStyle)(key);
    const cap = askLook(key).pickCap;
    if (target > cap) setTarget(cap);
  };
  useEffect(() => {
    if (onDraftChange) onDraftChange({ label: cleanLabel, noun: noun.trim(), target, style });
  }, [onDraftChange, cleanLabel, noun, target, style]);

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

  // CREATE WITHOUT LEAVING THE ASK (SPEC_ask_setup_polish F3, Dan 2026-11-16: save right away). A
  // search with no match offers the typed name and the aisle pills; a tap writes the catalog row at
  // once (onCreateItem → createCatalogItemNow: match-first, catalog only, never the list), appends it
  // to the shelf like a tapped row (ASK_SHELF_MAX holds: a full shelf greys the pills), and clears the
  // search, so the new tile can be photographed straight away. Cancelling the ask leaves the item in
  // Browse as a normal custom item. A failure keeps the typed name and says so under the card.
  const shelfFull = itemIds.length >= ASK_SHELF_MAX;
  const createItem = async (rawCategory) => {
    const name = query.trim();
    if (creating || !name || shelfFull) return;
    setCreating(true);
    setCreateFailed(false);
    const item = await onCreateItem(name, rawCategory);
    setCreating(false);
    if (!item || !item.id) { setCreateFailed(true); return; }
    setCreatedNames((prev) => new Map(prev).set(item.id, item.name));
    edit(setItemIds)((prev) => (prev.includes(item.id) || prev.length >= ASK_SHELF_MAX ? prev : [...prev, item.id]));
    setQuery("");
  };
  const onQuery = (value) => { setCreateFailed(false); setQuery(value); };

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

  // THE SCREEN'S LAYOUT (2026-11-14): one page, one scroller. The screen's body (AskScreen) scrolls the
  // whole form; nothing inside it scrolls on its own. The footer is sticky at the bottom of that
  // scroller, so Save stays on screen and the last catalog row ends above it. (The 2026-11-13 layout
  // clamped the form to the viewport and gave the catalog its own scroller; on a phone the shrunken
  // "The ask" section pushed that list under the footer and out of reach.) Spacing does the grouping
  // (no rules between sections): 32px between sections, 8px from a label to its field.
  return (
    <div className={`ask-form${embedded ? " ask-form-screen" : ""}`}>
      {!embedded && closeButton}
      {!embedded && (editing
        ? <h2>Edit Ask <span className="op-name">{editing.label}</span></h2>
        : <h2>New ask</h2>)}

      <div className="modal-field" ref={labelField}>
        <label className="modal-label" htmlFor="new-shelf-label">Who's picking?</label>
        {/* autoFocus only for a new ask: in edit the keyboard opening on load let iOS scroll the field
            into view and tuck "Who's picking?" under the header. */}
        <input id="new-shelf-label" className="modal-input op-name" maxLength={ASK_LABEL_MAX} autoFocus={!editing} autoComplete="off"
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
            const off = n > look.pickCap;
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
          {ASK_LOOKS.map((o) => (
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

      <div className="modal-field ask-form-shelf" ref={shelfField}>
        <span className="modal-label">
          The ask · {overBy > 0
            ? <span style={{ color: "#e05c5c" }}>{itemIds.length} of {look.tileCap}</span>
            : <>{itemIds.length} {itemIds.length === 1 ? "item" : "items"}</>}
        </span>
        {itemIds.length > 0 && (
          <div className="shelf-tiles" role="list" aria-label="On the ask">
            {itemIds.map((id) => {
              const name = nameById.get(id) || "this item";
              const url = hasPhoto(id) && photoUrl ? photoUrl(id) : null;
              const busy = photoBusy === id;
              // The thumb (nothing while the signed URL is still coming), one element for both photo tiles.
              const thumb = url ? <img className="op-replay-block op-photo" src={url} alt="" draggable="false" /> : null;
              return (
                <div key={id} className="shelf-tile" role="listitem">
                  {hasPhoto(id) && onPhoto ? (
                    // A photo tile with a photo flow: a tap replaces the photo (SPEC_ask_setup_polish F1) —
                    // Manage's strip's rule; the old thumb stays under a dimmed "…" while the new one uploads.
                    <button type="button" className="shelf-tile-art shelf-tile-photo" disabled={!!photoBusy}
                      aria-label={`Change the photo of ${name}`} onClick={() => openPhoto(id)}>
                      {thumb}
                      {busy && <span className="shelf-tile-busy" aria-hidden="true">…</span>}
                    </button>
                  ) : hasPhoto(id) ? (
                    // A photo tile without a photo flow: the thumb (an empty box while the signed URL is still coming).
                    <div className="shelf-tile-art shelf-tile-photo" aria-hidden="true">
                      {thumb}
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
        {/* name / enterKeyHint: a non-name-like name so iOS doesn't offer "AutoFill Contact" (Dan's IMG_6884). */}
        <input ref={searchField} className="modal-input ask-form-search" type="search" autoComplete="off" placeholder="Find an item"
          name="ask-item-search" enterKeyHint="search" autoCorrect="off"
          aria-label="Find an item for the ask" value={query} onChange={(e) => onQuery(e.target.value)}
          onFocus={() => setSearchFocus(true)} onBlur={onSearchBlur} />
        <div data-testid="new-shelf-catalog" className="ask-form-catalog" style={searchFocus && liftMin ? { minHeight: `${liftMin}px` } : undefined}>
          {results.length === 0 && q && onCreateItem ? (
            // F3's card, in Browse's create-card look (dashed card, "Add "<name>"", a hint), with the New
            // item sheet's aisle pills inside it. Browse's own card is a launcher for that sheet, which puts
            // the item on the list, so it is matched in look here rather than shared.
            <div className="ask-create-card">
              <div className="ask-create-line">Add <strong>"{query.trim()}"</strong></div>
              <div className="ask-create-sub">
                {shelfFull ? `The ask holds ${ASK_SHELF_MAX}. Take one off to add this.` : "As a new item. Tap its category to add it to the ask."}
              </div>
              <div className="cat-grid" role="group" aria-label="Category for the new item">
                {createCategories.map((cat) => (
                  <button key={cat.rawName} type="button" className="cat-pill" disabled={creating || shelfFull}
                    onClick={() => createItem(cat.rawName)}>
                    <span className="cat-em">{cat.glyph}</span>{cat.label}
                  </button>
                ))}
              </div>
              {createFailed && <div className="modal-error" role="alert" style={{ margin: "10px 0 0" }}>Couldn't add that item. Try again.</div>}
            </div>
          ) : results.length === 0 ? (
            <div className="picker-sub" style={{ margin: "10px 0" }}>Nothing in your catalog matches that.</div>
          ) : results.map((item) => {
            const on = itemIds.includes(item.id);
            return (
              // A result tap keeps the focus in "Find an item" (F2 polish, Dan's iPhone walk): no blur, so the
              // keyboard stays up, Save stays hidden and the catalog's hold stays, and several items go on in
              // a row. mousedown's default is what moves focus (iOS fires it for a tap too); the click still
              // runs. Tapping out and the keyboard's ✓ blur as before (onSearchBlur).
              <button key={item.id} type="button" aria-pressed={on} onClick={() => toggle(item.id)}
                onMouseDown={(e) => e.preventDefault()}
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

      {/* The footer (.modal-actions): one full-width Save, the message line above it, always on screen.
          No Cancel (2026-11-13): the ✕ closes. */}
      {!searchFocus && <div className="modal-actions ask-form-actions">
        {footer}
        <button className="modal-confirm" onClick={save} disabled={!!problem || !!dupName || saving}
          style={{ opacity: problem || dupName || saving ? 0.5 : 1 }}>{saving ? "Saving…" : "Save ask"}</button>
      </div>}
      <style>{ASK_FORM_CSS}</style>
    </div>
  );
}

// The form's own layout. In a sheet (.ask-form alone) it flows as any sheet body. On the screen
// (.ask-form-screen) it is plain flow inside the one scroller; the footer is sticky at the scroller's
// bottom edge (full width over the 24px gutters, cream, a soft shadow rather than a rule), and the
// space after the catalog lets the last row clear it. The catalog's row rules stay: they separate
// items, not sections.
const ASK_FORM_CSS = `
.ask-form-actions { flex-direction: column; align-items: stretch; gap: 8px; }
.ask-form-actions .modal-confirm { width: 100%; }
.ask-form-screen .modal-field { margin: 0 0 32px; }
.ask-form-screen .modal-label { margin-bottom: 8px; }
.ask-form-screen .ask-form-shelf { margin-bottom: 16px; }
.ask-form-screen .ask-form-catalog { margin-top: 8px; }
.ask-form-search { scroll-margin-top: 8px; }
.ask-create-card { margin: 10px 0 6px; padding: 12px 14px; border-radius: 10px; border: 1.5px dashed #C9A97A; background: rgba(201,169,122,0.06); }
.ask-create-line { font: 400 calc(15px * var(--op-text-scale, 1)) 'Lato', sans-serif; color: #8A5F3A; }
.ask-create-sub { font: 400 calc(14px * var(--op-text-scale, 1)) 'Lato', sans-serif; color: #8A5F3A; margin: 2px 0 10px; }
.ask-create-card button:disabled { opacity: 0.5; cursor: default; }
.ask-form-screen .ask-form-actions { position: sticky; bottom: 0; margin: 0 -24px; padding: 12px 24px calc(16px + env(safe-area-inset-bottom, 0px)); }
`;

// Three across on a phone (~96 px tiles in a ~330 px sheet), more on a wider screen. The art box
// is square; a photo covers it, the dashed box carries a muted camera. The × is a 32 px target
// riding the top-right corner; the name sits under the art, two lines at most.
const SHELF_TILES_CSS = `
.shelf-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 12px 10px; margin: 2px 0 12px; }
.shelf-tile { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; }
.shelf-tile-art { width: 100%; aspect-ratio: 1 / 1; border-radius: 14px; overflow: hidden; background: #F3E6CF; display: grid; place-items: center; padding: 0; }
.shelf-tile-photo { border: 1px solid #E8D5B7; position: relative; }
button.shelf-tile-photo { cursor: pointer; font-family: inherit; }
button.shelf-tile-photo:disabled { cursor: default; }
.shelf-tile-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.shelf-tile-busy { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(250,244,236,0.6); color: #2C1A0E; font: 700 22px/1 'Lato', sans-serif; }
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
