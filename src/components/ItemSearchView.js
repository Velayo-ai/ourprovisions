import { useEffect, useRef, useState } from "react";
import { flushSync, createPortal } from "react-dom";
import { COLUMN_MIN_WIDTH, COLUMN_MAX_WIDTH } from "../nav";

// ItemSearchView — a full-screen search layer over the page: one input, Done, an optional count line,
// and one scroller for the results. Extracted from NewShelfSheet (SPEC_one_list R7 Commit A, 2026-11-26)
// with no change in behaviour, so the Ask's "Find or add an item" view and the List's quick picker are the
// same primitive, not a fork. Every rule below was the Ask view's (SPEC_ask_setup_polish F2 revised,
// 2026-11-16, Dan's iPhone); the comments travelled with the code.
//
// THE KEYBOARD MUST RISE ON THE FIRST TAP, and iOS only opens it when focus() runs synchronously inside the
// tap. So the view stays MOUNTED while hidden (visibility), and the opener's own click handler calls
// show(): it makes the view visible with flushSync and focuses the input right there, never in an effect
// or a timeout. useItemSearch() holds that state, so the opener can live anywhere (the Ask form's button,
// App's List + Add, the Helm's +). Result rows keep the focus (preventDefault on mousedown: keepFocus), so
// items go on one after another with the keyboard up; return only drops the keyboard; Done closes.
//
// PORTALED TO document.body (IMG_6888): inside an iOS overflow-scrolling container a fixed box is clipped /
// out-stacked. As a body child at z 2100 nothing can cover it.
//
// IN THE DESKTOP FRAME it stays a body child (nothing in the tree moves), but it takes the frame's bounds: the
// app is the centred phone-width .phone-frame there (top/bottom 24px, COLUMN_MAX_WIDTH wide, radius 22), and a
// body child would otherwise cover the whole window. Only on a desktop: past COLUMN_MIN_WIDTH AND a fine
// pointer that can hover. A phone, in either orientation (a sideways phone is past COLUMN_MIN_WIDTH too), never
// matches, so every rule here for iOS is untouched there. (2026-11-27: the layer escaped the frame since
// SPEC_one_list's picker, prod included.)
//
// THE VIEW FOLLOWS THE VISIBLE AREA (IMG_6907): while open, on visualViewport resize AND scroll, at most
// once per frame, the view's top is visualViewport.offsetTop and its height visualViewport.height (also
// applied synchronously in show()). The list ends at the keyboard's top (IMG_6891), and the cream backfill
// hangs off the view's bottom edge. THEN THE WINDOW COMES HOME: after open and after any pan, on the next
// frame, window.scrollTo(0, 0) if offsetTop is still > 0 (three tries per pan).
//
// NO DRAG LEAKS OUT OF THE VIEW (IMG_6891): a non-passive touchmove listener prevents the default unless the
// touch started inside the list AND the list can scroll in the drag's direction.

// The visible area as the view's box, or null when it is the whole screen at the top.
const visibleBox = () => {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  if (!vv) return null;
  const top = Math.max(0, Math.round(vv.offsetTop * 10) / 10);
  return top > 0.5 || window.innerHeight - vv.height > 1 ? { top, height: Math.round(vv.height) } : null;
};
const sameBox = (a, b) => a === b || (!!a && !!b && a.top === b.top && a.height === b.height);

// Rows and buttons inside the view keep the focus in the input: mousedown's default is what moves focus
// (iOS fires it for a tap too); the click still runs.
export const keepFocus = (e) => e.preventDefault();

// The view's state, held by whoever opens it. show() and hide() are the ONLY way in and out.
export function useItemSearch() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewBox, setViewBox] = useState(null);   // { top, height }: the visible area, while it isn't the whole screen
  const searchField = useRef(null);
  const viewRef = useRef(null);
  const show = () => {
    flushSync(() => setSearchOpen(true));              // visible now, in this tap …
    searchField.current?.focus({ preventScroll: true });  // … so this focus raises the keyboard on the first tap
    flushSync(() => setViewBox(visibleBox()));         // … and the view is on the visible area before this tap paints
  };
  const hide = () => {
    searchField.current?.blur();
    setSearchOpen(false);
  };
  return { open: searchOpen, show, hide, inputRef: searchField, viewRef, viewBox, setViewBox };
}

