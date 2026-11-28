// Run: CI=true npx react-scripts test --watchAll=false src/lib/oneAdd
// (and with REACT_APP_FEATURE_ONE_ADD=on for the flag-on build).
//
// One add (SPEC_results_feeder_standard, an experiment on exp/one-add). The rules take the flag as an
// argument, so both builds are read here whichever way the suite runs; the source checks pin that the
// flag-off paths are today's.
jest.mock("@splunk/otel-web", () => ({ __esModule: true, default: { init: () => {}, setGlobalAttributes: () => {} } }));
jest.mock("@splunk/otel-web-session-recorder", () => ({ __esModule: true, default: { init: () => {} } }));
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
    expect(APP).toContain('if (ONE_ADD_ENABLED) setView(routeView("input"));');
    expect(APP).toContain("{helmDoors(NAV_DOORS).map(");
    expect(APP.match(/setView\("input"\)/g)).toHaveLength(1);   // the hand-back's flag-off branch only
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
    expect(APP).toContain('<h2 className="plan-view on results-title">This Week</h2>');
  });
  test("the Meals feeder is the List feeder's layer (ItemSearchView), opened inside the tap", () => {
    expect(APP).toContain('label="Add to this week" title="Add to this week"');
    expect(APP).toContain('listTestId="meals-feeder" className="meals-feeder" fieldAside={aside} tools={tools}');
    expect(APP).toContain("const mealsFeeder = useItemSearch();");
    expect(APP).toContain("    mealsFeeder.show();");
    // every add-a-meal door goes through the feeder with the flag on
    expect(APP).toContain('<HeaderAction verb="add" label="Add a meal to this week" onClick={openMealsAdd} />');
    expect(APP).toContain("<PlanWelcome firstMeal={!everCooked} onAdd={openMealsAdd}>");
    expect(APP).toContain('plan: { label: "Add a meal to this week", run: openMealsAdd }');
    expect(APP).not.toContain('setPlanScreen("library"); goToDoor("plan"); };');
  });
  test("the feeder's Done returns to This Week with N added", () => {
    expect(APP).toContain("<ItemSearchView search={feeder.search} onClose={feeder.onDone}");
    expect(APP).toContain("feeder={{ search: mealsFeeder, onDone: closeMealsFeeder,");
    expect(APP).toMatch(/ {4}mealsFeeder\.hide\(\);\s+if \(text\) showToast\(text\);/);
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

describe("R3 — the rail on the List feeder", () => {
  test("Staples first, then the ONE Ask pill, a divider, then the aisles", () => {
    const at = (s) => APP.indexOf(s, APP.indexOf("const feederRail = ONE_ADD_ENABLED ? ("));
    const staples = at('<span className="cat-em">★</span>Staples');
    const one = at('{feederAsk.kind === "one" && (');
    const many = at('{feederAsk.kind === "many" && (');
    const divider = at('<span className="cat-rail-divider" aria-hidden="true" />');
    const aisles = at("{categories.map(cat => {");
    expect(staples).toBeGreaterThan(0);
    expect(staples < one && one < many && many < divider && divider < aisles).toBe(true);
  });
  test("an Ask pill (or a chooser row) closes the feeder before the hand-over", () => {
    expect(APP).toContain("const feederHandover = (askId) => { feederCloseRef.current?.(); handoverAsk(askId); };");
    expect(APP).toContain("onOpen={(askId) => { setMoreAsksOpen(false); feederHandover(askId); }}");
  });
  test("the chooser is every ask in rail order, titled Ask…, with + New ask; flag off it is More asks as before", () => {
    expect(APP).toContain('asks={orderedAsks}');
    expect(APP).toContain('title="Ask…"');
    expect(APP).toContain("asks={askRail.more}");
  });
});

describe("R3 — MoreAsksSheet as the chooser", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { MoreAsksSheet } = require("../components/MoreAsksSheet");
  const asks = [{ id: "1", label: "Ivy" }, { id: "2", label: "Sam" }];
  test("title and + New ask only when asked for", () => {
    const plain = renderToStaticMarkup(React.createElement(MoreAsksSheet, { asks, onOpen: () => {} }));
    expect(plain).toContain("<h2>More asks</h2>");
    expect(plain).not.toContain("New ask");
    const chooser = renderToStaticMarkup(React.createElement(MoreAsksSheet, { asks, onOpen: () => {}, title: "Ask…", onNew: () => {} }));
    expect(chooser).toContain("<h2>Ask…</h2>");
    expect(chooser).toContain("New ask");
  });
});

describe("R4 — one sheet per feeder: View & filter", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  // App.js pulls in the whole app; the sheet is a plain function of its props.
  const { LibraryFilterSheet } = require("../App");
  const base = { draft: { from: null, made: false, ours: false, occ: "all" }, setDraft: () => {}, fromMembers: [], countFor: () => 3, onShow: () => {}, onClose: () => {} };
  const order = (html, words) => words.map((w) => html.indexOf(`>${w}<`));
  test("Meals, flag-on host: View → Filter → Manage, then Clear / Show N meals", () => {
    const html = renderToStaticMarkup(React.createElement(LibraryFilterSheet, { ...base, oneAdd: { libView: "grid", onToggleView: () => {}, present: ["dinner"], onCreate: () => {} } }));
    expect(html).toContain("<h2>View &amp; filter</h2>");
    const [v, f, m, c, s] = order(html, ["View", "Filter", "Manage", "Clear", "Show 3 meals"]);
    expect(v).toBeGreaterThan(0);
    expect(v < f && f < m && m < c && c < s).toBe(true);
    expect(html).toContain(">Type<");
    expect(html).toContain("New meal");
  });
  test("Meals, no oneAdd: Filter meals as before", () => {
    const html = renderToStaticMarkup(React.createElement(LibraryFilterSheet, base));
    expect(html).toContain("<h2>Filter meals</h2>");
    expect(html).not.toContain(">View<");
    expect(html).not.toContain(">Manage<");
  });
  test("List: View & organize becomes View & filter with the flag on; Done as before without it", () => {
    expect(APP).toContain("{ONE_ADD_ENABLED ? <h2>View &amp; filter</h2> : <h2>View &amp; organize</h2>}");
    expect(APP).toContain("Show {feederFlat.length} {feederFlat.length === 1 ? \"item\" : \"items\"}");
    expect(APP).toContain('<button className="modal-confirm" onClick={closeOrganize}>Done</button>');
  });
});

