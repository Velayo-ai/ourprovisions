// Run: CI=true npx react-scripts test --watchAll=false src/lib/preRum
//
// SPEC_rum_clerk_id_scrub Amendment 2026-10-26 R1–R3 (S29 / S33): codes leave
// the URL before Splunk starts, and are held in sessionStorage under two keys.
import fs from "fs";
import path from "path";
import { cleanEntryUrl, INVITE_KEY, REF_KEY } from "./preRum";

const ORIGIN = "https://dev.ourprovisions.velayo.ai";

// A sessionStorage stand-in. `throwing` models private mode / blocked storage.
function stub(initial = {}, throwing = false) {
  const m = { ...initial };
  return {
    getItem: (k) => { if (throwing) throw new Error("blocked"); return k in m ? m[k] : null; },
    setItem: (k, v) => { if (throwing) throw new Error("blocked"); m[k] = String(v); },
    dump: () => ({ ...m }),
  };
}

describe("cleanEntryUrl", () => {
  test("invite only: held, removed from the URL", () => {
    const s = stub();
    expect(cleanEntryUrl(`${ORIGIN}/?invite=ABCD1234`, s)).toBe(`${ORIGIN}/`);
    expect(s.dump()).toEqual({ [INVITE_KEY]: "ABCD1234" });
  });

  test("ref only: held, removed from the URL", () => {
    const s = stub();
    expect(cleanEntryUrl(`${ORIGIN}/?ref=R9R9R9`, s)).toBe(`${ORIGIN}/`);
    expect(s.dump()).toEqual({ [REF_KEY]: "R9R9R9" });
  });

  test("both: two keys, never one", () => {
    const s = stub();
    expect(cleanEntryUrl(`${ORIGIN}/?invite=ABCD1234&ref=R9R9R9`, s)).toBe(`${ORIGIN}/`);
    expect(s.dump()).toEqual({ [INVITE_KEY]: "ABCD1234", [REF_KEY]: "R9R9R9" });
  });

  test("a /g/<code> gift path is removed (not yet held — Phase A adds its key)", () => {
    const s = stub();
    expect(cleanEntryUrl(`${ORIGIN}/g/K7M2P9?ref=R9R9R9`, s)).toBe(`${ORIGIN}/`);
    expect(cleanEntryUrl(`${ORIGIN}/g/K7M2P9/#/home`, s)).toBe(`${ORIGIN}/#/home`);
    expect(s.dump()).toEqual({ [REF_KEY]: "R9R9R9" });
    // Only a single-segment /g/<code> is a gift path.
    const deep = `${ORIGIN}/g/K7M2P9/extra`;
    expect(cleanEntryUrl(deep, stub())).toBe(deep);
  });

  test("a held value is not overwritten by an empty URL, or by an empty param", () => {
    const held = { [INVITE_KEY]: "HELD1234", [REF_KEY]: "HELDREF" };
    const s1 = stub(held);
    expect(cleanEntryUrl(`${ORIGIN}/#/plan`, s1)).toBe(`${ORIGIN}/#/plan`);
    expect(s1.dump()).toEqual(held);
    const s2 = stub(held);
    expect(cleanEntryUrl(`${ORIGIN}/?invite=&ref=`, s2)).toBe(`${ORIGIN}/`);
    expect(s2.dump()).toEqual(held);
    // A fresh code in the URL does replace a held one — the newest link wins.
    const s3 = stub(held);
    cleanEntryUrl(`${ORIGIN}/?invite=NEW99999`, s3);
    expect(s3.dump()).toEqual({ [INVITE_KEY]: "NEW99999", [REF_KEY]: "HELDREF" });
  });

  test("other params and the hash are preserved", () => {
    const s = stub();
    expect(cleanEntryUrl(`${ORIGIN}/?email_address=a%40b.test&invite=ABCD1234&first_name=Dan#/home`, s))
      .toBe(`${ORIGIN}/?email_address=a%40b.test&first_name=Dan#/home`);
    expect(cleanEntryUrl(`${ORIGIN}/?ref=R9R9R9#/plan`, s)).toBe(`${ORIGIN}/#/plan`);
  });

  test("no-op on a clean URL: the same string back, nothing written", () => {
    const s = stub();
    for (const clean of [`${ORIGIN}/`, `${ORIGIN}/#/home`, `${ORIGIN}/?email_address=a%40b.test#/plan`, `${ORIGIN}/sign-up`]) {
      expect(cleanEntryUrl(clean, s)).toBe(clean);
    }
    expect(s.dump()).toEqual({});
  });

  test("storage that throws never stops the URL being cleaned", () => {
    expect(cleanEntryUrl(`${ORIGIN}/?invite=ABCD1234&ref=R9R9R9#/home`, stub({}, true))).toBe(`${ORIGIN}/#/home`);
  });

  test("an unparseable href is returned untouched", () => {
    expect(cleanEntryUrl("not a url ?invite=X", stub())).toBe("not a url ?invite=X");
  });
});

describe("index.js import order", () => {
  test("./lib/preRum is the first import, before ./rum", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
    const imports = src.split(/\r?\n/).filter((l) => /^import\b/.test(l));
    expect(imports[0]).toBe("import './lib/preRum';");
    expect(imports[1]).toBe("import './rum';");
    // The old inline bridge is gone — the URL is read in exactly one place.
    expect(src).not.toMatch(/URLSearchParams/);
  });
});
