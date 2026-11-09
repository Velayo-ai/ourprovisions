// Run: CI=true npx react-scripts test --watchAll=false src/lib/preRum
//
// SPEC_rum_clerk_id_scrub Amendment 2026-10-26 R1–R3 (S29 / S33): codes leave
// the URL before Splunk starts, and are held under separate keys.
// SPEC_durable_invite_hold A1–A2 (2026-11-08): the hold is localStorage, as
// {code, heldAt}, and each species expires.
import fs from "fs";
import path from "path";
import {
  cleanEntryUrl, readHeld, clearHeld,
  INVITE_KEY, REF_KEY, GIFT_KEY,
  INVITE_MAX_AGE_MS, REF_MAX_AGE_MS, GIFT_MAX_AGE_MS,
} from "./preRum";

const ORIGIN = "https://dev.ourprovisions.velayo.ai";
const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const hold = (code, heldAt = NOW) => JSON.stringify({ code, heldAt });

// A localStorage stand-in. `throwing` models private mode / blocked storage.
function stub(initial = {}, throwing = false) {
  const m = { ...initial };
  return {
    getItem: (k) => { if (throwing) throw new Error("blocked"); return k in m ? m[k] : null; },
    setItem: (k, v) => { if (throwing) throw new Error("blocked"); m[k] = String(v); },
    removeItem: (k) => { if (throwing) throw new Error("blocked"); delete m[k]; },
    dump: () => ({ ...m }),
  };
}

describe("cleanEntryUrl", () => {
  test("invite only: held as {code, heldAt}, removed from the URL", () => {
    const s = stub();
    expect(cleanEntryUrl(`${ORIGIN}/?invite=ABCD1234`, s, NOW)).toBe(`${ORIGIN}/`);
    expect(s.dump()).toEqual({ [INVITE_KEY]: hold("ABCD1234") });
  });

  test("ref only: held, removed from the URL", () => {
    const s = stub();
    expect(cleanEntryUrl(`${ORIGIN}/?ref=R9R9R9`, s, NOW)).toBe(`${ORIGIN}/`);
    expect(s.dump()).toEqual({ [REF_KEY]: hold("R9R9R9") });
  });

  test("both: two keys, never one", () => {
    const s = stub();
    expect(cleanEntryUrl(`${ORIGIN}/?invite=ABCD1234&ref=R9R9R9`, s, NOW)).toBe(`${ORIGIN}/`);
    expect(s.dump()).toEqual({ [INVITE_KEY]: hold("ABCD1234"), [REF_KEY]: hold("R9R9R9") });
  });

  test("a /g/<code> gift path is held under GIFT_KEY (Phase A, Commit 1) and removed from the URL; ref rides with it", () => {
    const s = stub();
    expect(cleanEntryUrl(`${ORIGIN}/g/K7M2P9ABCDEFGH23?ref=R9R9R9`, s, NOW)).toBe(`${ORIGIN}/`);
    expect(s.dump()).toEqual({ [GIFT_KEY]: hold("K7M2P9ABCDEFGH23"), [REF_KEY]: hold("R9R9R9") });
    const s2 = stub();
    expect(cleanEntryUrl(`${ORIGIN}/g/K7M2P9/#/home`, s2, NOW)).toBe(`${ORIGIN}/#/home`);
    expect(s2.dump()).toEqual({ [GIFT_KEY]: hold("K7M2P9") });
    // Three keys, never one slot: a gift link never erases a held invite.
    const s3 = stub({ [INVITE_KEY]: hold("HELD1234") });
    cleanEntryUrl(`${ORIGIN}/g/K7M2P9`, s3, NOW);
    expect(s3.dump()).toEqual({ [INVITE_KEY]: hold("HELD1234"), [GIFT_KEY]: hold("K7M2P9") });
    // Only a single-segment /g/<code> is a gift path.
    const deep = `${ORIGIN}/g/K7M2P9/extra`;
    expect(cleanEntryUrl(deep, stub(), NOW)).toBe(deep);
    expect(GIFT_KEY).toBe("pending_gift_code");
  });

  test("a held value is not overwritten by an empty URL, or by an empty param", () => {
    const held = { [INVITE_KEY]: hold("HELD1234"), [REF_KEY]: hold("HELDREF") };
    const s1 = stub(held);
    expect(cleanEntryUrl(`${ORIGIN}/#/plan`, s1, NOW)).toBe(`${ORIGIN}/#/plan`);
    expect(s1.dump()).toEqual(held);
    const s2 = stub(held);
    expect(cleanEntryUrl(`${ORIGIN}/?invite=&ref=`, s2, NOW)).toBe(`${ORIGIN}/`);
    expect(s2.dump()).toEqual(held);
    // A fresh code in the URL does replace a held one — the newest link wins.
    const s3 = stub(held);
    cleanEntryUrl(`${ORIGIN}/?invite=NEW99999`, s3, NOW + 5);
    expect(s3.dump()).toEqual({ [INVITE_KEY]: hold("NEW99999", NOW + 5), [REF_KEY]: hold("HELDREF") });
  });

  test("other params and the hash are preserved", () => {
    const s = stub();
    expect(cleanEntryUrl(`${ORIGIN}/?email_address=a%40b.test&invite=ABCD1234&first_name=Dan#/home`, s, NOW))
      .toBe(`${ORIGIN}/?email_address=a%40b.test&first_name=Dan#/home`);
    expect(cleanEntryUrl(`${ORIGIN}/?ref=R9R9R9#/plan`, s, NOW)).toBe(`${ORIGIN}/#/plan`);
  });

  test("no-op on a clean URL: the same string back, nothing written", () => {
    const s = stub();
    for (const clean of [`${ORIGIN}/`, `${ORIGIN}/#/home`, `${ORIGIN}/?email_address=a%40b.test#/plan`, `${ORIGIN}/sign-up`]) {
      expect(cleanEntryUrl(clean, s, NOW)).toBe(clean);
    }
    expect(s.dump()).toEqual({});
  });

  test("storage that throws, or no storage at all, never stops the URL being cleaned", () => {
    expect(cleanEntryUrl(`${ORIGIN}/?invite=ABCD1234&ref=R9R9R9#/home`, stub({}, true), NOW)).toBe(`${ORIGIN}/#/home`);
    expect(cleanEntryUrl(`${ORIGIN}/?invite=ABCD1234#/home`, null, NOW)).toBe(`${ORIGIN}/#/home`);
  });

  test("an unparseable href is returned untouched", () => {
    expect(cleanEntryUrl("not a url ?invite=X", stub(), NOW)).toBe("not a url ?invite=X");
  });
});

