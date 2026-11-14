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

describe("the cap", () => {
  test("at most two pills; the rest behind '+N more'; nothing else on the layout", () => {
    expect(ASK_PILL_CAP).toBe(2);
    const four = askRailLayout([NINA, EVERETT, BO, EASTON]);
    expect(labels(four.pills)).toEqual(["nina", "Everett"]);
    expect(labels(four.more)).toEqual(["Bo", "Easton"]);                // same order, in the sheet
    expect(askRailLayout([NINA, EVERETT, BO]).more).toHaveLength(1);
    const two = askRailLayout([NINA, EVERETT]);
    expect(two.pills).toHaveLength(2);
    expect(two.more).toEqual([]);
    // No "+ New shelf" on the rail (2026-11-13): the layout has no slot for one, with or without asks.
    expect(Object.keys(askRailLayout([]))).toEqual(["pills", "more"]);
    expect(Object.keys(askRailLayout([EASTON]))).toEqual(["pills", "more"]);
  });
});

// The rail in App.js draws from askRailLayout (source check: the rail is inline in a 13k-line file).
test("the rail renders the layout: Staples, two people pills, '+N more', the ghost, a divider, categories; no New shelf chip", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
  expect(app).toMatch(/\{askRail\.pills\.map\(ask => \(/);
  expect(app).toMatch(/<span className="cat-em"><AskIcon \/><\/span>\+\{askRail\.more\.length\} more/);
  expect(app).not.toMatch(/newShelfAt/);
  expect(app).not.toMatch(/ASK_GLYPH/);                                       // no emoji on any Ask pill
  // Order (C4.2, restored 2026-11-14): Staples → Ask pills → +N more → (ghost, with no asks) → divider →
  // categories. The pills are people pills, never filters: no selectedAsks, no data-active, pressed
  // only for the running / edited Ask.
  const at = (re) => app.search(re);
  const staples = at(/\{categoryGlyph\("Staples"\)\}<\/span>Staples/);
  const pills = at(/askRail\.pills\.map/);
  const more = at(/\+\{askRail\.more\.length\} more/);
  const ghost = app.indexOf('className="cat-pill people-pill people-pill-ghost" onClick={openNewAsk}', more);
  const divider = app.indexOf('{(askRail.pills.length > 0 || canMakeShelf) && <span className="cat-rail-divider" aria-hidden="true" />}', ghost);
  const cats = app.indexOf("{categories.map(cat => {", divider);
  expect(staples).toBeGreaterThan(0);
  expect([staples < pills, pills < more, more < ghost, ghost < divider, divider < cats]).toEqual([true, true, true, true, true]);
  // The ghost: only with zero asks, only where an ask can be made; "Ask someone…" is fixed copy.
  const ghostBlock = app.slice(ghost - 120, divider);
  expect(ghostBlock).toContain("{askRail.pills.length === 0 && canMakeShelf && (");
  expect(ghostBlock).toContain("Ask someone…");
  expect(app).toContain(".people-pill-ghost { background: transparent; border-style: dashed; }");
  const railAsks = app.slice(pills, more);
  // eslint-disable-next-line no-template-curly-in-string -- the source text under test
  expect(railAsks).toContain('className={`cat-pill people-pill${activeAskId === ask.id ? " on" : ""}`}');
  expect(railAsks).toContain("onClick={() => handoverAsk(ask.id)}");
  expect(railAsks).not.toMatch(/selectedAsks|data-active|toggleAsk/);
  expect(app).toContain('className="cat-pill people-pill cat-pill-more"');
  expect(app).toContain("const activeAskId = runAskId || editAskId || null;");
  // The rail itself carries no "+ New ask": its one home is View & organize's Asks section, which
  // opens the full-screen New ask screen.
  const rail = app.slice(staples, cats);
  expect(rail).not.toMatch(/<\/span>New (shelf|ask)|>New (shelf|ask)</);   // rendered text; the comment may name the screen
  expect(app).not.toMatch(/>New shelf</);                                      // rendered text; comments may still tell the history
  expect(app.match(/<span className="cat-em">\+<\/span>New ask/g)).toHaveLength(1);
  expect(app.match(/className="cat-pill cat-pill-new" style=\{\{ marginTop: "10px" \}\} onClick=\{openNewAsk\}/g)).toHaveLength(1);
  // Every hand-over — a pill, a "+N more" row, a block's "Hand it to" — is the one handoverAsk, which
  // records its time; nothing else does.
  expect(app).toContain("const handoverAsk = (askId) => { recordAskHandover(household?.id, askId); setRunAskId(askId); };");
  expect(app).toContain("onClick={() => handoverAsk(block.id)}");
  expect(app).toContain("onOpen={(askId) => { setMoreAsksOpen(false); handoverAsk(askId); }}");
  expect(app.match(/recordAskHandover\(/g)).toHaveLength(1);
  // The tokens, once, with the rule beside them.
  expect(app.match(/:root \{ --people-soft: #DFF3EF; --people-border: #A8DCD2; --people-strong: #0A776D; --people-ink: #13695B; \}/g)).toHaveLength(1);
  expect(app).toContain("Turquoise means people");
});
