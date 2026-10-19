import { ingredientTag, ingredientSummary, buyerFromEvents } from "./ingredientTags";

const names = { "u-dan": "Dan", "u-elly": "Elly" };
const firstNameOf = (id) => names[id] || "";
const base = { onWeek: true, onHand: false, viewerUserId: "u-dan", solo: false, firstNameOf };
const bought = (buyerUserId, deletedAt = null) => ({ status: "bought", deletedAt, quantity: 1, linkCreatedAt: "2026-10-17T10:00:00Z", buyerUserId });
const pending = { status: "pending", deletedAt: null, quantity: 1, linkCreatedAt: "2026-10-17T10:00:00Z", buyerUserId: null };

test("off This Week (unplanned or cooked) shows no tag at all", () => {
  expect(ingredientTag({ ...base, onWeek: false, link: bought("u-elly"), onHand: true })).toBeNull();
});

test("row 1: bought for this meal names the buyer, you, or nobody", () => {
  expect(ingredientTag({ ...base, link: bought("u-elly") }).text).toBe("Elly bought it");
  expect(ingredientTag({ ...base, link: bought("u-dan") }).text).toBe("You bought it");
  expect(ingredientTag({ ...base, link: bought(null) }).text).toBe("Bought");
  expect(ingredientTag({ ...base, link: bought("u-gone") }).text).toBe("Bought");   // a buyer who left: never guess
});

test("row 1 survives wrap-up: an archived bought row still reads bought", () => {
  expect(ingredientTag({ ...base, link: bought("u-elly", "2026-10-18T01:00:00Z") }).text).toBe("Elly bought it");
});

test("row 1 in a solo household is a nameless Bought", () => {
  expect(ingredientTag({ ...base, solo: true, link: bought("u-dan") }).text).toBe("Bought");
});

test("row 2: a live pending row with quantity is On the shopping list; archived or zeroed is not", () => {
  expect(ingredientTag({ ...base, link: pending }).text).toBe("On the shopping list");
  expect(ingredientTag({ ...base, link: { ...pending, deletedAt: "2026-10-18T01:00:00Z" } })).toBeNull();
  expect(ingredientTag({ ...base, link: { ...pending, quantity: 0 } })).toBeNull();
});

test("row 3: on hand reads Already have it, but a list state wins first", () => {
  expect(ingredientTag({ ...base, link: null, onHand: true }).text).toBe("Already have it");
  expect(ingredientTag({ ...base, link: pending, onHand: true }).text).toBe("On the shopping list");
  expect(ingredientTag({ ...base, link: bought("u-elly"), onHand: true }).text).toBe("Elly bought it");
});

test("row 4: nothing known, no tag", () => {
  expect(ingredientTag({ ...base, link: null })).toBeNull();
});

test("the summary counts what is still to buy, then says All here; off the week it is the bare count", () => {
  expect(ingredientSummary({ n: 13, onWeek: true, leftToBuy: 9 })).toBe("13 · 9 on the shopping list");
  expect(ingredientSummary({ n: 13, onWeek: true, leftToBuy: 0 })).toBe("13 · All here");
  expect(ingredientSummary({ n: 13, onWeek: false, leftToBuy: 9 })).toBe("13");
});

test("the buyer is the latest checked event at or after the link; an unchecked after it clears it", () => {
  const link = "2026-10-17T10:00:00Z";
  expect(buyerFromEvents([{ event_type: "checked", user_id: "u-elly", created_at: "2026-10-17T18:00:00Z" }], link)).toBe("u-elly");
  expect(buyerFromEvents([
    { event_type: "unchecked", user_id: "u-elly", created_at: "2026-10-17T18:05:00Z" },
    { event_type: "checked", user_id: "u-elly", created_at: "2026-10-17T18:00:00Z" },
  ], link)).toBeNull();
  expect(buyerFromEvents([{ event_type: "checked", user_id: "u-elly", created_at: "2026-10-16T18:00:00Z" }], link)).toBeNull();
  expect(buyerFromEvents([], link)).toBeNull();
});
