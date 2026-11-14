import { renderHook, act } from "@testing-library/react";
import { useCheckUndos } from "./useCheckUndos";
import { UNDO_MS } from "../lib/shopCheck";

// The fold's clocks (2026-11-14), on fake timers: a 6-item burst folds at the 4th, the group's one timer
// restarts on each check, the whole group drops when it runs out, and a stale row timer drops nothing.
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const ids = (r) => r.current.undos.entries.map((u) => u.id);
function check(r, ...list) { list.forEach((id) => act(() => r.current.offer(id, `Item ${id}`))); }

test("a 6-item burst: 3 separate toasts, then one group of 6", () => {
  const { result } = renderHook(() => useCheckUndos());
  check(result, "a", "b", "c");
  expect(result.current.undos.folded).toBe(false);
  check(result, "d");
  expect([result.current.undos.folded, ids(result).length]).toEqual([true, 4]);
  check(result, "e", "f");
  expect(ids(result)).toEqual(["a", "b", "c", "d", "e", "f"]);
});

test("separate toasts each expire on their own timer", () => {
  const { result } = renderHook(() => useCheckUndos());
  check(result, "a");
  act(() => jest.advanceTimersByTime(2000));
  check(result, "b");
  act(() => jest.advanceTimersByTime(UNDO_MS - 2000));
  expect(ids(result)).toEqual(["b"]);
  act(() => jest.advanceTimersByTime(2000));
  expect(ids(result)).toEqual([]);
});

test("folded: the group timer restarts on each new check, and the whole group drops when it runs out", () => {
  const { result } = renderHook(() => useCheckUndos());
  check(result, "a", "b", "c", "d");                    // folds at t=0
  act(() => jest.advanceTimersByTime(UNDO_MS - 1000));
  check(result, "e");                                     // restart
  act(() => jest.advanceTimersByTime(UNDO_MS - 1000));    // the first group timer would have fired by now
  expect(ids(result)).toHaveLength(5);                    // ...and the rows' old timers dropped nothing
  act(() => jest.advanceTimersByTime(1000));
  expect(result.current.undos).toMatchObject({ entries: [], folded: false });
});

test("a tap during the hold (or a failed write) takes one id out; the group stays folded until empty", () => {
  const { result } = renderHook(() => useCheckUndos());
  check(result, "a", "b", "c", "d");
  act(() => result.current.dismiss("b"));
  expect([result.current.undos.folded, ids(result)]).toEqual([true, ["a", "c", "d"]]);
  ["a", "c", "d"].forEach((id) => act(() => result.current.dismiss(id)));
  expect(result.current.undos).toMatchObject({ entries: [], folded: false });
  // Unfolded and empty: the next check is a separate toast with its own timer again.
  check(result, "e");
  expect(result.current.undos.folded).toBe(false);
  act(() => jest.advanceTimersByTime(UNDO_MS));
  expect(ids(result)).toEqual([]);
});

test("current() reads the live stack between renders (the burst path)", () => {
  const { result } = renderHook(() => useCheckUndos());
  act(() => { result.current.offer("a", "A"); result.current.offer("b", "B"); result.current.offer("c", "C"); result.current.offer("d", "D"); });
  expect(result.current.current().entries.map((u) => u.id)).toEqual(["a", "b", "c", "d"]);
  expect(result.current.undos.folded).toBe(true);
});
