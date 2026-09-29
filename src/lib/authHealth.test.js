// The authHealth Node check (SPEC_auth_state_ui_gating.md). First run ad hoc on
// 2026-09-24 (sixteen assertions: offline closes the gate, failures never close
// it, a refusal holds then lapses, the classifier, reset); committed and extended
// 2026-09-27 for Amendment 2 / A1 — the shared transient vocabulary.
//
// Run: CI=true npx react-scripts test --watchAll=false src/lib
import {
  classifyTokenFailure,
  reportToken,
  reportAuthRejected,
  resetAuthHealth,
  getAuthHealth,
  isPollingOpen,
  REJECTED_HOLD_MS,
} from "./authHealth";
import { classifyFetchError, classifyAuthFailure } from "./classifyFetchError";
import { AuthTokenMissing } from "./supabaseClient";
import { TRANSIENT_NETWORK_PHRASES, splitErrorMessage } from "./transientPhrases";

function setOnLine(value) {
  Object.defineProperty(window.navigator, "onLine", { value, configurable: true });
}
function goOffline() { setOnLine(false); window.dispatchEvent(new Event("offline")); }
function goOnline() { setOnLine(true); window.dispatchEvent(new Event("online")); }

beforeEach(() => {
  goOnline();
  resetAuthHealth();
});

// ── the polling gate ────────────────────────────────────────────────────────
describe("isPollingOpen — the gate every poll tick runs through", () => {
  test("open by default, online", () => {
    expect(getAuthHealth().online).toBe(true);
    expect(isPollingOpen()).toBe(true);
  });

  test("offline closes the gate; online reopens it", () => {
    goOffline();
    expect(getAuthHealth().online).toBe(false);
    expect(isPollingOpen()).toBe(false);
    goOnline();
    expect(isPollingOpen()).toBe(true);
  });

  // Amendment 2026-09-27, A4 — a suspended PWA misses the `offline` event.
  test("A4: navigator.onLine false with NO event closes the gate and resyncs the store", () => {
    setOnLine(false);                       // no `offline` event dispatched
    expect(getAuthHealth().online).toBe(true);
    expect(isPollingOpen()).toBe(false);
    expect(getAuthHealth().online).toBe(false);   // the pill now reads Reconnecting…
    setOnLine(true);                        // no `online` event either
    expect(isPollingOpen()).toBe(true);
    expect(getAuthHealth().online).toBe(true);
  });

  test("A4: visibilitychange → visible resyncs `online` from navigator", () => {
    setOnLine(false);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(getAuthHealth().online).toBe(false);
    setOnLine(true);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(getAuthHealth().online).toBe(false);   // hidden: no resync
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(getAuthHealth().online).toBe(true);
  });

  test("token failures of either class NEVER close the gate (a hold, not a loss)", () => {
    reportToken(false, "network");
    reportToken(false, "network");
    reportToken(false, "clerk");
    const s = getAuthHealth();
    expect(s.nullStreak).toBe(3);
    expect(s.clerkFailStreak).toBe(1);
    expect(s.lastFailClass).toBe("clerk");
    expect(isPollingOpen()).toBe(true);
  });

  test("a good token resets the streaks", () => {
    reportToken(false, "network");
    reportToken(true);
    const s = getAuthHealth();
    expect(s.nullStreak).toBe(0);
    expect(s.clerkFailStreak).toBe(0);
    expect(s.lastFailClass).toBe(null);
    expect(s.lastTokenAt).not.toBe(null);
  });

  test("a 401/403 with a token attached holds for REJECTED_HOLD_MS, then lapses and clears itself", () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(1_000_000);
    reportAuthRejected(401);
    expect(getAuthHealth().rejectedStatus).toBe(401);
    expect(isPollingOpen()).toBe(false);
    now.mockReturnValue(1_000_000 + REJECTED_HOLD_MS - 1);
    expect(isPollingOpen()).toBe(false);
    now.mockReturnValue(1_000_000 + REJECTED_HOLD_MS);
    expect(isPollingOpen()).toBe(true);
    expect(getAuthHealth().rejectedAt).toBe(null);
    now.mockRestore();
  });

  test("resetAuthHealth (a new Clerk session) wipes streaks and the refusal, keeps online", () => {
    reportToken(false, "clerk");
    reportAuthRejected(403);
    resetAuthHealth();
    const s = getAuthHealth();
    expect(s.nullStreak).toBe(0);
    expect(s.rejectedAt).toBe(null);
    expect(s.online).toBe(true);
  });
});

