// SPEC_qty_increment §6.1 / §6.4 / Q10, held on the source: every quantity caller sends a delta or
// an explicit remove, and nothing in the client writes a list_items quantity total any more.
const fs = require("fs");
const path = require("path");

const app = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
const hook = fs.readFileSync(path.join(__dirname, "..", "hooks", "useProvisions.js"), "utf8");

const code = (s) => s.replace(/\/\/[^\n]*/g, "");   // comments may still name the old function

describe("§6.1 the hook: deltas only", () => {
  test("updateQty is gone from the hook, App.js and its props", () => {
    expect(code(hook)).not.toMatch(/\bupdateQty\b/);
    expect(code(app)).not.toMatch(/\bupdateQty\b|\bonUpdateQty\b/);
  });
  test("no client write of list_items.quantity: no .update({ quantity …}) and no insert_list_item", () => {
    for (const src of [hook]) {   // mealLinks joins in §6.5
      expect(code(src)).not.toMatch(/\.update\(\{\s*quantity\b/);
    }
    expect(code(hook)).not.toMatch(/rpc\("insert_list_item"/);
  });
  test("adjustQty sends the delta to adjust_list_item_quantity keyed by household + catalog item", () => {
    expect(hook).toMatch(/rpc\("adjust_list_item_quantity", \{\s*p_household_id: ctx\.hhId,\s*p_catalog_item_id: ctx\.cid,\s*p_delta: delta,\s*p_price_per_unit: price,\s*\}\)/);
  });
  test("item_added_to_list fires only on the RPC's inserted / revived (Q10), never from a guess", () => {
    expect(hook).toMatch(/if \(isListEntry\(result\)\) emitItemAdded\(ctx\);/);
    expect(code(hook)).not.toMatch(/hadLiveRow/);
  });
  test("removeItem is the explicit remove: remove_list_item", () => {
    const i = hook.indexOf("const removeItem = useCallback(");
    expect(i).toBeGreaterThan(-1);
    expect(hook.slice(i, hook.indexOf("}, []);", i))).toMatch(/rpc\("remove_list_item"/);
  });
  test("the poll merges quantities by stamp, not by an in-flight set alone (§6.3)", () => {
    expect(hook).toMatch(/const qtySeqAtStart = qtySeqRef\.current;/);
    expect(hook).toMatch(/setQuantities\(\(prev\) => mergePolledById\(prev, newQty, qtyBusyRef\.current, qtyTouchRef\.current, qtySeqAtStart\)\)/);
    expect(code(hook)).not.toMatch(/pendingQtyRef/);
  });
  test("both hook functions are returned", () => {
    expect(hook).toMatch(/adjustQty, removeItem, updatePrice, toggleChecked,/);
  });
});

describe("§6.4 the callers", () => {
  test("Browse row: Add +1, − is −1, + is +1", () => {
    expect(app).toMatch(/onAdjustQty\(item\.name, 1, rawCategory\); e\.currentTarget\.blur\(\); \}\}>Add<\/button>/);
    expect(app).toMatch(/onClick=\{\(\) => onAdjustQty\(item\.name, -1, rawCategory\)\}>−<\/button>/);
    expect(app).toMatch(/onClick=\{\(\) => onAdjustQty\(item\.name, 1, rawCategory\)\}>\+<\/button>/);
    expect((app.match(/onAdjustQty=\{adjustQty\}/g) || []).length).toBe(4);
  });
  test("search add (both branches) is +1", () => {
    const i = app.indexOf("const addSearchedItem = async");
    const fn = app.slice(i, app.indexOf("\n  };\n", i));
    expect((fn.match(/return adjustQty\(typed, 1, rawCategory\);/g) || []).length).toBe(2);
  });
  test("new-item form is +1 with its price", () => {
    expect(app).toMatch(/adjustQty\(name, 1, newItemCategory, price > 0 \? price : undefined\);/);
  });
  test("Shop add sheet is +1, not qtyFor + 1 (the server makes a bought row a new need)", () => {
    const i = app.indexOf("const handleShopAddResult = async");
    const fn = app.slice(i, app.indexOf("\n  };\n", i));
    expect(fn).toMatch(/await adjustQty\(item\.name, 1, item\.rawCategory\);/);
    expect(fn).not.toMatch(/qtyFor/);
  });
  test("landscape: tap-add +1, tap-undo −1, press-and-hold removeItem; the view gets onUndo and onRemove apart", () => {
    expect(app).toMatch(/const landscapeAdd = useCallback\(\(item\) => \{\s*landscapeAddedRef\.current\.add\(item\.name\);\s*adjustQty\(item\.name, 1, item\.rawCategory\);/);
    expect(app).toMatch(/const landscapeUndo = useCallback\(\(item\) => \{\s*landscapeAddedRef\.current\.delete\(item\.name\);\s*adjustQty\(item\.name, -1, item\.rawCategory\);/);
    expect(app).toMatch(/const landscapeRemove = useCallback\(\(item\) => \{\s*landscapeAddedRef\.current\.delete\(item\.name\);\s*removeItem\(item\.name\);/);
    expect(app).toMatch(/onAdd=\{landscapeAdd\} onUndo=\{landscapeUndo\} onRemove=\{landscapeRemove\}/);
  });
});
