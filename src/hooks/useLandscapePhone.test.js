import { renderHook, act } from "@testing-library/react";
import { isLandscapePhone, readLandscapePhone, useLandscapePhone, isTextEntry, LANDSCAPE_DEBOUNCE_MS, LANDSCAPE_PHONE_QUERY, LANDSCAPE_ELIGIBLE_CLASS } from "./useLandscapePhone";

// A stand-in window: the two media queries, innerHeight, screen.orientation and timers.
function fakeWin({ coarse = true, landscape = false, height = 844, screenType } = {}) {
  const listeners = new Set();
  const win = {
    coarse, landscape, innerHeight: height,
    screen: screenType === null ? {} : { orientation: { type: screenType || (landscape ? "landscape-primary" : "portrait-primary"), addEventListener: jest.fn(), removeEventListener: jest.fn() } },
    matchMedia: (q) => ({
      get matches() { return q === "(pointer: coarse)" ? win.coarse : win.landscape; },
      addEventListener: (_t, fn) => listeners.add(fn),
      removeEventListener: (_t, fn) => listeners.delete(fn),
    }),
    addEventListener: (_t, fn) => listeners.add(fn),
    removeEventListener: (_t, fn) => listeners.delete(fn),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    turn(next) {
      Object.assign(win, { landscape: next.landscape, innerHeight: next.height });
      if (win.screen.orientation) win.screen.orientation.type = next.landscape ? "landscape-primary" : "portrait-primary";
      listeners.forEach((fn) => fn());
    },
    listenerCount: () => listeners.size,
  };
  return win;
}
const SIDEWAYS = { landscape: true, height: 390 };
const UPRIGHT = { landscape: false, height: 844 };

describe("isLandscapePhone — the gate", () => {
  test("a phone sideways: coarse, landscape, short", () => {
    expect(isLandscapePhone({ coarse: true, landscape: true, height: 390, screenType: "landscape-primary" })).toBe(true);
    expect(isLandscapePhone({ coarse: true, landscape: true, height: 500 })).toBe(true);
  });
  test("a desktop or laptop never passes, at any size (fine pointer)", () => {
    expect(isLandscapePhone({ coarse: false, landscape: true, height: 400 })).toBe(false);
    expect(isLandscapePhone({ coarse: false, landscape: true, height: 1080 })).toBe(false);
  });
  test("a tablet or unfolded foldable never passes (tall short side)", () => {
    expect(isLandscapePhone({ coarse: true, landscape: true, height: 768, screenType: "landscape-primary" })).toBe(false);
    expect(isLandscapePhone({ coarse: true, landscape: true, height: 501 })).toBe(false);
  });
  test("a phone upright does not pass", () => {
    expect(isLandscapePhone({ coarse: true, landscape: false, height: 844 })).toBe(false);
  });
  test("Android keyboard in portrait: viewport wider than tall, but the screen is still portrait", () => {
    expect(isLandscapePhone({ coarse: true, landscape: true, height: 300, screenType: "portrait-primary" })).toBe(false);
  });
  test("no screen.orientation: the media query stands", () => {
    expect(isLandscapePhone({ coarse: true, landscape: true, height: 390, screenType: undefined })).toBe(true);
    expect(readLandscapePhone(fakeWin({ landscape: true, height: 390, screenType: null }))).toBe(true);
  });
  test("no window / no matchMedia → false", () => {
    expect(readLandscapePhone(undefined)).toBe(false);
    expect(readLandscapePhone({})).toBe(false);
  });
});

describe("the display side: the CSS query, the body class, the keyboard test", () => {
  test("the query is the gate: landscape + coarse pointer + short side", () => {
    expect(LANDSCAPE_PHONE_QUERY).toBe("(orientation: landscape) and (pointer: coarse) and (max-height: 500px)");
    expect(LANDSCAPE_ELIGIBLE_CLASS).toBe("lp-eligible");
  });
  test("isTextEntry: fields that raise the keyboard", () => {
    const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
    expect(isTextEntry(el("input"))).toBe(true);
    expect(isTextEntry(el("input", { type: "search" }))).toBe(true);
    expect(isTextEntry(el("input", { type: "tel" }))).toBe(true);
    expect(isTextEntry(el("textarea"))).toBe(true);
    expect(isTextEntry({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });
  test("isTextEntry: everything else does not", () => {
    const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
    expect(isTextEntry(el("button"))).toBe(false);
    expect(isTextEntry(el("input", { type: "checkbox" }))).toBe(false);
    expect(isTextEntry(el("input", { type: "file" }))).toBe(false);
    expect(isTextEntry(el("div"))).toBe(false);
    expect(isTextEntry(document.body)).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});

describe("useLandscapePhone — mount, change, debounce (bookkeeping)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("a desktop (always landscape) is false on mount and after any resize", () => {
    const win = fakeWin({ coarse: false, landscape: true, height: 900 });
    const { result } = renderHook(() => useLandscapePhone(win));
    expect(result.current).toBe(false);
    act(() => { win.turn({ landscape: true, height: 400 }); jest.advanceTimersByTime(LANDSCAPE_DEBOUNCE_MS); });
    expect(result.current).toBe(false);
  });

  test("a phone already sideways on mount is true", () => {
    const { result } = renderHook(() => useLandscapePhone(fakeWin({ landscape: true, height: 390 })));
    expect(result.current).toBe(true);
  });

  test("rotating switches only after the debounce, both ways", () => {
    const win = fakeWin();
    const { result } = renderHook(() => useLandscapePhone(win));
    expect(result.current).toBe(false);
    act(() => { win.turn(SIDEWAYS); jest.advanceTimersByTime(LANDSCAPE_DEBOUNCE_MS - 1); });
    expect(result.current).toBe(false);
    act(() => { jest.advanceTimersByTime(1); });
    expect(result.current).toBe(true);
    act(() => { win.turn(UPRIGHT); jest.advanceTimersByTime(LANDSCAPE_DEBOUNCE_MS - 1); });
    expect(result.current).toBe(true);
    act(() => { jest.advanceTimersByTime(1); });
    expect(result.current).toBe(false);
  });

  test("a tilt-and-back inside the window never flips the value", () => {
    const win = fakeWin();
    const seen = [];
    const { result } = renderHook(() => { const v = useLandscapePhone(win); seen.push(v); return v; });
    act(() => { win.turn(SIDEWAYS); jest.advanceTimersByTime(200); win.turn(UPRIGHT); jest.advanceTimersByTime(LANDSCAPE_DEBOUNCE_MS); });
    expect(result.current).toBe(false);
    expect(seen).not.toContain(true);
  });

  test("a tablet rotating never switches", () => {
    const win = fakeWin({ height: 1024 });
    const { result } = renderHook(() => useLandscapePhone(win));
    act(() => { win.turn({ landscape: true, height: 768 }); jest.advanceTimersByTime(LANDSCAPE_DEBOUNCE_MS); });
    expect(result.current).toBe(false);
  });

  test("unmount removes every listener", () => {
    const win = fakeWin();
    const { unmount } = renderHook(() => useLandscapePhone(win));
    expect(win.listenerCount()).toBeGreaterThan(0);
    unmount();
    expect(win.listenerCount()).toBe(0);
  });
});
