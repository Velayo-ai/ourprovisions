import { HINT_KEY, HINT_VISITS, HINT_TEXT, hintForNextVisit, beginHintVisit } from "./landscapeHint";

const memory = (init = {}) => {
  const m = { ...init };
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, dump: () => m };
};
const throwing = (which) => ({
  getItem: () => { if (which !== "write") throw new Error("blocked"); return null; },
  setItem: () => { throw new Error("quota"); },
});

describe("the first-run subtitle", () => {
  test("three visits, and the words", () => {
    expect(HINT_VISITS).toBe(3);
    expect(HINT_TEXT).toBe("Tap to add · Hold to remove");
  });

  test("shows on visits 1, 2 and 3 only — then never again", () => {
    const s = memory();
    const shown = [];
    for (let visit = 1; visit <= 6; visit++) {
      const before = hintForNextVisit(s);       // what the hidden view is pre-rendered with
      const during = beginHintVisit(s);         // the visit starts
      expect(during).toBe(before);
      shown.push(during);
    }
    expect(shown).toEqual([true, true, true, false, false, false]);
    expect(s.dump()[HINT_KEY]).toBe("3");       // it stops counting once it has stopped showing
    expect(hintForNextVisit(s)).toBe(false);
  });

  test("looking does not count: only a visit does", () => {
    const s = memory();
    for (let i = 0; i < 10; i++) expect(hintForNextVisit(s)).toBe(true);
    expect(s.dump()[HINT_KEY]).toBe("0");
  });

  test("a device that has already had its three never shows it", () => {
    const s = memory({ [HINT_KEY]: "3" });
    expect(hintForNextVisit(s)).toBe(false);
    expect(beginHintVisit(s)).toBe(false);
  });

  test("garbage in storage counts as zero", () => {
    const s = memory({ [HINT_KEY]: "banana" });
    expect(hintForNextVisit(s)).toBe(true);
    expect(beginHintVisit(s)).toBe(true);
    expect(s.dump()[HINT_KEY]).toBe("1");
  });

  test("storage fails → never shown, never throws: no storage, reads blocked, writes blocked", () => {
    [null, throwing("read"), throwing("write")].forEach((s) => {
      expect(() => hintForNextVisit(s)).not.toThrow();
      expect(hintForNextVisit(s)).toBe(false);
      expect(beginHintVisit(s)).toBe(false);
    });
  });
});
