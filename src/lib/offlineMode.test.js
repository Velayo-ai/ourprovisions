// Run: CI=true npx react-scripts test --watchAll=false src/lib/offlineMode
import {
  nextOffline, OFFLINE_HOLD_MS, noteDue, NOTE_TRIP_MS, readNoteShownAt, writeNoteShownAt, clearNoteShownAt,
  changesLine, needsSignalLine, NOTE_COPY, SHEET_COPY, BEACON_MS, HARBOR_LABEL, lowPowerFromFrames,
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

describe("C2: the sheet's copy", () => {
  test("the copy is the ruled copy", () => {
    expect(NOTE_COPY).toBe("Shopping offline · everything's saved");
    expect(SHEET_COPY).toBe("You're offline. Everything you do is saved on this phone and shares with your household when you're back in signal.");
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
  test("two 1.5 s passes, then rest", () => {
    expect(BEACON_MS).toBe(3000);
  });
  test("the accessible names", () => {
    expect(HARBOR_LABEL).toEqual({ connected: "Connected to the Harbor", offline: "Offline" });
  });
  test("60 fps sweeps; 30 fps (Low Power Mode) and an unmeasurable sample don't", () => {
    expect(lowPowerFromFrames([16.7, 16.6, 16.8, 16.7, 16.6])).toBe(false);
    expect(lowPowerFromFrames([8.3, 8.4, 8.3, 8.3])).toBe(false);
    expect(lowPowerFromFrames([33.3, 33.4, 33.3, 33.3])).toBe(true);
    expect(lowPowerFromFrames([16.7])).toBe(true);
    expect(lowPowerFromFrames([])).toBe(true);
  });
});
