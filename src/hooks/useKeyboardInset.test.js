import { renderHook, act } from "@testing-library/react";
import { keyboardMetrics, useKeyboardInset } from "./useKeyboardInset";

// A stand-in visualViewport: an event target with the three numbers the hook reads.
function fakeViewport({ height, offsetTop = 0 }) {
  const listeners = { resize: new Set(), scroll: new Set() };
  return {
    height, offsetTop,
    addEventListener: jest.fn((type, fn) => listeners[type]?.add(fn)),
    removeEventListener: jest.fn((type, fn) => listeners[type]?.delete(fn)),
    fire(type) { listeners[type].forEach((fn) => fn()); },
    count(type) { return listeners[type].size; },
  };
}

describe("keyboardMetrics", () => {
  test("no keyboard: the visual viewport fills the layout one, inset 0", () => {
    expect(keyboardMetrics({ innerHeight: 844, visualViewport: { height: 844, offsetTop: 0 } }))
      .toEqual({ inset: 0, viewportHeight: 844 });
  });

  test("keyboard up: the covered strip is innerHeight − height − offsetTop", () => {
    expect(keyboardMetrics({ innerHeight: 844, visualViewport: { height: 508, offsetTop: 0 } }))
      .toEqual({ inset: 336, viewportHeight: 508 });
    // iOS scrolled the visual viewport down 40px to show the input: 40px less to lift.
    expect(keyboardMetrics({ innerHeight: 844, visualViewport: { height: 508, offsetTop: 40 } }))
      .toEqual({ inset: 296, viewportHeight: 508 });
  });

  test("never negative (pinch-zoom or rounding can overshoot)", () => {
    expect(keyboardMetrics({ innerHeight: 844, visualViewport: { height: 500, offsetTop: 400 } }).inset).toBe(0);
  });

  test("rounds fractional viewports to whole pixels", () => {
    expect(keyboardMetrics({ innerHeight: 844, visualViewport: { height: 507.6, offsetTop: 0.2 } }))
      .toEqual({ inset: 336, viewportHeight: 508 });
  });

  test("no visualViewport API: inset 0, no height", () => {
    expect(keyboardMetrics({ innerHeight: 844 })).toEqual({ inset: 0, viewportHeight: null });
    expect(keyboardMetrics(undefined)).toEqual({ inset: 0, viewportHeight: null });
  });
});

describe("useKeyboardInset", () => {
  const realVV = Object.getOwnPropertyDescriptor(window, "visualViewport");
  const realInner = window.innerHeight;
  let vv;

  beforeEach(() => {
    vv = fakeViewport({ height: 844 });
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true, writable: true });
  });
  afterEach(() => {
    if (realVV) Object.defineProperty(window, "visualViewport", realVV);
    else delete window.visualViewport;
    Object.defineProperty(window, "innerHeight", { value: realInner, configurable: true, writable: true });
  });

  test("tracks the keyboard opening and closing through resize and scroll", () => {
    const { result } = renderHook(() => useKeyboardInset(true));
    expect(result.current).toEqual({ inset: 0, viewportHeight: 844 });

    act(() => { vv.height = 508; vv.fire("resize"); });
    expect(result.current).toEqual({ inset: 336, viewportHeight: 508 });

    act(() => { vv.offsetTop = 40; vv.fire("scroll"); });
    expect(result.current.inset).toBe(296);

    act(() => { vv.height = 844; vv.offsetTop = 0; vv.fire("resize"); });
    expect(result.current).toEqual({ inset: 0, viewportHeight: 844 });
  });

  test("inactive: no listeners, inset 0", () => {
    const { result } = renderHook(() => useKeyboardInset(false));
    expect(result.current).toEqual({ inset: 0, viewportHeight: null });
    expect(vv.addEventListener).not.toHaveBeenCalled();
  });

  test("removes both listeners on unmount", () => {
    const { unmount } = renderHook(() => useKeyboardInset(true));
    expect(vv.count("resize")).toBe(1);
    expect(vv.count("scroll")).toBe(1);
    unmount();
    expect(vv.count("resize")).toBe(0);
    expect(vv.count("scroll")).toBe(0);
  });

  test("going inactive (the sheet closes) detaches and resets", () => {
    const { result, rerender } = renderHook(({ on }) => useKeyboardInset(on), { initialProps: { on: true } });
    act(() => { vv.height = 508; vv.fire("resize"); });
    expect(result.current.inset).toBe(336);
    rerender({ on: false });
    expect(result.current).toEqual({ inset: 0, viewportHeight: null });
    expect(vv.count("resize")).toBe(0);
  });

  test("no visualViewport API: inset 0 and nothing to attach", () => {
    delete window.visualViewport;
    const { result } = renderHook(() => useKeyboardInset(true));
    expect(result.current).toEqual({ inset: 0, viewportHeight: null });
  });
});
