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
    expect(rules.slice(0, -2)).toHaveLength(47);
    expect(rules.some((r) => r.selector === ".op-replay-block")).toBe(false);
  });
  test("preview: Clerk excludes only", () => {
    const { web } = initWith("preview");
    expect(web.privacy.maskAllText).toBe(false);
    expect(web.privacy.sensitivityRules).toEqual(CLERK);
  });
});

// SPEC_rum_span_url_scrub D1–D6. jsdom's own origin is http://localhost.
describe("scrubUrlAttributes", () => {
  let scrubUrlAttributes;
  jest.isolateModules(() => {
    jest.doMock("@splunk/otel-web", () => ({ __esModule: true, default: {} }));
    jest.doMock("@splunk/otel-web-session-recorder", () => ({ __esModule: true, default: {} }));
    jest.spyOn(console, "warn").mockImplementation(() => {}); // no token: init is skipped
    ({ scrubUrlAttributes } = require("./rum"));
    console.warn.mockRestore();
  });
  const DEV = "https://zxwtxjjmssykhqrghouf.supabase.co";
  const PROD = "https://parpauldmbetptkmdwbd.supabase.co";
  const scrub = (url) => scrubUrlAttributes({ "http.url": url })["http.url"];

  test("D3: signed storage GET — token gone, path cut at the bucket", () => {
    expect(scrub(`${DEV}/storage/v1/object/sign/meal-photos/0b1c/9d2e/77aa-thumb.jpg?token=eyJabc.def`))
      .toBe(`${DEV}/storage/v1/object/sign/meal-photos/[object]`);
    expect(scrub(`${PROD}/storage/v1/object/sign/household-photos/0b1c/header.jpg?token=eyJabc.def`))
      .toBe(`${PROD}/storage/v1/object/sign/household-photos/[object]`);
  });
  test("D3: POST /object/sign/<bucket> (bucket only) is left as is", () => {
    const url = `${DEV}/storage/v1/object/sign/meal-photos`;
    expect(scrub(url)).toBe(url);
    expect(scrub(`${url}?x=1`)).toBe(url);
  });
  test("D3: POST /object/sign/household-photos/<path> — cut at the bucket", () => {
    expect(scrub(`${DEV}/storage/v1/object/sign/household-photos/0b1c/header.jpg`))
      .toBe(`${DEV}/storage/v1/object/sign/household-photos/[object]`);
  });
  test("D3: the upload, POST /object/<bucket>/<path> with no operation — cut after the bucket", () => {
    expect(scrub(`${DEV}/storage/v1/object/meal-photos/0b1c/9d2e/77aa.jpg`))
      .toBe(`${DEV}/storage/v1/object/meal-photos/[object]`);
  });
  test("D3: the other operation words keep the operation and the bucket", () => {
    expect(scrub(`${DEV}/storage/v1/object/upload/sign/meal-photos/0b1c/a.jpg?token=t`))
      .toBe(`${DEV}/storage/v1/object/upload/sign/meal-photos/[object]`);
    expect(scrub(`${DEV}/storage/v1/object/public/meal-photos/0b1c/a.jpg`))
      .toBe(`${DEV}/storage/v1/object/public/meal-photos/[object]`);
    expect(scrub(`${DEV}/storage/v1/object/authenticated/meal-photos/0b1c/a.jpg`))
      .toBe(`${DEV}/storage/v1/object/authenticated/meal-photos/[object]`);
    expect(scrub(`${DEV}/storage/v1/object/info/public/meal-photos/0b1c/a.jpg`))
      .toBe(`${DEV}/storage/v1/object/info/public/meal-photos/[object]`);
    expect(scrub(`${DEV}/storage/v1/object/list/meal-photos`)).toBe(`${DEV}/storage/v1/object/list/meal-photos`);
  });
  test("D3 widened: an unknown operation fails closed — cut after the first segment", () => {
    expect(scrub(`${DEV}/storage/v1/object/foo/meal-photos/0b1c/9d2e/a.jpg?token=t`))
      .toBe(`${DEV}/storage/v1/object/foo/[object]`);
  });
  test("D3 widened: render/image/sign keeps route + operation + bucket", () => {
    expect(scrub(`${DEV}/storage/v1/render/image/sign/meal-photos/0b1c/9d2e/a.jpg?token=eyJabc.def&width=400`))
      .toBe(`${DEV}/storage/v1/render/image/sign/meal-photos/[object]`);
  });
  test("D3 widened: an unknown /storage/v1/ route is cut after its first segment", () => {
    expect(scrub(`${DEV}/storage/v1/upload/resumable/bWVhbC1waG90b3MvMGIxYy9hLmpwZw`))
      .toBe(`${DEV}/storage/v1/upload/resumable/[object]`);
  });
  test("D1: Supabase REST on the dev and prod hosts keeps its query, unchanged", () => {
    for (const host of [DEV, PROD]) {
      const url = `${host}/rest/v1/list_items?select=id,name&household_id=eq.0b1c2d3e-0000-4000-8000-000000000000`;
      expect(scrub(url)).toBe(url);
    }
  });
  test("D1: no exception for Edge Functions or another Supabase project", () => {
    expect(scrub(`${DEV}/functions/v1/recipe-import?url=https://x.test/r`)).toBe(`${DEV}/functions/v1/recipe-import`);
    expect(scrub("https://otherprojectref00000.supabase.co/rest/v1/t?select=id")).toBe("https://otherprojectref00000.supabase.co/rest/v1/t");
  });
  test("D2: own origin — query dropped, hash kept (today's behaviour)", () => {
    expect(scrub("http://localhost/?email=a%40b.test&code=1#/plan")).toBe("http://localhost/#/plan");
  });
  test("D4: img.clerk.com becomes origin + [object]", () => {
    expect(scrub("https://img.clerk.com/eyJ0eXBlIjoicHJveHkiLCJzcmMiOiJodHRwczovL2ltYWdlcy5jbGVyay5kZXYifQ?width=80"))
      .toBe("https://img.clerk.com/[object]");
  });
  test("D1 + D2: a third-party URL loses its ?token= and its #fragment", () => {
    expect(scrub("https://cdn.example.test/a/b.js?token=secret#access_token=abc")).toBe("https://cdn.example.test/a/b.js");
  });
  test("D6: an unparseable value is cut at ?", () => {
    expect(scrub("http://[bad/storage?token=secret")).toBe("http://[bad/storage");
  });
  test("the covered keys only; untouched attributes keep their identity", () => {
    const token = `${DEV}/storage/v1/object/sign/meal-photos/a/b.jpg?token=t`;
    const out = scrubUrlAttributes({ "location.href": token, "document.referrer": token, "xhr.url": token, "component": token });
    expect(out["location.href"]).toBe(`${DEV}/storage/v1/object/sign/meal-photos/[object]`);
    expect(out["document.referrer"]).toBe(out["location.href"]);
    expect(out["xhr.url"]).toBe(out["location.href"]);
    expect(out.component).toBe(token);
    const clean = { "http.url": "http://localhost/#/home", "http.status_code": 200 };
    expect(scrubUrlAttributes(clean)).toBe(clean);
  });
});
