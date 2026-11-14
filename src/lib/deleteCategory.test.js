/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the select's options are read as raw DOM (count, text, selected). */
import { render } from "@testing-library/react";
import { CategorySelect } from "../components/CategorySelect";
import { defaultMoveTarget, deleteCategoryLabel, categoryCountText, categoryDeletePlan, runCategoryDelete } from "./deleteCategory";

// Manage Categories → Delete never deletes items (2026-11-05). CATEGORY_ORDER is read from App.js
// itself, so the preselect is tested against the list that ships.
const fs = require("fs");
const path = require("path");
const APP = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
const CATEGORY_ORDER = JSON.parse(`[${APP.match(/const CATEGORY_ORDER = \[([^\]]*)\]/)[1]}]`);

const cat = (rawName) => ({ rawName, name: rawName, items: [] });
const CATS = [...CATEGORY_ORDER.map(cat), cat("Snacks"), cat("Party")];

// A supabase stand-in that records every call in the chain.
function fakeDb(result = { error: null }) {
  const calls = [];
  const chain = {
    update: (v) => { calls.push(["update", v]); return chain; },
    eq: (k, v) => { calls.push(["eq", k, v]); return chain; },
    is: (k, v) => { calls.push(["is", k, v]); return Promise.resolve(result); },
    delete: () => { calls.push(["delete"]); return chain; },
  };
  const db = { from: jest.fn((t) => { calls.push(["from", t]); return chain; }) };
  return { db, calls };
}

describe("the move picker: required, preselected, no delete-all", () => {
  test("Pantry is today's default", () => {
    expect(CATEGORY_ORDER).toContain("Pantry");
    expect(defaultMoveTarget(CATS, "Snacks", CATEGORY_ORDER)).toBe("Pantry");
  });

  test("if Pantry leaves CATEGORY_ORDER, the first standard category is the default", () => {
    const order = CATEGORY_ORDER.filter((c) => c !== "Pantry");
    expect(defaultMoveTarget(order.map(cat).concat(cat("Snacks")), "Snacks", order)).toBe(order[0]);
  });

  test("never the category being deleted; a standard one first, then whatever is left", () => {
    expect(defaultMoveTarget([cat("Dairy"), cat("Pantry"), cat("Snacks")], "Snacks", CATEGORY_ORDER)).toBe("Pantry");
    expect(defaultMoveTarget([cat("Dairy"), cat("Snacks")], "Snacks", CATEGORY_ORDER)).toBe("Dairy");
    expect(defaultMoveTarget([cat("Snacks"), cat("Party")], "Snacks", CATEGORY_ORDER)).toBe("Party");
    expect(defaultMoveTarget([cat("Snacks")], "Snacks", CATEGORY_ORDER)).toBe("");
  });

  test("rendered with items: the preselect shows, and there is no empty or delete-all option", () => {
    const targets = CATS.filter((c) => c.rawName !== "Snacks");
    const { container } = render(
      <CategorySelect categories={targets} value={defaultMoveTarget(CATS, "Snacks", CATEGORY_ORDER)} onChange={() => {}} />
    );
    const select = container.querySelector("select");
    const options = [...select.options];
    expect(options).toHaveLength(targets.length);
    expect(options.some((o) => o.value === "")).toBe(false);
    expect(options.some((o) => /delete all/i.test(o.textContent))).toBe(false);
    expect(select.options[select.selectedIndex].textContent).toBe("Pantry");
    // And the old placeholder is gone from the app.
    expect(APP).not.toContain("delete all items too");
  });

  test("a placeholder, when a caller passes one, is still the empty option (other pickers unchanged)", () => {
    const { container } = render(<CategorySelect categories={CATS} value="" onChange={() => {}} placeholder="— select category —" />);
    expect(container.querySelector("select").options[0].value).toBe("");
    expect(container.querySelector("select").options).toHaveLength(CATS.length + 1);
  });
});

describe("the button only moves and deletes", () => {
  test("labels", () => {
    expect(deleteCategoryLabel(2)).toBe("Move & Delete Category");
    expect(deleteCategoryLabel(0)).toBe("Delete Category");
    expect(categoryCountText(0)).toBe("0 items");
    expect(categoryCountText(1)).toBe("1 item");
    expect(categoryCountText(12)).toBe("12 items");
  });

  test("plans: items need a target or nothing happens; no items deletes directly", () => {
    expect(categoryDeletePlan(2, "Produce")).toBe("move");
    expect(categoryDeletePlan(2, null)).toBe("refuse");
    expect(categoryDeletePlan(2, "")).toBe("refuse");
    expect(categoryDeletePlan(0, null)).toBe("delete");
  });
});

