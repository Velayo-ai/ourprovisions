// Run: CI=true npx react-scripts test --watchAll=false src/lib
import { resolvePillState } from "./pillState";

test("A5b: offline with nothing saved is drawn as Reconnecting…", () => {
  expect(resolvePillState("offline", false)).toBe("reconnecting");
});

test("offline with saved data keeps 'Offline — showing last saved'", () => {
  expect(resolvePillState("offline", true)).toBe("offline");
});

test("every other state passes through untouched, saved or not", () => {
  for (const s of ["online", "reconnecting", "recovered"]) {
    expect(resolvePillState(s, false)).toBe(s);
    expect(resolvePillState(s, true)).toBe(s);
  }
});