// search: useItemSearch()'s handle. onClose: Done / Escape (the host resets its own state and calls hide()).
// query / onQuery: the input's value. label: the dialog's name. input: { className, placeholder, name,
// ariaLabel }. title (optional): a title bar above the field — "Add to our list" with Done beside it; without
// it the input and Done share one row (the Ask view). count (optional): the count line between the head and
// the list. listTestId, className: for the host. children: the list. overlay (optional): drawn over the list
// inside the view (the picker's toast), so it sits on the visible area, above the keyboard.
// One add (SPEC_results_feeder_standard R2, flag-on hosts only; every one defaults to today's view):
//   fieldAside — controls beside the field in the title variant (the layout toggle, View & filter).
//   tools      — a row under the field (the rail), above the count and the list.
//   onSubmit   — the return key with text in the field: the host's add (the List feeder adds what was typed);
//                the field keeps the focus, so the keyboard stays up for the next. Without it, return only
//                drops the keyboard.
//   doneLabel  — the Done pill's words (one add: "Done · N" once something was added this visit).
//   subtitle   — a status line under the title in the title bar ("What do we need? · N items").
//   suspended  — the view stays open (its state, its query) but is hidden while a sheet the feeder
//                opened sits over the app (New item, View & filter, the Ask chooser); those sheets live in
//                the app's tree below this portal's z 2100, so the feeder steps aside rather than out-stack them.
export function ItemSearchView({ search, onClose, query, onQuery, label, input = {}, title = null, subtitle = null, onSubmit = null, doneLabel = null, count = null, listTestId, className = "", overlay = null, fieldAside = null, tools = null, suspended = false, children }) {
  const { open, viewRef, viewBox, setViewBox, inputRef } = search;

  useEffect(() => {
    if (!open) return undefined;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return undefined;
    let frame = null;
    let homeFrame = null;
    let tries = 0;
    const home = () => {
      homeFrame = null;
      if (vv.offsetTop <= 0.5) { tries = 0; return; }
      if (tries >= 3) return;
      tries += 1;
      window.scrollTo(0, 0);
    };
    const apply = () => {
      frame = null;
      const next = visibleBox();
      setViewBox((prev) => (sameBox(prev, next) ? prev : next));
      if (vv.offsetTop <= 0.5) tries = 0;
      else if (homeFrame === null) homeFrame = requestAnimationFrame(home);
    };
    const onChange = () => { if (frame === null) frame = requestAnimationFrame(apply); };
    onChange();   // after open: follow, then bring the window home
    vv.addEventListener("resize", onChange);
    vv.addEventListener("scroll", onChange);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      if (homeFrame !== null) cancelAnimationFrame(homeFrame);
      vv.removeEventListener("resize", onChange);
      vv.removeEventListener("scroll", onChange);
      setViewBox(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const view = viewRef.current;
    if (!open || !view) return undefined;
    let list = null;
    let lastY = 0;
    const onStart = (e) => {
      const t = e.touches && e.touches[0];
      const inList = e.target && e.target.closest ? e.target.closest(".ask-search-list") : null;
      list = inList && view.contains(inList) ? inList : null;
      lastY = t ? t.clientY : 0;
    };
    const onMove = (e) => {
      const t = e.touches && e.touches[0];
      const y = t ? t.clientY : lastY;
      const dy = y - lastY;
      lastY = y;
      let allowed = false;
      if (list && e.touches.length === 1) {
        const max = list.scrollHeight - list.clientHeight;
        if (dy > 0) allowed = list.scrollTop > 0;                 // finger down: towards the list's top
        else if (dy < 0) allowed = list.scrollTop < max - 1;      // finger up: towards its end
        else allowed = max > 1;
      }
      if (!allowed && e.cancelable) e.preventDefault();
    };
    view.addEventListener("touchstart", onStart, { passive: true });
    view.addEventListener("touchmove", onMove, { passive: false });
    return () => { view.removeEventListener("touchstart", onStart); view.removeEventListener("touchmove", onMove); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const field = (
    // name / enterKeyHint: a non-name-like name so iOS doesn't offer "AutoFill Contact" (Dan's IMG_6884).
    <input ref={inputRef} className={input.className || "modal-input"} type="search" autoComplete="off" placeholder={input.placeholder}
      name={input.name} enterKeyHint="search" autoCorrect="off" tabIndex={open ? 0 : -1}
      aria-label={input.ariaLabel} value={query} onChange={(e) => onQuery(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (onSubmit && query.trim()) onSubmit(); else e.currentTarget.blur();
      }} />
  );
  const done = (extra = "") => (
    <button type="button" className={`ask-search-done${extra}`} onClick={onClose} tabIndex={open ? 0 : -1}>{doneLabel || "Done"}</button>
  );

  return (
    <>
      {typeof document !== "undefined" && createPortal(
        <div ref={viewRef} className={`ask-search${className ? ` ${className}` : ""}${open ? " open" : ""}${open && suspended ? " suspended" : ""}`} role="dialog" aria-modal="true" aria-label={label}
          style={open && viewBox ? { top: `${viewBox.top}px`, height: `${viewBox.height}px`, bottom: "auto" } : undefined}
          aria-hidden={open ? undefined : true} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
          {title ? (
            <>
              <div className={`item-search-titlebar${subtitle ? " has-sub" : ""}`}>
                {subtitle ? (
                  <div className="item-search-titletext">
                    <h2 className="item-search-title">{title}</h2>
                    <div className="item-search-sub">{subtitle}</div>
                  </div>
                ) : <h2 className="item-search-title">{title}</h2>}
                {done(" item-search-done")}
              </div>
              <div className="ask-search-head item-search-field">
                <span className="item-search-glass" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
                </span>
                {field}
                {fieldAside}
              </div>
            </>
          ) : (
            <div className="ask-search-head">
              {field}
              {done()}
            </div>
          )}
          {tools}
          {count && <div className="ask-search-count">{count}</div>}
          <div data-testid={listTestId} className="ask-search-list">
            {children}
          </div>
          {overlay}
        </div>, document.body)}
      <style>{ITEM_SEARCH_CSS}</style>
    </>
  );
}

// The view's own layout (moved from NewShelfSheet's ASK_FORM_CSS unchanged), plus the title-bar variant
// (the quick picker, mockup "Our List — one list, one screen" screen 3).
export const ITEM_SEARCH_CSS = `
.ask-search { position: fixed; inset: 0; z-index: 2100; touch-action: pan-y; display: flex; flex-direction: column; background: #FAF4EC; color: #2C1A0E;
  padding-top: env(safe-area-inset-top, 0px); visibility: hidden; opacity: 0; transform: translateY(12px);
  transition: opacity 160ms ease-out, transform 160ms ease-out, visibility 0s linear 160ms; }
.ask-search.open { visibility: visible; opacity: 1; transform: none; transition: opacity 160ms ease-out, transform 160ms ease-out, visibility 0s; }
.ask-search.open.suspended { visibility: hidden; opacity: 0; transition: none; }
/* THE BACKFILL (Dan's iPhone, IMG_6895). Sized to visualViewport.height, the view ends above the keyboard, but
   iOS 26's keyboard bar is translucent and floats with a gap, so the page showed through below the list.
   A cream skirt hangs off the view's bottom edge, a screen tall: whatever the keyboard leaves see-through, or
   any strip a pan uncovers, shows the view's own cream. It is part of the view, so the no-leak touchmove
   guard covers drags on it too. */
.ask-search::after { content: ""; position: absolute; top: 100%; left: 0; right: 0; height: 100vh; background: #FAF4EC; pointer-events: auto; }
@media (prefers-reduced-motion: reduce) { .ask-search, .ask-search.open { transition: none; transform: none; } }
.ask-search-head { flex: none; display: flex; align-items: center; gap: 12px; padding: 12px 16px 8px; }
.ask-search-head .ask-form-search { flex: 1 1 auto; min-width: 0; margin: 0; }
.ask-search-done { flex: none; border: none; background: none; padding: 10px 4px; font: 700 calc(16px * (1 + (var(--op-text-scale, 1) - 1) * 0.8)) 'Lato', sans-serif; color: #A0724A; cursor: pointer; }
.ask-search-count { flex: none; padding: 0 16px 8px; font: 400 calc(13px * var(--op-text-scale, 1)) 'Lato', sans-serif; color: #8A5F3A; }
.ask-search-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 0 16px 8px; }
.item-search-titlebar { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 60px; padding: 0 16px;
  border-bottom: 1.5px solid #d8bf94; }
.item-search-title { margin: 0; min-width: 0; font: 400 calc(22px * (1 + (var(--op-text-scale, 1) - 1) * 0.4)) 'Playfair Display', serif; color: #2C1A0E; }
.item-search-titlebar.has-sub { padding: 10px 16px; }
.item-search-titletext { min-width: 0; }
.item-search-sub { margin-top: 4px; font: 400 calc(14px * var(--op-text-scale, 1)) 'Lato', sans-serif; color: #8a7a60; }
.ask-search-done.item-search-done { min-height: 44px; padding: 0 22px; border-radius: 999px; background: #3A281C; color: #FFFDF9; }
.item-search-field { position: relative; padding: 14px 16px 6px; }
.item-search-glass { position: absolute; left: 30px; top: 50%; margin-top: 4px; transform: translateY(-50%); color: #9A7350; display: flex; pointer-events: none; }
/* The desktop frame (see the header): the frame's box, its radius, nothing hanging out of it. !important on the
   top / height because the visible-area follow writes them inline (a desktop pinch-zoom can set it). */
@media (min-width: ${COLUMN_MIN_WIDTH}px) and (hover: hover) and (pointer: fine) {
  .ask-search { top: 24px !important; bottom: 24px !important; height: auto !important;
    left: max(24px, calc(50% - ${COLUMN_MAX_WIDTH / 2}px)); right: max(24px, calc(50% - ${COLUMN_MAX_WIDTH / 2}px));
    border-radius: 22px; overflow: hidden; overflow: clip; box-shadow: 0 26px 60px -14px rgba(20,10,4,.55); }
  /* No desktop scrollbar inside the frame, as .phone-scroll (it reads as a phone). */
  .ask-search-list { scrollbar-width: none; }
  .ask-search-list::-webkit-scrollbar { display: none; width: 0; height: 0; }
}
.item-search-field input { flex: 1 1 auto; min-width: 0; margin: 0; height: 52px; padding-left: 42px; border-radius: 16px; border: 1.5px solid #d8bf94; background: #fff;
  font-size: calc(17px * var(--op-text-scale, 1)); }
`;

export default ItemSearchView;
