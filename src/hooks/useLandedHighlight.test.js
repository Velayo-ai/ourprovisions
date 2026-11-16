/* eslint-disable testing-library/no-node-access -- the tinted rows are found on screen by selector, as the hook does. */
import { renderHook, act } from "@testing-library/react";
import { useLandedHighlight, LANDED_ROW_SELECTOR, HIGHLIGHT_MS, FADE_MS, SETTLE_QUIET_MS } from "./useLandedHighlight";

// "See" after an Ask (2026-11-15, revised): See scrolls to the first landed row; once that scroll settles
// the tint holds, fades over the final ~1.2s, and is gone at ~5.2s. No bar, no controls.
let scrolled;
beforeEach(() => {
  jest.useFakeTimers();
  scrolled = [];
  Element.prototype.scrollIntoView = function scrollIntoView(opts) { scrolled.push([this.dataset.id, opts && opts.behavior]); };
  document.body.innerHTML = "";
});
afterEach(() => { jest.useRealTimers(); delete window.matchMedia; document.body.innerHTML = ""; });

function rowsOnScreen(ids, tinted) {
  document.body.innerHTML = ids.map((id) => `<div class="list-item${tinted.has(id) ? " ask-landed-hl" : ""}" data-id="${id}"></div>`).join("");
}
const NONE = new Set();
const SEE_DELAY = 60;   // the hook waits for Shop to render the rows
const advance = (ms) => act(() => { jest.advanceTimersByTime(ms); });
function see(ids = ["c", "a", "e"]) {
  const view = renderHook((p) => useLandedHighlight(p), { initialProps: { view: "list", checkedIds: NONE } });
  act(() => view.result.current.start("Five", ids));
  rowsOnScreen(["a", "b", "c", "d", "e"], new Set(ids));
  return view;
}

test("the timings: ~5.2s in all, the fade over the final ~1.2s", () => {
  expect(HIGHLIGHT_MS).toBe(5200);
  expect(FADE_MS).toBe(1200);
  expect(LANDED_ROW_SELECTOR).toBe(".list-item.ask-landed-hl");
});

test("See brings the first landed row (list order) into view, smoothly", () => {
  see();
  advance(SEE_DELAY);
  expect(scrolled).toEqual([["a", "smooth"]]);
});

test("after the scroll settles: holds for ~4s, fades for the last ~1.2s, gone at ~5.2s", () => {
  const { result } = see();
  advance(SEE_DELAY + SETTLE_QUIET_MS);                                             // settled: the clock starts
  expect(result.current.hl).toMatchObject({ label: "Five", fading: false });
  advance(HIGHLIGHT_MS - FADE_MS - 1);
  expect(result.current.hl.fading).toBe(false);
  advance(1);                                                                        // 4.0s: the fade begins
  expect(result.current.hl.fading).toBe(true);
  expect(result.current.hl.ids.size).toBe(3);
  advance(FADE_MS - 1);
  expect(result.current.hl).not.toBeNull();
  advance(1);                                                                        // 5.2s: gone
  expect(result.current.hl).toBeNull();
});

test("the clock waits for the scroll: while it is still moving nothing counts down", () => {
  const { result } = see();
  advance(SEE_DELAY);
  for (let k = 0; k < 8; k++) { advance(100); act(() => { window.dispatchEvent(new Event("scroll")); }); }   // 800ms of scrolling
  advance(SETTLE_QUIET_MS);                                                          // now settled
  advance(HIGHLIGHT_MS - 1);
  expect(result.current.hl).not.toBeNull();                                          // timed from the settle, not from See
  advance(1);
  expect(result.current.hl).toBeNull();
});

test("there is no bar API: start is the only control", () => {
  const { result } = see();
  expect(Object.keys(result.current).sort()).toEqual(["hl", "start"]);
});

test("leaving Shop clears it early", () => {
  const { result, rerender } = see();
  rerender({ view: "input", checkedIds: NONE });
  expect(result.current.hl).toBeNull();
});

test("a row checked off drops its own tint; the clock carries on", () => {
  const { result, rerender } = see(["a", "b", "c"]);
  advance(SEE_DELAY + SETTLE_QUIET_MS + 1000);
  rerender({ view: "list", checkedIds: new Set(["b"]) });
  expect([...result.current.hl.ids].sort()).toEqual(["a", "c"]);
  advance(HIGHLIGHT_MS - 1000);
  expect(result.current.hl).toBeNull();
});

test("reduced motion: the scroll jumps", () => {
  window.matchMedia = (q) => ({ matches: /reduce/.test(q), addListener() {}, removeListener() {} });
  see();
  advance(SEE_DELAY);
  expect(scrolled).toEqual([["a", "auto"]]);
});
