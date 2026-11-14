import { createRowWriteChain, mergePolledChecked } from "./checkWrites";

// A send() the test resolves or rejects by hand, honouring abort like fetch does.
function deferredSend(log, label) {
  let resolve, reject;
  const send = (signal) => new Promise((res, rej) => {
    log.push(`sent ${label}`);
    resolve = res; reject = rej;
    signal.addEventListener("abort", () => { log.push(`aborted ${label}`); const e = new Error("aborted"); e.name = "AbortError"; rej(e); });
  });
  return { send, resolve: (v) => resolve(v), reject: (e) => reject(e) };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

test("one write: sent at once, resolves latest, the row is no longer pending", async () => {
  const c = createRowWriteChain(); const log = [];
  const a = deferredSend(log, "check");
  const p = c.enqueue("r1", true, a.send);
  await flush();
  expect(log).toEqual(["sent check"]);
  expect(c.pending("r1")).toBe(true);
  expect(c.intent("r1", false)).toBe(true);
  a.resolve("bought");
  await expect(p).resolves.toEqual({ value: "bought", latest: true });
  expect(c.pending("r1")).toBe(false);
  expect(c.intent("r1", false)).toBe(false);   // falls back to the rendered state
});

test("Undo while the check is in flight: the check is aborted, then the uncheck is sent", async () => {
  const c = createRowWriteChain(); const log = [];
  const check = deferredSend(log, "check"), undo = deferredSend(log, "undo");
  const p1 = c.enqueue("r1", true, check.send);
  await flush();
  const p2 = c.enqueue("r1", false, undo.send);
  const r1 = await p1;
  expect(r1.aborted).toBe(true);
  expect(r1.latest).toBe(false);
  await flush();
  expect(log).toEqual(["sent check", "aborted check", "sent undo"]);
  undo.resolve([]);
  await expect(p2).resolves.toEqual({ value: [], latest: true });
  expect(c.pending("r1")).toBe(false);
});

test("a write still waiting its turn is cancelled, never sent", async () => {
  const c = createRowWriteChain(); const log = [];
  const w1 = deferredSend(log, "uncheck"), w2 = deferredSend(log, "check"), w3 = deferredSend(log, "undo");
  const p1 = c.enqueue("r1", false, w1.send);
  await flush();
  const p2 = c.enqueue("r1", true, w2.send);    // aborts w1, queues behind it
  const p3 = c.enqueue("r1", false, w3.send);   // supersedes w2 before it is sent
  await p1;
  await expect(p2).resolves.toEqual({ skipped: true });
  await flush();
  expect(log).toEqual(["sent uncheck", "aborted uncheck", "sent undo"]);
  w3.resolve("pending");
  await expect(p3).resolves.toEqual({ value: "pending", latest: true });
});

test("a failed write that is the latest reports it (the caller puts the row back)", async () => {
  const c = createRowWriteChain(); const log = [];
  const w = deferredSend(log, "check");
  const p = c.enqueue("r1", true, w.send);
  await flush();
  w.reject(new TypeError("Failed to fetch"));
  const r = await p;
  expect(r.aborted).toBe(false);
  expect(r.latest).toBe(true);
  expect(r.error.message).toBe("Failed to fetch");
  expect(c.pending("r1")).toBe(false);
});

test("rows are independent: three fast checks run side by side", async () => {
  const c = createRowWriteChain(); const log = [];
  const a = deferredSend(log, "a"), b = deferredSend(log, "b"), d = deferredSend(log, "d");
  c.enqueue("a", true, a.send); c.enqueue("b", true, b.send); c.enqueue("d", true, d.send);
  await flush();
  expect(log).toEqual(["sent a", "sent b", "sent d"]);
});

// The poll vs. a just-settled write (2026-11-14, the burst walk's lost check).
describe("mergePolledChecked", () => {
  test("no writes anywhere: the snapshot wins", () => {
    const polled = { a: true, b: false };
    expect(mergePolledChecked({ a: false, b: false }, polled, new Set(), {}, 0)).toBe(polled);
  });
  test("a write in flight keeps its local value", () => {
    expect(mergePolledChecked({ g: true }, { g: false }, new Set(["g"]), { g: 1 }, 1)).toEqual({ g: true });
  });
  test("THE RACE: poll requested at seq 4, Garlic's check starts at 5 and settles at 6 (guard cleared), the stale answer lands — Garlic stays checked", () => {
    const lastTouch = { g: 6 };                                    // started 5, settled 6
    expect(mergePolledChecked({ g: true, l: false }, { g: false, l: false }, new Set(), lastTouch, 4)).toEqual({ g: true, l: false });
  });
  test("the next poll, requested after the write settled, brings the server's value (even if someone else changed it)", () => {
    expect(mergePolledChecked({ g: true }, { g: false }, new Set(), { g: 6 }, 6)).toEqual({ g: false });
  });
  test("other rows still follow the server in the same merge", () => {
    expect(mergePolledChecked({ g: true, b: false }, { g: false, b: true }, new Set(), { g: 6 }, 4)).toEqual({ g: true, b: true });
  });
  test("a row that left the list isn't resurrected from the local map", () => {
    expect(mergePolledChecked({ g: true }, {}, new Set(), { x: 9 }, 4)).toEqual({});
  });
});
