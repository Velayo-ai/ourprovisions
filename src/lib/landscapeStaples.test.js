import { LANDSCAPE_PRESET, landscapeItems, tileTap, staplesAddedLine, HOLD_HINT } from "./landscapeStaples";

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
  test("off the list → add, whatever the visit says", () => {
    expect(tileTap({ qty: 0, addedThisVisit: false })).toBe("add");
    expect(tileTap({ qty: undefined, addedThisVisit: false })).toBe("add");
    expect(tileTap({ qty: 0, addedThisVisit: true })).toBe("add");
  });
  test("on the list, added during this visit → remove", () => {
    expect(tileTap({ qty: 1, addedThisVisit: true })).toBe("remove");
  });
  test("on the list before the visit → hint only, at ANY quantity — never a remove", () => {
    expect(tileTap({ qty: 1, addedThisVisit: false })).toBe("hint");
    expect(tileTap({ qty: 2, addedThisVisit: false })).toBe("hint");
    expect(tileTap({ qty: 12, addedThisVisit: false })).toBe("hint");
  });
  test("the hint says how", () => {
    expect(HOLD_HINT).toBe("Hold to remove");
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
