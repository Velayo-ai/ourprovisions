// Run: CI=true npx react-scripts test --watchAll=false src/lib/tripSession
//
// SPEC_one_list R5: an add never starts a trip. ensureTripSession is the one opener; adoptOnly (the
// added_in_store path) returns this person's open session or null and never calls start().
import { ensureTripSession } from "./tripSession";

// A fake of the hook's pieces: `db` is what loadSessions would find (this person's open, fresh session,
// or null); `phone` is this phone's activeSessionRef, which reload() overwrites with the db's answer.
function rig({ db = null, phone = null } = {}) {
  const state = { db, phone, starts: 0, reloads: 0 };
  const starting = { current: null };
  let releaseStart = null;
  const deps = {
    starting,
    reload: async () => { state.reloads += 1; state.phone = state.db; },
    current: () => state.phone,
    start: () => {
      state.starts += 1;
      return new Promise((resolve) => {
        releaseStart = () => { const s = { id: `new-${state.starts}` }; state.db = s; state.phone = s; resolve(s); };
      });
    },
  };
  return { state, deps, starting, release: () => releaseStart && releaseStart() };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("adoptOnly: an add joins a trip, never starts one", () => {
  test("no open session anywhere → null, nothing started", async () => {
    const { state, deps } = rig();
    await expect(ensureTripSession({ ...deps, adoptOnly: true })).resolves.toBeNull();
    expect(state.starts).toBe(0);
    expect(state.reloads).toBe(1);
  });

  test("STALE activeSession (wrapped up on another phone): the re-read finds none → null, nothing started", async () => {
    // This phone still holds the session; the database has none open (or loadSessions ended it at 8 h).
    const { state, deps } = rig({ db: null, phone: { id: "s-old" } });
    await expect(ensureTripSession({ ...deps, adoptOnly: true })).resolves.toBeNull();
    expect(state.starts).toBe(0);
    expect(state.phone).toBeNull();   // the stale copy is corrected by the read
  });

  test("the same stale case WITHOUT adoptOnly (a check) does start a trip — the hole R5 closes for adds", async () => {
    const { state, deps, release } = rig({ db: null, phone: { id: "s-old" } });
    const p = ensureTripSession(deps);
    await flush();
    release();
    await expect(p).resolves.toEqual({ id: "new-1" });
    expect(state.starts).toBe(1);
  });

  test("an open session → adopted and returned, nothing started", async () => {
    const open = { id: "s-1" };
    const { state, deps } = rig({ db: open, phone: null });   // opened on another of this person's phones
    await expect(ensureTripSession({ ...deps, adoptOnly: true })).resolves.toBe(open);
    expect(state.starts).toBe(0);
  });

  test("an add right after the first check-off joins the start in flight", async () => {
    const { state, deps, starting, release } = rig();
    const check = ensureTripSession(deps);   // the first check-off: no session yet, starts one
    await flush();
    expect(starting.current).not.toBeNull();
    const add = ensureTripSession({ ...deps, adoptOnly: true });
    release();
    const [a, b] = await Promise.all([check, add]);
    expect(a).toEqual({ id: "new-1" });
    expect(b).toBe(a);
    expect(state.starts).toBe(1);
  });

  test("an adoptOnly read never holds the lock, so a check during it still starts the trip", async () => {
    const { state, deps, starting, release } = rig();
    let releaseRead = null;
    const slowReload = () => new Promise((resolve) => { releaseRead = () => { state.phone = state.db; resolve(); }; });
    const add = ensureTripSession({ ...deps, reload: slowReload, adoptOnly: true });
    expect(starting.current).toBeNull();
    const check = ensureTripSession(deps);
    await flush();
    release();
    await expect(check).resolves.toEqual({ id: "new-1" });
    releaseRead();
    await add;
    expect(state.starts).toBe(1);
  });
});

describe("without adoptOnly (a check, an uncheck, the offline flush): unchanged", () => {
  test("two quick taps open one session", async () => {
    const { state, deps, release } = rig();
    const a = ensureTripSession(deps);
    const b = ensureTripSession(deps);
    await flush();
    release();
    const [sa, sb] = await Promise.all([a, b]);
    expect(sa).toBe(sb);
    expect(state.starts).toBe(1);
  });

  test("an open session is adopted, not duplicated", async () => {
    const open = { id: "s-1" };
    const { state, deps } = rig({ db: open });
    await expect(ensureTripSession(deps)).resolves.toBe(open);
    expect(state.starts).toBe(0);
  });

  test("the lock is released after the start", async () => {
    const { deps, starting, release } = rig();
    const p = ensureTripSession(deps);
    await flush();
    release();
    await p;
    expect(starting.current).toBeNull();
  });
});

// The callers, on the source (they live inside ProvisionsApp / useProvisions, which need Clerk + Supabase).
describe("the callers (source)", () => {
  const fs = require("fs");
  const path = require("path");
  const APP = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
  const HOOK = fs.readFileSync(path.join(__dirname, "..", "hooks", "useProvisions.js"), "utf8");
  const noteAddedHere = APP.slice(APP.indexOf("const noteAddedHere"), APP.indexOf("// The picker's adds (SPEC_one_list R8, R14)"));

  test("noteAddedHere has no door gate, tags only during this person's trip, and logs through adoptOnly", () => {
    expect(noteAddedHere).not.toMatch(/view\s*[!=]==/);
    expect(noteAddedHere).toMatch(/if \(!res \|\| !activeSession\) return;/);
    expect(noteAddedHere).toMatch(/recordListEvent\("added_in_store", \{ \.\.\.res, adoptOnly: true \}\)/);
  });

  test("recordListEvent hands adoptOnly to ensureSession and writes nothing when none was adopted", () => {
    const rec = HOOK.slice(HOOK.indexOf("const recordListEvent"), HOOK.indexOf("}, [ensureSession]);"));
    expect(rec).toMatch(/ensureSession\(\{ silent: true, startedAt: tripStartedAt, adoptOnly \}\)/);
    expect(rec).toMatch(/if \(adoptOnly && !session\) return null;/);
  });

  test("ensureSession goes through ensureTripSession, and only it calls startSession", () => {
    expect(HOOK).toMatch(/return ensureTripSession\(\{/);
    expect((HOOK.match(/startSession\(\{/g) || []).length).toBe(1);   // the one call, inside ensureSession's start()
  });
});
