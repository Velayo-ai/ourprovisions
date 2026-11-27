// Run: CI=true npx react-scripts test --watchAll=false src/lib/listPicker
// SPEC_one_list R7–R9: what the quick picker lists and what each row says.
import { pickerItems, filterItems, letterGroups, itemStatus, hiddenMatchFor, openBucket, PICKER_COPY, normalizeName } from "./listPicker";

const CATS = [
  { name: "Produce", rawName: "Produce", items: [{ name: "Bananas" }, { name: "Apples" }] },
  { name: "Other", rawName: "Other", items: [{ name: "7-Up" }, { name: "Coffee" }, { name: "Ghost" }] },
];
const MAP = { Apples: { id: "a" }, Bananas: { id: "b" }, "7-Up": { id: "s" }, Coffee: { id: "c" } };   // Ghost: no catalog row

test("the person's Browse catalog, flat, A–Z, with ids and raw categories; a name with no catalog row is left out", () => {
  const items = pickerItems(CATS, MAP);
  expect(items.map((i) => i.name)).toEqual(["7-Up", "Apples", "Bananas", "Coffee"]);
  expect(items.find((i) => i.name === "Apples")).toEqual({ id: "a", name: "Apples", category: "Produce", rawCategory: "Produce" });
});

test("letter headers; anything not starting with a letter goes under # first", () => {
  const g = letterGroups(pickerItems(CATS, MAP));
  expect(g.map((x) => x.letter)).toEqual(["#", "A", "B", "C"]);
  expect(g[0].items.map((i) => i.name)).toEqual(["7-Up"]);
});

test("typing filters by substring, any case; no text lists everything", () => {
  const items = pickerItems(CATS, MAP);
  expect(filterItems(items, "  an ").map((i) => i.name)).toEqual(["Bananas"]);
  expect(filterItems(items, "")).toBe(items);
});

describe("itemStatus (R8)", () => {
  const listRows = [{ id: "r1", catalogItemId: "a", quantity: 2 }, { id: "r2", catalogItemId: "b", quantity: 1 }];
  test("live, quantity > 0, not checked → on (✓, inert)", () => {
    expect(itemStatus("a", { listRows, quantities: { r1: 2 }, checked: {} })).toBe("on");
  });
  test("checked this trip → cart (shows +; a tap is the renewal)", () => {
    expect(itemStatus("b", { listRows, quantities: {}, checked: { r2: true } })).toBe("cart");
  });
  test("not on the list → off", () => {
    expect(itemStatus("c", { listRows, quantities: {}, checked: {} })).toBe("off");
  });
  test("the shown quantity wins over the row's (an optimistic −1 to 0 is off at once)", () => {
    expect(itemStatus("a", { listRows, quantities: { r1: 0 }, checked: {} })).toBe("off");
  });
  test("an add in flight before its row exists (pre:<catalog id>) is on at once", () => {
    expect(itemStatus("c", { listRows, quantities: { "pre:c": 1 }, checked: {} })).toBe("on");
  });
  test("a renewal in flight (adjustQty took the row out of the cart) is on", () => {
    expect(itemStatus("b", { listRows, quantities: { r2: 1 }, checked: { r2: false } })).toBe("on");
  });
});

test("the hidden match is exact on the normalized name, live or not (F1b)", () => {
  const hidden = [{ id: "h", name: "Oat  Milk" }];
  expect(hiddenMatchFor("oat milk", hidden, [])).toEqual({ item: hidden[0], qty: 0, live: false });
  expect(hiddenMatchFor(" OAT MILK ", hidden, [{ catalogItemId: "h", quantity: 3 }])).toEqual({ item: hidden[0], qty: 3, live: true });
  expect(hiddenMatchFor("oat", hidden, [])).toBeNull();
  expect(hiddenMatchFor("", hidden, [])).toBeNull();
  expect(normalizeName("  A   b ")).toBe("a b");
});

test("picker_closed's open_s is a bucket, never a raw duration", () => {
  expect([0, 9999, 10000, 45000, 90000, 400000].map(openBucket)).toEqual(["lt10", "lt10", "10_30", "30_60", "60_180", "180plus"]);
});

test("the copy (R8, R14)", () => {
  expect(PICKER_COPY.added("Bagels")).toBe("Bagels is on the list");
  expect(PICKER_COPY.renewed("Apples")).toBe("Apples added again · it was in your cart");
  expect(PICKER_COPY.needsSignal).toBe("Adding items needs signal for now.");
});
