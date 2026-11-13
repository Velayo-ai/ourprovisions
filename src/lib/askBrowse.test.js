import { askBlocks, categoryPartShown, browseFilterCount, browseFilterDescriptor } from "./askBrowse";

// The shelf rows carry their catalog items (shapeAsks); Browse's own list only prices them.
const item = (name, extra = {}) => ({ name, category: "Pantry", isGlobal: true, householdId: null, deletedAt: null, ...extra });
const rawCategoryByName = new Map([["Apples", "Produce"], ["Bread", "Bakery"], ["Goldfish", "Snacks"]]);
const ASKS = [
  { id: "a-easton", label: "Easton", householdId: "hh", shelf: [
    { id: "c-goldfish", item: item("Goldfish") },
    { id: "c-apples", item: item("Apples") },
    { id: "c-gone", item: item("Gone", { isGlobal: false, householdId: "hh", deletedAt: "2026-11-10T00:00:00Z" }) },
    { id: "c-hidden", item: item("Hidden thing") },      // hidden by this person in Browse: not in rawCategoryByName
  ] },
  { id: "a-everett", label: "Everett", householdId: "hh", shelf: [{ id: "c-bread", item: item("Bread") }] },
];
const label = (raw) => (raw === "Bakery" ? "Bakery" : raw);
const cat = (rawName, n) => ({ rawName, name: rawName, items: Array.from({ length: n }, (_, i) => ({ name: `${rawName}-${i}` })) });

describe("askBlocks", () => {
  test("only selected asks, in rail order; the live tiles in shelf order, priced by their real aisle, else their own", () => {
    expect(askBlocks(ASKS, new Set(["a-everett", "a-easton"]), rawCategoryByName)).toEqual([
      { id: "a-easton", label: "Easton", items: [
        { id: "c-goldfish", name: "Goldfish", rawCategory: "Snacks" }, { id: "c-apples", name: "Apples", rawCategory: "Produce" },
        { id: "c-hidden", name: "Hidden thing", rawCategory: "Pantry" },
      ] },
      { id: "a-everett", label: "Everett", items: [{ id: "c-bread", name: "Bread", rawCategory: "Bakery" }] },
    ]);
  });
  test("a deleted tile is left out; a tile this person hid stays (S4-9); a stale selection selects nothing", () => {
    const [easton] = askBlocks(ASKS, new Set(["a-easton"]), rawCategoryByName);
    expect(easton.items.map((i) => i.name)).toEqual(["Goldfish", "Apples", "Hidden thing"]);
    expect(askBlocks(ASKS, new Set(["a-deleted"]), rawCategoryByName)).toEqual([]);
    expect(askBlocks(null, new Set(["a-easton"]), rawCategoryByName)).toEqual([]);
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
  const blocks = askBlocks([{ ...ASKS[0], shelf: ASKS[0].shelf.slice(0, 3) }], new Set(["a-easton"]), rawCategoryByName);   // 2 live tiles
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
    const twoAsks = askBlocks([{ ...ASKS[0], shelf: ASKS[0].shelf.slice(0, 3) }, ASKS[1]], new Set(["a-easton", "a-everett"]), rawCategoryByName);   // Goldfish, Apples · Bread
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