// ── the token-failure classifier ────────────────────────────────────────────
describe("classifyTokenFailure — network vs Clerk-reported", () => {
  test("null / API error → clerk", () => {
    expect(classifyTokenFailure(null)).toBe("clerk");
    expect(classifyTokenFailure(new Error("Clerk: session not found"))).toBe("clerk");
  });
  test("a browser TypeError → network", () => {
    expect(classifyTokenFailure(new TypeError("Failed to fetch"))).toBe("network");
  });
  test("navigator.onLine false → network regardless of the error", () => {
    goOffline();
    expect(classifyTokenFailure(new Error("anything"))).toBe("network");
  });
  test("WebKit and Chrome phrases → network via the shared list", () => {
    expect(classifyTokenFailure({ message: "Load failed" })).toBe("network");
    expect(classifyTokenFailure({ message: "Failed to fetch" })).toBe("network");
  });
});

// ── A1: the fetch-error classifier and the shared vocabulary ────────────────
describe("classifyFetchError — Amendment 2026-09-27 A1", () => {
  test("a nameless postgrest object with 'TypeError: Load failed' (iOS) → transient", () => {
    expect(classifyFetchError({ message: "TypeError: Load failed", details: "", hint: "", code: "" })).toBe("transient");
  });
  test("'Failed to fetch' (Chrome), named and nameless → transient", () => {
    expect(classifyFetchError(new TypeError("Failed to fetch"))).toBe("transient");
    expect(classifyFetchError({ message: "TypeError: Failed to fetch" })).toBe("transient");
  });
  test("a bare WebKit TypeError('Load failed') → transient", () => {
    expect(classifyFetchError(new TypeError("Load failed"))).toBe("transient");
  });
  test("a PostgREST 42501 (RLS refusal) → real", () => {
    expect(classifyFetchError({ message: "permission denied for table households", code: "42501" })).toBe("real");
    expect(classifyFetchError({ message: "not a member of this household", code: "42501" })).toBe("real");
  });
  test("a generic TypeError that is not network → real", () => {
    expect(classifyFetchError({ message: "TypeError: Cannot read properties of undefined" })).toBe("real");
    expect(classifyFetchError(new TypeError("x is not a function"))).toBe("real");
  });
  test("AbortError, named or nameless → transient", () => {
    const abort = new Error("The operation was aborted"); abort.name = "AbortError";
    expect(classifyFetchError(abort)).toBe("transient");
    expect(classifyFetchError({ message: "AbortError: The operation was aborted" })).toBe("transient");
  });
  test("'JWT not yet valid' stays transient (clock skew); a JWT expired is real", () => {
    expect(classifyFetchError({ message: "JWT not yet valid" })).toBe("transient");
    expect(classifyFetchError({ message: "JWT expired" })).toBe("real");
  });
  test("no error → real", () => {
    expect(classifyFetchError(null)).toBe("real");
  });

  test("both classifiers read ONE list, and it holds both browsers' phrases", () => {
    expect(TRANSIENT_NETWORK_PHRASES).toEqual(expect.arrayContaining(["Load failed", "Failed to fetch"]));
    for (const phrase of TRANSIENT_NETWORK_PHRASES) {
      expect(classifyFetchError({ message: `TypeError: ${phrase}` })).toBe("transient");
      expect(classifyTokenFailure({ message: phrase })).toBe("network");
    }
  });

  test("splitErrorMessage reads the named and the nameless shape alike", () => {
    expect(splitErrorMessage({ message: "TypeError: Load failed" })).toEqual({ name: "TypeError", message: "Load failed" });
    expect(splitErrorMessage(new TypeError("Load failed"))).toEqual({ name: "TypeError", message: "Load failed" });
    expect(splitErrorMessage({ message: "permission denied" })).toEqual({ name: "", message: "permission denied" });
    expect(splitErrorMessage(null)).toEqual({ name: "", message: "" });
  });
});

// ── auth failures are a class of their own, checked before transient/real ──
describe("classifyAuthFailure", () => {
  test("401/403 with a token → rejected", () => {
    expect(classifyAuthFailure({ message: "JWT expired" }, 401)).toBe("rejected");
    expect(classifyAuthFailure({ message: "permission denied" }, 403)).toBe("rejected");
  });
  test("the wrapper's refusal (AuthTokenMissing, thrown or postgrest-wrapped) → missing", () => {
    expect(classifyAuthFailure(new AuthTokenMissing("network"), 0)).toBe("missing");
    expect(classifyAuthFailure({ message: "AuthTokenMissing: no Clerk token (network) — refusing to query as anon", code: "" }, 0)).toBe("missing");
  });
  test("a transport failure is NOT an auth failure — the fetch classifier decides", () => {
    expect(classifyAuthFailure({ message: "TypeError: Load failed" }, 0)).toBe(null);
  });
});
