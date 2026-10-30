// Run: CI=true npx react-scripts test --watchAll=false src/lib/giftCard
import { giftCardModel, fromLine, ingredientCount, giftMetaLine } from "./giftCard";

const ROW = { gift_id: "3f2a9c1e-7b6d-4e5f-8a9b-0c1d2e3f4a5b", title: "Famous Grilled Cheese & Pickle", attribution: "Easton", ingredient_count: 7, has_photo: true };

describe("giftCardModel (C5–C8)", () => {
  test("the five fields → the card's model", () => {
    expect(giftCardModel(ROW)).toEqual({ giftId: ROW.gift_id, title: ROW.title, from: "From Easton", count: "7 ingredients", hasPhoto: true });
  });
  test("C6: empty attribution → no From line (null, never a placeholder)", () => {
    expect(giftCardModel({ ...ROW, attribution: "" }).from).toBeNull();
    expect(giftCardModel({ ...ROW, attribution: null }).from).toBeNull();
    expect(giftCardModel({ ...ROW, attribution: "   " }).from).toBeNull();
  });
  test("C8: has_photo is the flag itself — anything but true is false", () => {
    expect(giftCardModel({ ...ROW, has_photo: false }).hasPhoto).toBe(false);
    expect(giftCardModel({ ...ROW, has_photo: null }).hasPhoto).toBe(false);
    expect(giftCardModel({ ...ROW, has_photo: "true" }).hasPhoto).toBe(false);
  });
  test("C7: no row → null (unknown and revoked look the same)", () => {
    expect(giftCardModel(null)).toBeNull();
    expect(giftCardModel(undefined)).toBeNull();
    expect(giftCardModel({})).toBeNull();
  });
  test("the title is shown as written, trimmed; an empty one reads 'A meal'", () => {
    expect(giftCardModel({ ...ROW, title: "  grandma's cookies " }).title).toBe("grandma's cookies");
    expect(giftCardModel({ ...ROW, title: "" }).title).toBe("A meal");
  });
});

describe("fromLine / ingredientCount / giftMetaLine", () => {
  test("From is never possessive", () => {
    expect(fromLine("Easton")).toBe("From Easton");
    expect(fromLine("NYT Cooking")).toBe("From NYT Cooking");
    expect(fromLine("")).toBeNull();
  });
  test("ingredient count pluralises; junk reads 0", () => {
    expect(ingredientCount(1)).toBe("1 ingredient");
    expect(ingredientCount(7)).toBe("7 ingredients");
    expect(ingredientCount(0)).toBe("0 ingredients");
    expect(ingredientCount(NaN)).toBe("0 ingredients");
    expect(ingredientCount(-2)).toBe("0 ingredients");
  });
  test("the meta line joins From and the count with ·, or is the count alone", () => {
    expect(giftMetaLine(giftCardModel(ROW))).toBe("From Easton · 7 ingredients");
    expect(giftMetaLine(giftCardModel({ ...ROW, attribution: "" }))).toBe("7 ingredients");
    expect(giftMetaLine(null)).toBe("");
  });
});