describe("R5 — one add control, one ✓ mark (this build's flag)", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { ONE_ADD_ENABLED } = require("./featureFlags");
  const { LibraryAction, LibraryRow, LibraryCard } = require("../components/LibraryCards");
  const meal = { id: "m1", name: "Tacos" };
  const act = (stage) => renderToStaticMarkup(React.createElement(LibraryAction, { meal, stage, busy: false, canPlan: true, onPlan: () => {}, onUnplan: () => {} }));
  test("not on the board: the circle + either way", () => {
    expect(act("none")).toContain('class="lib-plan"');
    expect(act("none")).not.toContain("This week");
  });
  const item = (C, stage) => renderToStaticMarkup(React.createElement(C, { meal, stage, busy: false, canPlan: true, onPlan: () => {}, onUnplan: () => {}, onOpen: () => {}, onSetType: () => {} }));
  test("on the board: the ✓ alone on the right; \"This week\" a teal line under the name, readiness after it (flag on); today's pill / words (flag off)", () => {
    if (ONE_ADD_ENABLED) {
      for (const st of ["planned", "toBuy", "ready"]) {
        expect(act(st)).toContain('class="lib-plan on"');
        expect(act(st)).not.toContain("This week");
      }
      for (const C of [LibraryRow, LibraryCard]) {
        expect(item(C, "planned")).toContain('<span class="lib-onsub">This week</span>');
        expect(item(C, "toBuy")).toContain('<span class="lib-onsub">This week<span class="lib-onsub-ready"> · To buy</span></span>');
        expect(item(C, "ready")).toContain("> · Ready<");
        expect(item(C, "none")).not.toContain("This week");
      }
    } else {
      expect(item(LibraryRow, "planned")).not.toContain("This week");
      expect(act("planned")).toContain('class="lib-plan planned"');
      expect(act("toBuy")).toBe('<span class="lib-stage">To buy</span>');
      expect(act("planned")).not.toContain("This week");
    }
  });
  test("the feeder's row: \"On the list\" under the name, the stepper alone on the right (no ✓); never an undo tap", () => {
    expect(APP).toContain('{on && <span className="pick-sub">On the list</span>}');
    expect(APP).toContain('.pick-frow.on .pick-sub { color: #0A776D; font-weight: 700; }');
    const rowSrc = APP.slice(APP.indexOf("const feederRow = (item) => {"), APP.indexOf("  const row = (item) => {"));
    expect(rowSrc).not.toContain('pick-mark on');
    expect(APP).toContain('subtitle={feeder ? `What do we need? · ${items.length} ${items.length === 1 ? "item" : "items"}` : null}');
    expect(APP).toContain('aria-label="One fewer"');
    expect(APP).toContain('if (status === "on" && fresh.has(item.id) && !feeder) {');
  });
  test("no per-meal toast in the Meals feeder (the ✓ confirms; Done says N added)", () => {
    expect(APP).toContain("if (ok && !ONE_ADD_ENABLED) showToast(`${mealById[mealId]?.name || \"Meal\"} added to your week ✓`);");
  });
});
