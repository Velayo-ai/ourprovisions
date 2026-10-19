/* eslint-disable testing-library/no-node-access, testing-library/no-container -- the
   deck and recipe view are read as raw DOM (button class + text), as in RecipeViewActions. */
// Run: CI=true npx react-scripts test --watchAll=false src/lib/mealLinks
//
// REPLANNING STARTS OVER (Dan, 2026-10-19 — the Beef and Broccoli repro). Proves, over
// an in-memory list_items / list_item_meals pair shaped like the dev rows of the repro:
//   - Remove with an item in the cart: this meal's link is gone, the item is still in
//     the cart (row, quantity, status untouched), another meal's link on it survives;
//   - Cooked it at R1: every live link of the meal is gone, the rows are untouched;
//   - a re-plan after either reads state A on the board, the library's stage, Home's
//     deck and the recipe view — through the real counts, derivation and renderers;
//   - close_cycle's 052 ready_at predicate (modelled on its inputs — no migration) can
//     no longer match the new placement;
//   - a failed release is a warning and leaves today's behaviour;
//   - the two shared paths (removeMealFromList, markCooked) call the release.
import { render } from "@testing-library/react";
import { fetchLiveMealLinks, linksToRelease, releaseMealLinks, rowCountsFromProvenance } from "./mealLinks";
import { boardCardState } from "./boardState";
import { recipeBlockFor } from "./recipePlan";

jest.mock("@splunk/otel-web", () => ({ __esModule: true, default: { init: () => {}, setGlobalAttributes: () => {} } }));
jest.mock("@splunk/otel-web-session-recorder", () => ({ __esModule: true, default: { init: () => {} } }));

