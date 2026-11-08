import { isGripTouch, pushUndo, dropUndo, GRIP_HOLD_MS, GRIP_MOVE_PX, CHECK_HOLD_MS, UNDO_MS } from "./shopCheck";

const touch = (o) => ({ pointerType: "touch", downAt: 1000, upAt: 1100, maxMove: 0, cancelled: false, ...o });

describe("isGripTouch", () => {
  test("a quick, still touch is a tap", () => {
    expect(isGripTouch(touch())).toBe(false);
  });
  test("a touch held longer than 500 ms is a grip", () => {
    expect(isGripTouch(touch({ upAt: 1000 + GRIP_HOLD_MS + 1 }))).toBe(true);
    expect(isGripTouch(touch({ upAt: 1000 + GRIP_HOLD_MS }))).toBe(false);
  });
  test("a touch that moved more than 10 px is a scroll", () => {
    expect(isGripTouch(touch({ maxMove: GRIP_MOVE_PX + 0.5 }))).toBe(true);
    expect(isGripTouch(touch({ maxMove: GRIP_MOVE_PX }))).toBe(false);
  });
  test("a touch the browser cancelled (it became a scroll) never counts", () => {
    expect(isGripTouch(touch({ cancelled: true }))).toBe(true);
  });
  test("mouse and pen are never filtered, however long or far", () => {
    expect(isGripTouch(touch({ pointerType: "mouse", upAt: 9000, maxMove: 80 }))).toBe(false);
    expect(isGripTouch(touch({ pointerType: "pen", upAt: 9000, maxMove: 80 }))).toBe(false);
  });
  test("no pointer record (keyboard) is never a grip", () => {
    expect(isGripTouch(null)).toBe(false);
  });
});

describe("the undo stack", () => {
  test("each check gets its own entry, newest last", () => {
    let l = [];
    l = pushUndo(l, { id: "a", name: "Milk", key: 1 });
    l = pushUndo(l, { id: "b", name: "Eggs", key: 2 });
    l = pushUndo(l, { id: "c", name: "Bread", key: 3 });
    expect(l.map((u) => u.id)).toEqual(["a", "b", "c"]);
    expect(dropUndo(l, "b").map((u) => u.id)).toEqual(["a", "c"]);
  });
  test("re-checking a row replaces its old entry; a stale timer can't drop the new one", () => {
    let l = pushUndo([], { id: "a", name: "Milk", key: 1 });
    l = pushUndo(l, { id: "a", name: "Milk", key: 2 });
    expect(l).toEqual([{ id: "a", name: "Milk", key: 2 }]);
    expect(dropUndo(l, "a", 1)).toEqual(l);
    expect(dropUndo(l, "a", 2)).toEqual([]);
  });
  test("the timings are the ruled ones", () => {
    expect([GRIP_HOLD_MS, GRIP_MOVE_PX, CHECK_HOLD_MS, UNDO_MS]).toEqual([500, 10, 3000, 5000]);
  });
});
