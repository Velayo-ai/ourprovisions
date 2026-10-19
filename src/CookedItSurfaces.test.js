/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   each surface is read as raw DOM: which button, with which fixed copy. */
// Run: CI=true npx react-scripts test --watchAll=false src/CookedItSurfaces
//
// SPEC_recipe_view Amendment C2 (+ the 2026-10-19 clarification), rendered on all four
// surfaces that can offer Cooked it — the board card, the board's ⋯ menu, Home's deck and
// the recipe view — from ONE board state per row. Cooked it is offered only:
//   - when the placement is Ready (ready_at set by wrap-up), or
//   - when the meal has nothing to shop for, or
//   - when the meal was never added to Shop — the freezer-pizza exit, board ⋯ ONLY.
// Never before wrap-up: everything in the cart nudges "Wrap up →" (board card and recipe
// view, the same door to Shop).
import { render, fireEvent } from "@testing-library/react";
import { boardCardState } from "./lib/boardState";

jest.mock("@splunk/otel-web", () => ({ __esModule: true, default: { init: () => {}, setGlobalAttributes: () => {} } }));
jest.mock("@splunk/otel-web-session-recorder", () => ({ __esModule: true, default: { init: () => {} } }));
const { PlanBoard, OnDeckCard, RecipeView } = require("./App");

const MEAL = { id: "4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b", kind: "meal", name: "Big Salad", occasion: ["lunch"], instructions: "", attribution: "", created_by: null,
  meal_ingredients: [{ catalog_item_id: "c1", quantity_per_serving: 1, on_hand: false, catalog_items: { name: "Romaine" } }] };
const EMPTY = { ...MEAL, meal_ingredients: [] };
const noop = () => {};
const inputs = (m, { readyAt = null, total = 0, bought = 0, cooked = false } = {}) => ({
  placements: { [m.id]: { sortOrder: 0, readyAt } },
  rows: total ? { [m.id]: { total, bought } } : {},
  mealById: {},
  cookedIds: new Set(cooked ? [m.id] : []),
});
const cookedIt = (root) => Array.from(root.querySelectorAll("button")).filter((b) => b.textContent === "Cooked it").length;

function boardCard(m, inp) {
  const { container, unmount } = render(<PlanBoard meals={[m]} rows={inp.rows} placements={inp.placements} mealById={{}} cookedIds={inp.cookedIds}
    onOpen={noop} onSkip={noop} onCooked={noop} onLockIn={noop} onSeeList={noop} onReorder={noop} busyMealId={null} />);
  const card = cookedIt(container.querySelector(".board-actions") || container);
  const more = container.querySelector(".board-more");
  if (more) fireEvent.click(more);
  const menu = container.querySelector(".board-menu");
  const see = container.querySelector(".board-see")?.textContent ?? null;
  const out = { card, menu: menu ? cookedIt(menu) : 0, see };
  unmount();
  return out;
}
function deck(m, inp) {
  const cooked = inp.cookedIds.has(m.id);
  const { container, unmount } = render(<OnDeckCard boardMeals={cooked ? [] : [m]} boardCards={[m]} placements={inp.placements} rows={inp.rows} mealById={{}}
    cookedIds={inp.cookedIds} busyMealId={null} switching={false} holdNight={false}
    onAdd={noop} onView={noop} onLockIn={noop} onCooked={noop} onSkip={noop} onSwitch={noop} onLeftovers={noop} onOut={noop} onOther={noop} />);
  const n = cookedIt(container);
  unmount();
  return n;
}
function recipe(m, state) {
  const { container, unmount } = render(<RecipeView meal={m} state={state} members={[]} cookCount={0} lastCookedAt={null} cookRows={null} links={null}
    tagsReady={false} addedThisPlan={false} viewerUserId={null} busy={false}
    onClose={noop} onEdit={noop} onPlan={noop} onAddToShop={noop} onCooked={noop} onRemove={noop} onSeeList={noop} />);
  const row = container.querySelector(".rv-plan-row");
  const out = { n: cookedIt(row), main: row.querySelector("button")?.textContent ?? null };
  unmount();
  return out;
}

// [case, meal, inputs, board card, board ⋯, Home deck, recipe view]   (1 = offers Cooked it)
describe("C2: where Cooked it is offered, per surface", () => {
  test.each([
    ["A · planned, never added to Shop (freezer pizza)", MEAL, {},                                      0, 1, 0, 0],
    ["B · on the list, items left",                      MEAL, { total: 3, bought: 1 },                 0, 0, 0, 0],
    ["C1 · everything in the cart, not wrapped up",      MEAL, { total: 3, bought: 3 },                 0, 0, 0, 0],
    ["C · Ready (wrapped up)",                           MEAL, { readyAt: "2026-10-19T12:00:00Z" },     1, 0, 1, 1],
    ["C · nothing to shop for",                          EMPTY, {},                                     0, 1, 1, 1],
    ["D · cooked this load",                             MEAL, { cooked: true },                        0, 0, 0, 0],
  ])("%s", (_, m, o, card, menu, deckN, rv) => {
    const inp = inputs(m, o);
    const st = boardCardState(m, inp);
    const b = boardCard(m, inp);
    expect([b.card, b.menu, deck(m, inp), recipe(m, st).n]).toEqual([card, menu, deckN, rv]);
  });
  test("D · not on This Week: the recipe view offers + Add to This Week, never Cooked it", () => {
    expect(recipe(MEAL, null)).toEqual({ n: 0, main: "+ Add to This Week" });
  });
});

describe("C1: everything in the cart nudges to wrap up, in the same words on both surfaces", () => {
  test("board card at 0 left reads Wrap up →; with items left it reads See on list", () => {
    expect(boardCard(MEAL, inputs(MEAL, { total: 3, bought: 3 })).see).toBe("Wrap up →");
    expect(boardCard(MEAL, inputs(MEAL, { total: 3, bought: 1 })).see).toBe("See on list");
  });
  test("the recipe view's main action at 0 left is Wrap up →", () => {
    const inp = inputs(MEAL, { total: 3, bought: 3 });
    expect(recipe(MEAL, boardCardState(MEAL, inp)).main).toBe("Wrap up →");
  });
  test("the board and the recipe view agree in every state (B2, no exception)", () => {
    // [meal, inputs, the recipe view's main action, the board's own line for the same placement]
    const rows = [
      [MEAL, {}, "Add to Shop", "Not on the list yet"],
      [MEAL, { total: 3, bought: 1 }, "2 left to buy · See list →", "1 of 3 in cart"],
      [MEAL, { total: 3, bought: 3 }, "Wrap up →", "3 of 3 in cart"],
      [MEAL, { readyAt: "x" }, "Cooked it", "Everything's in — go cook"],
      [EMPTY, {}, "Cooked it", "Nothing to shop for"],
      [MEAL, { cooked: true }, "+ Plan again", ""],
    ];
    for (const [m, o, main, line] of rows) {
      const inp = inputs(m, o);
      const st = boardCardState(m, inp);
      expect([recipe(m, st).main, st.line]).toEqual([main, line]);
    }
  });
});
