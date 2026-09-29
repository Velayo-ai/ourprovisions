// Run: CI=true npx react-scripts test --watchAll=false src/lib
import { pickActiveHousehold, rememberHousehold, readRememberedHousehold, activeKeyFor, LEGACY_ACTIVE_KEY } from "./rememberedHousehold";

const DT = "user_dt", DH = "user_dh";
const MADBURY = "hh-madbury", O11Y = "hh-o11y", SACANDAGA = "hh-sacandaga";
const dhPlaces = [{ id: SACANDAGA }, { id: MADBURY }, { id: O11Y }];   // oldest-joined first
const dtPlaces = [{ id: MADBURY }, { id: SACANDAGA }];

beforeEach(() => localStorage.clear());

test("no memory at all → the first returned (oldest-joined), as before", () => {
  expect(pickActiveHousehold(DH, dhPlaces)).toBe(SACANDAGA);
  expect(pickActiveHousehold(DH, [])).toBe(null);
});

test("A6: each person returns to their OWN last place; DT's never leaks to DH", () => {
  rememberHousehold(DT, SACANDAGA);
  rememberHousehold(DH, MADBURY);
  expect(pickActiveHousehold(DT, dtPlaces)).toBe(SACANDAGA);
  expect(pickActiveHousehold(DH, dhPlaces)).toBe(MADBURY);
});

test("own key present but no longer a member → falls back, no legacy adoption", () => {
  rememberHousehold(DH, "hh-left");
  localStorage.setItem(LEGACY_ACTIVE_KEY, MADBURY);
  expect(pickActiveHousehold(DH, dhPlaces)).toBe(SACANDAGA);
  expect(localStorage.getItem(LEGACY_ACTIVE_KEY)).toBe(MADBURY);   // untouched
});

test("legacy key adopted ONCE when a member: written per user, then deleted", () => {
  localStorage.setItem(LEGACY_ACTIVE_KEY, MADBURY);
  expect(pickActiveHousehold(DH, dhPlaces)).toBe(MADBURY);
  expect(localStorage.getItem(activeKeyFor(DH))).toBe(MADBURY);
  expect(localStorage.getItem(LEGACY_ACTIVE_KEY)).toBe(null);
});

test("legacy key left in place when this user is NOT a member of it", () => {
  localStorage.setItem(LEGACY_ACTIVE_KEY, "hh-someone-elses");
  expect(pickActiveHousehold(DH, dhPlaces)).toBe(SACANDAGA);
  expect(localStorage.getItem(LEGACY_ACTIVE_KEY)).toBe("hh-someone-elses");
  expect(localStorage.getItem(activeKeyFor(DH))).toBe(null);
});

test("readRememberedHousehold returns null (never throws) when storage is unavailable", () => {
  const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(readRememberedHousehold(DH, dhPlaces)).toBe(null);
  expect(() => rememberHousehold(DH, MADBURY)).not.toThrow();
  spy.mockRestore();
});
