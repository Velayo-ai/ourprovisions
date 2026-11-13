import { onViewportSettled, VIEWPORT_SETTLE_MS } from "./viewportSettled";

// A stand-in window with the four event sources a rotation can fire on.
function fakeWin({ visualViewport = true, screenOrientation = true } = {}) {
  const target = () => {
    const fns = new Set();
    return { addEventListener: (_t, fn) => fns.add(fn), removeEventListener: (_t, fn) => fns.delete(fn), fire: () => fns.forEach((fn) => fn()), count: () => fns.size };
  };
  const byType = { resize: target(), orientationchange: target() };
  const so = target(), vv = target();
  return {
    addEventListener: (t, fn) => byType[t].addEventListener(t, fn),
    removeEventListener: (t, fn) => byType[t].removeEventListener(t, fn),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    screen: screenOrientation ? { orientation: so } : {},
    visualViewport: visualViewport ? vv : undefined,
    fire: { resize: byType.resize.fire, orientationchange: byType.orientationchange.fire, screen: so.fire, vv: vv.fire },
    listeners: () => byType.resize.count() + byType.orientationchange.count() + so.count() + vv.count(),
  };
}

describe("onViewportSettled", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("runs once, VIEWPORT_SETTLE_MS after the event — never at the event", () => {
    const win = fakeWin(), fn = jest.fn();
    onViewportSettled(win, fn);
    win.fire.resize();
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(VIEWPORT_SETTLE_MS - 1);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("a rotation's burst of events (any source, any order) settles once, after the LAST one", () => {
    const win = fakeWin(), fn = jest.fn();
    onViewportSettled(win, fn);
    win.fire.orientationchange(); jest.advanceTimersByTime(80);
    win.fire.resize(); jest.advanceTimersByTime(120);
    win.fire.vv(); jest.advanceTimersByTime(150);
    win.fire.screen(); jest.advanceTimersByTime(200);
    win.fire.resize();
    jest.advanceTimersByTime(VIEWPORT_SETTLE_MS - 1);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("nothing runs with no event; unsubscribe removes every listener and cancels a pending run", () => {
    const win = fakeWin(), fn = jest.fn();
    const off = onViewportSettled(win, fn);
    jest.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    expect(win.listeners()).toBe(4);
    win.fire.resize();
    off();
    jest.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    expect(win.listeners()).toBe(0);
  });

  test("works without visualViewport or screen.orientation; no window → a no-op unsubscribe", () => {
    const win = fakeWin({ visualViewport: false, screenOrientation: false }), fn = jest.fn();
    onViewportSettled(win, fn);
    win.fire.resize();
    jest.advanceTimersByTime(VIEWPORT_SETTLE_MS);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(() => onViewportSettled(undefined, fn)()).not.toThrow();
  });
});
