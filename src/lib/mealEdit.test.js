// Run: CI=true npx react-scripts test --watchAll=false src/lib/mealEdit
//
// The meal-edit link gap (Dan, 2026-10-19): when an edit drops an ingredient from a meal
// with live rows on Shop, today's Remove rule applies per ingredient — the SAME path
// (takeMealOffList + the in-cart link release), scoped to the dropped catalog items:
//   - a pending ingredient comes off Shop, and the card's "{n} left" drops;
//   - an in-cart one stays in the cart, unlinked from this meal;
//   - a shared item stays for the other meal (only this meal's share comes off);
//   - an ingredient the edit did NOT drop is untouched;
//   - an ingredient ADDED in the edit is not put on Shop.
// Run over an in-memory PostgREST-shaped fake with updates and the remove_list_item RPC.
import { takeMealOffList, droppedIngredientIds, linksToRelease, releaseMealLinks, rowCountsFromProvenance } from "./mealLinks";
import { boardCardState } from "./boardState";

const fs = require("fs");
const HH = "hh-1";
const MEAL = "meal-edit";
const OTHER = "meal-other";

function fakeDb(tables) {
  const writes = [];
  const get = (r, col) => col.split(".").reduce((o, k) => (o == null ? o : o[k]), r);
  const from = (table) => {
    const q = { op: "select", filters: [], embed: false, patch: null };
    const run = () => {
      const match = (r) => q.filters.every((f) => f(r));
      if (q.op === "delete") { writes.push({ table, op: "delete" }); tables[table] = tables[table].filter((r) => !match(r)); return { data: null, error: null }; }
      if (q.op === "update") { writes.push({ table, op: "update", patch: q.patch }); tables[table].forEach((r) => { if (match(r)) Object.assign(r, q.patch); }); return { data: null, error: null }; }
      let rows = tables[table].map((r) => ({ ...r }));
      if (q.embed) rows = rows.map((r) => ({ ...r, list_items: tables.list_items.find((li) => li.id === r.list_item_id) || null })).filter((r) => r.list_items);
      return { data: rows.filter(match), error: null };
    };
    const chain = {
      select: (s) => { q.embed = /list_items!inner/.test(s); return chain; },
      delete: () => { q.op = "delete"; return chain; },
      update: (patch) => { q.op = "update"; q.patch = patch; return chain; },
      eq: (col, v) => { q.filters.push((r) => get(r, col) === v); return chain; },
      is: (col, v) => { q.filters.push((r) => (get(r, col) ?? null) === v); return chain; },
      in: (col, vs) => { q.filters.push((r) => vs.includes(get(r, col))); return chain; },
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return chain;
  };
  // remove_list_item: soft-delete the household's live row for the catalog item (its links stay; readers filter deleted_at)
  const rpc = async (name, args) => {
    writes.push({ table: "rpc", op: name });
    const li = tables.list_items.find((r) => r.household_id === args.p_household_id && r.catalog_item_id === args.p_catalog_item_id && r.deleted_at == null);
    if (li) li.deleted_at = "2026-10-19T23:59:00Z";
    return { data: { removed: !!li }, error: null };
  };
  return { from, rpc, writes, tables };
}

// The meal before the edit: tomatoes (pending, only this meal), cheese (in the cart), onion (pending, shared
// with another meal), salt (pending, kept by the edit). The edit drops tomatoes, cheese and onion and ADDS basil.
const seed = () => ({
  list_items: [
    { id: "li-tom", household_id: HH, catalog_item_id: "c-tom", status: "pending", quantity: 2, deleted_at: null },
    { id: "li-cheese", household_id: HH, catalog_item_id: "c-cheese", status: "bought", quantity: 1, deleted_at: null },
    { id: "li-onion", household_id: HH, catalog_item_id: "c-onion", status: "pending", quantity: 3, deleted_at: null },
    { id: "li-salt", household_id: HH, catalog_item_id: "c-salt", status: "pending", quantity: 1, deleted_at: null },
  ],
  list_item_meals: [
    { list_item_id: "li-tom", meal_id: MEAL, quantity_contributed: 2 },
    { list_item_id: "li-cheese", meal_id: MEAL, quantity_contributed: 0 },
    { list_item_id: "li-onion", meal_id: MEAL, quantity_contributed: 1 },
    { list_item_id: "li-onion", meal_id: OTHER, quantity_contributed: 2 },
    { list_item_id: "li-salt", meal_id: MEAL, quantity_contributed: 1 },
  ],
});
const BEFORE = ["c-tom", "c-cheese", "c-onion", "c-salt"].map((c) => ({ catalog_item_id: c }));
const AFTER = ["c-salt", "c-basil"].map((c) => ({ catalog_item_id: c }));   // the edit's rows

// updateMeal's reconcile, as wired (takeMealOffListAndRelease): the one path, scoped, then the in-cart release.
async function reconcileEdit(db) {
  const dropped = droppedIngredientIds(BEFORE, AFTER);
  const links = await takeMealOffList(db, { householdId: HH, mealId: MEAL, catalogItemIds: dropped });
  await releaseMealLinks(db, { mealId: MEAL, listItemIds: linksToRelease(links, { onlyBought: true }) });
  return dropped;
}
const provenance = (db) => {
  const map = {};
  db.tables.list_item_meals.forEach((l) => {
    const li = db.tables.list_items.find((x) => x.id === l.list_item_id);
    if (!li || li.deleted_at != null) return;
    (map[li.catalog_item_id] = map[li.catalog_item_id] || []).push({ mealId: l.meal_id, status: li.status });
  });
  return map;
};
const row = (db, id) => db.tables.list_items.find((r) => r.id === id);
const linked = (db, id, meal = MEAL) => db.tables.list_item_meals.some((l) => l.list_item_id === id && l.meal_id === meal);

describe("droppedIngredientIds", () => {
  test("live before, absent after; an added ingredient is never returned; a re-added one is not dropped", () => {
    expect(droppedIngredientIds(BEFORE, AFTER)).toEqual(["c-tom", "c-cheese", "c-onion"]);
    expect(droppedIngredientIds([{ catalog_item_id: "a" }], [{ catalog_item_id: "a" }, { catalog_item_id: "b" }])).toEqual([]);
    expect(droppedIngredientIds([], AFTER)).toEqual([]);
  });
});

describe("an edit that drops ingredients takes them off Shop by Remove's rule", () => {
  test("a pending ingredient comes off Shop, and the card's {n} left drops", async () => {
    const db = fakeDb(seed());
    const meal = { id: MEAL, kind: "meal", name: "Pasta", meal_ingredients: AFTER };
    const left = () => { const rc = rowCountsFromProvenance(provenance(db))[MEAL]; return rc ? rc.total - rc.bought : 0; };
    expect(left()).toBe(3);                         // tomatoes, onion, salt (cheese is in the cart)
    await reconcileEdit(db);
    expect(row(db, "li-tom").deleted_at).not.toBeNull();   // off Shop (remove_list_item: fully spent)
    expect(linked(db, "li-tom")).toBe(false);
    expect(left()).toBe(1);                         // only salt remains to buy for this meal
    const st = boardCardState(meal, { placements: { [MEAL]: { readyAt: null } }, rows: rowCountsFromProvenance(provenance(db)), mealById: {}, cookedIds: new Set() });
    expect(st.line).toBe("1 to buy");
  });
  test("an in-cart ingredient stays in the cart, unlinked", async () => {
    const db = fakeDb(seed());
    await reconcileEdit(db);
    expect(row(db, "li-cheese")).toMatchObject({ status: "bought", quantity: 1, deleted_at: null });
    expect(linked(db, "li-cheese")).toBe(false);
  });
  test("a shared item stays for the other meal: only this meal's share comes off, its claim survives", async () => {
    const db = fakeDb(seed());
    await reconcileEdit(db);
    expect(row(db, "li-onion")).toMatchObject({ status: "pending", quantity: 2, deleted_at: null });   // 3 − this meal's 1
    expect(linked(db, "li-onion")).toBe(false);
    expect(linked(db, "li-onion", OTHER)).toBe(true);
  });
  test("an ingredient the edit kept is untouched; an added one is not put on Shop", async () => {
    const db = fakeDb(seed());
    await reconcileEdit(db);
    expect(row(db, "li-salt")).toMatchObject({ status: "pending", quantity: 1, deleted_at: null });
    expect(linked(db, "li-salt")).toBe(true);
    expect(db.tables.list_items.some((r) => r.catalog_item_id === "c-basil")).toBe(false);
    expect(db.writes.some((w) => w.op === "insert")).toBe(false);
  });
  test("Remove (no scope) still takes the whole meal off — the same function, unscoped", async () => {
    const db = fakeDb(seed());
    const links = await takeMealOffList(db, { householdId: HH, mealId: MEAL });
    await releaseMealLinks(db, { mealId: MEAL, listItemIds: linksToRelease(links, { onlyBought: true }) });
    expect(db.tables.list_item_meals.filter((l) => l.meal_id === MEAL)).toEqual([]);
    expect(row(db, "li-salt").deleted_at).not.toBeNull();
    expect(row(db, "li-cheese").deleted_at).toBeNull();
  });
  test("an empty scope is a no-op (no read, no write)", async () => {
    const db = fakeDb(seed());
    await expect(takeMealOffList(db, { householdId: HH, mealId: MEAL, catalogItemIds: [] })).resolves.toEqual([]);
    expect(db.writes).toEqual([]);
  });
});

describe("the wiring: one path, warned on failure (source guards — the hook needs a live client)", () => {
  const hook = fs.readFileSync(`${__dirname}/../hooks/useProvisions.js`, "utf8");
  const body = (name) => { const i = hook.indexOf(`const ${name} = useCallback(`); return hook.slice(i, hook.indexOf("\n  }, [", i)); };
  test("updateMeal reads the meal's ingredients before the rewrite and reconciles the dropped ones through the shared function", () => {
    const b = body("updateMeal");
    expect(b.indexOf('.select("catalog_item_id")')).toBeGreaterThan(-1);
    expect(b.indexOf('.select("catalog_item_id")')).toBeLessThan(b.indexOf('.update({ deleted_at: new Date().toISOString() })'));
    expect(b).toMatch(/const dropped = droppedIngredientIds\(before, rows\);/);
    expect(b).toMatch(/await takeMealOffListAndRelease\(db, hh, mealId, \{ catalogItemIds: dropped, path: "edit" \}\);/);
    expect(b).toMatch(/catch \(rErr\) \{\s+warnLinkRelease\(rErr, \{ householdId: hh\.id, mealId, path: "edit", links: dropped\.length \}\);/);
    expect(b).not.toMatch(/rpc\("add_meal_to_list"|addMealToList\(|lockIn\(/);   // an edit never adds to Shop
  });
  test("removeMealFromList goes through the same function; the pending loop exists once, in the lib", () => {
    expect(body("removeMealFromList")).toMatch(/await takeMealOffListAndRelease\(db, hh, mealId, \{ path: "remove" \}\);/);
    expect(hook).not.toMatch(/for \(const row of pending\)/);
    const lib = fs.readFileSync(`${__dirname}/mealLinks.js`, "utf8");
    expect((lib.match(/for \(const row of pending\)/g) || []).length).toBe(1);
  });
  test("App re-reads provenance after an edit, so {n} left moves at once", () => {
    const app = fs.readFileSync(`${__dirname}/../App.js`, "utf8");
    expect(app).toMatch(/if \(mealSheet\.mode === "edit"\) await refreshProvenance\(\);/);
  });
});
