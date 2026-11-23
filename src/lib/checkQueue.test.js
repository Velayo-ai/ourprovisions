import {
  queueKey, cacheKey, discardForeign, clearCheckStorage, readQueue, writeQueue, putEntry, settleEntry,
  earliestCheckTap, writeListCache, readListCache, listCacheSignature, OFFLINE_SKIP, isOfflineSkip, cachedHouseholdFor,
} from "./checkQueue";

const memStore = () => {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _keys: () => [...m.keys()].sort(),
  };
};

describe("checkQueue — keying", () => {
  test("keys carry the person and the place", () => {
    expect(queueKey("user_1", "hh_1")).toBe("op_check_queue:user_1:hh_1");
    expect(cacheKey("user_1", "hh_1")).toBe("op_list_cache:user_1:hh_1");
  });
  test("discardForeign keeps only this person's keys at this place; other op_ keys are untouched", () => {
    const s = memStore();
    s.setItem("op_check_queue:user_1:hh_1", "{}");
    s.setItem("op_list_cache:user_1:hh_1", "{}");
    s.setItem("op_check_queue:user_2:hh_1", "{}");   // another person, same phone
    s.setItem("op_list_cache:user_1:hh_2", "{}");    // same person, another place
    s.setItem("op_shop_lens", "az");
    const gone = discardForeign("user_1", "hh_1", s);
    expect(gone.sort()).toEqual(["op_check_queue:user_2:hh_1", "op_list_cache:user_1:hh_2"]);
    expect(s._keys()).toEqual(["op_check_queue:user_1:hh_1", "op_list_cache:user_1:hh_1", "op_shop_lens"]);
  });
  test("clearCheckStorage removes every queue and cache key, nothing else", () => {
    const s = memStore();
    s.setItem("op_check_queue:a:b", "{}"); s.setItem("op_list_cache:c:d", "{}"); s.setItem("op_showPrices", "true");
    clearCheckStorage(s);
    expect(s._keys()).toEqual(["op_showPrices"]);
  });
  test("no storage (private mode) is a no-op, never a throw", () => {
    expect(() => discardForeign("a", "b", null)).not.toThrow();
    expect(() => clearCheckStorage(null)).not.toThrow();
    expect(readQueue("a", "b", null)).toEqual({});
    expect(() => writeQueue("a", "b", { r: { want: true, tapAt: "2026-11-23T10:00:00.000Z" } }, null)).not.toThrow();
    const throwing = { get length() { throw new Error("blocked"); }, getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); }, key() { throw new Error("blocked"); } };
    expect(readQueue("a", "b", throwing)).toEqual({});
    expect(() => writeQueue("a", "b", { r: { want: true, tapAt: "2026-11-23T10:00:00.000Z" } }, throwing)).not.toThrow();
    expect(() => clearCheckStorage(throwing)).not.toThrow();
  });
});

