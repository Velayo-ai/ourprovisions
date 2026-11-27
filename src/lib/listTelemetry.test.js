// Run: CI=true npx react-scripts test --watchAll=false src/lib/listTelemetry
// SPEC_one_list Telemetry + SPEC_one_list_dashboard: every one-list span carries workflow.name = its own name
// (so rum.workflow.count sees it), bucketed counts only, never a name; the attribute sets are pinned here.
const spans = [];
jest.mock("@opentelemetry/api", () => ({
  trace: { getTracer: () => ({ startSpan: (name, opts) => { spans.push({ name, attributes: (opts && opts.attributes) || {} }); return { end: () => {} }; } }) },
}));
const T = require("./listTelemetry");

beforeEach(() => { spans.length = 0; });
const last = () => spans[spans.length - 1];

test("added_bucket: 0 · 1 · 2-4 · 5+", () => {
  expect([0, 1, 2, 4, 5, 40].map(T.addedBucket)).toEqual(["0", "1", "2-4", "2-4", "5+", "5+"]);
});

test.each([
  ["picker_opened", () => T.pickerOpened("helm", "hh"), { from: "helm", household_id: "hh" }],
  ["picker_closed", () => T.pickerClosed(3, 45000, "hh"), { added: 3, added_bucket: "2-4", open_s: "30_60", household_id: "hh" }],
  ["picker_tap_on_listed", () => T.pickerTapOnListed("hh"), { household_id: "hh" }],
  ["list_guide_cta (add)", () => T.listGuideCta("add", null, "hh"), { choice: "add", household_id: "hh" }],
  ["list_guide_cta (browse)", () => T.listGuideCta("browse", "staples", "hh"), { choice: "browse", browse_kind: "staples", household_id: "hh" }],
  ["list_guide_cta (plan)", () => T.listGuideCta("plan", "aisles", "hh"), { choice: "plan", household_id: "hh" }],
  ["first_item_added", () => T.firstItemAdded("guide", 12000, "hh"), { after: "guide", s: "10_30", household_id: "hh" }],
  ["list_welcome_dismissed", () => T.listWelcomeDismissed("hh"), { household_id: "hh" }],
])("%s: exactly its attributes, plus workflow.name = its name", (label, fire, attrs) => {
  fire();
  const s = last();
  expect(s.attributes).toEqual({ "workflow.name": s.name, ...attrs });
  expect(label.startsWith(s.name)).toBe(true);
});

test("a missing household is null, never undefined", () => {
  T.pickerTapOnListed(undefined);
  expect(last().attributes).toEqual({ "workflow.name": "picker_tap_on_listed", household_id: null });
});

test("a tracer that throws never throws into the UI", () => {
  jest.isolateModules(() => {
    jest.doMock("@opentelemetry/api", () => ({ trace: { getTracer: () => ({ startSpan: () => { throw new Error("boom"); } }) } }));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const T2 = require("./listTelemetry");
    expect(() => T2.pickerOpened("list_add", "hh")).not.toThrow();
    warn.mockRestore();
  });
});

describe("the callers (source)", () => {
  const fs = require("fs");
  const path = require("path");
  const APP = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
  const HOOK = fs.readFileSync(path.join(__dirname, "..", "hooks", "useProvisions.js"), "utf8");
  test("App sends the one-list events only through lib/listTelemetry (no hand-rolled picker spans)", () => {
    expect(APP).not.toMatch(/startSpan\("(picker_opened|picker_closed|picker_tap_on_listed|list_guide_cta|first_item_added|list_welcome_dismissed)"/);
    for (const fn of ["pickerOpened(from", "pickerClosed(added, openMs", "pickerTapOnListed(", "listGuideCta(\"add\"", "listGuideCta(\"browse\", hasStaples ? \"staples\" : \"aisles\"", "listGuideCta(\"plan\"", "firstItemAdded(m.after", "listWelcomeDismissed("]) {
      expect(APP).toContain(fn);
    }
  });
  test("both item_added_to_list emitters (manual, meal) carry workflow.name and tell App (first_item_added)", () => {
    const blocks = HOOK.split('tracer.startSpan("item_added_to_list"').slice(1).map((b) => b.slice(0, 900));
    expect(blocks).toHaveLength(2);
    blocks.forEach((b) => {
      expect(b).toMatch(/"workflow\.name": "item_added_to_list"/);
      expect(b).toMatch(/onItemAddedRef\.current\(\);/);
    });
  });
});
