import { createQtyQueue, applyOptimisticDelta, adoptQtyResult, seedRowKey, isListEntry, guessChange, adoptCheckedResult, MAX_DELTA } from "./qtyWrites";
import { mergePolledById } from "./checkWrites";

// A send() whose answers the test releases by hand, in any order.
function manualSend() {
  const calls = [];
  const send = jest.fn((key, delta) => new Promise((resolve, reject) => calls.push({ key, delta, resolve, reject })));
  return { send, calls };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createQtyQueue", () => {
  test("one request in flight per item; taps meanwhile add up into one queued delta (5 taps → +1, +4)", async () => {
    const { send, calls } = manualSend();
    const q = createQtyQueue({ send });
    const taps = [1, 1, 1, 1, 1].map(() => q.tap("c1", 1));
    await flush();
    expect(calls.map((c) => c.delta)).toEqual([1]);
    calls[0].resolve({ quantity: 2 });
    await flush();
    expect(calls.map((c) => c.delta)).toEqual([1, 4]);
    calls[1].resolve({ quantity: 6 });
    const res = await Promise.all(taps);
    expect(res[0]).toEqual({ ok: true, result: { quantity: 2 } });
    res.slice(1).forEach((r) => expect(r).toEqual({ ok: true, result: { quantity: 6 } }));
    expect(q.busy("c1")).toBe(false);
  });

  test("items are independent: two items each get their own request at once", async () => {
    const { send, calls } = manualSend();
    const q = createQtyQueue({ send });
    q.tap("a", 1); q.tap("b", -1);
    await flush();
    expect(calls.map((c) => [c.key, c.delta])).toEqual([["a", 1], ["b", -1]]);
  });

  test("adopt only when drained: onDone reports drained false while more is queued, true at the end", async () => {
    const { send, calls } = manualSend();
    const onDone = jest.fn();
    const q = createQtyQueue({ send, onDone });
    q.tap("c1", 1); q.tap("c1", 1);
    await flush();
    calls[0].resolve({ quantity: 2 });
    await flush();
    expect(onDone).toHaveBeenLastCalledWith("c1", { ok: true, result: { quantity: 2 }, drained: false });
    calls[1].resolve({ quantity: 3 });
    await flush();
    expect(onDone).toHaveBeenLastCalledWith("c1", { ok: true, result: { quantity: 3 }, drained: true });
  });

  test("onSend fires just before each request with its delta (the stamp)", async () => {
    const { send, calls } = manualSend();
    const onSend = jest.fn();
    const q = createQtyQueue({ send, onSend });
    q.tap("c1", -1); q.tap("c1", -1); q.tap("c1", -1);
    await flush();
    expect(onSend.mock.calls).toEqual([["c1", -1]]);
    calls[0].resolve({});
    await flush();
    expect(onSend.mock.calls).toEqual([["c1", -1], ["c1", -2]]);
  });

  test("taps that net to zero while a request is in flight send nothing and count as drained", async () => {
    const { send, calls } = manualSend();
    const onDone = jest.fn();
    const q = createQtyQueue({ send, onDone });
    q.tap("c1", 1);
    const plus = q.tap("c1", 1);
    const minus = q.tap("c1", -1);
    await flush();
    calls[0].resolve({ quantity: 2 });
    expect(await plus).toEqual({ ok: true, result: { quantity: 2 } });
    expect(await minus).toEqual({ ok: true, result: { quantity: 2 } });
    expect(calls).toHaveLength(1);
    expect(onDone).toHaveBeenLastCalledWith("c1", { ok: true, result: { quantity: 2 }, drained: true });
    expect(q.busy("c1")).toBe(false);
  });

  test("a failure drops what was queued behind it, with no retry; every tap it covered resolves failed", async () => {
    const { send, calls } = manualSend();
    const onDone = jest.fn();
    const q = createQtyQueue({ send, onDone });
    const t1 = q.tap("c1", 1);
    const t2 = q.tap("c1", 1);
    await flush();
    const err = new Error("offline");
    calls[0].reject(err);
    expect(await t1).toEqual({ ok: false, error: err });
    expect(await t2).toEqual({ ok: false, error: err });
    await flush();
    expect(calls).toHaveLength(1);
    expect(onDone).toHaveBeenLastCalledWith("c1", { ok: false, error: err, drained: true });
    expect(q.busy("c1")).toBe(false);
    // The next tap starts fresh.
    q.tap("c1", 1);
    await flush();
    expect(calls.map((c) => c.delta)).toEqual([1, 1]);
  });

  test("a queued sum over MAX_DELTA goes in parts, never one refused request", async () => {
    const { send, calls } = manualSend();
    const q = createQtyQueue({ send });
    q.tap("c1", 1);
    for (let i = 0; i < 120; i++) q.tap("c1", 1);
    await flush();
    calls[0].resolve({});
    await flush();
    expect(calls[1].delta).toBe(MAX_DELTA);
    calls[1].resolve({});
    await flush();
    expect(calls[2].delta).toBe(120 - MAX_DELTA);
  });

  test("a zero or non-integer delta is never sent", async () => {
    const { send } = manualSend();
    const q = createQtyQueue({ send });
    expect(await q.tap("c1", 0)).toEqual({ ok: true, result: null });
    expect(await q.tap("c1", 1.5)).toEqual({ ok: true, result: null });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("applyOptimisticDelta", () => {
  test("moves the shown number by the delta at once, floored at 0", () => {
    expect(applyOptimisticDelta({ r1: 2 }, "r1", 1)).toEqual({ r1: 3 });
    expect(applyOptimisticDelta({ r1: 1 }, "r1", -3)).toEqual({ r1: 0 });
    expect(applyOptimisticDelta({}, "pre:c1", 1)).toEqual({ "pre:c1": 1 });
    const prev = { r1: 2 };
    expect(applyOptimisticDelta(prev, null, 1)).toBe(prev);
  });
});

describe("adoptQtyResult", () => {
  test("bumped / lowered / renewed / inserted / revived: the row id takes the server's quantity", () => {
    expect(adoptQtyResult({ r1: 9 }, { result: { list_item_id: "r1", quantity: 3, outcome: "bumped" }, optKey: "r1" }))
      .toEqual({ r1: 3 });
    expect(adoptQtyResult({ "pre:c1": 1 }, { result: { list_item_id: "r9", quantity: 1, outcome: "inserted" }, optKey: "pre:c1", preKey: "pre:c1" }))
      .toEqual({ "pre:c1": 1, r9: 1 });
  });
  test("removed / absent: the row's entries read 0 — kept, not deleted, so the merge can hold them", () => {
    expect(adoptQtyResult({ r1: 1, "pre:c1": 1, r2: 4 }, { result: { list_item_id: "r1", quantity: 0, outcome: "removed" }, optKey: "r1", preKey: "pre:c1" }))
      .toEqual({ r1: 0, "pre:c1": 0, r2: 4 });
    expect(adoptQtyResult({ "pre:c1": 1 }, { result: { list_item_id: null, quantity: null, outcome: "absent" }, optKey: "pre:c1", preKey: "pre:c1" }))
      .toEqual({ "pre:c1": 0 });
  });
  test("V5 regression: after a removal, a poll requested before it and answered after can't put the old number back", () => {
    // 5 → 0 by − taps; the removal settled at seq 9; a poll requested at seq 6 still carries the row at 4.
    const afterRemove = adoptQtyResult({ r1: 0 }, { result: { list_item_id: "r1", quantity: 0, outcome: "removed" }, optKey: "r1" });
    expect(mergePolledById(afterRemove, { r1: 4 }, new Set(), { r1: 9 }, 6)).toEqual({ r1: 0 });
    // The next poll (requested after) no longer has the row: the entry goes.
    expect(mergePolledById(afterRemove, {}, new Set(), { r1: 9 }, 9)).toEqual({});
  });
  test("no result (a net-zero tap) changes nothing", () => {
    const prev = { r1: 2 };
    expect(adoptQtyResult(prev, { result: null, optKey: "r1" })).toBe(prev);
  });
});

describe("seedRowKey", () => {
  test("a row id revealed mid-burst takes the number on screen", () => {
    expect(seedRowKey({ "pre:c1": 3 }, { rowId: "r9", optKey: "pre:c1" })).toEqual({ "pre:c1": 3, r9: 3 });
  });
  test("never overwrites a row id already shown, and needs an optimistic value to copy", () => {
    const prev = { "pre:c1": 3, r9: 2 };
    expect(seedRowKey(prev, { rowId: "r9", optKey: "pre:c1" })).toBe(prev);
    const p2 = { a: 1 };
    expect(seedRowKey(p2, { rowId: "r9", optKey: "pre:c1" })).toBe(p2);
    expect(seedRowKey(p2, { rowId: null, optKey: "a" })).toBe(p2);
  });
  test("V5 regression: the seeded, busy row id keeps its number when a poll delivers the new row mid-burst", () => {
    // pre:c1 shown 3 while the server has 1 (one request landed); the row id r9 is seeded and busy.
    const seeded = seedRowKey({ "pre:c1": 3 }, { rowId: "r9", optKey: "pre:c1" });
    expect(mergePolledById(seeded, { r9: 1 }, new Set(["r9", "pre:c1"]), {}, 0)).toEqual({ r9: 3, "pre:c1": 3 });
  });
});

test("isListEntry: inserted and revived only (Q10)", () => {
  expect(["inserted", "revived", "bumped", "renewed", "lowered", "removed", "absent"].filter((o) => isListEntry({ outcome: o })))
    .toEqual(["inserted", "revived"]);
  expect(isListEntry(null)).toBe(false);
});

// SPEC_qty_followup_086 F2: the instant guess follows the server's rules.
describe("guessChange + adoptCheckedResult (F2)", () => {
  // What the hook's show() does to the displayed map with the guess (pure, no side effects).
  const render = (prev, key, args) => ({ ...prev, [key]: guessChange({ shown: prev[key], ...args }).qty });

  test("a bought row at 2, +1: the first render shows 1 and unchecked — never 3", () => {
    const g = guessChange({ shown: 2, delta: 1, serverStatus: "bought" });
    expect(g).toEqual({ qty: 1, uncheck: true });
    expect(render({ r1: 2 }, "r1", { delta: 1, serverStatus: "bought" })).toEqual({ r1: 1 });
  });
  test("skipped / deferred are not pending either: a fresh need", () => {
    expect(guessChange({ shown: 3, delta: 2, serverStatus: "skipped" })).toEqual({ qty: 2, uncheck: true });
    expect(guessChange({ shown: 3, delta: 1, serverStatus: "deferred" })).toEqual({ qty: 1, uncheck: true });
  });
  test("later taps in the same burst add to the fresh need (renewing): 1 → 2 → 3", () => {
    let m = render({ r1: 2 }, "r1", { delta: 1, serverStatus: "bought" });
    m = render(m, "r1", { delta: 1, serverStatus: "bought", renewing: true });
    m = render(m, "r1", { delta: 1, serverStatus: "bought", renewing: true });
    expect(m).toEqual({ r1: 3 });
    expect(guessChange({ shown: 1, delta: 1, serverStatus: "bought", renewing: true }).uncheck).toBe(false);
  });
  test("a bought row at 2, −1: shows 1, still checked", () => {
    expect(guessChange({ shown: 2, delta: -1, serverStatus: "bought" })).toEqual({ qty: 1, uncheck: false });
    expect(guessChange({ shown: 1, delta: -3, serverStatus: "bought" })).toEqual({ qty: 0, uncheck: false });
  });
  test("a pending row, or no row, is unchanged from today: old ± delta", () => {
    expect(guessChange({ shown: 2, delta: 1, serverStatus: "pending" })).toEqual({ qty: 3, uncheck: false });
    expect(guessChange({ shown: 2, delta: -1, serverStatus: "pending" })).toEqual({ qty: 1, uncheck: false });
    expect(guessChange({ shown: undefined, delta: 1, serverStatus: null })).toEqual({ qty: 1, uncheck: false });
  });
  test("a poll requested before the change and answered after doesn't put the row back in the cart", () => {
    // The guess unchecked r1 (pending + stamped at 7); a snapshot requested at 5 still says bought.
    expect(mergePolledById({ r1: false }, { r1: true }, new Set(["r1"]), { r1: 7 }, 5)).toEqual({ r1: false });
    // Released and stamped at drain (9); a poll requested at 6 still can't; one requested at 9 can.
    expect(mergePolledById({ r1: false }, { r1: true }, new Set(), { r1: 9 }, 6)).toEqual({ r1: false });
    expect(mergePolledById({ r1: false }, { r1: false }, new Set(), { r1: 9 }, 9)).toEqual({ r1: false });
  });
  test("adoptCheckedResult: renewed → unchecked; others follow the returned status; removed / absent change nothing", () => {
    expect(adoptCheckedResult({ r1: true }, { list_item_id: "r1", outcome: "renewed", status: "pending", quantity: 1 })).toEqual({ r1: false });
    expect(adoptCheckedResult({ r1: false }, { list_item_id: "r1", outcome: "lowered", status: "bought", quantity: 1 })).toEqual({ r1: true });
    expect(adoptCheckedResult({ r1: true }, { list_item_id: "r1", outcome: "bumped", status: "pending", quantity: 3 })).toEqual({ r1: false });
    const prev = { r1: true };
    expect(adoptCheckedResult(prev, { list_item_id: "r1", outcome: "removed", status: "bought", quantity: 0 })).toBe(prev);
    expect(adoptCheckedResult(prev, { list_item_id: null, outcome: "absent" })).toBe(prev);
    expect(adoptCheckedResult(prev, { list_item_id: "r1", outcome: "lowered", status: "bought" })).toBe(prev);
  });
  test("a wrong guess is corrected on drain: guessed a fresh need, but the row was already pending on the server", () => {
    // Shown 1 + unchecked by the guess; the server bumped it to 4 and it is pending.
    const result = { list_item_id: "r1", outcome: "bumped", status: "pending", quantity: 4 };
    expect(adoptQtyResult({ r1: 1 }, { result, optKey: "r1" })).toEqual({ r1: 4 });
    expect(adoptCheckedResult({ r1: false }, result)).toEqual({ r1: false });
    // Guessed "still bought" after a −, but the server says it left the cart (someone unchecked it): adopt.
    const r2 = { list_item_id: "r2", outcome: "lowered", status: "pending", quantity: 1 };
    expect(adoptCheckedResult({ r2: true }, r2)).toEqual({ r2: false });
  });
});
