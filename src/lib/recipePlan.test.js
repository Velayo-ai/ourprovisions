import { planActionFor, leftToBuy } from "./recipePlan";

// boardCardState's flags for each board row, as the board computes them.
const notOnWeek = null;
const planned = { noShop: false, cooked: false, ready: false, planned: true, toBuy: false, canAdd: true };
const plannedNoShop = { noShop: false, cooked: false, ready: false, planned: true, toBuy: false, canAdd: false };
const toBuy = { noShop: false, cooked: false, ready: false, planned: false, toBuy: true, canAdd: false, rc: { total: 10, bought: 0 } };
const toBuyAllInCart = { ...toBuy, rc: { total: 10, bought: 10 } };

test("left to buy is the board's live rows minus the cart", () => {
  expect(leftToBuy(toBuy)).toBe(10);
  expect(leftToBuy({ ...toBuy, rc: { total: 13, bought: 11 } })).toBe(2);
  expect(leftToBuy(toBuyAllInCart)).toBe(0);
  expect(leftToBuy(null)).toBe(0);
});

test("To buy with everything in the cart follows D9 to Cooked it (A5 revision)", () => {
  expect(planActionFor(toBuyAllInCart)).toBe("cookIt");
});
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
