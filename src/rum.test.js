// Run: CI=true npx react-scripts test --watchAll=false src/rum
//
// The privacy blocks rum.js hands the two Splunk agents, captured from their
// init() calls in each environment. Pins SPEC_replay_labels_promotion2 A5: the
// recorder's rules are the 10-18 block plus EXACTLY one rule — exclude
// .op-replay-block, in both environments, after the Clerk excludes — and the
// click-text block is unchanged (a photo has no text).
const CLERK = [
  { rule: "exclude", selector: '[class*="cl-"]' },
  { rule: "exclude", selector: "#clerk-components" },
];
const BLOCK = { rule: "exclude", selector: ".op-replay-block" };

function initWith(env) {
  const calls = {};
  jest.isolateModules(() => {
    process.env.REACT_APP_RUM_TOKEN = "test-token";
    process.env.REACT_APP_DEPLOY_ENV = env;
    jest.doMock("@splunk/otel-web", () => ({ __esModule: true, default: { init: (c) => { calls.web = c; }, setGlobalAttributes: () => {} } }));
    jest.doMock("@splunk/otel-web-session-recorder", () => ({ __esModule: true, default: { init: (c) => { calls.recorder = c; } } }));
    require("./rum");
  });
  delete process.env.REACT_APP_RUM_TOKEN;
  delete process.env.REACT_APP_DEPLOY_ENV;
  return calls;
}

describe("session recorder sensitivityRules", () => {
  test("production: Clerk excludes, then the photo block — nothing unmasked", () => {
    const { recorder } = initWith("production");
    expect(recorder.maskAllInputs).toBe(true);
    expect(recorder.maskAllText).toBe(true);
    expect(recorder.sensitivityRules).toEqual([...CLERK, BLOCK]);
  });
  test("preview: body unmasked (dev audience), Clerk excludes, then the photo block", () => {
    const { recorder } = initWith("preview");
    expect(recorder.maskAllInputs).toBe(false);
    expect(recorder.maskAllText).toBe(false);
    expect(recorder.sensitivityRules).toEqual([{ rule: "unmask", selector: "body" }, ...CLERK, BLOCK]);
  });
  test("the photo block is listed last in both (later rules win; exclude is absolute)", () => {
    for (const env of ["production", "preview"]) {
      const rules = initWith(env).recorder.sensitivityRules;
      expect(rules[rules.length - 1]).toEqual(BLOCK);
      expect(rules.filter((r) => r.selector === ".op-replay-block")).toHaveLength(1);
    }
  });
});

describe("click-text privacy block is unchanged", () => {
  test("production: allow-list unmasks + Clerk excludes, no photo rule", () => {
    const { web } = initWith("production");
    const rules = web.privacy.sensitivityRules;
    expect(web.privacy.maskAllText).toBe(true);
    expect(rules.slice(-2)).toEqual(CLERK);
    expect(rules.slice(0, -2).every((r) => r.rule === "unmask")).toBe(true);
    expect(rules.slice(0, -2)).toHaveLength(46);
    expect(rules.some((r) => r.selector === ".op-replay-block")).toBe(false);
  });
  test("preview: Clerk excludes only", () => {
    const { web } = initWith("preview");
    expect(web.privacy.maskAllText).toBe(false);
    expect(web.privacy.sensitivityRules).toEqual(CLERK);
  });
});
