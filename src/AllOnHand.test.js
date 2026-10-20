/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the prompt and the surfaces are read as raw DOM (button text, pressed state, attributes). */
// Run: CI=true npx react-scripts test --watchAll=false src/AllOnHand
//
// SPEC_all_on_hand (2026-10-19, Step 0 rulings). Proves:
//   - the 064 stamp rule (modelled on its inputs — the SQL lives in migrations/064, whose
//     dry run proves it on the database): all on hand → stamped; partly on hand, no
//     ingredients, a closed or already-ready placement, or a live linked row → not;
//   - a stamped placement reads "Everything's in" with Cooked it on the board card, Home's
//     deck and the recipe view; partly on hand is the normal To-buy (B); a re-plan
//     (appendPlacement) clears the stamp → state A; Remove from This Week → D;
//   - the prompt (D4): "Buy it ({qty})" / "I have it" (default), no "Remove from this meal",
//     the confirm reads "I have everything" when nothing is Buy it; no name or quantity in
//     any attribute;
//   - Add all's toast line; the client reloads placements after a 0 count.
import { render, fireEvent } from "@testing-library/react";
import { boardCardState } from "./lib/boardState";
import { recipeBlockFor } from "./lib/recipePlan";
import { addAllOnHandLine } from "./lib/onHand";

jest.mock("@splunk/otel-web", () => ({ __esModule: true, default: { init: () => {}, setGlobalAttributes: () => {} } }));
jest.mock("@splunk/otel-web-session-recorder", () => ({ __esModule: true, default: { init: () => {} } }));
const { OnHandPrompt, PlanBoard, OnDeckCard, RecipeView } = require("./App");
const fs = require("fs");
const noop = () => {};

// ---------------------------------------------------------------- the 064 rule, on its inputs
// v_count = ingredients processed: on_hand = false, or on hand and included this time.
function stamp({ ingredients, include = [], placement, liveLinks = 0 }) {
  const processed = ingredients.filter((i) => !i.deleted && (!i.onHand || include.includes(i.id))).length;
  const live = ingredients.some((i) => !i.deleted);
  const open = placement && !placement.cooked && !placement.skipped && !placement.ready;
  const stamped = processed === 0 && live && liveLinks === 0 && !!open;
  return { count: processed, stamped, event: stamped };   // the event row is written IF FOUND, i.e. only when stamped
}
const PIZZA = [{ id: "dough", onHand: true }, { id: "sauce", onHand: true }, { id: "cheese", onHand: true }, { id: "basil", onHand: true }];
const OPEN = { cooked: false, skipped: false, ready: false };

