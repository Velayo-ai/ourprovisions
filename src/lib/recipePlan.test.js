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

test("To buy with everything in the cart nudges to wrap up — never Cooked it before wrap-up (Amendment C, supersedes A5)", () => {
  expect(planActionFor(toBuyAllInCart)).toBe("wrapUp");
});
const ready = { noShop: false, cooked: false, ready: true, planned: false, toBuy: false, canAdd: false };
const cooked = { noShop: false, cooked: true, ready: false, planned: false, toBuy: false, canAdd: false };

test("not on This Week offers Add", () => {
  expect(planActionFor(notOnWeek)).toBe("add");
});

test("planned with ingredients maps to onWeek (the action block offers Add to Shop there)", () => {
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

// ---------------------------------------------------------------- Amendment B: the action block
// Built from boardCardState itself (src/lib/boardState.js, the board's ONE derivation) over the
// board's real inputs, so the view's block and the board card's line are proven on the SAME placement.
describe("recipeBlockFor agrees with the board card for the same placement", () => {
  const { boardCardState } = require("./boardState");
  const { recipeBlockFor, REMOVE_LABEL } = require("./recipePlan");
  const M = { id: "m1", kind: "meal", name: "Big Salad", meal_ingredients: [{ id: 1 }, { id: 2 }] };
  const EMPTY = { ...M, meal_ingredients: [] };
  const board = (meal, { readyAt = null, total = 0, bought = 0, cooked = false } = {}) => boardCardState(meal, {
    placements: { [meal.id]: { sortOrder: 0, readyAt } },
    rows: total ? { [meal.id]: { total, bought } } : {},
    mealById: {},
    cookedIds: new Set(cooked ? [meal.id] : []),
  });
  test.each([
    // [case, meal, inputs, board line, block]
    ["A · planned, not on the list", M, {}, "Not on the list yet", { onWeek: true, soft: null, action: "addToShop", remove: "week" }],
    ["B · on the list, 4 left", M, { total: 6, bought: 2 }, "2 of 6 in cart", { onWeek: true, soft: null, action: "toBuy", remove: "shop" }],
    ["B · on the list, none in the cart", M, { total: 6 }, "6 to buy", { onWeek: true, soft: null, action: "toBuy", remove: "shop" }],
    ["C1 · all in the cart, not wrapped up", M, { total: 6, bought: 6 }, "6 of 6 in cart", { onWeek: true, soft: "All in your cart", action: "wrapUp", remove: "shop" }],
    ["C · ready (wrapped up)", M, { readyAt: "2026-10-19T12:00:00Z" }, "Everything's in — go cook", { onWeek: true, soft: "Everything's in", action: "cookIt", remove: "week" }],
    ["C · nothing to shop for (R2)", EMPTY, {}, "Nothing to shop for", { onWeek: true, soft: "Nothing to shop for", action: "cookIt", remove: "week" }],
    ["D · cooked this load", M, { cooked: true }, "", { onWeek: false, soft: null, action: "cooked", remove: null }],
  ])("%s", (_, meal, inputs, line, block) => {
    const st = board(meal, inputs);
    expect(st.line).toBe(line);
    expect(recipeBlockFor(st)).toEqual(block);
    // R3: the quiet link's words are keyed on the same flag the board's ⋯ → Remove reads
    expect(block.remove === null || (block.remove === "shop") === st.toBuy).toBe(true);
  });
  test("D · not on This Week: no status, no remove, + Add to This Week", () => {
    expect(recipeBlockFor(null)).toEqual({ onWeek: false, soft: null, action: "add", remove: null });
  });
  test("the remove words are the board's ⋯ → Remove words, word for word", () => {
    expect(REMOVE_LABEL.shop).toBe("Remove (and take its items off Shop)");
    expect(REMOVE_LABEL.week).toBe("Remove from This Week");
  });
  test("B4 transitions, on the board's own state after each action", () => {
    // Add to Shop: A → B once the meal's rows are on the list
    expect(recipeBlockFor(board(M, {})).action).toBe("addToShop");
    expect(recipeBlockFor(board(M, { total: 3 })).action).toBe("toBuy");
    // buy everything → C1 (Wrap up →), wrap up → C (Cooked it)
    expect(recipeBlockFor(board(M, { total: 3, bought: 3 })).action).toBe("wrapUp");
    expect(recipeBlockFor(board(M, { readyAt: "2026-10-19T12:00:00Z" })).action).toBe("cookIt");
    expect(recipeBlockFor(board(M, { readyAt: "2026-10-19T12:00:00Z" })).soft).toBe("Everything's in");
    // Cooked it → D (+ Plan again); Remove → not on the week → D (+ Add to This Week)
    expect(recipeBlockFor(board(M, { cooked: true })).action).toBe("cooked");
    expect(recipeBlockFor(null).action).toBe("add");
  });
});
