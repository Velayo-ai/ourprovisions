/* eslint-disable testing-library/no-node-access -- the tinted rows are found on screen by selector, as the hook does. */
import { renderHook, act } from "@testing-library/react";
import { useLandedHighlight, nextLandedIndex, LANDED_ROW_SELECTOR } from "./useLandedHighlight";

// "See" after an Ask (2026-11-15): the tint and the bar wait for her; Next walks the landed rows in list
// order and wraps; Done, leaving Shop and a check clear them.
let scrolled;
beforeEach(() => {
  jest.useFakeTimers();
  scrolled = [];
  Element.prototype.scrollIntoView = function scrollIntoView(opts) { scrolled.push([this.dataset.id, opts && opts.behavior]); };
  document.body.innerHTML = "";
});
afterEach(() => { jest.useRealTimers(); delete window.matchMedia; document.body.innerHTML = ""; });

// Shop's rows on screen, in list order; the tinted ones carry the class (as App renders them).
function rowsOnScreen(ids, tinted) {
  document.body.innerHTML = ids.map((id) => `<div class="list-item${tinted.has(id) ? " ask-landed-hl" : ""}" data-id="${id}"></div>`).join("");
}
const NONE = new Set();

test("nextLandedIndex: from none to the first, then on, wrapping at the end", () => {
  expect(nextLandedIndex(-1, 3)).toBe(0);
  expect(nextLandedIndex(0, 3)).toBe(1);
  expect(nextLandedIndex(2, 3)).toBe(0);                  // wraps
  expect(nextLandedIndex(4, 3)).toBe(2);                  // a cursor past the end (rows dropped) still lands in range
  expect(nextLandedIndex(0, 0)).toBe(-1);
  expect(LANDED_ROW_SELECTOR).toBe(".list-item.ask-landed-hl");
});

test("See: the tint and the bar stay (no timed fade); the first landed row is brought into view", () => {
  const { result, rerender } = renderHook((p) => useLandedHighlight(p), { initialProps: { view: "list", checkedIds: NONE } });
  act(() => result.current.start("Five", ["c", "a", "e"]));
  rowsOnScreen(["a", "b", "c", "d", "e"], new Set(["a", "c", "e"]));
  act(() => { jest.advanceTimersByTime(100); });
  expect(scrolled).toEqual([["a", "smooth"]]);                                     // first in LIST order
  expect(result.current.hl).toMatchObject({ label: "Five", total: 3 });
  act(() => { jest.advanceTimersByTime(60000); });                                  // a minute later: still there
  rerender({ view: "list", checkedIds: NONE });
  expect(result.current.hl).not.toBeNull();
});

test("Next goes through the landed rows in list order and wraps around", () => {
  const { result } = renderHook((p) => useLandedHighlight(p), { initialProps: { view: "list", checkedIds: NONE } });
  act(() => result.current.start("Five", ["e", "a", "c"]));
  rowsOnScreen(["a", "b", "c", "d", "e"], new Set(["a", "c", "e"]));
  act(() => { jest.advanceTimersByTime(100); });                                    // See: a
  const order = [];
  for (let k = 0; k < 4; k++) act(() => { order.push(result.current.next().dataset.id); });
  expect(order).toEqual(["c", "e", "a", "c"]);                                      // c, e, wrap to a, c
});

test("Done clears the tint and the bar", () => {
  const { result } = renderHook((p) => useLandedHighlight(p), { initialProps: { view: "list", checkedIds: NONE } });
  act(() => result.current.start("Five", ["a"]));
  act(() => result.current.done());
  expect(result.current.hl).toBeNull();
});

test("leaving Shop clears them", () => {
  const { result, rerender } = renderHook((p) => useLandedHighlight(p), { initialProps: { view: "list", checkedIds: NONE } });
  act(() => result.current.start("Five", ["a", "b"]));
  expect(result.current.hl).not.toBeNull();
  rerender({ view: "input", checkedIds: NONE });                                     // to Browse
  expect(result.current.hl).toBeNull();
});

test("a row checked off drops its own tint; the last one takes the bar with it", () => {
  const { result, rerender } = renderHook((p) => useLandedHighlight(p), { initialProps: { view: "list", checkedIds: NONE } });
  act(() => result.current.start("Five", ["a", "b", "c"]));
  rerender({ view: "list", checkedIds: new Set(["b", "zz"]) });                      // b checked (zz: some other row)
  expect([...result.current.hl.ids].sort()).toEqual(["a", "c"]);
  expect(result.current.hl.total).toBe(3);                                           // "Five's 3 picks" still names what landed
  rerender({ view: "list", checkedIds: new Set(["a", "b", "c"]) });
  expect(result.current.hl).toBeNull();
});

test("reduced motion: See and Next jump without the scroll animation", () => {
  window.matchMedia = (q) => ({ matches: /reduce/.test(q), addListener() {}, removeListener() {} });
  const { result } = renderHook((p) => useLandedHighlight(p), { initialProps: { view: "list", checkedIds: NONE } });
  act(() => result.current.start("Five", ["a", "c"]));
  rowsOnScreen(["a", "b", "c"], new Set(["a", "c"]));
  act(() => { jest.advanceTimersByTime(100); });
  act(() => { result.current.next(); });
  expect(scrolled).toEqual([["a", "auto"], ["c", "auto"]]);
});