// ---------------------------------------------------------------- a tiny PostgREST-shaped fake
function fakeDb(tables, { failDelete = false } = {}) {
  const writes = [];
  const from = (table) => {
    const q = { table, op: "select", filters: [], embed: null };
    const run = () => {
      if (q.op === "delete") {
        writes.push({ table, op: "delete", filters: q.filters });
        if (failDelete) return { data: null, error: { code: "42501", message: "permission denied" } };
        const before = tables[table].length;
        tables[table] = tables[table].filter((r) => !q.filters.every((f) => f(r)));
        return { data: null, error: null, count: before - tables[table].length };
      }
      let rows = tables[table].map((r) => ({ ...r }));
      if (q.embed) rows = rows.map((r) => ({ ...r, list_items: tables.list_items.find((li) => li.id === r.list_item_id) || null })).filter((r) => r.list_items);
      return { data: rows.filter((r) => q.filters.every((f) => f(r))), error: null };
    };
    const get = (r, col) => col.split(".").reduce((o, k) => (o == null ? o : o[k]), r);
    const chain = {
      select: (s) => { if (/list_items!inner/.test(s)) q.embed = "list_items"; return chain; },
      delete: () => { q.op = "delete"; return chain; },
      eq: (col, v) => { q.filters.push((r) => get(r, col) === v); return chain; },
      is: (col, v) => { q.filters.push((r) => (get(r, col) ?? null) === v); return chain; },
      in: (col, vs) => { q.filters.push((r) => vs.includes(get(r, col))); return chain; },
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return chain;
  };
  return { from, writes, tables };
}

// The repro, as the dev rows read at 22:13 UTC 2026-10-19 (names only for the reader).
const HH = "faadd8be-5772-4f8f-b5e4-2684ebd6f700";
const MEAL = { id: "af047d88-5df7-4019-8f85-50522fc5be97", kind: "meal", name: "Healthy Beef and Broccoli Stir-Fry", meal_ingredients: Array.from({ length: 10 }, (_, i) => ({ id: i })) };
const OTHER_MEAL = "11111111-2222-4333-8444-555555555555";
const NEW_CYCLE = "2f32aff5-0d90-4a6c-b9ee-6e3038faaa10";
const OLD_CYCLE = "1f23a730-957f-4888-8571-22f22a3e62aa";
const seed = () => ({
  list_items: [
    { id: "garlic", catalog_item_id: "c-garlic", household_id: HH, status: "bought", quantity: 1, deleted_at: null, cycle_id: NEW_CYCLE },
    { id: "broccoli", catalog_item_id: "c-broc", household_id: HH, status: "bought", quantity: 1, deleted_at: "2026-10-19T22:03:33Z", cycle_id: OLD_CYCLE },
    { id: "ginger", catalog_item_id: "c-ginger", household_id: HH, status: "pending", quantity: 1, deleted_at: null, cycle_id: NEW_CYCLE },
  ],
  list_item_meals: [
    { list_item_id: "garlic", meal_id: MEAL.id, quantity_contributed: 1, add_count: 1 },
    { list_item_id: "garlic", meal_id: OTHER_MEAL, quantity_contributed: 1, add_count: 1 },   // another meal needs garlic too
    { list_item_id: "broccoli", meal_id: MEAL.id, quantity_contributed: 1, add_count: 1 },    // archived: never a reader's row
    { list_item_id: "ginger", meal_id: MEAL.id, quantity_contributed: 1, add_count: 1 },
  ],
});

// fetchMealProvenance's shape (useProvisions): live links only, keyed by catalog item.
function provenanceOf(db) {
  const map = {};
  db.tables.list_item_meals.forEach((l) => {
    const li = db.tables.list_items.find((x) => x.id === l.list_item_id);
    if (!li || li.household_id !== HH || li.deleted_at != null) return;
    (map[li.catalog_item_id] = map[li.catalog_item_id] || []).push({ mealId: l.meal_id, status: li.status });
  });
  return map;
}
// close_cycle 052, modelled on its inputs: an OPEN placement is stamped when the meal has
// ≥ 1 link into the CLOSING cycle's rows and none of those rows is pending.
function wouldStampReady(db, { mealId, placement, closingCycle }) {
  if (placement.cooked_at || placement.skipped_at || placement.ready_at) return false;
  const rows = db.tables.list_item_meals.filter((l) => l.meal_id === mealId)
    .map((l) => db.tables.list_items.find((li) => li.id === l.list_item_id))
    .filter((li) => li && li.household_id === HH && li.cycle_id === closingCycle);
  return rows.length > 0 && !rows.some((li) => li.status === "pending");
}
const openPlacement = { sort_order: 26, ready_at: null, cooked_at: null, skipped_at: null };
const stateAfterReplan = (db) => boardCardState(MEAL, {
  placements: { [MEAL.id]: { sortOrder: 0, readyAt: null } },
  rows: rowCountsFromProvenance(provenanceOf(db)), mealById: {}, cookedIds: new Set(),
});

describe("the bug, as it was (no release)", () => {
  test("Garlic's surviving link reads R1 on re-plan, and the next wrap-up would stamp Ready", () => {
    const db = fakeDb(seed());
    db.tables.list_item_meals = db.tables.list_item_meals.filter((l) => !(l.meal_id === MEAL.id && l.list_item_id === "ginger")); // Remove's pending loop did this
    const st = stateAfterReplan(db);
    expect(st.line).toBe("1 of 1 in cart");
    expect(recipeBlockFor(st)).toMatchObject({ action: "cookIt", soft: "All in your cart" });
    expect(wouldStampReady(db, { mealId: MEAL.id, placement: openPlacement, closingCycle: NEW_CYCLE })).toBe(true);
  });
});

describe("Remove with an item in the cart", () => {
  test("the link goes; the item stays in the cart; another meal's link on it survives", async () => {
    const db = fakeDb(seed());
    // removeMealFromList's own read (status rides along), then its pending loop drops ginger's link:
    const links = await fetchLiveMealLinks(db, { householdId: HH, mealId: MEAL.id });
    db.tables.list_item_meals = db.tables.list_item_meals.filter((l) => !(l.meal_id === MEAL.id && l.list_item_id === "ginger"));
    const ids = linksToRelease(links, { onlyBought: true });
    expect(ids).toEqual(["garlic"]);                 // never the pending row (its own loop), never the archived one
    const before = JSON.stringify(db.tables.list_items);
    await expect(releaseMealLinks(db, { mealId: MEAL.id, listItemIds: ids })).resolves.toBe(1);
    expect(db.tables.list_item_meals.some((l) => l.meal_id === MEAL.id && l.list_item_id === "garlic")).toBe(false);
    expect(db.tables.list_item_meals.some((l) => l.meal_id === OTHER_MEAL && l.list_item_id === "garlic")).toBe(true);
    expect(JSON.stringify(db.tables.list_items)).toBe(before);   // row, quantity, status untouched
    expect(db.tables.list_items.find((li) => li.id === "garlic")).toMatchObject({ status: "bought", quantity: 1, deleted_at: null });
    expect(db.writes.every((w) => w.table === "list_item_meals")).toBe(true);
  });
});

describe("Cooked it at R1", () => {
  test("every live link of the meal goes; the rows are untouched", async () => {
    const db = fakeDb({
      list_items: [
        { id: "a", household_id: HH, catalog_item_id: "c-a", status: "bought", quantity: 2, deleted_at: null, cycle_id: NEW_CYCLE },
        { id: "b", household_id: HH, catalog_item_id: "c-b", status: "bought", quantity: 1, deleted_at: null, cycle_id: NEW_CYCLE },
      ],
      list_item_meals: [{ list_item_id: "a", meal_id: MEAL.id }, { list_item_id: "b", meal_id: MEAL.id }],
    });
    expect(recipeBlockFor(stateAfterReplan(db))).toMatchObject({ action: "cookIt", soft: "All in your cart" });   // R1 before the cook
    const before = JSON.stringify(db.tables.list_items);
    const live = await fetchLiveMealLinks(db, { householdId: HH, mealId: MEAL.id });
    await releaseMealLinks(db, { mealId: MEAL.id, listItemIds: linksToRelease(live) });
    expect(db.tables.list_item_meals.filter((l) => l.meal_id === MEAL.id)).toEqual([]);
    expect(JSON.stringify(db.tables.list_items)).toBe(before);
  });
});

describe("a re-plan after either reads state A everywhere", () => {
  const { OnDeckCard, RecipeView } = require("../App");
  async function afterRemove() {
    const db = fakeDb(seed());
    const links = await fetchLiveMealLinks(db, { householdId: HH, mealId: MEAL.id });
    db.tables.list_item_meals = db.tables.list_item_meals.filter((l) => !(l.meal_id === MEAL.id && l.list_item_id === "ginger"));
    await releaseMealLinks(db, { mealId: MEAL.id, listItemIds: linksToRelease(links, { onlyBought: true }) });
    return db;
  }
  async function afterCook() {
    const db = fakeDb(seed());
    db.tables.list_items.find((li) => li.id === "ginger").status = "bought";   // R1: all in the cart
    await releaseMealLinks(db, { mealId: MEAL.id, listItemIds: linksToRelease(await fetchLiveMealLinks(db, { householdId: HH, mealId: MEAL.id })) });
    return db;
  }
  test.each([["Remove", afterRemove], ["Cooked it", afterCook]])("after %s", async (_, make) => {
    const db = await make();
    const rows = rowCountsFromProvenance(provenanceOf(db));
    const st = stateAfterReplan(db);
    // board
    expect(st).toMatchObject({ planned: true, toBuy: false, ready: false, canAdd: true, chip: "Planned" });
    expect(st.line).toBe("Not on the list yet");
    // library stage (App's libraryStages: ready ? "ready" : toBuy ? "toBuy" : "planned")
    expect(st.ready ? "ready" : st.toBuy ? "toBuy" : "planned").toBe("planned");
    // recipe view
    expect(recipeBlockFor(st)).toEqual({ onWeek: true, soft: null, action: "addToShop", remove: "week" });
    const noop = () => {};
    const { container: rvBox, unmount: rvUnmount } = render(<RecipeView meal={MEAL} state={st} members={[]} cookCount={0} lastCookedAt={null} cookRows={null} links={null} tagsReady={false}
      addedThisPlan={false} viewerUserId={null} busy={false} onClose={noop} onEdit={noop} onPlan={noop} onAddToShop={noop} onCooked={noop} onRemove={noop} onSeeList={noop} />);
    expect(rvBox.querySelector(".rv-plan-row button").textContent).toBe("Add to Shop");
    rvUnmount();
    // Home deck (rendered: the board's derivation, verbatim)
    const { container: deckBox } = render(<OnDeckCard boardMeals={[MEAL]} boardCards={[MEAL]} placements={{ [MEAL.id]: { sortOrder: 0, readyAt: null } }} rows={rows}
      mealById={{}} cookedIds={new Set()} busyMealId={null} switching={false} holdNight={false}
      onAdd={noop} onView={noop} onLockIn={noop} onCooked={noop} onSkip={noop} onSwitch={noop} onLeftovers={noop} onOut={noop} onOther={noop} />);
    expect(deckBox.querySelector(".deck-primary").textContent).toBe("Add to Shop");
    // close_cycle 052 can no longer match the new placement at the next wrap-up
    expect(wouldStampReady(db, { mealId: MEAL.id, placement: openPlacement, closingCycle: NEW_CYCLE })).toBe(false);
  });
});

describe("a failed release is a warning, and today's behaviour stands", () => {
  test("releaseMealLinks rejects on a delete error; releaseLinksOrWarn warns and returns null, never throws", async () => {
    const db = fakeDb(seed(), { failDelete: true });
    await expect(releaseMealLinks(db, { mealId: MEAL.id, listItemIds: ["garlic"] })).rejects.toMatchObject({ code: "42501" });
    const { releaseLinksOrWarn } = require("../hooks/useProvisions");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await expect(releaseLinksOrWarn(db, { householdId: HH, mealId: MEAL.id, listItemIds: ["garlic"], path: "remove" })).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("meal_links_release_failed (remove)"), "permission denied");
    warn.mockRestore();
    expect(db.tables.list_item_meals.some((l) => l.meal_id === MEAL.id && l.list_item_id === "garlic")).toBe(true);   // the link stays
  });
  test("nothing to release is a no-op (no write)", async () => {
    const db = fakeDb(seed());
    await expect(releaseMealLinks(db, { mealId: MEAL.id, listItemIds: [] })).resolves.toBe(0);
    expect(db.writes).toEqual([]);
  });
});

