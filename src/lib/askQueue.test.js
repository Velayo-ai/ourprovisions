import {
  ASK_LAND_TIMEOUT_MS, makeAskLanding, cleanLanding, readAskQueue, writeAskQueue, byTap,
  synthKey, isSynthKey, parseSynthKey, rekeySynth, synthKeysOf, askSendIsTransient,
  liveLandings, applyAskOverlay, heldByLanding, planFlushStep, shownListState,
} from "./askQueue";
import { askKey, queueKey, discardForeign, clearCheckStorage, OFFLINE_SKIP, putEntry, splitAtTaps, splitAroundWrap } from "./checkQueue";
import { AuthTokenMissing } from "./supabaseClient";

function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _m: m,
  };
}

const RUN = "11111111-1111-4111-8111-111111111111";
const RUN2 = "22222222-2222-4222-8222-222222222222";
const T = (min) => new Date(Date.UTC(2026, 10, 24, 20, min)).toISOString();
const land = (over = {}) => makeAskLanding({
  runId: RUN, askId: "ask-1", ids: ["apples"], tapAt: T(10), label: "Easton", style: "simple",
  items: [{ id: "apples", name: "Apples", category: "Produce" }, { id: "bread", name: "Bread", category: "Bakery" }],
  ...over,
});

describe("the stored queue (D2)", () => {
  test("an entry keeps only what it needs; items are trimmed to its picks", () => {
    const e = land({ ids: ["apples"] });
    expect(e).toEqual({
      runId: RUN, askId: "ask-1", ids: ["apples"], tapAt: T(10), label: "Easton", style: "simple",
      items: [{ id: "apples", name: "Apples", category: "Produce" }], landed: false,
    });
  });

  test("a bad entry is not an entry: no run id, no picks, 49 picks, a duplicate, a bad time", () => {
    expect(land({ runId: "" })).toBeNull();
    expect(land({ ids: [] })).toBeNull();
    expect(land({ ids: Array.from({ length: 49 }, (_, i) => `i${i}`) })).toBeNull();
    expect(land({ ids: ["a", "a"] })).toBeNull();
    expect(land({ tapAt: "not a time" })).toBeNull();
    expect(cleanLanding(null)).toBeNull();
  });

  test("round trip under op_ask_queue:<clerk>:<household>; an empty list removes the key", () => {
    const s = memStore();
    const list = [land(), land({ runId: RUN2, ids: ["bread"], tapAt: T(12) })];
    writeAskQueue("u", "h", list, s);
    expect(s._m.has("op_ask_queue:u:h")).toBe(true);
    expect(askKey("u", "h")).toBe("op_ask_queue:u:h");
    expect(readAskQueue("u", "h", s)).toEqual(list);
    expect(readAskQueue("u", "other", s)).toEqual([]);
    writeAskQueue("u", "h", [], s);
    expect(s._m.has("op_ask_queue:u:h")).toBe(false);
  });

  test("a garbled value, a duplicated run and a bad entry are dropped on read", () => {
    const s = memStore({ "op_ask_queue:u:h": "{nope" });
    expect(readAskQueue("u", "h", s)).toEqual([]);
    s.setItem("op_ask_queue:u:h", JSON.stringify([land(), land(), { runId: "x" }]));
    expect(readAskQueue("u", "h", s)).toEqual([land()]);
  });

  test("the foreign discard and the clear cover the Ask queue (sign-out, household switch)", () => {
    const s = memStore({
      "op_ask_queue:u:h": "[]", "op_ask_queue:u:h2": "[]", "op_ask_queue:u2:h": "[]",
      [queueKey("u", "h")]: "{}", "op_other": "keep",
    });
    expect(discardForeign("u", "h", s).sort()).toEqual(["op_ask_queue:u2:h", "op_ask_queue:u:h2"]);
    expect(s._m.has("op_ask_queue:u:h")).toBe(true);
    clearCheckStorage(s);
    expect([...s._m.keys()]).toEqual(["op_other"]);
  });

  test("blocked storage never throws; it reads as empty", () => {
    const throwing = { get length() { throw new Error("x"); }, key() { throw new Error("x"); }, getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } };
    expect(readAskQueue("u", "h", throwing)).toEqual([]);
    expect(() => writeAskQueue("u", "h", [land()], throwing)).not.toThrow();
    expect(readAskQueue("u", "h", null)).toEqual([]);
  });

  test("byTap is tap order, stable on a tie", () => {
    const a = land({ runId: "a", tapAt: T(20) });
    const b = land({ runId: "b", tapAt: T(5) });
    const c = land({ runId: "c", tapAt: T(5) });
    expect(byTap([a, b, c]).map((e) => e.runId)).toEqual(["b", "c", "a"]);
  });
});

