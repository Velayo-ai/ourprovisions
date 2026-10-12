// Run: CI=true npx react-scripts test --watchAll=false src/lib/importErrors
import { classifyFetchFailure, IMPORT_HINTS, IMPORT_FAILED_TOAST, GALLEY_OFFLINE_TOAST, GALLEY_FAILED_TOAST } from "./importErrors";

// What the hook shows for a thrown error, as plain data: null for a cancel, the
// row hint for offline, the plain toast for anything else.
const copyFor = (err) => {
  const kind = classifyFetchFailure(err);
  if (kind === "aborted") return null;
  if (kind === "offline") return { hint: IMPORT_HINTS.offline };
  return { toast: IMPORT_FAILED_TOAST };
};

test("Safari's offline TypeError maps to the connection hint; the raw message never appears", () => {
  const err = new TypeError("Load failed");
  const out = copyFor(err);
  expect(out).toEqual({ hint: "Couldn't reach the reader. Check your connection and try again." });
  expect(JSON.stringify(out)).not.toContain("Load failed");
});

test("Chrome's and Firefox's wording map the same way, text never copied through", () => {
  for (const msg of ["Failed to fetch", "NetworkError when attempting to fetch resource."]) {
    const out = copyFor(new TypeError(msg));
    expect(out.hint).toBe(IMPORT_HINTS.offline);
    expect(JSON.stringify(out)).not.toContain(msg);
  }
});

test("AbortError (Never mind) stays silent", () => {
  const err = new DOMException("The user aborted a request.", "AbortError");
  expect(classifyFetchFailure(err)).toBe("aborted");
  expect(copyFor(err)).toBeNull();
  const plain = new Error("x"); plain.name = "AbortError";
  expect(copyFor(plain)).toBeNull();
});

test("any other error gets the plain toast, raw message kept out", () => {
  const err = new Error("Clerk: token refresh exploded (secret details)");
  const out = copyFor(err);
  expect(out).toEqual({ toast: "Couldn't read the recipe. Try again." });
  expect(JSON.stringify(out)).not.toContain("Clerk");
  expect(copyFor(null)).toEqual({ toast: IMPORT_FAILED_TOAST });
  expect(copyFor("string error")).toEqual({ toast: IMPORT_FAILED_TOAST });
});

test("the five hints are fixed copy and distinct", () => {
  const values = Object.values(IMPORT_HINTS);
  expect(values.length).toBe(5);
  expect(new Set(values).size).toBe(5);
  expect(IMPORT_HINTS.offline).not.toBe(IMPORT_HINTS.unreachable);
});

// The Galley's toast, as the hook now picks it: offline → connection copy, else plain.
const galleyToastFor = (err) => {
  const kind = classifyFetchFailure(err);
  if (kind === "aborted") return null;
  return kind === "offline" ? GALLEY_OFFLINE_TOAST : GALLEY_FAILED_TOAST;
};

test("Galley (pre-existing leak): a TypeError becomes the connection toast, raw text absent", () => {
  const out = galleyToastFor(new TypeError("Load failed"));
  expect(out).toBe("Couldn't reach the galley. Check your connection and try again.");
  expect(out).not.toContain("Load failed");
  expect(galleyToastFor(new Error("boom"))).toBe("Couldn't get a suggestion. Try again.");
  const abort = new Error("x"); abort.name = "AbortError";
  expect(galleyToastFor(abort)).toBeNull();
});
