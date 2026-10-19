import { cookDate, cookHistoryLine } from "./cookDate";

// "now" is Sunday 2026-10-18, 19:30 local.
const now = new Date(2026, 9, 18, 19, 30);
const at = (y, m, d, h = 18) => new Date(y, m - 1, d, h).toISOString();

test("a cook today reads tonight, whatever the hour", () => {
  expect(cookDate(at(2026, 10, 18, 9), now)).toBe("tonight");
  expect(cookDate(at(2026, 10, 18, 23), now)).toBe("tonight");
});

test("yesterday, then the weekday inside the last week", () => {
  expect(cookDate(at(2026, 10, 17), now)).toBe("yesterday");
  expect(cookDate(at(2026, 10, 16), now)).toBe("Friday");
  expect(cookDate(at(2026, 10, 12), now)).toBe("Monday");
});

test("a week or more ago reads weekday + date; another year adds the year", () => {
  expect(cookDate(at(2026, 10, 11), now)).toBe("Sun, Oct 11");
  expect(cookDate(at(2026, 9, 27), now)).toBe("Sun, Sep 27");
  expect(cookDate(at(2025, 12, 25), now)).toBe("Thu, Dec 25, 2025");
});

test("a bad date renders nothing", () => {
  expect(cookDate("nope", now)).toBe("");
  expect(cookDate(null, now)).toBe("");
});

test("the cook line: once says the date only, 2+ adds the count, never-cooked says nothing", () => {
  expect(cookHistoryLine(at(2026, 10, 18), 1, now)).toBe("Last cooked tonight");
  expect(cookHistoryLine(at(2026, 9, 27), 3, now)).toBe("Last cooked Sun, Sep 27 · 3 times");
  expect(cookHistoryLine(null, 0, now)).toBe("");
  expect(cookHistoryLine(at(2026, 10, 18), 0, now)).toBe("");
});