describe("064: when the add stamps the placement ready", () => {
  test.each([
    ["all on hand, nothing included", { ingredients: PIZZA, placement: OPEN }, { count: 0, stamped: true, event: true }],
    ["one bought (Buy it)", { ingredients: PIZZA, include: ["cheese"], placement: OPEN }, { count: 1, stamped: false, event: false }],
    ["partly on hand", { ingredients: [...PIZZA.slice(0, 2), { id: "x", onHand: false }], placement: OPEN }, { count: 1, stamped: false, event: false }],
    ["no live ingredient", { ingredients: [{ id: "a", onHand: true, deleted: true }], placement: OPEN }, { count: 0, stamped: false, event: false }],
    ["no open placement (cooked)", { ingredients: PIZZA, placement: { ...OPEN, cooked: true } }, { count: 0, stamped: false, event: false }],
    ["skipped placement", { ingredients: PIZZA, placement: { ...OPEN, skipped: true } }, { count: 0, stamped: false, event: false }],
    ["already ready (never re-stamped)", { ingredients: PIZZA, placement: { ...OPEN, ready: true } }, { count: 0, stamped: false, event: false }],
    ["a live linked row remains", { ingredients: PIZZA, placement: OPEN, liveLinks: 1 }, { count: 0, stamped: false, event: false }],
  ])("%s", (_, input, expected) => {
    expect(stamp(input)).toEqual(expected);
  });
  test("the migration implements exactly that rule (source guard on migrations/064)", () => {
    const sql = fs.readFileSync(`${__dirname}/../migrations/064_all_on_hand.sql`, "utf8");
    expect(sql).toMatch(/IF v_count = 0\s+AND EXISTS \(SELECT 1 FROM meal_ingredients\s+WHERE meal_id = p_meal_id AND deleted_at IS NULL\)\s+AND NOT EXISTS \(SELECT 1 FROM list_item_meals lim/);
    expect(sql).toMatch(/AND cooked_at IS NULL AND skipped_at IS NULL AND ready_at IS NULL;\s+-- D3[^\n]*\n\s+IF FOUND THEN\s+INSERT INTO meal_ready_events \(household_id, meal_id, source, created_by\)\s+VALUES \(v_household_id, p_meal_id, 'on_hand', v_user_id\);/);
    for (const role of ["public", "anon", "authenticated"]) expect(sql).toContain(`revoke all on table public.meal_ready_events from ${role};`);
    expect(sql).toContain("alter table public.meal_ready_events enable row level security;");
    expect(sql).not.toMatch(/create policy[^;]*meal_ready_events/i);
  });
});

// ---------------------------------------------------------------- the four surfaces
const MEAL = { id: "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d", kind: "meal", name: "Freezer Pizza Night", occasion: ["dinner"], instructions: "", attribution: "", created_by: null,
  meal_ingredients: PIZZA.map((p) => ({ catalog_item_id: p.id, quantity_per_serving: 1, on_hand: true, catalog_items: { name: p.id } })) };
const inputs = ({ readyAt = null, total = 0, bought = 0 } = {}) => ({
  placements: { [MEAL.id]: { sortOrder: 0, readyAt } }, rows: total ? { [MEAL.id]: { total, bought } } : {}, mealById: {}, cookedIds: new Set(),
});
const cookedIt = (root) => Array.from(root.querySelectorAll("button")).filter((b) => b.textContent === "Cooked it").length;
function surfaces(inp) {
  const st = boardCardState(MEAL, inp);
  const { container: bc, unmount: bu } = render(<PlanBoard meals={[MEAL]} rows={inp.rows} placements={inp.placements} mealById={{}} cookedIds={inp.cookedIds}
    onOpen={noop} onSkip={noop} onCooked={noop} onLockIn={noop} onSeeList={noop} onReorder={noop} busyMealId={null} />);
  const board = { cooked: cookedIt(bc.querySelector(".board-actions")), line: bc.querySelector(".board-line")?.textContent };
  bu();
  const { container: dc, unmount: du } = render(<OnDeckCard boardMeals={[MEAL]} boardCards={[MEAL]} placements={inp.placements} rows={inp.rows} mealById={{}} cookedIds={inp.cookedIds}
    busyMealId={null} switching={false} holdNight={false} onAdd={noop} onView={noop} onLockIn={noop} onCooked={noop} onSkip={noop} onSwitch={noop}
    onLeftovers={noop} onOut={noop} onOther={noop} />);
  const deck = cookedIt(dc);
  du();
  const onRemove = jest.fn();
  const { container: rc, unmount: ru } = render(<RecipeView meal={MEAL} state={st} members={[]} cookCount={0} lastCookedAt={null} cookRows={null} links={null} tagsReady={false}
    addedThisPlan={false} viewerUserId={null} busy={false} onClose={noop} onEdit={noop} onPlan={noop} onAddToShop={noop} onCooked={noop} onRemove={onRemove} onSeeList={noop} />);
  const row = rc.querySelector(".rv-plan-row");
  const recipe = { cooked: cookedIt(row), main: row.querySelector("button").textContent, status: row.querySelector(".rv-status")?.textContent ?? null };
  const remove = row.querySelector(".rv-remove");
  if (remove) fireEvent.click(remove);
  ru();
  return { st, board, deck, recipe, removeArgs: onRemove.mock.calls[0] || null };
}

describe("a stamped placement, everywhere", () => {
  test("all on hand → Everything's in, Cooked it on the board card, Home's deck and the recipe view", () => {
    const s = surfaces(inputs({ readyAt: "2026-10-19T23:30:00Z" }));
    expect(s.st).toMatchObject({ ready: true, toBuy: false, planned: false });
    expect(s.board).toEqual({ cooked: 1, line: "Everything's in — go cook" });
    expect(s.deck).toBe(1);
    expect(s.recipe).toEqual({ cooked: 1, main: "Cooked it", status: "✓ On This Week · Everything's in" });
  });
  test("Remove from This Week on a stamped meal is the board's Remove with toBuy false → the view goes to D", () => {
    const s = surfaces(inputs({ readyAt: "2026-10-19T23:30:00Z" }));
    expect(s.removeArgs).toEqual([MEAL.id, false]);
    expect(recipeBlockFor(null)).toMatchObject({ onWeek: false, action: "add" });   // placement closed → not on This Week
  });
  test("partly on hand → the normal To-buy (B), not stamped", () => {
    const s = surfaces(inputs({ total: 2 }));
    expect(s.st).toMatchObject({ ready: false, toBuy: true });
    expect(s.recipe.main).toBe("2 left to buy · See list →");
    expect([s.board.cooked, s.deck, s.recipe.cooked]).toEqual([0, 0, 0]);
  });
  test("a re-plan clears the stamp (appendPlacement writes ready_at: null) → state A", () => {
    const hook = fs.readFileSync(`${__dirname}/hooks/useProvisions.js`, "utf8");
    const i = hook.indexOf("async function appendPlacement(");
    expect(hook.slice(i, hook.indexOf("\n  }\n", i))).toMatch(/ready_at: null,/);
    const s = surfaces(inputs());
    expect(s.recipe.main).toBe("Add to Shop");
    expect([s.board.cooked, s.deck, s.recipe.cooked]).toEqual([0, 0, 0]);
  });
});

// ---------------------------------------------------------------- the prompt (D4)
const PROMPT = {
  mealId: MEAL.id, mealName: "Freezer Pizza Night", allOnHand: true,
  items: [{ catalog_item_id: "dough", name: "Pizza Dough", quantity_per_serving: 2 }, { catalog_item_id: "cheese", name: "Mozzarella", quantity_per_serving: 1 }],
  choices: { dough: "skip", cheese: "skip" },
};
const promptOf = (p, h = {}) => render(<OnHandPrompt prompt={p} onChoose={h.onChoose || noop} onCancel={h.onCancel || noop} onConfirm={h.onConfirm || noop} />);
const btn = (container, text) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === text);

