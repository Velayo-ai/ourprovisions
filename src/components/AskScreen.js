import { useState, useCallback } from "react";
import { NewShelfSheet } from "./NewShelfSheet";
import { AskIcon } from "./AskIcon";

// THE ASK SCREEN (2026-11-13): New ask and Edit Ask {Label}, full screen over the app like the run
// (AskRun), never a sheet. Opened from "+ New ask" in View & organize and from an Ask's row there (edit).
// The header is the sheet's cream with the usual dark title, a 3px --people-strong line across its top
// edge (the people tokens: an Ask is an invitation to take part), the close button and a live preview
// of the Ask's pill — always there: a ghost ("Ask …", dashed --people-border, half opacity) until a
// name is typed, then the real Ask pill, "Ask {name} · {theme}" (the theme is "What are they
// picking?", left off while empty), following every keystroke. The body is the Ask form as it was
// (NewShelfSheet, embedded): the same fields, the same footer, the same save. The form reports its
// draft up (onDraftChange) and the preview follows it. "Pill" is our word, never on screen.
//
// Privacy: the name is a person's (K3) — it sits in .op-name in the title and the preview, never in an
// attribute; the dialog's label is fixed copy.
export function AskScreen({ edit = null, closeButton, onClose, ...form }) {
  const [draft, setDraft] = useState({ label: edit ? edit.label : "", noun: edit ? edit.shelfNoun || "" : "" });
  const onDraftChange = useCallback((d) => setDraft({ label: d.label, noun: d.noun }), []);
  return (
    <div className="ask-editor" role="dialog" aria-modal="true" aria-label={edit ? "Edit ask" : "New ask"}>
      <header className="ask-editor-head">
        {closeButton}
        <h2>{edit ? <>Edit Ask <span className="op-name">{edit.label}</span></> : "New ask"}</h2>
        <span className={`cat-pill people-pill ask-editor-preview${draft.label ? "" : " ask-editor-ghost"}`} aria-live="polite">
          <span className="cat-em"><AskIcon /></span>
          {draft.label
            ? <span>Ask <span className="op-name">{draft.label}</span>{draft.noun ? ` · ${draft.noun}` : ""}</span>
            : <span>Ask …</span>}
        </span>
      </header>
      <div className="ask-editor-body">
        <NewShelfSheet {...form} edit={edit} onClose={onClose} closeButton={null} embedded onDraftChange={onDraftChange} />
      </div>
      <style>{ASK_EDITOR_CSS}</style>
    </div>
  );
}

// Truly full screen (2026-11-13): fixed over everything at the run's z-index, edge to edge on every
// axis (the dynamic viewport height, so a phone's browser chrome never leaves a strip of page showing),
// the page cream behind everything, no inset and no width cap. The header is the same cream with the
// accent line as its top border; no rule under it — spacing groups the sections. The body is THE one
// scroller (2026-11-14): the whole form scrolls as one page, the form's sticky footer pinned at its
// bottom. The page lock (useScrollLock) touches only body and the app's scroll column, never this.
const ASK_EDITOR_CSS = `
.ask-editor { position: fixed; inset: 0; height: 100dvh; z-index: 2000; background: #FAF4EC; color: #2C1A0E; display: flex; flex-direction: column; overscroll-behavior: contain; }
.ask-editor-head { position: relative; flex: none; background: #FAF4EC; color: #2C1A0E; border-top: 3px solid var(--people-strong);
  padding: calc(16px + env(safe-area-inset-top, 0px)) 24px 24px; }
.ask-editor-head h2 { font-family: 'Playfair Display', serif; font-size: calc(1.4rem * (1 + (var(--op-text-scale, 1) - 1) * 0.5)); font-weight: 700;
  color: #2C1A0E; margin: 0; padding-right: 44px; display: block; }
.ask-editor-head .sheet-close { top: calc(8px + env(safe-area-inset-top, 0px)); right: 8px; }
.ask-editor-preview { display: inline-flex; margin-top: 14px; cursor: default; }
/* The ghost: the Ask's place in the header before it has a name — dashed people border, half strength. */
.ask-editor-ghost { background: transparent; border: 1px dashed var(--people-border); color: var(--people-ink); opacity: 0.5; }
.ask-editor-body { position: relative; flex: 1 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
  touch-action: pan-y; width: 100%; box-sizing: border-box; padding: 0 24px; }
`;

export default AskScreen;