describe("the boundary split (D4)", () => {
  const entries = { a: { want: true, tapAt: T(1) }, b: { want: true, tapAt: T(10) }, c: { want: false, tapAt: T(11) }, d: { want: true, tapAt: T(30) } };

  test("splits at every boundary by tap time; a check at a boundary's own time goes before it", () => {
    expect(splitAtTaps(entries, [T(20), T(10)])).toEqual([["a", "b"], ["c"], ["d"]]);
    expect(splitAtTaps(entries, [])).toEqual([["a", "b", "c", "d"]]);
    expect(splitAtTaps({}, [T(1)])).toEqual([[], []]);
  });

  test("splitAroundWrap is the one-boundary case, unchanged", () => {
    expect(splitAroundWrap(entries, { tapAt: T(10) })).toEqual({ before: ["a", "b"], after: ["c", "d"] });
    expect(splitAroundWrap(entries, null)).toEqual({ before: ["a", "b", "c", "d"], after: [] });
  });
});

describe("the synthetic check key (D4)", () => {
  test("ask:<runId>:<cid>, parsed back; anything else is not one", () => {
    const k = synthKey(RUN, "apples");
    expect(k).toBe(`ask:${RUN}:apples`);
    expect(isSynthKey(k)).toBe(true);
    expect(parseSynthKey(k)).toEqual({ runId: RUN, catalogItemId: "apples" });
    expect(isSynthKey("0b3c-row-id")).toBe(false);
    expect(parseSynthKey("ask:")).toBeNull();
    expect(parseSynthKey("ask:run:")).toBeNull();
  });

  test("re-key: this run's held checks move to the real rows; another run's stay; a pick with no row is dropped", () => {
    const entries = {
      [synthKey(RUN, "apples")]: { want: true, tapAt: T(12) },
      [synthKey(RUN, "gone")]: { want: true, tapAt: T(13) },
      [synthKey(RUN2, "bread")]: { want: true, tapAt: T(14) },
      "row-x": { want: false, tapAt: T(2) },
    };
    const r = rekeySynth(entries, RUN, (cid) => (cid === "apples" ? "row-apples" : null));
    expect(r.entries).toEqual({
      "row-apples": { want: true, tapAt: T(12), cid: "apples" },
      [synthKey(RUN2, "bread")]: { want: true, tapAt: T(14) },
      "row-x": { want: false, tapAt: T(2) },
    });
    expect(r.moved).toEqual([[synthKey(RUN, "apples"), "row-apples"]]);
    expect(r.dropped).toEqual([synthKey(RUN, "gone")]);
    expect(entries[synthKey(RUN, "apples")]).toBeDefined();   // never mutated
  });

  test("re-key onto a row that already has an entry keeps the newer tap", () => {
    const older = rekeySynth({ [synthKey(RUN, "a")]: { want: true, tapAt: T(5) }, r1: { want: false, tapAt: T(9) } }, RUN, () => "r1");
    expect(older.entries).toEqual({ r1: { want: false, tapAt: T(9) } });
    const newer = rekeySynth({ [synthKey(RUN, "a")]: { want: true, tapAt: T(12) }, r1: { want: false, tapAt: T(9) } }, RUN, () => "r1");
    expect(newer.entries).toEqual({ r1: { want: true, tapAt: T(12), cid: "a" } });
  });

  test("synthKeysOf lists one run's held checks", () => {
    expect(synthKeysOf({ [synthKey(RUN, "a")]: {}, [synthKey(RUN2, "b")]: {}, r: {} }, RUN)).toEqual([synthKey(RUN, "a")]);
  });

  test("a synthetic key is always held; a real row is held while an unlanded landing sent before the tap covers it", () => {
    const rows = [{ id: "r-apples", catalogItemId: "apples" }, { id: "r-milk", catalogItemId: "milk" }];
    const list = [land({ ids: ["apples"], tapAt: T(10) })];
    expect(heldByLanding(synthKey(RUN, "x"), rows, [])).toBe(true);
    expect(heldByLanding(synthKey(RUN, "x"), rows, [], T(1))).toBe(true);
    expect(heldByLanding("r-apples", rows, list)).toBe(true);                 // a new tap
    expect(heldByLanding("r-apples", rows, list, T(12))).toBe(true);          // tapped after the pick
    expect(heldByLanding("r-apples", rows, list, T(5))).toBe(false);          // tapped before it: goes first
    expect(heldByLanding("r-milk", rows, list)).toBe(false);
    expect(heldByLanding("r-apples", rows, [{ ...list[0], landed: true }])).toBe(false);
    expect(heldByLanding("unknown", rows, list)).toBe(false);
  });

  test("the flush step: checks before the first boundary, then that boundary; synthetic keys never sent", () => {
    const a = land({ runId: "a", tapAt: T(10) });
    const b = land({ runId: "b", tapAt: T(30) });
    const wrap = { tapAt: T(20), dropIds: [], hideIds: [] };
    const entries = {
      r1: { want: true, tapAt: T(5) }, r2: { want: true, tapAt: T(10) }, r3: { want: false, tapAt: T(15) },
      r4: { want: true, tapAt: T(25) }, r5: { want: true, tapAt: T(40) },
      [synthKey("a", "bananas")]: { want: true, tapAt: T(12) },
    };
    let s = planFlushStep(entries, [b, a], wrap);
    expect(s.send).toEqual(["r1", "r2"]);
    expect(s.boundary).toMatchObject({ kind: "land", entry: a });
    s = planFlushStep(entries, [b], wrap);   // a replayed
    expect(s.send).toEqual(["r1", "r2", "r3"]);
    expect(s.boundary).toMatchObject({ kind: "wrap", wrap });
    s = planFlushStep(entries, [b], null);   // the Wrap up landed
    expect(s.send).toEqual(["r1", "r2", "r3", "r4"]);
    expect(s.boundary.entry).toBe(b);
    s = planFlushStep(entries, [], null);    // nothing left: every check, but never the synthetic key
    expect(s.send).toEqual(["r1", "r2", "r3", "r4", "r5"]);
    expect(s.boundary).toBeNull();
    expect(planFlushStep({}, [], null)).toEqual({ send: [], boundary: null });
  });
});

