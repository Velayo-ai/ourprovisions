import { createQtyQueue, applyOptimisticDelta, adoptQtyResult, isListEntry, MAX_DELTA } from "./qtyWrites";

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
  test("removed / absent: the row's entries go", () => {
    expect(adoptQtyResult({ r1: 0, "pre:c1": 0, r2: 4 }, { result: { list_item_id: "r1", quantity: 0, outcome: "removed" }, optKey: "r1", preKey: "pre:c1" }))
      .toEqual({ r2: 4 });
    expect(adoptQtyResult({ "pre:c1": 0 }, { result: { list_item_id: null, quantity: null, outcome: "absent" }, optKey: "pre:c1", preKey: "pre:c1" }))
      .toEqual({});
  });
  test("no result (a net-zero tap) changes nothing", () => {
    const prev = { r1: 2 };
    expect(adoptQtyResult(prev, { result: null, optKey: "r1" })).toBe(prev);
  });
});

test("isListEntry: inserted and revived only (Q10)", () => {
  expect(["inserted", "revived", "bumped", "renewed", "lowered", "removed", "absent"].filter((o) => isListEntry({ outcome: o })))
    .toEqual(["inserted", "revived"]);
  expect(isListEntry(null)).toBe(false);
});