describe("readHeld / clearHeld (A2: each species expires)", () => {
  test("the max ages: invite 7 days, ref 30, gift 7", () => {
    expect(INVITE_MAX_AGE_MS).toBe(7 * DAY);
    expect(REF_MAX_AGE_MS).toBe(30 * DAY);
    expect(GIFT_MAX_AGE_MS).toBe(7 * DAY);
  });

  test("a fresh hold reads back its code and stays (bootstrap clears it after the attempt)", () => {
    const s = stub({ [INVITE_KEY]: hold("ABCD1234", NOW - DAY) });
    expect(readHeld(INVITE_KEY, INVITE_MAX_AGE_MS, s, NOW)).toBe("ABCD1234");
    expect(s.dump()).toEqual({ [INVITE_KEY]: hold("ABCD1234", NOW - DAY) });
  });

  test("on the boundary it still reads; a millisecond past, it is ignored and cleared", () => {
    const s = stub({ [INVITE_KEY]: hold("EDGE0001", NOW - 7 * DAY) });
    expect(readHeld(INVITE_KEY, INVITE_MAX_AGE_MS, s, NOW)).toBe("EDGE0001");
    expect(readHeld(INVITE_KEY, INVITE_MAX_AGE_MS, s, NOW + 1)).toBe(null);
    expect(s.dump()).toEqual({});
  });

  test("an 8-day-old invite is ignored and cleared; an 8-day-old ref still reads", () => {
    const s = stub({ [INVITE_KEY]: hold("OLD00001", NOW - 8 * DAY), [REF_KEY]: hold("REF00001", NOW - 8 * DAY) });
    expect(readHeld(INVITE_KEY, INVITE_MAX_AGE_MS, s, NOW)).toBe(null);
    expect(readHeld(REF_KEY, REF_MAX_AGE_MS, s, NOW)).toBe("REF00001");
    expect(s.dump()).toEqual({ [REF_KEY]: hold("REF00001", NOW - 8 * DAY) });
  });

  test("garbage, a bare string, or a hold with no code is cleared, never used", () => {
    for (const bad of ["not json", "ABCD1234", JSON.stringify({ heldAt: NOW }), JSON.stringify({ code: "", heldAt: NOW }), JSON.stringify({ code: "X", heldAt: "yesterday" })]) {
      const s = stub({ [INVITE_KEY]: bad });
      expect(readHeld(INVITE_KEY, INVITE_MAX_AGE_MS, s, NOW)).toBe(null);
      expect(s.dump()).toEqual({});
    }
  });

  test("nothing held → null; blocked or missing storage → null, no throw", () => {
    expect(readHeld(INVITE_KEY, INVITE_MAX_AGE_MS, stub(), NOW)).toBe(null);
    expect(readHeld(INVITE_KEY, INVITE_MAX_AGE_MS, stub({}, true), NOW)).toBe(null);
    expect(readHeld(INVITE_KEY, INVITE_MAX_AGE_MS, null, NOW)).toBe(null);
    expect(() => clearHeld(INVITE_KEY, stub({}, true))).not.toThrow();
    expect(() => clearHeld(INVITE_KEY, null)).not.toThrow();
  });

  test("clearHeld removes only its key", () => {
    const s = stub({ [INVITE_KEY]: hold("A"), [REF_KEY]: hold("B") });
    clearHeld(INVITE_KEY, s);
    expect(s.dump()).toEqual({ [REF_KEY]: hold("B") });
  });

  test("round trip: what cleanEntryUrl holds, readHeld reads", () => {
    const s = stub();
    cleanEntryUrl(`${ORIGIN}/?invite=5EA0IB&ref=R9R9R9`, s, NOW);
    expect(readHeld(INVITE_KEY, INVITE_MAX_AGE_MS, s, NOW + DAY)).toBe("5EA0IB");
    expect(readHeld(REF_KEY, REF_MAX_AGE_MS, s, NOW + DAY)).toBe("R9R9R9");
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

describe("the held codes leave sessionStorage", () => {
  // A1: no reader goes back to the per-tab store for a held code. (The same-load
  // intents — just_joined_*, just_signed_up, invite_failed — stay in sessionStorage.)
  test("no source file reads or writes a held key through sessionStorage", () => {
    const SRC = path.join(__dirname, "..");
    const files = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.js$/.test(e.name) && !/\.test\.js$/.test(e.name)) files.push(p);
      }
    })(SRC);
    const offenders = files.filter((f) =>
      /sessionStorage\.(getItem|setItem|removeItem)\(\s*(GIFT_KEY|INVITE_KEY|REF_KEY|"pending_(invite|ref|gift)_code")/.test(fs.readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