describe("the send: queue or a real error (D1, 2a, 2c)", () => {
  test("transient: WebKit Load failed, Chrome Failed to fetch, the offline skip, a network token, the 8 s timeout", () => {
    expect(askSendIsTransient({ message: "TypeError: Load failed", code: "" })).toBe(true);
    expect(askSendIsTransient({ message: "TypeError: Failed to fetch", code: "" })).toBe(true);
    expect(askSendIsTransient(OFFLINE_SKIP)).toBe(true);
    expect(askSendIsTransient({ message: "AuthTokenMissing: no Clerk token (network) — refusing to query as anon", code: "" })).toBe(true);
    expect(askSendIsTransient({ message: "AbortError: signal is aborted without reason", code: "" })).toBe(true);
    expect(askSendIsTransient(null, { timedOut: true })).toBe(true);
    expect(ASK_LAND_TIMEOUT_MS).toBe(8000);
  });

  test("2a: Clerk's null token is real online, transient while the app knows it is off grid", () => {
    const err = { message: `AuthTokenMissing: ${new AuthTokenMissing("clerk").message}`, code: "" };
    expect(askSendIsTransient(err)).toBe(false);
    expect(askSendIsTransient(err, { offline: true })).toBe(true);
  });

  test("real: the server answered (42501, P0002, 22023), or nothing to classify", () => {
    expect(askSendIsTransient({ code: "42501", message: "not a member" })).toBe(false);
    expect(askSendIsTransient({ code: "P0002", message: "no live ask" }, { offline: true })).toBe(false);
    expect(askSendIsTransient({ code: "22023", message: "bad" })).toBe(false);
    expect(askSendIsTransient(null)).toBe(false);
  });
});

