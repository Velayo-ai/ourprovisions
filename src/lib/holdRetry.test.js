// Run: CI=true npx react-scripts test --watchAll=false src/lib
import { holdDelayMs, scheduleHoldRetry, HOLD_STEADY_MS } from "./holdRetry";

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

test("backoff is 1, 2, 4, 8, 16 s then every 30 s (Amendment 2026-09-27, A2)", () => {
  expect([1, 2, 3, 4, 5, 6, 7, 40].map(holdDelayMs)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  expect(holdDelayMs(0)).toBe(1000);
  expect(HOLD_STEADY_MS).toBe(30000);
});

test("the timer fires the retry once", () => {
  const retry = jest.fn();
  scheduleHoldRetry(2, retry);
  jest.advanceTimersByTime(1999);
  expect(retry).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(retry).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(60000);
  expect(retry).toHaveBeenCalledTimes(1);
});

test("`online` fires the retry immediately and disarms the timer", () => {
  const retry = jest.fn();
  scheduleHoldRetry(6, retry);
  window.dispatchEvent(new Event("online"));
  expect(retry).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(HOLD_STEADY_MS + 1);
  expect(retry).toHaveBeenCalledTimes(1);
});

test("visibilitychange → visible fires immediately; → hidden does not", () => {
  const retry = jest.fn();
  scheduleHoldRetry(3, retry);
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
  expect(retry).not.toHaveBeenCalled();
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
  expect(retry).toHaveBeenCalledTimes(1);
});

test("cancel disarms the timer and the listeners", () => {
  const retry = jest.fn();
  const cancel = scheduleHoldRetry(1, retry);
  cancel();
  jest.advanceTimersByTime(5000);
  window.dispatchEvent(new Event("online"));
  document.dispatchEvent(new Event("visibilitychange"));
  expect(retry).not.toHaveBeenCalled();
});
