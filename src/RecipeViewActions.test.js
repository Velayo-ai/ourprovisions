/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the action block is audited as raw DOM (classes, roles, attributes), the way the
   replay recorder and click-text collection see it. */
// Run: CI=true npx react-scripts test --watchAll=false src/RecipeViewActions
//
// SPEC_recipe_view Amendment B + Step 0 rulings (2026-10-19), rendered:
//   - each state shows the mockup's three parts: a status line that is never a
//     control, ONE main action, the quiet remove link in the board's own words;
//   - each action calls the handler the view is handed, with the board's arguments
//     (Remove passes the card's toBuy, as the board's ⋯ → Remove does);
//   - the call site hands the view the board's OWN handlers (source guard: the
//     wiring lives inside ProvisionsApp, which cannot render alone);
//   - the old ✓ On This Week pill is gone; the count-bearing button is .rv-see.
import { render, fireEvent } from "@testing-library/react";
import { computeAccessibleName } from "dom-accessibility-api";
import { boardCardState } from "./lib/boardState";

jest.mock("@splunk/otel-web", () => ({ __esModule: true, default: { init: () => {}, setGlobalAttributes: () => {} } }));
jest.mock("@splunk/otel-web-session-recorder", () => ({ __esModule: true, default: { init: () => {} } }));
const { RecipeView } = require("./App");

const MEAL = {
  id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a", kind: "meal", name: "Grilled Shrimp With Chimichurri",
  occasion: ["dinner"], instructions: "1. Grill.\n2. Serve.", attribution: "", created_by: null,
  meal_ingredients: [
    { catalog_item_id: "c1", quantity_per_serving: 2, on_hand: false, catalog_items: { name: "Shrimp" } },
    { catalog_item_id: "c2", quantity_per_serving: 1, on_hand: false, catalog_items: { name: "Parsley" } },
  ],
};
const EMPTY = { ...MEAL, meal_ingredients: [] };
const stateOf = (meal, { readyAt = null, total = 0, bought = 0, cooked = false } = {}) => boardCardState(meal, {
  placements: { [meal.id]: { sortOrder: 0, readyAt } },
  rows: total ? { [meal.id]: { total, bought } } : {},
  mealById: {},
  cookedIds: new Set(cooked ? [meal.id] : []),
});

function view(meal, state, over = {}) {
  const h = { onPlan: jest.fn(), onAddToShop: jest.fn(), onCooked: jest.fn(), onRemove: jest.fn(), onSeeList: jest.fn(), onClose: jest.fn(), onEdit: jest.fn() };
  const utils = render(
    <RecipeView meal={meal} state={state} members={[]} cookCount={0} lastCookedAt={null} cookRows={null} links={null}
      tagsReady={false} addedThisPlan={false} viewerUserId={null} busy={false} {...h} {...over} />,
  );
  const row = utils.container.querySelector(".rv-plan-row");
  return { ...utils, h, row };
}
const status = (row) => row.querySelector(".rv-status")?.textContent ?? null;
const buttons = (row) => Array.from(row.querySelectorAll("button"));