describe("the on-hand prompt: one question, two answers", () => {
  test("Buy it ({qty}) / I have it, defaulting to I have it; no Remove from this meal", () => {
    const { container } = promptOf(PROMPT);
    const labels = Array.from(container.querySelectorAll(".onhand-row button")).map((b) => [b.textContent, b.getAttribute("aria-pressed")]);
    expect(labels).toEqual([["Buy it (2)", "false"], ["I have it", "true"], ["Buy it (1)", "false"], ["I have it", "true"]]);
    expect(container.textContent).not.toMatch(/Remove from this meal|removed from this meal|Removing takes it out/);
    expect(container.textContent).toContain("Buy it is just for this time — the ingredient stays on hand for next time.");
  });
  test("the confirm reads I have everything when nothing is Buy it, Add to Shop when anything is", () => {
    const { container: ac, unmount: au } = promptOf(PROMPT);
    expect(btn(ac, "I have everything")).toBeTruthy();
    expect(btn(ac, "Add to Shop")).toBeFalsy();
    au();
    const { container: bc } = promptOf({ ...PROMPT, choices: { dough: "include", cheese: "skip" } });
    expect(btn(bc, "Add to Shop")).toBeTruthy();
    expect(btn(bc, "I have everything")).toBeFalsy();
  });
  test("a partly-flagged meal (some ingredients not on hand) never offers I have everything — all I have it still adds the rest", () => {
    const { container } = promptOf({ ...PROMPT, allOnHand: false });
    expect(btn(container, "Add to Shop")).toBeTruthy();
    expect(btn(container, "I have everything")).toBeFalsy();
  });
  test("the prompt is told whether every live ingredient is in it (source guard: handleAddMealToList)", () => {
    const app = fs.readFileSync(`${__dirname}/App.js`, "utf8");
    expect(app).toMatch(/allOnHand: onHand\.length === \(meal\?\.meal_ingredients \|\| \[\]\)\.length,/);
  });
  test("taps report the choice by catalog id; confirm and cancel call through", () => {
    const h = { onChoose: jest.fn(), onConfirm: jest.fn(), onCancel: jest.fn() };
    const { container } = promptOf(PROMPT, h);
    fireEvent.click(btn(container, "Buy it (2)"));
    expect(h.onChoose).toHaveBeenCalledWith("dough", "include");
    fireEvent.click(btn(container, "I have everything"));
    expect(h.onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(btn(container, "Cancel"));
    expect(h.onCancel).toHaveBeenCalledTimes(1);
  });
  test("no item name or quantity in any attribute (replay)", () => {
    const { container } = promptOf(PROMPT);
    const attrs = [];
    container.querySelectorAll("*").forEach((el) => { for (const a of el.attributes) if (!(a.name === "title" || a.name === "alt" || a.name.startsWith("on"))) attrs.push(`${a.name}="${a.value}"`); });
    expect(attrs.length).toBeGreaterThan(5);
    expect(attrs.filter((x) => /Pizza|Dough|Mozzarella|Freezer|Buy it \(/i.test(x))).toEqual([]);
    expect(attrs.filter((x) => /^(aria-[a-z]+|id|class|data-[a-z-]+)="[^"]*\b[12]\b/.test(x))).toEqual([]);
  });
});

// ---------------------------------------------------------------- Add all + the client reload
describe("Add all and the placement reload", () => {
  test("the batch toast names the on-hand meals", () => {
    expect(addAllOnHandLine(3, 1)).toBe("3 meals added · 1 already on hand — ready to cook");
    expect(addAllOnHandLine(1, 2)).toBe("1 meal added · 2 already on hand — ready to cook");
    expect(addAllOnHandLine(0, 1)).toBe("1 already on hand — ready to cook");
  });
  test("addMealToList reloads placements after a 0 count; lockInAll counts the stamped meals from that reload", () => {
    const hook = fs.readFileSync(`${__dirname}/hooks/useProvisions.js`, "utf8");
    expect(hook).toMatch(/if \(!count\) await loadPlacements\(db, hh\);/);
    expect(hook).toMatch(/else if \(placementsRef\.current\[id\]\?\.readyAt\) readyOnHand \+= 1;/);
    expect(hook).not.toMatch(/const removeMealIngredients|removeMealIngredients\(/);
    const app = fs.readFileSync(`${__dirname}/App.js`, "utf8");
    expect(app).toMatch(/const \{ added: n, readyOnHand: m \} = await lockInAll\(ids\);/);
    expect(app).toContain(`if (!count) showToast("Everything's on hand — no trip needed.");`);
    expect(app).not.toMatch(/removeMealIngredients|"remove"\)/);
  });
});
