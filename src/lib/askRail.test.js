import fs from "fs";
import path from "path";
import { askHandoverKey, readAskHandovers, recordAskHandover, orderAsks, freezeAskOrder, askRailLayout, ASK_PILL_CAP } from "./askRail";

// Browse's ask pills at 3+ asks (SPEC_ask_slice2 C4.2; Dan's rail ruling 2026-11-07).
const ask = (id, label) => ({ id, label });
const EASTON = ask("a1", "Easton");
const EVERETT = ask("a2", "Everett");
const NINA = ask("a3", "nina");
const BO = ask("a4", "Bo");
const labels = (list) => list.map((a) => a.label);

function memoryStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

describe("ordering", () => {
  test("last hand-over first, most recent first; never-handed-over after, A–Z (case-insensitive)", () => {
    const order = orderAsks([EASTON, EVERETT, NINA, BO], { a2: 100, a3: 300 });
    expect(labels(order)).toEqual(["nina", "Everett", "Bo", "Easton"]);
  });
  test("no hand-overs at all → alphabetical", () => {
    expect(labels(orderAsks([NINA, EVERETT, EASTON, BO], {}))).toEqual(["Bo", "Easton", "Everett", "nina"]);
  });
  test("a recorded hand-over is read back per household + ask id", () => {
    const s = memoryStorage();
    recordAskHandover("hh-1", "a3", 500, s);
    recordAskHandover("hh-2", "a1", 900, s);                  // another household's time
    expect(readAskHandovers("hh-1", ["a1", "a3"], s)).toEqual({ a3: 500 });
    expect([...s.m.keys()]).toEqual([askHandoverKey("hh-1", "a3"), askHandoverKey("hh-2", "a1")]);
    expect([...s.m.keys()].join(" ")).not.toMatch(/nina|Easton/);   // ids only, never a label (K3)
  });
  test("a missing or junk time is 'never'", () => {
    const s = memoryStorage({ [askHandoverKey("hh", "a1")]: "soon", [askHandoverKey("hh", "a2")]: "0" });
    expect(readAskHandovers("hh", ["a1", "a2", "a3"], s)).toEqual({});
  });
});

describe("storage failure falls back to alphabetical", () => {
  const throwing = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); } };
  test("reads that throw → no times → A–Z", () => {
    const h = readAskHandovers("hh", ["a1", "a2", "a3", "a4"], throwing);
    expect(h).toEqual({});
    expect(labels(orderAsks([NINA, EVERETT, EASTON, BO], h))).toEqual(["Bo", "Easton", "Everett", "nina"]);
  });
  test("a write that throws is swallowed; no storage at all reads as never", () => {
    expect(() => recordAskHandover("hh", "a1", 1, throwing)).not.toThrow();
    expect(readAskHandovers("hh", ["a1"], null)).toEqual({});
    expect(() => recordAskHandover("hh", "a1", 1, null)).not.toThrow();
  });
});

describe("no re-sort while Browse is open", () => {
  test("a hand-over after the order is set does not move anything", () => {
    const first = freezeAskOrder([], [EASTON, EVERETT, NINA], {});
    expect(first).toEqual(["a1", "a2", "a3"]);                          // A–Z
    const again = freezeAskOrder(first, [EASTON, EVERETT, NINA], { a3: Date.now() });   // nina just handed over
    expect(again).toBe(first);                                          // same array: nothing changed
  });
  test("asks loaded after Browse opened, or made mid-session, follow the placed ones; deleted ones drop out", () => {
    expect(freezeAskOrder([], [], {})).toEqual([]);                     // Browse open before asks load
    const loaded = freezeAskOrder([], [NINA, EASTON], { a3: 10 });
    expect(loaded).toEqual(["a3", "a1"]);
    const withNew = freezeAskOrder(loaded, [NINA, EASTON, BO], { a3: 10 });
    expect(withNew).toEqual(["a3", "a1", "a4"]);                       // Bo would sort first; placed last
    expect(freezeAskOrder(withNew, [NINA, BO], { a3: 10 })).toEqual(["a3", "a4"]);
  });
});

describe("the cap and '+ New shelf'", () => {
  test("at most two pills; the rest behind '+N more'", () => {
    expect(ASK_PILL_CAP).toBe(2);
    const four = askRailLayout([NINA, EVERETT, BO, EASTON], true);
    expect(labels(four.pills)).toEqual(["nina", "Everett"]);
    expect(labels(four.more)).toEqual(["Bo", "Easton"]);                // same order, in the sheet
    expect(askRailLayout([NINA, EVERETT, BO], true).more).toHaveLength(1);
    const two = askRailLayout([NINA, EVERETT], true);
    expect(two.pills).toHaveLength(2);
    expect(two.more).toEqual([]);
  });
  test("'+ New shelf' right after Staples with 0 asks, at the very end with 1+, absent when it can't be made", () => {
    expect(askRailLayout([], true).newShelfAt).toBe("afterStaples");
    expect(askRailLayout([EASTON], true).newShelfAt).toBe("end");
    expect(askRailLayout([EASTON, EVERETT, NINA], true).newShelfAt).toBe("end");
    expect(askRailLayout([], false).newShelfAt).toBeNull();
  });
});

// The rail in App.js draws from askRailLayout (source check: the rail is inline in a 12k-line file).
test("the rail renders the layout: New shelf in both places, two pills, the '+N more' label", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
  expect(app).toMatch(/askRail\.newShelfAt === "afterStaples" && \(/);
  expect(app).toMatch(/askRail\.newShelfAt === "end" && \(/);
  expect(app).toMatch(/\{askRail\.pills\.map\(ask => \{/);
  expect(app).toMatch(/<span className="cat-em" aria-hidden="true">\{ASK_GLYPH\}<\/span>\+\{askRail\.more\.length\} more/);
  // Order: Staples → (New shelf, 0 asks) → ask pills → +N more → categories → (New shelf, 1+ asks).
  const at = (re) => app.search(re);
  const staples = at(/\{categoryGlyph\("Staples"\)\}<\/span>Staples/);
  const early = at(/askRail\.newShelfAt === "afterStaples"/);
  const pills = at(/askRail\.pills\.map/);
  const more = at(/\+\{askRail\.more\.length\} more/);
  const cats = app.indexOf("{categories.map(cat => {", more);
  const late = at(/askRail\.newShelfAt === "end"/);
  expect([staples < early, early < pills, pills < more, more < cats, cats < late]).toEqual([true, true, true, true, true]);
  // A hand-over records its time; a pill tap does not.
  expect(app).toMatch(/onClick=\{\(\) => \{ recordAskHandover\(household\?\.id, block\.id\); setRunAskId\(block\.id\); \}\}/);
  expect(app.match(/recordAskHandover\(/g)).toHaveLength(1);
});