describe("the four states (and R1 / R2) render the mockup's three parts", () => {
  test.each([
    ["A · planned, not on the list", MEAL, {}, "✓ On This Week", ["rv-plan add", "Add to Shop"], "Remove from This Week"],
    ["B · on the list, 4 left", MEAL, { total: 6, bought: 2 }, "✓ On This Week", ["rv-see", "4 left to buy · See list →"], "Remove (and take its items off Shop)"],
    ["R1 · all in the cart", MEAL, { total: 6, bought: 6 }, "✓ On This Week · All in your cart", ["rv-plan teal", "Cooked it"], "Remove (and take its items off Shop)"],
    ["C · ready", MEAL, { readyAt: "2026-10-19T12:00:00Z" }, "✓ On This Week · Everything's in", ["rv-plan teal", "Cooked it"], "Remove from This Week"],
    ["C · nothing to shop for", EMPTY, {}, "✓ On This Week · Nothing to shop for", ["rv-plan teal", "Cooked it"], "Remove from This Week"],
  ])("%s", (_, meal, inputs, statusText, [cls, main], removeText) => {
    const { row } = view(meal, stateOf(meal, inputs));
    expect(status(row)).toBe(statusText);
    const [primary, quiet, ...rest] = buttons(row);
    expect(rest).toEqual([]);   // never two equal buttons: one main action + the quiet link
    expect(primary.className).toBe(cls);
    expect(primary.textContent).toBe(main);
    expect(quiet.className).toBe("rv-remove");
    expect(quiet.textContent).toBe(removeText);
    // status is text, never a control
    const st = row.querySelector(".rv-status");
    expect(st.closest("button")).toBeNull();
    expect(st.hasAttribute("role")).toBe(false);
    expect(st.hasAttribute("tabindex")).toBe(false);
  });
  test("D · not on This Week: + Add to This Week, no status, no remove", () => {
    const { row } = view(MEAL, null);
    expect(status(row)).toBeNull();
    expect(buttons(row).map((b) => [b.className, b.textContent])).toEqual([["rv-plan add", "+ Add to This Week"]]);
  });
  test("D · cooked this load: + Plan again, no status, no remove", () => {
    const { row } = view(MEAL, stateOf(MEAL, { cooked: true }));
    expect(status(row)).toBeNull();
    expect(buttons(row).map((b) => [b.className, b.textContent])).toEqual([["rv-plan add", "+ Plan again"]]);
  });
  test("the old ✓ On This Week pill is gone in every state", () => {
    for (const st of [null, stateOf(MEAL), stateOf(MEAL, { total: 3 }), stateOf(MEAL, { total: 3, bought: 3 }), stateOf(MEAL, { readyAt: "x" }), stateOf(EMPTY), stateOf(MEAL, { cooked: true })]) {
      const { container, unmount } = view(MEAL, st);
      expect(container.querySelector(".rv-plan.on, .rv-plan.see")).toBeNull();
      buttons(container).forEach((b) => expect(b.textContent).not.toMatch(/✓ On This Week/));
      unmount();
    }
  });
});

