// SPEC_ask_setup_polish F3, held on the source: the Ask form's create writes the catalog row at once,
// match-first, and never touches the shopping list.
const fs = require("fs");
const path = require("path");

const app = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
const hook = fs.readFileSync(path.join(__dirname, "..", "hooks", "useProvisions.js"), "utf8");
const code = (s) => s.replace(/\/\/[^\n]*/g, "");
const body = (() => {
  const start = hook.indexOf("const createCatalogItemNow = useCallback(");
  const end = hook.indexOf("}, [findCatalogMatch, reportSuccess]);", start);
  return start < 0 || end < 0 ? "" : code(hook.slice(start, end));
})();

describe("createCatalogItemNow (F3)", () => {
  test("exists, is returned by the hook and taken by App", () => {
    expect(body).not.toBe("");
    expect(hook).toMatch(/materializePendingIngredients, createCatalogItemNow, addMealToList,/);
    expect(app).toMatch(/^\s*createCatalogItemNow,$/m);
  });
  test("match-first: findCatalogMatch before any insert, and a match returns that row", () => {
    expect(body).toMatch(/const match = findCatalogMatch\(trimmed\);\s*if \(match\) return match;/);
    expect(body.indexOf("findCatalogMatch(")).toBeLessThan(body.indexOf("insert_custom_catalog_item"));
  });
  test("no match: insert_custom_catalog_item with the household and the caller, then into the catalog Browse reads", () => {
    expect(body).toMatch(/rpc\("insert_custom_catalog_item", \{\s*p_name: trimmed,\s*p_category: category,\s*p_household_id: hh\.id,\s*p_created_by: internalUserIdRef\.current,\s*\}\)/);
    expect(body).toMatch(/setCatalogMap\(\(prev\) => \(\{ \.\.\.prev, \[trimmed\]: item \}\)\)/);
  });
  test("never the shopping list: no list_items, no quantity, no list RPC", () => {
    expect(body).not.toMatch(/list_items|adjust_list_item_quantity|adjustQty|insert_list_item|quantit/);
  });
  test("App wires it into the Ask screen with the New item sheet's aisles", () => {
    expect(app).toMatch(/onCreateItem=\{createCatalogItemNow\}/);
    expect(app).toMatch(/createCategories=\{categories\.filter\(\(cat\) => cat\.rawName !== "⭐ My Custom Items"\)/);
  });
});