describe("the overlay (D3)", () => {
  const rows = [
    { id: "r-apples", catalogItemId: "apples", name: "Apples", quantity: 2, status: "pending", pickedByLabels: null },
    { id: "r-bread", catalogItemId: "bread", name: "Bread", quantity: 3, status: "bought", pickedByLabels: ["Everett"] },
  ];
  const quantities = { "r-apples": 2, "r-bread": 3 };
  const checked = { "r-apples": false, "r-bread": true };
  const items = [
    { id: "apples", name: "Apples", category: "Produce" }, { id: "bread", name: "Bread", category: "Bakery" },
    { id: "bananas", name: "Bananas", category: "Produce" },
  ];

  test("no landings: the inputs come back as they are", () => {
    const o = applyAskOverlay({ rows, quantities, checked, landings: [] });
    expect(o.rows).toBe(rows);
    expect(o.quantities).toBe(quantities);
    expect(o.checked).toBe(checked);
    expect(o.addIds).toEqual([]);
  });

  test("the three branches: pending +1 with the label; bought → a new need at 1, label reset; none → a new row", () => {
    const L = land({ ids: ["apples", "bread", "bananas"], items });
    const o = applyAskOverlay({ rows, quantities, checked, landings: [L], me: "user-paige" });
    const by = Object.fromEntries(o.rows.map((r) => [r.catalogItemId, r]));
    expect(by.apples).toMatchObject({ id: "r-apples", quantity: 3, status: "pending", pickedByLabels: ["Easton"] });
    expect(by.bread).toMatchObject({ id: "r-bread", quantity: 1, status: "pending", pickedByLabels: ["Easton"] });
    expect(by.bananas).toMatchObject({
      id: synthKey(RUN, "bananas"), quantity: 1, status: "pending", name: "Bananas", category: "Produce",
      addedBy: "user-paige", pickedByLabels: ["Easton"],
    });
    expect(o.quantities).toMatchObject({ "r-apples": 3, "r-bread": 1, [synthKey(RUN, "bananas")]: 1 });
    expect(o.checked).toMatchObject({ "r-apples": false, "r-bread": false, [synthKey(RUN, "bananas")]: false });
    expect(o.addIds.sort()).toEqual(["r-apples", "r-bread", synthKey(RUN, "bananas")].sort());
    // Server state is never touched.
    expect(rows[1].status).toBe("bought");
    expect(quantities["r-apples"]).toBe(2);
  });

  test("the label: appended once, kept at 8", () => {
    const eight = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const r = [
      { id: "r1", catalogItemId: "apples", name: "Apples", quantity: 1, status: "pending", pickedByLabels: ["Easton"] },
      { id: "r2", catalogItemId: "bread", name: "Bread", quantity: 1, status: "pending", pickedByLabels: eight },
    ];
    const o = applyAskOverlay({ rows: r, landings: [land({ ids: ["apples", "bread"] })] });
    expect(o.rows[0].pickedByLabels).toEqual(["Easton"]);
    expect(o.rows[1].pickedByLabels).toEqual(eight);
    const o2 = applyAskOverlay({ rows: [{ ...r[0], pickedByLabels: ["Nina"] }], landings: [land({ ids: ["apples"] })] });
    expect(o2.rows[0].pickedByLabels).toEqual(["Nina", "Easton"]);
  });

  test("tap order: a check queued before the pick makes it a new need; after the pick it shows checked", () => {
    const before = applyAskOverlay({
      rows, quantities, checked: { ...checked, "r-apples": true },
      checkEntries: { "r-apples": { want: true, tapAt: T(5) } }, landings: [land({ ids: ["apples"], tapAt: T(10) })],
    });
    expect(before.rows[0]).toMatchObject({ quantity: 1, status: "pending" });
    expect(before.checked["r-apples"]).toBe(false);
    const after = applyAskOverlay({
      rows, quantities, checked: { ...checked, "r-apples": true },
      checkEntries: { "r-apples": { want: true, tapAt: T(15) } }, landings: [land({ ids: ["apples"], tapAt: T(10) })],
    });
    expect(after.rows[0]).toMatchObject({ quantity: 3, status: "pending" });
    expect(after.checked["r-apples"]).toBe(true);
  });

  test("a check of a new overlay row (synthetic key), then its Undo, cancels out", () => {
    const L = land({ ids: ["bananas"], items });
    const key = synthKey(RUN, "bananas");
    let entries = putEntry({}, key, true, T(12), false, "bananas");
    expect(applyAskOverlay({ rows, landings: [L], checkEntries: entries }).checked[key]).toBe(true);
    entries = putEntry(entries, key, false, T(13), false, "bananas");
    expect(entries).toEqual({});
    expect(applyAskOverlay({ rows, landings: [L], checkEntries: entries }).checked[key]).toBe(false);
  });

  test("two landings of the same new item: one row, 1 then +1, both labels", () => {
    const a = land({ ids: ["bananas"], items, tapAt: T(10) });
    const b = land({ runId: RUN2, ids: ["bananas"], items, tapAt: T(12), label: "Everett" });
    const o = applyAskOverlay({ rows, landings: [b, a] });
    const ban = o.rows.filter((r) => r.catalogItemId === "bananas");
    expect(ban).toHaveLength(1);
    expect(ban[0]).toMatchObject({ id: synthKey(RUN, "bananas"), quantity: 2, pickedByLabels: ["Easton", "Everett"] });
  });

  test("a pick with no name to draw is left to the replay's read", () => {
    const o = applyAskOverlay({ rows, landings: [land({ ids: ["mystery"], items: [] })] });
    expect(o.rows).toHaveLength(2);
    expect(o.addIds).toEqual([]);
  });

  test("a Browse +1 online on an overlay-only item: the server row it makes gets the pick on top", () => {
    const L = land({ ids: ["bananas"], items });
    const shown = applyAskOverlay({ rows, landings: [L] });
    expect(shown.rows.find((r) => r.catalogItemId === "bananas").quantity).toBe(1);
    // Paige's +1 reached the server: a real pending row at 1. The landing is still queued, so +1 on top.
    const server = [...rows, { id: "r-bananas", catalogItemId: "bananas", name: "Bananas", quantity: 1, status: "pending", pickedByLabels: null }];
    const after = applyAskOverlay({ rows: server, quantities: { ...quantities, "r-bananas": 1 }, landings: [L] });
    const ban = after.rows.filter((r) => r.catalogItemId === "bananas");
    expect(ban).toHaveLength(1);
    expect(ban[0]).toMatchObject({ id: "r-bananas", quantity: 2, pickedByLabels: ["Easton"] });
  });

  test("no blink: a landed entry applies until a read that started after it is in, and then the server says the same", () => {
    const L = { ...land({ ids: ["apples"] }), landed: true, landedSeq: 5 };
    // The replay landed; the read in flight started before it (5): still overlaid over the old rows.
    const during = applyAskOverlay({ rows, quantities, landings: liveLandings([L], 5) });
    expect(during.rows[0].quantity).toBe(3);
    // Read 6 started after the landing and is applied: the entry retires; the server's row already has it.
    const serverAfter = [{ ...rows[0], quantity: 3, pickedByLabels: ["Easton"] }, rows[1]];
    const after = applyAskOverlay({ rows: serverAfter, quantities: { ...quantities, "r-apples": 3 }, landings: liveLandings([L], 6) });
    expect(after.rows[0].quantity).toBe(3);
    expect(after.rows[0].pickedByLabels).toEqual(["Easton"]);
    expect(after.addIds).toEqual([]);   // the dot clears with it
    // Restored from storage already landed (no landedSeq): it retires at once, never shown twice.
    expect(liveLandings([{ ...land(), landed: true }], 0)).toHaveLength(0);
    expect(liveLandings([land()], 99)).toHaveLength(1);   // a queued one stays whatever is read
  });
});