describe("runCategoryDelete", () => {
  test("items and no target: refuses and touches nothing", async () => {
    const { db, calls } = fakeDb();
    await expect(runCategoryDelete(db, "hh1", "Snacks", null, 2)).resolves.toEqual({ plan: "refuse", error: null });
    expect(db.from).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  test("the move re-homes the household's live items to the target, and deletes no row", async () => {
    const { db, calls } = fakeDb();
    await expect(runCategoryDelete(db, "hh1", "Snacks", "Produce", 2)).resolves.toEqual({ plan: "move", error: null });
    expect(calls).toEqual([
      ["from", "catalog_items"],
      ["update", { category: "Produce" }],
      ["eq", "household_id", "hh1"],
      ["eq", "category", "Snacks"],
      ["is", "deleted_at", null],
    ]);
    expect(calls.some(([op]) => op === "delete")).toBe(false);
  });

  test("a failed move reports its error (the caller then keeps the category)", async () => {
    const { db } = fakeDb({ error: { message: "nope" } });
    await expect(runCategoryDelete(db, "hh1", "Snacks", "Produce", 2)).resolves.toEqual({ plan: "move", error: { message: "nope" } });
  });

  test("an empty category deletes directly: no database write", async () => {
    const { db } = fakeDb();
    await expect(runCategoryDelete(db, "hh1", "Party", null, 0)).resolves.toEqual({ plan: "delete", error: null });
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe("App wiring", () => {
  test("deleteCategory runs the plan and has no item-deleting branch", () => {
    const body = APP.slice(APP.indexOf("const deleteCategory = async"), APP.indexOf("const openBudgetModal"));
    expect(body).toContain("runCategoryDelete(supabase, household.id, rawName, moveTo, itemCount)");
    expect(body).toContain('if (plan === "refuse" || moveErr) return;');
    expect(body).not.toMatch(/await deleteItem\(/);
  });

  test("standard categories are not listed and nothing says so (Dan, 2026-11-10); nothing names a category in a form", () => {
    expect(APP).not.toContain("Standard categories can't be renamed or deleted.");
    expect(APP).not.toContain("can’t be deleted — only categories you’ve created");
    expect(APP).not.toContain("can't be renamed — only categories you've created");
    // The rows are text: a category name never sits in an aria-label or an <option> value.
    expect(APP).toContain('aria-label="Rename this category"');   // the row itself: tap to edit (no pencil)
    expect(APP).toContain('aria-label="Delete this category"');
    expect(APP).not.toContain("M4 20h4l10.5-10.5");                // the pencil icon is gone
  });

  test("no factory reset under Categories (Dan, 2026-11-10): household factory reset belongs in its own designed flow", () => {
    expect(APP).not.toContain("Restore default categories");
    expect(APP).not.toContain("handleResetCategories");
    expect(APP).not.toContain("Danger Zone");
  });

  test("both delete confirmations sit after the View & organize sheet in the tree and one layer above it (2026-11-11)", () => {
    const manage = APP.indexOf("{browseFilterOpen && (");
    const askConfirm = APP.indexOf("{ASK_ENABLED && deleteAskId && (() =>");
    const catConfirm = APP.indexOf("{deletingCategory && (");
    expect(manage).toBeGreaterThan(0);
    expect(askConfirm).toBeGreaterThan(manage);
    expect(catConfirm).toBeGreaterThan(askConfirm);
    // Topmost (2026-11-14): above the sheet's own layer, whatever that is, and below the full-screen Ask screen.
    const sheetZ = Number(APP.slice(manage).match(/className="modal-overlay" onClick=\{closeOrganize\} style=\{\{ zIndex: (\d+)/)[1]);
    const zOf = (from) => Number(APP.slice(from, from + 400).match(/className="modal-overlay" style=\{\{ zIndex: (\d+) \}\}/)[1]);
    expect(zOf(askConfirm)).toBeGreaterThan(sheetZ);
    expect(zOf(catConfirm)).toBeGreaterThan(sheetZ);
    expect(zOf(askConfirm)).toBeLessThan(2000);            // .ask-editor's z-index
  });

  test("one confirmation at a time: opening either delete confirm closes the other (2026-11-14)", () => {
    expect(APP).toContain("setDeleteAskId(null);\n                                setDeletingCategory({ rawName: cat.rawName, name: cat.name, itemCount: n });".replace(/\n/g, APP.includes("\r\n") ? "\r\n" : "\n"));
    expect(APP).toContain("onClick={() => { setDeletingCategory(null); setDeleteAskFailed(false); setDeleteAskId(row.id); }}");
    // Each confirm is one piece of state (an id / one object), so a second tap of the same kind replaces, never stacks.
    expect(APP.match(/\{ASK_ENABLED && deleteAskId && \(\(\) =>/g)).toHaveLength(1);
    expect(APP.match(/\{deletingCategory && \(/g)).toHaveLength(1);
  });

  test("empty created categories are let go when View & organize opens, on open only", () => {
    const body = APP.slice(APP.indexOf("const catalogForPruneRef"), APP.indexOf("}, [browseFilterOpen]);"));
    expect(body).toContain("if (!browseFilterOpen) return;");
    expect(body).toContain("items.some(i => i.category === c)");
    expect(APP).not.toMatch(/aria-label=\{`(Rename|Delete) \$\{cat\./);
  });
});