describe("each action calls its handler with the board's arguments", () => {
  test("A · Add to Shop → onAddToShop(mealId); Remove → onRemove(mealId, false)", () => {
    const { row, h } = view(MEAL, stateOf(MEAL));
    fireEvent.click(buttons(row)[0]);
    expect(h.onAddToShop).toHaveBeenCalledWith(MEAL.id);
    fireEvent.click(buttons(row)[1]);
    expect(h.onRemove).toHaveBeenCalledWith(MEAL.id, false);
    expect(h.onPlan).not.toHaveBeenCalled();
  });
  test("B · See list → onSeeList(); Remove → onRemove(mealId, true) — the items come off Shop", () => {
    const { row, h } = view(MEAL, stateOf(MEAL, { total: 6, bought: 2 }));
    fireEvent.click(buttons(row)[0]);
    expect(h.onSeeList).toHaveBeenCalledTimes(1);
    fireEvent.click(buttons(row)[1]);
    expect(h.onRemove).toHaveBeenCalledWith(MEAL.id, true);
  });
  test("R1 / C · Cooked it → onCooked(mealId); R1's Remove follows toBuy (true), C's is false", () => {
    const r1 = view(MEAL, stateOf(MEAL, { total: 6, bought: 6 }));
    fireEvent.click(buttons(r1.row)[0]);
    expect(r1.h.onCooked).toHaveBeenCalledWith(MEAL.id);
    fireEvent.click(buttons(r1.row)[1]);
    expect(r1.h.onRemove).toHaveBeenCalledWith(MEAL.id, true);
    r1.unmount();
    const c = view(MEAL, stateOf(MEAL, { readyAt: "x" }));
    fireEvent.click(buttons(c.row)[1]);
    expect(c.h.onRemove).toHaveBeenCalledWith(MEAL.id, false);
  });
  test("D · + Plan again / + Add to This Week → onPlan(mealId)", () => {
    const a = view(MEAL, stateOf(MEAL, { cooked: true }));
    fireEvent.click(buttons(a.row)[0]);
    expect(a.h.onPlan).toHaveBeenCalledWith(MEAL.id);
    a.unmount();
    const b = view(MEAL, null);
    fireEvent.click(buttons(b.row)[0]);
    expect(b.h.onPlan).toHaveBeenCalledWith(MEAL.id);
  });
  test("busy disables the main action and the remove link (See list is navigation, never disabled)", () => {
    const { row } = view(MEAL, stateOf(MEAL), { busy: true });
    expect(buttons(row).every((b) => b.disabled)).toBe(true);
    const b = view(MEAL, stateOf(MEAL, { total: 6 }), { busy: true });
    expect(b.row.querySelector(".rv-see").disabled).toBe(false);
  });
  test("B4: the view follows the state in place (rerender with the board's next state)", () => {
    const { row, rerender, h } = view(MEAL, stateOf(MEAL));
    const props = (st) => ({ meal: MEAL, state: st, members: [], cookCount: 0, lastCookedAt: null, cookRows: null, links: null, tagsReady: false, addedThisPlan: false, viewerUserId: null, busy: false, ...h });
    expect(buttons(row)[0].textContent).toBe("Add to Shop");
    rerender(<RecipeView {...props(stateOf(MEAL, { total: 2 }))} />);
    expect(buttons(row)[0].textContent).toBe("2 left to buy · See list →");
    rerender(<RecipeView {...props(stateOf(MEAL, { total: 2, bought: 2 }))} />);
    expect(buttons(row)[0].textContent).toBe("Cooked it");
    rerender(<RecipeView {...props(stateOf(MEAL, { cooked: true }))} />);
    expect(buttons(row)[0].textContent).toBe("+ Plan again");
    rerender(<RecipeView {...props(null)} />);
    expect(buttons(row)[0].textContent).toBe("+ Add to This Week");
  });
  test("accessible names are the visible fixed copy (no aria-label on the block)", () => {
    const { row } = view(MEAL, stateOf(MEAL, { total: 6, bought: 2 }));
    expect(buttons(row).map((b) => computeAccessibleName(b))).toEqual(["4 left to buy · See list →", "Remove (and take its items off Shop)"]);
    row.querySelectorAll("*").forEach((el) => expect(el.hasAttribute("aria-label")).toBe(false));
  });
});

describe("the call site hands the view the board's OWN handlers (B3)", () => {
  const fs = require("fs");
  const app = fs.readFileSync(`${__dirname}/App.js`, "utf8");
  const tagBlock = (name) => { const i = app.indexOf(`<${name}\n`); return app.slice(i, app.indexOf("/>", i)); };
  test("PlanBoard and RecipeView take the same three handlers", () => {
    const board = tagBlock("PlanBoard"), rv = tagBlock("RecipeView");
    expect(board).toMatch(/onLockIn=\{handleAddMealToList\}/);
    expect(board).toMatch(/onCooked=\{handleCookedMeal\}/);
    expect(board).toMatch(/onSkip=\{handleSkipMeal\}/);
    expect(rv).toMatch(/onAddToShop=\{handleAddMealToList\}/);
    expect(rv).toMatch(/onCooked=\{handleCookedMeal\}/);
    expect(rv).toMatch(/onRemove=\{handleSkipMeal\}/);
    expect(rv).not.toMatch(/handleUnplanMeal/);
  });
  test("the view steps aside while the on-hand prompt is open (R5)", () => {
    expect(app).toMatch(/\{MEALS_ENABLED && rvMeal && !mealSheet && !onHandPrompt && \(\s*<RecipeView/);
  });
});