describe("what the hook hands out (D3: one place, at the return)", () => {
  const listRows = [{ id: "r-apples", catalogItemId: "apples", name: "Apples", quantity: 2, status: "pending", pickedByLabels: null }];
  const quantities = { "r-apples": 2 };
  const checked = { "r-apples": false };
  const items = [{ id: "apples", name: "Apples", category: "Produce" }, { id: "bananas", name: "Bananas", category: "Produce" }];

  test("nothing queued: the hook's own objects, untouched", () => {
    const queuedChecks = {};
    const s = shownListState({ listRows, quantities, checked, queuedChecks, askQueue: [], appliedReadNo: 3 });
    expect(s.listRows).toBe(listRows);
    expect(s.quantities).toBe(quantities);
    expect(s.checked).toBe(checked);
    expect(s.queuedChecks).toBe(queuedChecks);
  });

  test("a queued landing: the rows it touched are drawn as landed, each with the dot; a queued check keeps its own entry", () => {
    const L = land({ ids: ["apples", "bananas"], items });
    const queuedChecks = { "r-other": { want: true, tapAt: T(1) } };
    const s = shownListState({ listRows, quantities, checked, queuedChecks, askQueue: [L], appliedReadNo: 0, me: "u-paige" });
    expect(s.listRows.map((r) => [r.id, r.quantity])).toEqual([["r-apples", 3], [synthKey(RUN, "bananas"), 1]]);
    expect(s.quantities).toMatchObject({ "r-apples": 3, [synthKey(RUN, "bananas")]: 1 });
    expect(Object.keys(s.queuedChecks).sort()).toEqual(["r-apples", "r-other", synthKey(RUN, "bananas")].sort());
    expect(s.queuedChecks["r-other"]).toEqual({ want: true, tapAt: T(1) });
    // The server state the hook keeps is never touched.
    expect(listRows).toHaveLength(1);
    expect(quantities["r-apples"]).toBe(2);
  });

  test("See highlights overlay rows: they carry the catalog id landed.start is given", () => {
    const s = shownListState({ listRows, quantities, checked, queuedChecks: {}, askQueue: [land({ ids: ["bananas"], items })], appliedReadNo: 0 });
    const ids = new Set(["bananas"]);
    expect(s.listRows.filter((r) => ids.has(r.catalogItemId)).map((r) => r.name)).toEqual(["Bananas"]);
  });

  test("no blink across the replay: before the read and after it the same quantity, and the dot goes with the read", () => {
    const L = { ...land({ ids: ["apples"] }), landed: true, landedSeq: 7 };
    const before = shownListState({ listRows, quantities, checked, queuedChecks: {}, askQueue: [L], appliedReadNo: 7 });
    const serverAfter = [{ ...listRows[0], quantity: 3, pickedByLabels: ["Easton"] }];
    const after = shownListState({ listRows: serverAfter, quantities: { "r-apples": 3 }, checked, queuedChecks: {}, askQueue: [L], appliedReadNo: 8 });
    expect(before.listRows[0].quantity).toBe(3);
    expect(after.listRows[0].quantity).toBe(3);
    expect(before.queuedChecks).toHaveProperty("r-apples");
    expect(after.queuedChecks).toEqual({});
  });
});
