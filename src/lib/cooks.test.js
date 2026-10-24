// Run: CI=true npx react-scripts test --watchAll=false src/lib/cooks
//
// The cook count stays exact (2026-10-19, the dev walk's "Last cooked tonight · 5 times" over
// 4 meal_cooks rows). The race: markCooked's cook_meal inserts the row; while markCooked
// still awaits its link release, the 2 s placements poll sees cooked_at move (cookChanged)
// and re-reads the log — already counting the new row; the old client "+1" then counted it
// again. Now every path rebuilds the map from the server's rows (cooksFromRows), so the
// order of the poll and the cook no longer matters.
import { cooksFromRows } from "./cooks";

const MEAL = "pizza";
const row = (at, meal = MEAL) => ({ meal_id: meal, cooked_at: at });
const newestFirst = (rows) => [...rows].sort((a, b) => (a.cooked_at < b.cooked_at ? 1 : -1));
const SEP28 = row("2026-09-28T13:19:34Z");
const T1 = row("2026-10-20T02:40:38Z");
const T2 = row("2026-10-20T02:41:36Z");
const T3 = row("2026-10-20T02:42:47Z");

// One Cooked it, with the poll's re-read landing BEFORE markCooked settles (the race).
function cookWithPollFirst(dbRows, newRow, settle) {
  const db = [...dbRows, newRow];                      // cook_meal committed the row
  let state = cooksFromRows(newestFirst(db));          // the poll: cookChanged → loadCooks
  state = settle(state, db, newRow);                   // then markCooked finishes
  return state[MEAL];
}
const oldPlusOne = (state, _db, r) => ({ ...state, [MEAL]: { lastCookedAt: r.cooked_at, count: (state[MEAL]?.count || 0) + 1 } });
const reRead = (_state, db) => cooksFromRows(newestFirst(db));   // markCooked → loadCooks

describe("cooksFromRows", () => {
  test("count and last cook per meal, from rows read newest first", () => {
    expect(cooksFromRows(newestFirst([SEP28, T1, T2, T3, row("2026-10-01T00:00:00Z", "tacos")]))).toEqual({
      [MEAL]: { lastCookedAt: T3.cooked_at, count: 4 },
      tacos: { lastCookedAt: "2026-10-01T00:00:00Z", count: 1 },
    });
    expect(cooksFromRows([])).toEqual({});
  });
});

describe("the poll's loadCooks fires before the cook settles", () => {
  test("the old +1 counted one cook twice — the dev walk's 5 over 4 rows", () => {
    expect(cookWithPollFirst([SEP28, T1, T2], T3, oldPlusOne)).toEqual({ lastCookedAt: T3.cooked_at, count: 5 });
  });
  test("the re-read keeps it exact: 3 + one real cook = 4, whatever the order", () => {
    expect(cookWithPollFirst([SEP28, T1, T2], T3, reRead)).toEqual({ lastCookedAt: T3.cooked_at, count: 4 });
  });
  test("4 stays 4 until a real new cook; then exactly 5", () => {
    const four = [SEP28, T1, T2, T3];
    expect(cooksFromRows(newestFirst(four))[MEAL].count).toBe(4);
    const T4 = row("2026-10-20T03:10:00Z");
    expect(cookWithPollFirst(four, T4, reRead)).toEqual({ lastCookedAt: T4.cooked_at, count: 5 });
  });
  test("a double tap / a partner's cook (cook_meal returns null, no new row) leaves the count alone", () => {
    const four = newestFirst([SEP28, T1, T2, T3]);
    expect(cooksFromRows(four)[MEAL].count).toBe(4);   // the D3 branch re-reads too: nothing was inserted
  });
});

describe("the wiring (source guard: the hook needs a live client)", () => {
  const src = require("fs").readFileSync(`${__dirname}/../hooks/useProvisions.js`, "utf8");
  const i = src.indexOf("const markCooked = useCallback(");
  const body = src.slice(i, src.indexOf("\n  }, [", i));
  test("markCooked re-reads the log after a successful cook and never adds 1 on the client", () => {
    expect(body).not.toMatch(/count \|\| 0\) \+ 1/);
    const serverStamp = body.indexOf("{ ...now[mealId], cookedAt } });");
    const reread = body.indexOf("await loadCooks(db, hh);", serverStamp);
    expect(serverStamp).toBeGreaterThan(-1);   // the placement update stays (optimistic, then the server's stamp)
    expect(reread).toBeGreaterThan(serverStamp);
  });
  test("loadCooks builds the map with cooksFromRows; nothing else in the hook increments a cook count", () => {
    expect(src).toMatch(/setCooks\(cooksFromRows\(data\)\);/);
    expect(src).not.toMatch(/count: \(c\[mealId\]\?\.count/);
  });
});

// ---------------------------------------------------------------- the cook id at the afterglow (Photos slice 2, S3)
describe("resolveCookId", () => {
  const { resolveCookId } = require("./cooks");
  const fakeDb = (result) => {
    const calls = [];
    const q = { select: () => q, eq: (c, v) => { calls.push([c, v]); return q; }, then: (res) => res(result) };
    return { db: { from: (t) => { calls.push(["from", t]); return q; } }, calls };
  };
  const ARGS = { householdId: "hh", mealId: "m", cookedAt: "2026-10-21T23:30:01.123456+00:00" };

  test("reads meal_cooks by household, meal and the EXACT returned timestamp; one row → its id", async () => {
    const { db, calls } = fakeDb({ data: [{ id: "c1" }], error: null });
    expect(await resolveCookId(db, ARGS)).toEqual({ id: "c1", count: 1 });
    expect(calls).toEqual([["from", "meal_cooks"], ["household_id", "hh"], ["meal_id", "m"], ["cooked_at", ARGS.cookedAt]]);
  });

  test("0 or 2+ rows → no id, the count logged, never a guess", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(await resolveCookId(fakeDb({ data: [], error: null }).db, ARGS)).toEqual({ id: null, count: 0 });
    expect(await resolveCookId(fakeDb({ data: [{ id: "a" }, { id: "b" }], error: null }).db, ARGS)).toEqual({ id: null, count: 2 });
    expect(warn.mock.calls.map((c) => c[0])).toEqual([
      "[cook id] lookup found 0 rows for one cook (no afterglow controls)",
      "[cook id] lookup found 2 rows for one cook (no afterglow controls)",
    ]);
    warn.mockRestore();
  });

  test("a read error → no id; nothing to look up without a timestamp (a partner's tap)", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(await resolveCookId(fakeDb({ data: null, error: { message: "nope" } }).db, ARGS)).toEqual({ id: null, count: -1 });
    expect(await resolveCookId(fakeDb({ data: [{ id: "x" }], error: null }).db, { ...ARGS, cookedAt: null })).toEqual({ id: null, count: 0 });
    warn.mockRestore();
  });

  test("markCooked resolves the id only after a cook it logged, and never changes cook_meal's call", () => {
    const src = require("fs").readFileSync(`${__dirname}/../hooks/useProvisions.js`, "utf8");
    const i = src.indexOf("const markCooked = useCallback(");
    const body = src.slice(i, src.indexOf("}, [reportSuccess]);", i));
    expect(body).toContain('db.rpc("cook_meal", { p_household_id: hh.id, p_meal_id: mealId })');
    expect(body).toMatch(/if \(cookedAt == null\) \{[\s\S]*?setCookIdsByMeal\(\(prev\) => \(\{ \.\.\.prev, \[mealId\]: null \}\)\)/);
    expect(body).toMatch(/resolveCookId\(db, \{ householdId: hh\.id, mealId, cookedAt \}\)/);
  });
});
