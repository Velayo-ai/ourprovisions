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
    // 47 + .rv-photo-add, .rv-photo-remove, .rv-photo-remove-yes, .rv-photo-keep (Photos v1 slice 1) + .rv-photo-open,
    // .rv-viewer-close (photo hero) + .rv-photo-prev, .rv-photo-next, .rv-dot (desktop stepping) + .board-photo-add, .rate-star (slice 2)
    // = 58; SPEC_photo_menu (2026-10-25): out .rv-photo-remove-yes, .rv-photo-keep; in .rv-photo-replace, .rv-photo-details,
    // .rv-photo-save, .rv-photo-confirm-remove, .rv-photo-confirm-keep, .rv-photo-placeholder → 62;
    // Phase A Commit 0 (showcase upload, 2026-10-29): in .rv-photo-showcase, .rv-showcase-go, .rv-showcase-cancel → 65;
    // Phase A Commit 1 (public gift card): in .gift-add, .gift-signin, .gift-what, .gift-retry → 69;
    // Phase A Commit 0b (S46 flip model, 2026-10-30): out .rv-photo-showcase; in .rv-photo-make-showcase, .rv-photo-make-cook,
    // .rv-photo-full-ok (.rv-showcase-go / -cancel stay as the S13 prompt's buttons) → 71;
    // Phase A Commit 2 (give sheet): in .rv-more, .rv-give, .rv-stop-giving, .give-go, .give-nudge, .give-send, .give-copy,
    // .stop-giving-yes, .stop-giving-no → 80; Phase A Commit 3 (accept): in .gift-open, .gift-ok, .thanks-send, .thanks-skip → 84
    expect(rules.slice(0, -2)).toHaveLength(84);
    const sel = rules.map((r) => r.selector);
    [".rv-photo-replace", ".rv-photo-details", ".rv-photo-save", ".rv-photo-remove", ".rv-photo-confirm-remove", ".rv-photo-confirm-keep", ".rv-photo-placeholder",
      ".rv-photo-make-showcase", ".rv-photo-make-cook", ".rv-showcase-go", ".rv-showcase-cancel", ".rv-photo-full-ok", ".gift-add", ".gift-signin", ".gift-what", ".gift-retry",
      ".rv-more", ".rv-give", ".rv-stop-giving", ".give-go", ".give-nudge", ".give-send", ".give-copy", ".stop-giving-yes", ".stop-giving-no",
      ".gift-open", ".gift-ok", ".thanks-send", ".thanks-skip"]
      .forEach((c) => expect(sel).toContain(c));
    expect(sel).not.toContain(".rv-photo-owner");   // the "Added by {First}" line is household text, off the list
    [".rv-photo-remove-yes", ".rv-photo-keep", ".rv-photo-more", ".rv-photo-showcase"].forEach((c) => expect(sel).not.toContain(c));
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
  test("kept REST query: a clerk_id filter's value becomes [clerk], whatever the operator", () => {
    expect(scrub(`${DEV}/rest/v1/users?select=excluded_from_learning&clerk_id=eq.user_3BVcVwOqXaBBVxum1d8UZeBQ85S`))
      .toBe(`${DEV}/rest/v1/users?select=excluded_from_learning&clerk_id=eq.[clerk]`);
    expect(scrub(`${PROD}/rest/v1/user_hidden_items?clerk_id=eq.user_3BVcVwOqXaBBVxum1d8UZeBQ85S&select=catalog_item_id%2Ccatalog_items%28id%2Cname%29`))
      .toBe(`${PROD}/rest/v1/user_hidden_items?clerk_id=eq.[clerk]&select=catalog_item_id%2Ccatalog_items%28id%2Cname%29`);
    expect(scrub(`${DEV}/rest/v1/users?clerk_id=in.(user_a,user_b)`)).toBe(`${DEV}/rest/v1/users?clerk_id=in.[clerk]`);
    expect(scrub(`${DEV}/rest/v1/users?clerk_id=not.eq.user_a`)).toBe(`${DEV}/rest/v1/users?clerk_id=not.eq.[clerk]`);
    expect(scrub(`${DEV}/rest/v1/household_members?users.clerk_id=eq.user_a`)).toBe(`${DEV}/rest/v1/household_members?users.clerk_id=eq.[clerk]`);
  });
  test("kept REST query: a non-clerk filter is untouched", () => {
    const url = `${DEV}/rest/v1/meals?household_id=eq.faadd8be-5772-4f8f-b5e4-2684ebd6f700&deleted_at=is.null&not_clerk_id=eq.x`;
    expect(scrub(url)).toBe(url);
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

  // SPEC_rum_clerk_id_scrub D1–D4, Amendment 2026-10-26 R4–R5.
  describe("Clerk API hosts: ids masked by pattern, query dropped whole", () => {
    const PRODC = "https://clerk.ourprovisions.velayo.ai";
    const DEVC = "https://many-puma-34.clerk.accounts.dev";
    const SESS = "sess_3L7jXk9Qw2Pz8RmN4vT6bYc1DfE0a"; // 27-char tail, Clerk's real length
    const USER = "user_3BVcVwOqXaBBVxum1d8UZeBQ85S";
    test("sess_: the token refresh keeps its route shape, loses the id and the query", () => {
      expect(scrub(`${PRODC}/v1/client/sessions/${SESS}/tokens?_clerk_js_version=5.100.0`))
        .toBe(`${PRODC}/v1/client/sessions/sess_[id]/tokens`);
      expect(scrub(`${PRODC}/v1/client/sessions/${SESS}/tokens/supabase?_clerk_js_version=5.100.0&_method=POST`))
        .toBe(`${PRODC}/v1/client/sessions/sess_[id]/tokens/supabase`);
      expect(scrub(`${PRODC}/v1/client/sessions/${SESS}/touch`)).toBe(`${PRODC}/v1/client/sessions/sess_[id]/touch`);
    });
    test("two ids in one path: both masked, prefixes kept", () => {
      expect(scrub(`${PRODC}/v1/client/sessions/${SESS}/x/${USER}`)).toBe(`${PRODC}/v1/client/sessions/sess_[id]/x/user_[id]`);
    });
    test("sia_ / sua_ / user_ / client_ / ins_: route words like sign_ins stay", () => {
      expect(scrub(`${PRODC}/v1/client/sign_ins/sia_2abcDEFghiJKLmno3PQRstuVWX/attempt_first_factor`))
        .toBe(`${PRODC}/v1/client/sign_ins/sia_[id]/attempt_first_factor`);
      expect(scrub(`${PRODC}/v1/client/sign_ups/sua_2abcDEFghiJKLmno3PQRstuVWX/prepare_verification`))
        .toBe(`${PRODC}/v1/client/sign_ups/sua_[id]/prepare_verification`);
      expect(scrub(`${PRODC}/v1/me?_clerk_session_id=${SESS}`)).toBe(`${PRODC}/v1/me`);
      expect(scrub(`${PRODC}/v1/users/${USER}`)).toBe(`${PRODC}/v1/users/user_[id]`);
      expect(scrub(`${PRODC}/v1/clients/client_2abcDEFghiJKLmno3PQRstuVWX`)).toBe(`${PRODC}/v1/clients/client_[id]`);
      expect(scrub(`${PRODC}/v1/instances/ins_2abcDEFghiJKLmno3PQRstuVWX`)).toBe(`${PRODC}/v1/instances/ins_[id]`);
    });
    test("an unknown prefix is masked too — the rule is the pattern, not a list", () => {
      expect(scrub(`${PRODC}/v1/things/zz_2abcDEFghiJKLmno3PQRstuVWX`)).toBe(`${PRODC}/v1/things/zz_[id]`);
    });
    test("route words shaped like an id stay routes: the tail must be 16+ (R5 ruling)", () => {
      for (const route of ["/v1/oauth_callback", "/v1/me/email_addresses", "/v1/me/saml_accounts", "/v1/me/external_accounts", "/v1/me/phone_numbers"]) {
        expect(scrub(`${PRODC}${route}`)).toBe(`${PRODC}${route}`);
      }
      expect(scrub(`${PRODC}/v1/me/email_addresses/idn_2abcDEFghiJKLmno3PQRstuVWX`))
        .toBe(`${PRODC}/v1/me/email_addresses/idn_[id]`);
      // 15 characters is not an id; 16 is.
      expect(scrub(`${PRODC}/v1/x/sess_abcDEFghi123456`)).toBe(`${PRODC}/v1/x/sess_abcDEFghi123456`);
      expect(scrub(`${PRODC}/v1/x/sess_abcDEFghi1234567`)).toBe(`${PRODC}/v1/x/sess_[id]`);
    });
    test("a short tail is not an id; no id and no query is unchanged (same string)", () => {
      expect(scrub(`${PRODC}/v1/client/id_abc1234`)).toBe(`${PRODC}/v1/client/id_abc1234`);
      const env = `${PRODC}/v1/environment`;
      expect(scrub(env)).toBe(env);
    });
    test("dev host by suffix: the whole query goes, __clerk_db_jwt included (D3)", () => {
      const out = scrub(`${DEVC}/v1/client?__clerk_db_jwt=eyJhbGciOiJIUzI1NiJ9.secret.sig&_clerk_js_version=5.100.0`);
      expect(out).toBe(`${DEVC}/v1/client`);
      expect(out).not.toMatch(/clerk_db_jwt|\?/);
      expect(scrub(`${DEVC}/v1/client/sessions/${SESS}/tokens?__clerk_db_jwt=x`)).toBe(`${DEVC}/v1/client/sessions/sess_[id]/tokens`);
    });
    test("a non-Clerk host is untouched by this rule", () => {
      expect(scrub(`https://cdn.example.test/x/${SESS}`)).toBe(`https://cdn.example.test/x/${SESS}`);
      const rest = `${DEV}/rest/v1/t?select=id&note=eq.${SESS}`;
      expect(scrub(rest)).toBe(rest);
      expect(scrub(`https://notclerk.accounts.dev.example.test/v1/${SESS}`)).toBe(`https://notclerk.accounts.dev.example.test/v1/${SESS}`);
    });
    test("img.clerk.com keeps its own rule, byte for byte", () => {
      expect(scrub("https://img.clerk.com/eyJ0eXBlIjoicHJveHkiLCJzcmMiOiJodHRwczovL2ltYWdlcy5jbGVyay5kZXYifQ?width=80"))
        .toBe("https://img.clerk.com/[object]");
    });
  });

  // R4: a gift code is a bearer key; on our origin /g/<code> → /g/[code].
  describe("own-origin /g/<code>", () => {
    test("masked, with the hash kept and the query dropped", () => {
      expect(scrub("http://localhost/g/K7M2P9?ref=R9R9R9#/home")).toBe("http://localhost/g/[code]#/home");
      expect(scrub("http://localhost/g/K7M2P9")).toBe("http://localhost/g/[code]");
      expect(scrub("http://localhost/g/K7M2P9/extra")).toBe("http://localhost/g/[code]/extra");
    });
    test("a bare /g/ and other own-origin paths are not touched", () => {
      expect(scrub("http://localhost/g/")).toBe("http://localhost/g/");
      expect(scrub("http://localhost/gift/K7M2P9")).toBe("http://localhost/gift/K7M2P9");
    });
    test("a foreign host's /g/<code> is untouched by this rule (only its query goes)", () => {
      expect(scrub("https://cdn.example.test/g/K7M2P9?x=1")).toBe("https://cdn.example.test/g/K7M2P9");
    });
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
