// Run: CI=true npx react-scripts test --watchAll=false src/lib/oneAdd
// (and with REACT_APP_FEATURE_ONE_ADD=on for the flag-on build).
//
// One add (SPEC_results_feeder_standard, an experiment on exp/one-add). The rules take the flag as an
// argument, so both builds are read here whichever way the suite runs; the source checks pin that the
// flag-off paths are today's.
const fs = require("fs");
const path = require("path");
const {
  routeViewWith, helmDoorsWith, listStatusLine, askPill, staplesHintVisit,
  STAPLES_HINT_KEY, STAPLES_HINT_VISITS, addedToastText,
} = require("./oneAdd");
const { NAV_DOORS, viewForHash } = require("../nav");

const APP = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");

describe("R1 — Browse is not a door with the flag on", () => {
  test("off: every view routes to itself", () => {
    for (const v of ["home", "plan", "input", "list", null]) expect(routeViewWith(false, v)).toBe(v);
  });
  test("on: Browse's view lands on List; the rest are unchanged; no hash stays no hash", () => {
    expect(routeViewWith(true, "input")).toBe("list");
    for (const v of ["home", "plan", "list", null]) expect(routeViewWith(true, v)).toBe(v);
  });
  test("on: the #/browse deep link lands on List (no dead route)", () => {
    expect(routeViewWith(true, viewForHash("#/browse"))).toBe("list");
    expect(routeViewWith(false, viewForHash("#/browse"))).toBe("input");
  });
  test("the Helm: HOME · PLAN · LIST on, all four off; NAV_DOORS itself untouched", () => {
    expect(helmDoorsWith(true, NAV_DOORS).map((d) => d.label)).toEqual(["Home", "Plan", "List"]);
    expect(helmDoorsWith(false, NAV_DOORS)).toBe(NAV_DOORS);
    expect(NAV_DOORS.map((d) => d.key)).toEqual(["home", "plan", "browse", "shop"]);
  });
  test("every entry into a view goes through routeView", () => {
    expect(APP).toContain('useState(() => routeView(viewForHash(window.location.hash)) || "home")');
    expect(APP).toContain("setView(routeView(v)); }");
    expect(APP).toContain("const v = routeView(door);");
    expect(APP).toContain('setView(routeView("input"));');
    expect(APP).toContain("{helmDoors(NAV_DOORS).map(");
    expect(APP).not.toMatch(/setView\("input"\)/);
  });
});

describe("R1 — Our list's status line (draft copy)", () => {
  test("items and aisles before the trip", () => {
    expect(listStatusLine({ open: 4, cart: 0, aisles: 2 })).toBe("4 items · 2 aisles");
    expect(listStatusLine({ open: 1, cart: 0, aisles: 1 })).toBe("1 item · 1 aisle");
  });
  test("to get and in the cart once something is checked", () => {
    expect(listStatusLine({ open: 3, cart: 1, aisles: 2 })).toBe("3 to get · 1 in the cart");
    expect(listStatusLine({ open: 0, cart: 5, aisles: 0 })).toBe("5 items in the cart");
    expect(listStatusLine({ open: 0, cart: 1, aisles: 0 })).toBe("1 item in the cart");
  });
  test("shown only with the flag on", () => {
    expect(APP).toMatch(/\{ONE_ADD_ENABLED \? \(\s*\/\* One add \(R1\): the results title gets a status line/);
  });
});

describe("R1 — the empty List's entry cards", () => {
  test("Browse our staples retires with the flag on; Add items and Plan a meal stay", () => {
    expect(APP).toContain('{!ONE_ADD_ENABLED && row("browse", hasStaples ? "Browse our staples" : "Browse the aisles"');
    expect(APP).toContain('{row("add", "Add items",');
    expect(APP).toContain('{row("plan", "Plan a meal", "I know what I want to cook.", onPlan)}');
  });
});

describe("R1/R2 — Plan is This Week only; Meals opens from + Add as the Meals feeder", () => {
  test("one title, no switch, with the flag on", () => {
    expect(APP).toContain('{screen === "library" ? "Add to this week" : "This Week"}');
  });
  test("the feeder's Done returns to This Week with N added", () => {
    expect(APP).toContain('<button type="button" className="hdr-done" onClick={closeMealsFeeder}>Done</button>');
    expect(addedToastText(0)).toBeNull();
    expect(addedToastText(1)).toBe("1 added");
    expect(addedToastText(3)).toBe("3 added");
  });
});

describe("R3 — one Ask pill", () => {
  const a = (id, label) => ({ id, label });
  test("0 → none, 1 → by name, 2+ → the chooser", () => {
    expect(askPill([])).toEqual({ kind: "none" });
    expect(askPill(null)).toEqual({ kind: "none" });
    expect(askPill([a("1", "Ivy")])).toEqual({ kind: "one", ask: a("1", "Ivy") });
    const two = [a("1", "Ivy"), a("2", "Sam")];
    expect(askPill(two)).toEqual({ kind: "many", asks: two });
  });
});

describe("R3 — the staples hint, first 3 visits per device", () => {
  const store = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
  };
  test("shows on visits 1–3, then never", () => {
    const s = store();
    const seen = Array.from({ length: 5 }, () => staplesHintVisit(s));
    expect(seen).toEqual([true, true, true, false, false]);
    expect(s.m.get(STAPLES_HINT_KEY)).toBe(String(STAPLES_HINT_VISITS));
  });
  test("storage that throws shows nothing", () => {
    const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(staplesHintVisit(bad)).toBe(false);
  });
});

describe("R2 — the feeder's aisle sections", () => {
  const { pickerSections } = require("./listPicker");
  const map = { Apples: { id: "a" }, Milk: { id: "m" }, Ghost: {} };
  test("Browse's blocks in order, items as picker rows; a row with no id drops; an empty block keeps its header", () => {
    const out = pickerSections([
      { name: "🥦 Produce", rawName: "Produce", items: [{ name: "Apples" }, { name: "Ghost" }] },
      { name: "🥛 Dairy", rawName: "Dairy", items: [{ name: "Milk" }] },
      { name: "Camping", rawName: "Camping", items: [] },
    ], map);
    expect(out).toEqual([
      { name: "🥦 Produce", rawName: "Produce", items: [{ id: "a", name: "Apples", category: "🥦 Produce", rawCategory: "Produce" }] },
      { name: "🥛 Dairy", rawName: "Dairy", items: [{ id: "m", name: "Milk", category: "🥛 Dairy", rawCategory: "Dairy" }] },
      { name: "Camping", rawName: "Camping", items: [] },
    ]);
  });
  test("the feeder is wired only with the flag on; the picker without it is today's", () => {
    expect(APP).toContain("const feeder = ONE_ADD_ENABLED ? {");
    expect(APP).toContain("feeder={feeder} />");
    expect(APP).toContain(') : feeder ? feederBody() : letterGroups(items).map((g) => (');
  });
});