describe("checkQueue — entries", () => {
  const T1 = "2026-11-23T10:00:00.000Z", T2 = "2026-11-23T10:00:05.000Z";
  test("a check of an unchecked row is queued with its tap time", () => {
    expect(putEntry({}, "r1", true, T1, false)).toEqual({ r1: { want: true, tapAt: T1 } });
  });
  test("several taps collapse to the last; a final state equal to the synced state leaves the queue", () => {
    let q = putEntry({}, "r1", true, T1, false);
    q = putEntry(q, "r1", false, T2, false);          // Undo offline: back to what the server has
    expect(q).toEqual({});
    q = putEntry(q, "r2", true, T1, false);
    q = putEntry(q, "r2", false, T2, false);
    q = putEntry(q, "r2", true, "2026-11-23T10:00:09.000Z", false);
    expect(q).toEqual({ r2: { want: true, tapAt: "2026-11-23T10:00:09.000Z" } });
  });
  test("an unknown synced state keeps the entry (never drop what might be a change)", () => {
    expect(putEntry({}, "r1", false, T1, null)).toEqual({ r1: { want: false, tapAt: T1 } });
  });
  test("the catalog id rides with the entry, kept across taps that don't know it, and survives storage", () => {
    let q = putEntry({}, "r1", true, T1, false, "c1");
    expect(q).toEqual({ r1: { want: true, tapAt: T1, cid: "c1" } });
    q = putEntry(q, "r1", true, T2, null);
    expect(q.r1.cid).toBe("c1");
    const s = memStore();
    writeQueue("u", "h", q, s);
    expect(readQueue("u", "h", s)).toEqual({ r1: { want: true, tapAt: T2, cid: "c1" } });
  });
  test("cachedHouseholdFor: this person's newest cached place, never someone else's", () => {
    const s = memStore();
    s.setItem("op_list_cache:u:hh_old", JSON.stringify({ savedAt: "2026-11-20T10:00:00.000Z" }));
    s.setItem("op_list_cache:u:hh_new", JSON.stringify({ savedAt: "2026-11-23T10:00:00.000Z" }));
    s.setItem("op_list_cache:other:hh_x", JSON.stringify({ savedAt: "2026-11-24T10:00:00.000Z" }));
    expect(cachedHouseholdFor("u", s)).toBe("hh_new");
    expect(cachedHouseholdFor("nobody", s)).toBeNull();
    expect(cachedHouseholdFor("u", null)).toBeNull();
  });
  test("putEntry never mutates its input", () => {
    const q = { r1: { want: true, tapAt: T1 } };
    putEntry(q, "r1", false, T2, false);
    expect(q).toEqual({ r1: { want: true, tapAt: T1 } });
  });
  test("settleEntry drops the entry unless a newer tap replaced it", () => {
    const q = { r1: { want: true, tapAt: T2 } };
    expect(settleEntry(q, "r1", T2)).toEqual({});
    expect(settleEntry(q, "r1", T1)).toEqual(q);            // the T1 write settled; T2 still waits
    expect(settleEntry(q, "r9", T2)).toBe(q);
  });
  test("earliestCheckTap is the first queued CHECK (an uncheck doesn't start a trip)", () => {
    expect(earliestCheckTap({})).toBeNull();
    expect(earliestCheckTap({ a: { want: false, tapAt: "2026-11-23T09:00:00.000Z" }, b: { want: true, tapAt: T2 }, c: { want: true, tapAt: T1 } })).toBe(T1);
  });
  test("read / write round-trip; junk entries are dropped on read; an empty queue removes its key", () => {
    const s = memStore();
    writeQueue("u", "h", { r1: { want: true, tapAt: T1 } }, s);
    expect(readQueue("u", "h", s)).toEqual({ r1: { want: true, tapAt: T1 } });
    s.setItem(queueKey("u", "h"), JSON.stringify({ r1: { want: true, tapAt: T1 }, r2: { want: "yes", tapAt: T1 }, r3: { want: true, tapAt: "never" } }));
    expect(readQueue("u", "h", s)).toEqual({ r1: { want: true, tapAt: T1 } });
    s.setItem(queueKey("u", "h"), "not json");
    expect(readQueue("u", "h", s)).toEqual({});
    writeQueue("u", "h", {}, s);
    expect(s.getItem(queueKey("u", "h"))).toBeNull();
  });
  test("OFFLINE_SKIP is recognised by name too (a copy that crossed a boundary)", () => {
    expect(isOfflineSkip(OFFLINE_SKIP)).toBe(true);
    expect(isOfflineSkip({ name: "OfflineSkip" })).toBe(true);
    expect(isOfflineSkip(new Error("Load failed"))).toBe(false);
    expect(isOfflineSkip(null)).toBe(false);
  });
});

describe("checkQueue — the cached list", () => {
  const hh = { id: "hh_1", name: "Madbury", budget_goal: 150, photoUrl: "https://signed.example/x" };
  const rows = [{ id: "r1", catalogItemId: "c1", name: "Milk", category: "Dairy", quantity: 1, status: "pending" }];
  test("round-trip keeps the household's id, name and budget only (no signed URLs)", () => {
    const s = memStore();
    writeListCache("u", "hh_1", { household: hh, rows, contributors: { Milk: [{ userId: "x", quantityAdded: 1 }] } }, s);
    const c = readListCache("u", "hh_1", s);
    expect(c.household).toEqual({ id: "hh_1", name: "Madbury", budget_goal: 150 });
    expect(c.rows).toEqual(rows);
    expect(c.contributors.Milk[0].userId).toBe("x");
  });
  test("a cache for another place, a household mismatch or a bad version reads as nothing", () => {
    const s = memStore();
    writeListCache("u", "hh_1", { household: hh, rows, contributors: {} }, s);
    expect(readListCache("u", "hh_2", s)).toBeNull();
    expect(readListCache("other", "hh_1", s)).toBeNull();
    writeListCache("u", "hh_2", { household: hh, rows, contributors: {} }, s);   // household.id ≠ key: refused
    expect(s.getItem(cacheKey("u", "hh_2"))).toBeNull();
    s.setItem(cacheKey("u", "hh_1"), JSON.stringify({ v: 99, household: hh, rows }));
    expect(readListCache("u", "hh_1", s)).toBeNull();
  });
  test("the signature moves with ids, quantities, statuses and contributors, and only with them", () => {
    const a = listCacheSignature("h", rows, {});
    expect(listCacheSignature("h", rows.map((r) => ({ ...r, name: "Renamed" })), {})).toBe(a);
    expect(listCacheSignature("h", [{ ...rows[0], status: "bought" }], {})).not.toBe(a);
    expect(listCacheSignature("h", [{ ...rows[0], quantity: 2 }], {})).not.toBe(a);
    expect(listCacheSignature("h", rows, { Milk: [{ userId: "x", quantityAdded: 1 }] })).not.toBe(a);
  });
});
