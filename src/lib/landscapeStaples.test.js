import { LANDSCAPE_PRESET, landscapeItems, tileTap, staplesAddedLine } from "./landscapeStaples";

const categories = [
  { rawName: "Produce", items: [{ name: "Apples" }, { name: "Bananas" }] },
  { rawName: "Dairy", items: [{ name: "Milk" }, { name: "Yogurt" }] },
  { rawName: "Empty", items: [] },
];
const catalogMap = {
  Apples: { is_staple: false }, Bananas: { is_staple: true },
  Milk: { is_staple: true }, Yogurt: {},
};

describe("landscapeItems", () => {
  test("the preset is staples, and only staples", () => {
    expect(LANDSCAPE_PRESET).toEqual(["staples"]);
  });
  test("staples only, flat, in category order, each with its aisle", () => {
    expect(landscapeItems(categories, catalogMap)).toEqual([
      { name: "Bananas", rawCategory: "Produce" },
      { name: "Milk", rawCategory: "Dairy" },
    ]);
  });
  test("no staples → empty; an unknown preset key → empty; missing inputs → empty", () => {
    expect(landscapeItems(categories, { Apples: {} })).toEqual([]);
    expect(landscapeItems(categories, catalogMap, ["nope"])).toEqual([]);
    expect(landscapeItems(undefined, undefined)).toEqual([]);
  });
});

describe("tileTap", () => {
  test("off the list → add", () => {
    expect(tileTap(0)).toBe("add");
    expect(tileTap(undefined)).toBe("add");
  });
  test("on at exactly 1 → remove", () => {
    expect(tileTap(1)).toBe("remove");
  });
  test("on at 2 or more → hint only, never a remove", () => {
    expect(tileTap(2)).toBe("hint");
    expect(tileTap(12)).toBe("hint");
  });
});

describe("staplesAddedLine", () => {
  test("0 → no toast", () => {
    expect(staplesAddedLine(0)).toBeNull();
  });
  test("1 and N", () => {
    expect(staplesAddedLine(1)).toBe("1 staple added");
    expect(staplesAddedLine(3)).toBe("3 staples added");
  });
});
