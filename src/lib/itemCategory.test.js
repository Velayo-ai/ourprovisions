/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the select's options are read as raw DOM (count, value, selected). */
import { render, screen } from "@testing-library/react";
import { EditItemCategoryField } from "../components/EditItemCategoryField";
import { editCategoryOptions, updateItemCategory, applyItemCategory, saveItemEdits } from "./itemCategory";

// Edit item → Category (2026-11-05). CATEGORY_ORDER is read from App.js, so the picker is tested
// against the list that ships.
const fs = require("fs");
const path = require("path");
const APP = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
const CATEGORY_ORDER = JSON.parse(`[${APP.match(/const CATEGORY_ORDER = \[([^\]]*)\]/)[1]}]`);

const cat = (rawName) => ({ rawName, name: rawName, items: [] });
// What the categories memo hands over: standard ones with items on view, then the household's own.
const CATEGORIES = [cat("Produce"), cat("Dairy"), cat("Breads"), cat("Party")];

// A supabase stand-in that records the chain; `.select()` ends it with { data, error }.
function fakeDb(result = { data: [{ id: "c1" }], error: null }) {
  const calls = [];
  const chain = {
    update: (v) => { calls.push(["update", v]); return chain; },
    eq: (k, v) => { calls.push(["eq", k, v]); return chain; },
    is: (k, v) => { calls.push(["is", k, v]); return chain; },
    select: (c) => { calls.push(["select", c]); return Promise.resolve(result); },
  };
  const db = { from: jest.fn((t) => { calls.push(["from", t]); return chain; }) };
  return { db, calls };
}
const CUSTOM = { id: "c1", name: "Sourdough", category: "Breads", is_global: false };
const STANDARD = { id: "g1", name: "Milk", category: "Dairy", is_global: true };

describe("the field", () => {
  const options = editCategoryOptions(CATEGORIES, CATEGORY_ORDER);

  test("lists every category: all standard ones (even with nothing on view), then the household's own", () => {
    expect(options.map((o) => o.rawName)).toEqual([...CATEGORY_ORDER, "Breads", "Party"]);
  });

  test("a custom item shows the picker, preselected to its category, with no empty option", () => {
    const { container } = render(
      <EditItemCategoryField isCustom options={options} value="Breads" onChange={() => {}} currentLabel="Breads" />
    );
    const select = container.querySelector("select");
    expect(select).not.toBeNull();
    expect(select.options[select.selectedIndex].textContent).toBe("Breads");
    expect([...select.options].some((o) => o.value === "")).toBe(false);
    // Index-valued options (the replay rule): no category name in any value.
    expect([...select.options].every((o) => /^\d+$/.test(o.value))).toBe(true);
    expect(screen.queryByText("Standard items stay in their aisle for now.")).toBeNull();
  });

  test("a standard item shows its category as read-only text and no picker", () => {
    const { container } = render(
      <EditItemCategoryField isCustom={false} options={options} value="Dairy" onChange={() => {}} currentLabel="🥛 Dairy" />
    );
    expect(container.querySelector("select")).toBeNull();
    expect(screen.getByText("🥛 Dairy")).toBeInTheDocument();
    expect(screen.getByText("Standard items stay in their aisle for now.")).toBeInTheDocument();
  });
});

describe("updateItemCategory: one row, by id", () => {
  test("updates exactly that row: by id, the household's, custom, live", async () => {
    const { db, calls } = fakeDb();
    await expect(updateItemCategory(db, "hh1", CUSTOM, "Pantry")).resolves.toEqual({ ok: true, error: null });
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      ["from", "catalog_items"],
      ["update", { category: "Pantry" }],
      ["eq", "id", "c1"],
      ["eq", "household_id", "hh1"],
      ["eq", "is_global", false],
      ["is", "deleted_at", null],
      ["select", "id"],
    ]);
  });

  test("a standard item is refused before any write", async () => {
    const { db } = fakeDb();
    const r = await updateItemCategory(db, "hh1", STANDARD, "Pantry");
    expect(r.ok).toBe(false);
    expect(db.from).not.toHaveBeenCalled();
  });

  test("an unchanged category writes nothing", async () => {
    const { db } = fakeDb();
    await expect(updateItemCategory(db, "hh1", CUSTOM, "Breads")).resolves.toEqual({ ok: true, error: null });
    expect(db.from).not.toHaveBeenCalled();
  });

  test("a database error or zero rows changed is a failure", async () => {
    expect((await updateItemCategory(fakeDb({ data: null, error: { message: "denied" } }).db, "hh1", CUSTOM, "Pantry")).error)
      .toBe("Could not change category: denied");
    expect((await updateItemCategory(fakeDb({ data: [], error: null }).db, "hh1", CUSTOM, "Pantry")).ok).toBe(false);
  });
});

