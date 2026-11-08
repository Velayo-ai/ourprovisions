import { render, screen, fireEvent } from "@testing-library/react";
import ShopCheckbox from "./ShopCheckbox";

// jsdom has no PointerEvent, so fireEvent.pointer* would drop pointerType. A MouseEvent that keeps it.
beforeAll(() => {
  if (!window.PointerEvent) {
    window.PointerEvent = class PointerEvent extends MouseEvent {
      constructor(type, init = {}) { super(type, init); this.pointerType = init.pointerType || ""; }
    };
  }
});

let clock = 0;
beforeEach(() => {
  clock = 1000;
  jest.spyOn(performance, "now").mockImplementation(() => clock);
});
afterEach(() => jest.restoreAllMocks());

const setup = (props = {}) => {
  const onToggle = jest.fn();
  render(<ShopCheckbox checked={false} name="Milk" onToggle={onToggle} {...props} />);
  return { onToggle, box: screen.getByRole("checkbox", { name: "Milk" }) };
};

// A touch gesture: down, optional moves, up after `ms`, then the click the browser sends.
const tap = (el, { type = "touch", ms = 80, moves = [], cancel = false } = {}) => {
  fireEvent.pointerDown(el, { pointerType: type, clientX: 20, clientY: 20 });
  moves.forEach(([x, y]) => fireEvent.pointerMove(el, { pointerType: type, clientX: x, clientY: y }));
  clock += ms;
  if (cancel) { fireEvent.pointerCancel(el, { pointerType: type }); return; }
  const [x, y] = moves.length ? moves[moves.length - 1] : [20, 20];
  fireEvent.pointerUp(el, { pointerType: type, clientX: x, clientY: y });
  fireEvent.click(el, { detail: 1 });
};

test("it is a named checkbox that reports its state", () => {
  render(<ShopCheckbox checked name="Eggs" onToggle={() => {}} />);
  const box = screen.getByRole("checkbox", { name: "Eggs" });
  expect(box).toHaveAttribute("aria-checked", "true");
  expect(box.tagName).toBe("BUTTON");
  expect(box).not.toHaveAttribute("aria-label");   // the name is .sr-only text, never an attribute
});

test("a quick touch checks", () => {
  const { onToggle, box } = setup();
  tap(box);
  expect(onToggle).toHaveBeenCalledTimes(1);
});

test("a touch held longer than half a second does not check", () => {
  const { onToggle, box } = setup();
  tap(box, { ms: 650 });
  expect(onToggle).not.toHaveBeenCalled();
});

test("a touch that moved more than 10 px does not check", () => {
  const { onToggle, box } = setup();
  tap(box, { moves: [[24, 34]] });
  expect(onToggle).not.toHaveBeenCalled();
});

test("a touch that wandered and came back still does not check", () => {
  const { onToggle, box } = setup();
  tap(box, { moves: [[20, 45], [21, 21]] });
  expect(onToggle).not.toHaveBeenCalled();
});

test("a touch the browser cancelled (a scroll) does not check, and the next tap does", () => {
  const { onToggle, box } = setup();
  tap(box, { cancel: true });
  expect(onToggle).not.toHaveBeenCalled();
  tap(box);
  expect(onToggle).toHaveBeenCalledTimes(1);
});

test("a slow mouse click still checks", () => {
  const { onToggle, box } = setup();
  tap(box, { type: "mouse", ms: 900 });
  expect(onToggle).toHaveBeenCalledTimes(1);
});

test("keyboard activation checks, even right after an ignored grip", () => {
  const { onToggle, box } = setup();
  tap(box, { ms: 900 });
  fireEvent.click(box, { detail: 0 });   // Enter / Space on a <button> dispatches a click with detail 0
  expect(onToggle).toHaveBeenCalledTimes(1);
});
