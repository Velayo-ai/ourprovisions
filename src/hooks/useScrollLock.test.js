import { renderHook } from "@testing-library/react";
import { useScrollLock } from "./useScrollLock";

// The Add sheet's scroll lock (2026-11-05): the .phone-scroll column (by ref) and the body.
// jsdom does not lay out, so scrollTop is a plain writable property on the element.
function column({ overflow = "", scrollTop = 0 } = {}) {
  const el = document.createElement("div");
  el.className = "phone-scroll";
  el.style.overflow = overflow;
  Object.defineProperty(el, "scrollTop", { value: scrollTop, writable: true, configurable: true });
  document.body.appendChild(el);
  return { el, ref: { current: el } };
}

afterEach(() => { document.body.innerHTML = ""; document.body.style.overflow = ""; });

test("open: .phone-scroll and the body get overflow hidden; close: their previous values come back", () => {
  const { el, ref } = column({ overflow: "auto" });
  document.body.style.overflow = "visible";
  const { rerender } = renderHook(({ on }) => useScrollLock(on, ref), { initialProps: { on: false } });
  expect(el.style.overflow).toBe("auto");
  rerender({ on: true });
  expect(el.style.overflow).toBe("hidden");
  expect(document.body.style.overflow).toBe("hidden");
  rerender({ on: false });
  expect(el.style.overflow).toBe("auto");
  expect(document.body.style.overflow).toBe("visible");
});

test("an empty previous value is restored as empty (the stylesheet's overflow-y applies again)", () => {
  const { el, ref } = column();
  const { unmount } = renderHook(() => useScrollLock(true, ref));
  expect(el.style.overflow).toBe("hidden");
  unmount();
  expect(el.style.overflow).toBe("");
});

test("the column's scrollTop is the same after close as before open", () => {
  const { el, ref } = column({ scrollTop: 640 });
  const { rerender } = renderHook(({ on }) => useScrollLock(on, ref), { initialProps: { on: true } });
  expect(el.scrollTop).toBe(640);
  el.scrollTop = 0;                     // something moved it while locked (focus, a reflow)
  rerender({ on: false });
  expect(el.scrollTop).toBe(640);
});

test("no column (ref not attached): the body is still locked and released", () => {
  const { rerender } = renderHook(({ on }) => useScrollLock(on, { current: null }), { initialProps: { on: true } });
  expect(document.body.style.overflow).toBe("hidden");
  rerender({ on: false });
  expect(document.body.style.overflow).toBe("");
});