describe("catalogMap", () => {
  test("only the edited entry's category changes", () => {
    const map = { Sourdough: CUSTOM, Milk: STANDARD };
    const next = applyItemCategory(map, "Sourdough", "Pantry");
    expect(next.Sourdough).toEqual({ ...CUSTOM, category: "Pantry" });
    expect(next.Milk).toBe(STANDARD);
    expect(map.Sourdough.category).toBe("Breads");   // not mutated
  });
});

describe("saveItemEdits", () => {
  test("a new category alone: one category write, no rename", async () => {
    const rename = jest.fn();
    const setCategory = jest.fn(async () => ({ ok: true }));
    const r = await saveItemEdits({ oldName: "Sourdough", newName: "Sourdough", isCustom: true, oldCategory: "Breads", newCategory: "Pantry" }, { rename, setCategory });
    expect(r).toEqual({ ok: true, name: "Sourdough", error: null });
    expect(rename).not.toHaveBeenCalled();
    expect(setCategory).toHaveBeenCalledWith("Sourdough", "Pantry");
  });

  test("name and category together: both apply, the rename first, the category under the new name", async () => {
    const order = [];
    const rename = jest.fn(async () => { order.push("rename"); return true; });
    const setCategory = jest.fn(async () => { order.push("category"); return { ok: true }; });
    const r = await saveItemEdits({ oldName: "Sourdough", newName: "Rye loaf", isCustom: true, oldCategory: "Breads", newCategory: "Pantry" }, { rename, setCategory });
    expect(r.ok).toBe(true);
    expect(order).toEqual(["rename", "category"]);
    expect(rename).toHaveBeenCalledWith("Sourdough", "Rye loaf");
    expect(setCategory).toHaveBeenCalledWith("Rye loaf", "Pantry");
  });

  test("a failed category update is reported and leaves the item as it was", async () => {
    const map = { Sourdough: CUSTOM };
    let applied = map;
    const setCategory = async (name, category) => {
      const res = await updateItemCategory(fakeDb({ data: null, error: { message: "denied" } }).db, "hh1", map[name], category);
      if (res.ok) applied = applyItemCategory(map, name, category);   // the hook's order: map only on success
      return res;
    };
    const r = await saveItemEdits({ oldName: "Sourdough", newName: "Sourdough", isCustom: true, oldCategory: "Breads", newCategory: "Pantry" }, { rename: jest.fn(), setCategory });
    expect(r).toEqual({ ok: false, name: "Sourdough", error: "Could not change category: denied" });
    expect(applied).toBe(map);
    expect(applied.Sourdough.category).toBe("Breads");
  });

  test("a failed rename stops the save: no category write", async () => {
    const setCategory = jest.fn();
    const r = await saveItemEdits({ oldName: "Sourdough", newName: "Rye loaf", isCustom: true, oldCategory: "Breads", newCategory: "Pantry" }, { rename: async () => false, setCategory });
    expect(r.ok).toBe(false);
    expect(setCategory).not.toHaveBeenCalled();
  });

  test("a standard item never writes a category", async () => {
    const setCategory = jest.fn();
    const r = await saveItemEdits({ oldName: "Milk", newName: "Milk", isCustom: false, oldCategory: "Dairy", newCategory: "Pantry" }, { rename: jest.fn(), setCategory });
    expect(r.ok).toBe(true);
    expect(setCategory).not.toHaveBeenCalled();
  });
});

describe("App wiring", () => {
  test("the Edit item sheet renders the field and saves through saveItemEdits", () => {
    expect(APP).toContain("<EditItemCategoryField");
    expect(APP).toContain("{ rename: renameItem, setCategory: setItemCategory }");
    expect(APP).toContain('if (!isCustom && !showPrices) return;');   // the early return stays
  });
});
