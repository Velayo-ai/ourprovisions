import { isGripTouch, pushUndo, dropUndo, expireUndo, expireGroup, undoAllIds, undoSettling, EMPTY_UNDO, UNDO_CAP, GRIP_HOLD_MS, GRIP_MOVE_PX, CHECK_HOLD_MS, UNDO_MS } from "./shopCheck";

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

const ids = (s) => s.entries.map((u) => u.id);
// Check a burst of rows, ids "a", "b", …, keys 1, 2, …
const burst = (n, from = EMPTY_UNDO) => {
  let s = from;
  for (let i = 0; i < n; i++) s = pushUndo(s, { id: "abcdefgh"[i], name: `Item ${i + 1}`, key: i + 1 });
  return s;
};

describe("the undo stack", () => {
  test("each check gets its own entry, newest last", () => {
    const s = burst(3);
    expect(ids(s)).toEqual(["a", "b", "c"]);
    expect(ids(dropUndo(s, "b"))).toEqual(["a", "c"]);
  });
  test("re-checking a row replaces its old entry; a stale timer can't drop the new one", () => {
    let s = pushUndo(EMPTY_UNDO, { id: "a", name: "Milk", key: 1 });
    s = pushUndo(s, { id: "a", name: "Milk", key: 2 });
    expect(s.entries).toEqual([{ id: "a", name: "Milk", key: 2 }]);
    expect(expireUndo(s, "a", 1)).toBe(s);
    expect(expireUndo(s, "a", 2).entries).toEqual([]);
  });
  test("the timings and the cap are the ruled ones", () => {
    expect([GRIP_HOLD_MS, GRIP_MOVE_PX, CHECK_HOLD_MS, UNDO_MS, UNDO_CAP]).toEqual([500, 10, 3000, 5000, 3]);
  });
});

describe("the fold (2026-11-14): at most 3 toasts, then one group", () => {
  test("3 live checks stay separate, each on its own timer", () => {
    const s = burst(3);
    expect(s.folded).toBe(false);
    expect(ids(expireUndo(s, "a", 1))).toEqual(["b", "c"]);       // a row's own timer still drops it
  });
  test("the 4th live check folds them all; n counts every check that hasn't expired", () => {
    const s = burst(4);
    expect(s.folded).toBe(true);
    expect(s.entries).toHaveLength(4);
    // a check whose toast already expired is not counted: 3 checks, one expires, then 2 more → 4 live
    let t = expireUndo(burst(3), "a", 1);
    t = pushUndo(t, { id: "d", name: "D", key: 4 });
    expect(t.folded).toBe(false);                                  // 3 live: still separate
    t = pushUndo(t, { id: "e", name: "E", key: 5 });
    expect([t.folded, t.entries.length]).toEqual([true, 4]);
  });
  test("folded, per-row timers drop nothing; the group's one timer restarts on each new check", () => {
    const s4 = burst(4);
    expect(expireUndo(s4, "a", 1)).toBe(s4);
    const s5 = pushUndo(s4, { id: "e", name: "E", key: 5 });
    expect(s5.groupKey).toBeGreaterThan(s4.groupKey);              // restarted
    expect(expireGroup(s5, s4.groupKey)).toBe(s5);                 // the old timer can't drop the group
    const gone = expireGroup(s5, s5.groupKey);
    expect([gone.entries.length, gone.folded]).toEqual([0, false]); // the whole group drops
    expect(undoSettling(gone)).toBe(false);
  });
  test("Undo all reverts only the rows still checked, in check order", () => {
    const s = burst(5);
    const stillChecked = new Set(["a", "c", "e"]);
    expect(undoAllIds(s, (id) => stillChecked.has(id))).toEqual(["a", "c", "e"]);
  });
  test("a tap during a row's hold takes it out of the group: n drops, the group stays folded until empty", () => {
    let s = burst(4);
    s = dropUndo(s, "b");
    expect([s.folded, s.entries.length]).toEqual([true, 3]);      // 3 left, still one group
    s = dropUndo(dropUndo(dropUndo(s, "a"), "c"), "d");
    expect([s.folded, s.entries.length]).toEqual([false, 0]);
  });
  test("a failed write takes its id out of the group, like today's per-row drop", () => {
    const s = dropUndo(burst(6), "f");
    expect(s.folded).toBe(true);
    expect(ids(s)).toEqual(["a", "b", "c", "d", "e"]);
    expect(dropUndo(s, "zz")).toBe(s);                             // an id not in the group changes nothing
  });
  test("All done waits while the group is up", () => {
    expect(undoSettling(burst(6))).toBe(true);
    expect(undoSettling(burst(2))).toBe(true);
    expect(undoSettling(EMPTY_UNDO)).toBe(false);
  });
});
