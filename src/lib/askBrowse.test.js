import { askBlocks, categoryPartShown, browseFilterCount, browseFilterDescriptor } from "./askBrowse";

const catalogById = new Map([
  ["c-apples", { id: "c-apples", name: "Apples" }],
  ["c-bread", { id: "c-bread", name: "Bread" }],
  ["c-goldfish", { id: "c-goldfish", name: "Goldfish" }],
  ["c-hidden", { id: "c-hidden", name: "Hidden thing" }],
]);
const rawCategoryByName = new Map([["Apples", "Produce"], ["Bread", "Bakery"], ["Goldfish", "Snacks"]]);
const ASKS = [
  { id: "a-easton", label: "Easton", itemIds: ["c-goldfish", "c-apples", "c-gone", "c-hidden"] },
  { id: "a-everett", label: "Everett", itemIds: ["c-bread"] },
];
const label = (raw) => (raw === "Bakery" ? "Bakery" : raw);
const cat = (rawName, n) => ({ rawName, name: rawName, items: Array.from({ length: n }, (_, i) => ({ name: `${rawName}-${i}` })) });

describe("askBlocks", () => {
  test("only selected asks, in rail order; tiles in shelf order, priced by their real aisle", () => {
    expect(askBlocks(ASKS, new Set(["a-everett", "a-easton"]), catalogById, rawCategoryByName)).toEqual([
      { id: "a-easton", label: "Easton", items: [{ id: "c-goldfish", name: "Goldfish", rawCategory: "Snacks" }, { id: "c-apples", name: "Apples", rawCategory: "Produce" }] },
      { id: "a-everett", label: "Everett", items: [{ id: "c-bread", name: "Bread", rawCategory: "Bakery" }] },
    ]);
  });
  test("a deleted or hidden tile is left out of Browse; a stale selection selects nothing", () => {
    const [easton] = askBlocks(ASKS, new Set(["a-easton"]), catalogById, rawCategoryByName);
    expect(easton.items.map((i) => i.name)).toEqual(["Goldfish", "Apples"]);
    expect(askBlocks(ASKS, new Set(["a-deleted"]), catalogById, rawCategoryByName)).toEqual([]);
    expect(askBlocks(null, new Set(["a-easton"]), catalogById, rawCategoryByName)).toEqual([]);
  });
});

describe("categoryPartShown — pills add up; only asks shows only their blocks (D-b)", () => {
  test.each([
    [{ stapleFilter: false, categoriesActive: false, asksActive: false }, true],
    [{ stapleFilter: false, categoriesActive: false, asksActive: true }, false],
    [{ stapleFilter: true, categoriesActive: false, asksActive: true }, true],
    [{ stapleFilter: false, categoriesActive: true, asksActive: true }, true],
  ])("%o → %s", (state, shown) => expect(categoryPartShown(state)).toBe(shown));
});

test("browseFilterCount counts the live asks (D-e)", () => {
  expect(browseFilterCount({ stapleFilter: true, selectedCategoryCount: 2, askBlockCount: 1 })).toBe(4);
  expect(browseFilterCount({ stapleFilter: false, selectedCategoryCount: 0, askBlockCount: 0 })).toBe(0);
});

describe("browseFilterDescriptor", () => {
  const produce = cat("Produce", 3), dairy = cat("Dairy", 2);
  const blocks = askBlocks(ASKS, new Set(["a-easton"]), catalogById, rawCategoryByName);   // 2 tiles
  const base = { shownCats: [], displayCategories: [produce, dairy], blocks: [], stapleFilter: false, categoryRailLabel: label };

  test("nothing filters → null (unchanged)", () => {
    expect(browseFilterDescriptor(base)).toBeNull();
  });
  test("categories only → unchanged from before C3", () => {
    expect(browseFilterDescriptor({ ...base, shownCats: [dairy], displayCategories: [dairy] })).toEqual({ names: ["Dairy"], count: 2 });
  });
  test("Staples only → Staples, then every surviving category (unchanged)", () => {
    expect(browseFilterDescriptor({ ...base, stapleFilter: true })).toEqual({ names: ["Staples", "Produce", "Dairy"], count: 5 });
  });
  test("an ask only → the ask by label, counted by its own tiles; no categories", () => {
    expect(browseFilterDescriptor({ ...base, blocks })).toEqual({ names: [{ ask: "Easton" }], count: 2 });
  });
  test("Staples + an ask → Staples, the ask, the staple categories; the shelf whole (K4)", () => {
    expect(browseFilterDescriptor({ ...base, stapleFilter: true, blocks })).toEqual({
      names: ["Staples", { ask: "Easton" }, "Produce", "Dairy"], count: 7,
    });
  });
  test("an ask + a category → rail order, both counted", () => {
    expect(browseFilterDescriptor({ ...base, shownCats: [dairy], displayCategories: [dairy], blocks })).toEqual({
      names: [{ ask: "Easton" }, "Dairy"], count: 4,
    });
  });
  test("the count is DISTINCT items: one shown in its ask's block and in its own aisle counts once", () => {
    const produceWithApples = { rawName: "Produce", name: "Produce", items: [{ name: "Apples" }, { name: "Pears" }] };
    const twoAsks = askBlocks(ASKS, new Set(["a-easton", "a-everett"]), catalogById, rawCategoryByName);   // Goldfish, Apples · Bread
    expect(browseFilterDescriptor({ ...base, shownCats: [produceWithApples], displayCategories: [produceWithApples], blocks: twoAsks }))
      .toEqual({ names: [{ ask: "Easton" }, { ask: "Everett" }, "Produce"], count: 4 });   // Goldfish, Apples, Bread, Pears
    const sameTileTwice = [{ id: "x", label: "A", items: [{ name: "Apples" }] }, { id: "y", label: "B", items: [{ name: "Apples" }] }];
    expect(browseFilterDescriptor({ ...base, blocks: sameTileTwice }).count).toBe(1);
  });
  test("the ask's label is never a plain string, so the caller can't render it outside .op-name", () => {
    const d = browseFilterDescriptor({ ...base, blocks });
    expect(d.names.filter((n) => typeof n === "string" && n.includes("Easton"))).toEqual([]);
  });
});
