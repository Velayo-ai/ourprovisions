import { render, screen, fireEvent, act } from "@testing-library/react";
import { SheetPanel } from "./SheetPanel";

// jsdom (CRA's jest 27) has no PointerEvent; a MouseEvent subclass carries the
// clientX/Y the hook reads, plus the pointer fields it checks.
beforeAll(() => {
  if (!window.PointerEvent) {
    window.PointerEvent = class PointerEvent extends MouseEvent {
      constructor(type, init = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? "touch";
      }
    };
  }
});

function mount(onClose = jest.fn(), onBackdrop = jest.fn()) {
  render(
    <div data-testid="scrim" onClick={onBackdrop}>
      <SheetPanel onClose={onClose} label="Test sheet">
        <button type="button" onClick={() => onClose("button")}>Close</button>
        <p>Body</p>
      </SheetPanel>
    </div>
  );
  return { onClose, onBackdrop, sheet: screen.getByRole("dialog") };
}
const pt = (y, x = 10) => ({ pointerId: 1, pointerType: "touch", clientX: x, clientY: y, button: 0 });

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("dialog semantics are on the panel", () => {
  const { sheet } = mount();
  expect(sheet).toHaveAttribute("aria-modal", "true");
  expect(sheet).toHaveAttribute("aria-label", "Test sheet");
  expect(sheet.style.touchAction).toBe("none");
});

test("a full swipe down closes after the slide", () => {
  const { onClose, sheet } = mount();
  fireEvent.pointerDown(sheet, pt(100));
  fireEvent.pointerMove(sheet, pt(140));
  expect(sheet.style.transform).toBe("translateY(40px)");
  expect(sheet.style.transition).toBe("none");
  fireEvent.pointerMove(sheet, pt(200));
  fireEvent.pointerUp(sheet, pt(200));
  expect(sheet.style.transform).toBe("translateY(110%)");
  expect(onClose).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(200); });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("a short drag springs back and does not close", () => {
  const { onClose, sheet } = mount();
  fireEvent.pointerDown(sheet, pt(100));
  fireEvent.pointerMove(sheet, pt(130));
  act(() => { jest.advanceTimersByTime(1000); });   // slow, so no flick
  fireEvent.pointerUp(sheet, pt(130));
  expect(sheet.style.transform).toBe("none");
  act(() => { jest.advanceTimersByTime(500); });
  expect(onClose).not.toHaveBeenCalled();
});

test("dragging up or sideways never arms", () => {
  const { onClose, sheet } = mount();
  fireEvent.pointerDown(sheet, pt(100));
  fireEvent.pointerMove(sheet, pt(20));          // up
  fireEvent.pointerMove(sheet, pt(130, 200));    // more across than down
  fireEvent.pointerUp(sheet, pt(130, 200));
  expect(sheet.style.transform).toBe("none");
  act(() => { jest.advanceTimersByTime(500); });
  expect(onClose).not.toHaveBeenCalled();
});

test("a tap inside stays a tap: the Close button works, the scrim does not fire", () => {
  const { onClose, onBackdrop } = mount();
  const btn = screen.getByRole("button", { name: "Close" });
  fireEvent.pointerDown(btn, pt(100));
  fireEvent.pointerUp(btn, pt(100));
  fireEvent.click(btn);
  expect(onClose).toHaveBeenCalledWith("button");
  expect(onBackdrop).not.toHaveBeenCalled();
});

test("a tap on the scrim still reaches the scrim", () => {
  const { onBackdrop } = mount();
  fireEvent.click(screen.getByTestId("scrim"));
  expect(onBackdrop).toHaveBeenCalledTimes(1);
});
