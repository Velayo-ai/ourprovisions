/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the head and body are the panel's own wrappers, read as raw DOM (style, scrollTop). */
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AddSheetPanel } from "./AddSheetPanel";

// Pull-down-to-close on the Add sheet (2026-11-05): useSheetDrag, handlers on the head and on
// the scroller. jsdom has no PointerEvent and does not lay out: the same MouseEvent stand-in as
// SheetPanel.test.js, and scrollTop set by hand.
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
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const pt = (y, x = 10) => ({ pointerId: 1, pointerType: "touch", clientX: x, clientY: y, button: 0 });
const scrolledTo = (el, px) => Object.defineProperty(el, "scrollTop", { value: px, writable: true, configurable: true });

function mount({ inset = 0 } = {}) {
  const onClose = jest.fn();
  const { container } = render(
    <AddSheetPanel
      onClose={onClose}
      inset={inset}
      head={<><div className="add-sheet-grab" data-testid="grab" /><input aria-label="Search" /></>}
    >
      <div data-testid="row">Apples</div>
    </AddSheetPanel>
  );
  return {
    onClose,
    sheet: container.querySelector(".add-sheet"),
    body: container.querySelector(".add-sheet-body"),
    grab: screen.getByTestId("grab"),
    input: screen.getByRole("textbox", { name: "Search" }),
  };
}

// A pull: press at 100, move to 200 (well past 8px and the 72px threshold), release.
function pull(el, to = 200) {
  fireEvent.pointerDown(el, pt(100));
  fireEvent.pointerMove(el, pt(to));
  fireEvent.pointerUp(el, pt(to));
}

test("a pull on the handle closes after the slide", () => {
  const { onClose, sheet, grab } = mount();
  fireEvent.pointerDown(grab, pt(100));
  fireEvent.pointerMove(grab, pt(140));
  expect(sheet.style.transform).toBe("translateY(40px)");
  expect(sheet.style.transition).toBe("none");
  fireEvent.pointerMove(grab, pt(200));
  fireEvent.pointerUp(grab, pt(200));
  expect(sheet.style.transform).toBe("translateY(110%)");
  expect(onClose).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(200); });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("a pull on the handle closes even while the results are scrolled", () => {
  const { onClose, body, grab } = mount();
  scrolledTo(body, 120);
  fireEvent.scroll(body);
  pull(grab);
  act(() => { jest.advanceTimersByTime(200); });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("a pull on scrolled results scrolls: it never arms, touch-action hands it to the browser", () => {
  const { onClose, sheet, body, input } = mount();
  scrolledTo(body, 120);
  fireEvent.scroll(body);
  expect(body.style.touchAction).toBe("pan-y");
  expect(input.closest(".add-sheet-head").style.touchAction).toBe("none");
  fireEvent.pointerDown(body, pt(100));
  fireEvent.pointerMove(body, pt(160));
  scrolledTo(body, 0);                     // the scroll reaches the top mid-drag: still a scroll
  fireEvent.pointerMove(body, pt(260));
  fireEvent.pointerUp(body, pt(260));
  expect(sheet.style.transform).toBe("translateY(0px)");
  act(() => { jest.advanceTimersByTime(500); });
  expect(onClose).not.toHaveBeenCalled();
});

test("a pull at the top of the results closes", () => {
  const { onClose, body } = mount();
  scrolledTo(body, 0);
  expect(body.style.touchAction).toBe("none");
  pull(body);
  act(() => { jest.advanceTimersByTime(200); });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("a tap on the search field does not arm: it stays a tap and can focus", () => {
  const { onClose, sheet, input } = mount();
  fireEvent.pointerDown(input, pt(100));
  fireEvent.pointerMove(input, pt(105));   // under 8px: finger jitter, not a drag
  fireEvent.pointerUp(input, pt(105));
  input.focus();
  expect(document.activeElement).toBe(input);
  expect(sheet.style.transform).toBe("translateY(0px)");
  expect(sheet.style.transition).toBe("");  // the class's 150ms keyboard transition, untouched
  act(() => { jest.advanceTimersByTime(500); });
  expect(onClose).not.toHaveBeenCalled();
});

test("keyboard up: the lift and the drag are one translateY", () => {
  const { sheet, grab } = mount({ inset: 300 });
  expect(sheet.style.transform).toBe("translateY(-300px)");
  expect(sheet.style.transition).toBe("");  // at rest: the class's transition
  fireEvent.pointerDown(grab, pt(100));
  fireEvent.pointerMove(grab, pt(140));
  expect(sheet.style.transform).toBe("translateY(-260px)");
  expect(sheet.style.transition).toBe("none");
  act(() => { jest.advanceTimersByTime(1000); });   // slow, so no flick
  fireEvent.pointerUp(grab, pt(140));      // 40px < 72: springs back
  expect(sheet.style.transform).toBe("translateY(-300px)");
  expect(sheet.style.transition).toBe("");
});

test("keyboard up, leaving: translateY(110%) on the hook's slide", () => {
  const { sheet, grab } = mount({ inset: 300 });
  pull(grab);
  expect(sheet.style.transform).toBe("translateY(110%)");
  expect(sheet.style.transition).toBe("transform 0.2s ease");
});

test("a tap inside never reaches the scrim", () => {
  const onBackdrop = jest.fn();
  render(<div data-testid="scrim" onClick={onBackdrop}><AddSheetPanel onClose={jest.fn()} head={<button type="button">Mic</button>} /></div>);
  fireEvent.click(screen.getByRole("button", { name: "Mic" }));
  expect(onBackdrop).not.toHaveBeenCalled();
});
