// Run: CI=true npx react-scripts test --watchAll=false src/lib/offlineMode
import {
  nextOffline, OFFLINE_HOLD_MS, noteDue, NOTE_TRIP_MS, readNoteShownAt, writeNoteShownAt, clearNoteShownAt,
  changesLine, needsSignalLine, NOTE_COPY, offGridCopy, APP_ROW_STATUS, BEACON_MS, BEACON_PASS_MS, HARBOR_LABEL, lowPowerFromFrames,
} from "./offlineMode";

const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

describe("C5: the shown offline state", () => {
  test("turns on at once when raw offline", () => {
    expect(nextOffline({ shown: false }, true, 1000)).toEqual({ shown: true, raw: true, steadySince: null, clearAt: null });
  });
  test("signal back: held for 10 s of steady signal from the moment it returned", () => {
    const on = nextOffline({ shown: false }, true, 0);
    expect(nextOffline(on, false, 3000)).toEqual({ shown: true, raw: false, steadySince: 3000, clearAt: 3000 + OFFLINE_HOLD_MS });
  });
  test("clears once the signal has been steady for the hold", () => {
    expect(nextOffline({ shown: true, raw: false, steadySince: 3000 }, false, 3000 + OFFLINE_HOLD_MS)).toEqual({ shown: false, raw: false, steadySince: null, clearAt: null });
  });
  test("a long spell of signal dropping in and out never flicks off, however long it lasts", () => {
    let s = nextOffline({ shown: false }, true, 0);
    for (let t = 2000; t < 60000; t += 4000) {
      s = nextOffline(s, false, t);
      expect(s.shown).toBe(true);
      s = nextOffline(s, true, t + 2000);
      expect(s.shown).toBe(true);
    }
  });
  test("a re-evaluation inside the hold keeps the original steady start", () => {
    let s = nextOffline(nextOffline({ shown: false }, true, 0), false, 1000);
    s = nextOffline(s, false, 6000);
    expect(s).toEqual({ shown: true, raw: false, steadySince: 1000, clearAt: 1000 + OFFLINE_HOLD_MS });
  });
  test("online and never offline stays off", () => {
    expect(nextOffline({ shown: false }, false, 9)).toEqual({ shown: false, raw: false, steadySince: null, clearAt: null });
  });
});

describe("C3: one note per trip", () => {
  test("due when never shown, or shown by another trip", () => {
    expect(noteDue(null, 1)).toBe(true);
    expect(noteDue(1000, 1000 + NOTE_TRIP_MS + 1)).toBe(true);
  });
  test("not due again this trip", () => {
    expect(noteDue(1000, 5000)).toBe(false);
  });
  test("stored, read back, cleared at Wrap up; storage failures never throw", () => {
    const s = memStore();
    expect(readNoteShownAt(s)).toBeNull();
    writeNoteShownAt(4242, s);
    expect(readNoteShownAt(s)).toBe(4242);
    clearNoteShownAt(s);
    expect(readNoteShownAt(s)).toBeNull();
    const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    expect(readNoteShownAt(broken)).toBeNull();
    expect(() => writeNoteShownAt(1, broken)).not.toThrow();
    expect(() => clearNoteShownAt(broken)).not.toThrow();
  });
});

describe("C10: off grid — the copy", () => {
  test("the note", () => {
    expect(NOTE_COPY).toBe("Off grid · everything's saved");
  });
  test("more than one member: on your own for now, shared with the household by name", () => {
    expect(offGridCopy({ memberCount: 2, householdName: "Madbury" })).toBe("You're off grid, shopping on your own for now. Everything's kept on this phone and shared with Madbury when you're back in signal.");
    expect(offGridCopy({ memberCount: 5, householdName: "  " })).toContain("shared with your household when");
  });
  test("one member, or a count not known yet: no sharing claimed", () => {
    const one = "You're off grid. Everything's kept on this phone and syncs when you're back in signal.";
    expect(offGridCopy({ memberCount: 1, householdName: "Madbury" })).toBe(one);
    expect(offGridCopy({ memberCount: 0 })).toBe(one);
    expect(offGridCopy()).toBe(one);
  });
  test("the app row's status, and no copy uses the word offline (connection words and plan words never overlap)", () => {
    expect(APP_ROW_STATUS).toEqual({ online: "Active", offGrid: "Working off grid" });
    const all = [NOTE_COPY, offGridCopy({ memberCount: 3, householdName: "H" }), offGridCopy({ memberCount: 1 }), APP_ROW_STATUS.offGrid, HARBOR_LABEL.offline];
    all.forEach((t) => { expect(t).not.toMatch(/offline/i); expect(t).not.toMatch(/\b(solo|upgrade|intelligent|event)\b/i); });
  });
  test("changes waiting: one plain line, none when nothing waits", () => {
    expect(changesLine(0)).toBeNull();
    expect(changesLine(1)).toBe("1 change will share when you're back.");
    expect(changesLine(3)).toBe("3 changes will share when you're back.");
  });
  test("the known gap, said plainly", () => {
    expect(needsSignalLine("add")).toBe("Adding items needs signal for now.");
    expect(needsSignalLine("nope")).toBeNull();
  });
});

describe("C9: the beacon", () => {
  test("two ~3 s turns, then rest", () => {
    expect(BEACON_PASS_MS).toBe(3000);
    expect(BEACON_MS).toBe(6000);
  });
  test("the accessible names", () => {
    expect(HARBOR_LABEL).toEqual({ connected: "Connected to the Harbor", offline: "Off grid" });
  });
  test("60 fps sweeps; 30 fps (Low Power Mode) and an unmeasurable sample don't", () => {
    expect(lowPowerFromFrames([16.7, 16.6, 16.8, 16.7, 16.6])).toBe(false);
    expect(lowPowerFromFrames([8.3, 8.4, 8.3, 8.3])).toBe(false);
    expect(lowPowerFromFrames([33.3, 33.4, 33.3, 33.3])).toBe(true);
    expect(lowPowerFromFrames([16.7])).toBe(true);
    expect(lowPowerFromFrames([])).toBe(true);
  });
});
