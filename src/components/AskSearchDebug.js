import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// THE SEARCH VIEW'S DEBUG READOUT (2026-11-17, dev / preview only). Four fixes for "the view slides when
// dragging with the keyboard up" were guesses a headless browser couldn't check; this measures it on the
// phone. NO BEHAVIOUR: it only reads, its listeners are passive, and its panel is pointer-events: none.
//
// NEVER IN A PRODUCTION BUILD: ASK_SEARCH_DEBUG is the same build-time check rum.js uses (isProd =
// REACT_APP_DEPLOY_ENV === "production"). Vercel sets "production" for Production, CRA inlines it, the
// constant folds to false and `ASK_SEARCH_DEBUG && <AskSearchDebug />` drops out of the bundle.
//
// ON / OFF: a 1-second long-press on the view's "The ask · N items" line, remembered in localStorage
// (op_ask_search_debug). The panel is fixed at the top of the VISIBLE area (top = visualViewport.offsetTop,
// set every frame) so it stays on screen wherever iOS pans. Per frame it shows: the bundle; visualViewport
// height / offsetTop / pageTop; window.innerHeight and scrollY; the scrolling element's scrollTop; the
// view's rect top and height; the list's scrollTop / scrollHeight / clientHeight; the active element; the
// computed overflow and position of body and html (the scroll lock). LAST DRAG: at touchstart the target
// and whether it is inside the list; at touchend what moved during the drag (the list's scrollTop,
// window.scrollY, visualViewport.offsetTop) and by how much.
export const askSearchDebugAllowed = (deployEnv) => deployEnv !== "production";
// Written as a direct comparison (not through the function above) so the minifier folds it: with
// "production" inlined this is the literal false, and the component is dropped from the bundle.
export const ASK_SEARCH_DEBUG = process.env.REACT_APP_DEPLOY_ENV !== "production";
export const ASK_SEARCH_DEBUG_KEY = "op_ask_search_debug";
const HOLD_MS = 1000;

const readStored = () => { try { return window.localStorage.getItem(ASK_SEARCH_DEBUG_KEY) === "1"; } catch (e) { return false; } };
const writeStored = (on) => { try { if (on) window.localStorage.setItem(ASK_SEARCH_DEBUG_KEY, "1"); else window.localStorage.removeItem(ASK_SEARCH_DEBUG_KEY); } catch (e) { /* private mode */ } };
const r1 = (n) => (typeof n === "number" ? Math.round(n * 10) / 10 : "–");
const describe = (el) => {
  if (!el || !el.tagName) return "none";
  const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
  return el.tagName.toLowerCase() + cls;
};

export function AskSearchDebug({ viewRef, open }) {
  const [on, setOn] = useState(readStored);
  const panel = useRef(null);
  const drag = useRef({ line: "last drag: none yet" });

  // The toggle: a 1 s hold on the count line. Pointer events, so it works with a finger and a mouse.
  useEffect(() => {
    const view = viewRef.current;
    const line = view ? view.querySelector(".ask-search-total") : null;
    if (!line) return undefined;
    let timer = null;
    const clear = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
    const start = () => { clear(); timer = setTimeout(() => { timer = null; setOn((v) => { writeStored(!v); return !v; }); }, HOLD_MS); };
    line.addEventListener("pointerdown", start);
    line.addEventListener("pointerup", clear);
    line.addEventListener("pointercancel", clear);
    line.addEventListener("pointerleave", clear);
    return () => {
      clear();
      line.removeEventListener("pointerdown", start);
      line.removeEventListener("pointerup", clear);
      line.removeEventListener("pointercancel", clear);
      line.removeEventListener("pointerleave", clear);
    };
  }, [viewRef]);

  // The last-drag line: passive listeners on the view, reading only.
  useEffect(() => {
    const view = viewRef.current;
    if (!on || !open || !view) return undefined;
    const vv = window.visualViewport;
    const snap = () => {
      const list = view.querySelector(".ask-search-list");
      return { list: list ? list.scrollTop : 0, win: window.scrollY, off: vv ? vv.offsetTop : 0 };
    };
    let begin = null;
    let startText = "";
    const onStart = (e) => {
      const inList = !!(e.target && e.target.closest && e.target.closest(".ask-search-list"));
      begin = snap();
      startText = `${describe(e.target)} inList=${inList ? "yes" : "no"}`;
      drag.current.line = `drag: ${startText} (in progress)`;
    };
    const onEnd = () => {
      if (!begin) return;
      const end = snap();
      const d = (a, b) => { const v = r1(b - a); return v > 0 ? `+${v}` : `${v}`; };
      drag.current.line = `last drag: ${startText} | Δlist ${d(begin.list, end.list)} Δwin.scrollY ${d(begin.win, end.win)} Δvv.offsetTop ${d(begin.off, end.off)}`;
      begin = null;
    };
    view.addEventListener("touchstart", onStart, { passive: true });
    view.addEventListener("touchend", onEnd, { passive: true });
    view.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      view.removeEventListener("touchstart", onStart);
      view.removeEventListener("touchend", onEnd);
      view.removeEventListener("touchcancel", onEnd);
    };
  }, [on, open, viewRef]);

  // The readout: every frame while shown, written straight to the panel (no React render per frame).
  useEffect(() => {
    if (!on || !open) return undefined;
    const bundle = ([...document.scripts].map((s) => s.src).find((s) => /main\.[a-z0-9]+\.js/.test(s)) || "").replace(/.*\//, "") || "local";
    let frame = null;
    const tick = () => {
      const el = panel.current;
      const view = viewRef.current;
      if (el && view) {
        const vv = window.visualViewport;
        const list = view.querySelector(".ask-search-list");
        const rect = view.getBoundingClientRect();
        const se = document.scrollingElement;
        const act = document.activeElement;
        const body = getComputedStyle(document.body);
        const html = getComputedStyle(document.documentElement);
        el.style.top = `${vv ? vv.offsetTop : 0}px`;
        el.textContent = [
          bundle,
          vv ? `vv h ${r1(vv.height)} offTop ${r1(vv.offsetTop)} pageTop ${r1(vv.pageTop)}` : "vv: none",
          `innerH ${window.innerHeight} scrollY ${r1(window.scrollY)} se.scrollTop ${se ? r1(se.scrollTop) : "–"}`,
          `view top ${r1(rect.top)} h ${r1(rect.height)}`,
          list ? `list sT ${r1(list.scrollTop)} sH ${list.scrollHeight} cH ${list.clientHeight}` : "list: none",
          `active ${act ? act.tagName.toLowerCase() : "none"}${act && act.getAttribute && act.getAttribute("name") ? " " + act.getAttribute("name") : ""}`,
          `body ov ${body.overflow} pos ${body.position} | html ov ${html.overflow} pos ${html.position}`,
          drag.current.line,
        ].join("\n");
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { if (frame !== null) cancelAnimationFrame(frame); };
  }, [on, open, viewRef]);

  if (!on || !open || typeof document === "undefined") return null;
  return createPortal(
    <div ref={panel} className="ask-search-debug" aria-hidden="true" style={{
      position: "fixed", top: 0, right: 0, zIndex: 2200, pointerEvents: "none", maxWidth: "78vw",
      padding: "4px 6px", background: "rgba(20,20,20,0.82)", color: "#9CFF9C", whiteSpace: "pre-wrap",
      font: "10px/1.25 ui-monospace, Menlo, Consolas, monospace", borderBottomLeftRadius: "6px",
    }} />,
    document.body);
}

export default AskSearchDebug;