describe("the shared paths call the release (source guard: the hook needs a live client)", () => {
  const src = require("fs").readFileSync(`${__dirname}/../hooks/useProvisions.js`, "utf8");
  const body = (name) => { const i = src.indexOf(`const ${name} = useCallback(`); return src.slice(i, src.indexOf("\n  }, [", i)); };
  test("removeMealFromList releases the in-cart links after its pending loop", () => {
    const b = body("removeMealFromList");
    expect(b).toMatch(/releaseLinksOrWarn\(db, \{[\s\S]*path: "remove"[\s\S]*linksToRelease\(links, \{ onlyBought: true \}\)/);
    expect(b.indexOf("releaseLinksOrWarn")).toBeGreaterThan(b.indexOf("for (const row of pending)"));
  });
  test("markCooked releases every live link after a successful cook_meal, before either success return", () => {
    const b = body("markCooked");
    const err = b.indexOf("if (err) {"), rel = b.indexOf('path: "cook", listItemIds: linksToRelease(live)'), noop = b.indexOf("if (cookedAt == null)");
    expect(err).toBeGreaterThan(-1);
    expect(rel).toBeGreaterThan(err);
    expect(noop).toBeGreaterThan(rel);
  });
  test("every Cooked it door goes through handleCookedMeal, which re-reads provenance", () => {
    const app = require("fs").readFileSync(`${__dirname}/../App.js`, "utf8");
    expect((app.match(/onCooked[=:]\s*\{?handleCookedMeal\}?/g) || []).length).toBe(3);   // board, Home deck, recipe view
    expect(app).toMatch(/const ok = await markCooked\(mealId\);[\s\S]{0,400}else await refreshProvenance\(\);/);
  });
});
