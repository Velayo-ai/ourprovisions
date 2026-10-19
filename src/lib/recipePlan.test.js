import { planActionFor } from "./recipePlan";

// boardCardState's flags for each board row, as the board computes them.
const notOnWeek = null;
const planned = { noShop: false, cooked: false, ready: false, planned: true, toBuy: false, canAdd: true };
const plannedNoShop = { noShop: false, cooked: false, ready: false, planned: true, toBuy: false, canAdd: false };
const toBuy = { noShop: false, cooked: false, ready: false, planned: false, toBuy: true, canAdd: false };
const ready = { noShop: false, cooked: false, ready: true, planned: false, toBuy: false, canAdd: false };
const cooked = { noShop: false, cooked: true, ready: false, planned: false, toBuy: false, canAdd: false };

test("not on This Week offers Add", () => {
  expect(planActionFor(notOnWeek)).toBe("add");
});

test("planned with ingredients reads On This Week (un-plans)", () => {
  expect(planActionFor(planned)).toBe("onWeek");
});

test("planned with nothing to shop for offers Cooked it", () => {
  expect(planActionFor(plannedNoShop)).toBe("cookIt");
});

test("To buy is the inert stage word — never Cooked it (Ground Beef Tacos, 2026-10-18)", () => {
  // canAdd is false on every To-buy card; that alone must not read as "nothing to shop for".
  expect(planActionFor(toBuy)).toBe("toBuy");
  expect(planActionFor({ ...toBuy, canAdd: false })).toBe("toBuy");
});

test("ready offers Cooked it", () => {
  expect(planActionFor(ready)).toBe("cookIt");
});

test("cooked this load is the inert ✓ Cooked", () => {
  expect(planActionFor(cooked)).toBe("cooked");
});
