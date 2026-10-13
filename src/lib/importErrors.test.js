// Run: CI=true npx react-scripts test --watchAll=false src/lib/importErrors
import { classifyFetchFailure, IMPORT_HINTS, IMPORT_FAILED_HINT, GALLEY_HINTS, GALLEY_OFFLINE_HINT, GALLEY_FAILED_HINT } from "./importErrors";

// What the hook returns for a thrown error on the read path, as plain data: null
// for a cancel, otherwise a reason the sheet maps to the ONE hint line.
const reasonFor = (err) => {
  const kind = classifyFetchFailure(err);
  if (kind === "aborted") return null;
  return { reason: kind === "offline" ? "offline" : "failed" };
};
const hintFor = (err) => { const r = reasonFor(err); return r ? IMPORT_HINTS[r.reason] : null; };

test("Safari's offline TypeError maps to the connection hint; the raw message never appears", () => {
  const err = new TypeError("Load failed");
  expect(hintFor(err)).toBe("Couldn't reach the reader. Check your connection and try again.");
  expect(hintFor(err)).not.toContain("Load failed");
});

test("Chrome's and Firefox's wording map the same way, text never copied through", () => {
  for (const msg of ["Failed to fetch", "NetworkError when attempting to fetch resource."]) {
    expect(hintFor(new TypeError(msg))).toBe(IMPORT_HINTS.offline);
    expect(hintFor(new TypeError(msg))).not.toContain(msg);
  }
});

test("AbortError (Never mind) stays silent", () => {
  const err = new DOMException("The user aborted a request.", "AbortError");
  expect(classifyFetchFailure(err)).toBe("aborted");
  expect(reasonFor(err)).toBeNull();
  const plain = new Error("x"); plain.name = "AbortError";
  expect(reasonFor(plain)).toBeNull();
});

test("any other error gets the plain hint, raw message kept out", () => {
  const err = new Error("Clerk: token refresh exploded (secret details)");
  expect(hintFor(err)).toBe("Couldn't read the recipe. Try again.");
  expect(hintFor(err)).not.toContain("Clerk");
  expect(hintFor(null)).toBe(IMPORT_FAILED_HINT);
  expect(hintFor("string error")).toBe(IMPORT_FAILED_HINT);
});

test("the read hints are fixed copy and distinct, and every reason the hook returns has one", () => {
  const values = Object.values(IMPORT_HINTS);
  expect(values.length).toBe(7);
  expect(new Set(values).size).toBe(7);
  for (const reason of ["not_a_recipe", "unreadable", "timeout", "unreachable", "offline", "session_expired", "failed"]) {
    expect(typeof IMPORT_HINTS[reason]).toBe("string");
  }
});

// The invent path, the same slot: offline → connection copy, else the plain line.
const galleyHintFor = (err) => {
  const kind = classifyFetchFailure(err);
  if (kind === "aborted") return null;
  return GALLEY_HINTS[kind === "offline" ? "offline" : "failed"];
};

test("Galley: a TypeError becomes the connection hint, raw text absent; anything else the plain hint; abort silent", () => {
  const out = galleyHintFor(new TypeError("Load failed"));
  expect(out).toBe("Couldn't reach the Galley. Check your connection and try again.");
  expect(out).toBe(GALLEY_OFFLINE_HINT);
  expect(out).not.toContain("Load failed");
  expect(galleyHintFor(new Error("boom"))).toBe("Couldn't get a suggestion. Try again.");
  expect(galleyHintFor(new Error("boom"))).toBe(GALLEY_FAILED_HINT);
  const abort = new Error("x"); abort.name = "AbortError";
  expect(galleyHintFor(abort)).toBeNull();
  for (const reason of ["offline", "session_expired", "failed"]) expect(typeof GALLEY_HINTS[reason]).toBe("string");
});
