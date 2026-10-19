import { ingredientTag, ingredientSummary, buyerFromEvents, rowWindowStart, boughtForThisMeal } from "./ingredientTags";

// Re-plan edge (2026-10-18): Taco Night was added to Shop on the 10th, bought on the 11th,
// cooked on the 12th, then re-planned on the 17th WITHOUT being re-added — the old link
// (created the 10th) and its archived bought row are still there.
const linkOld = "2026-10-10T10:00:00Z";
const lastCook = "2026-10-12T19:00:00Z";
const boughtBeforeCook = [{ event_type: "checked", user_id: "u-elly", created_at: "2026-10-11T18:00:00Z" }];
const boughtAfterCook = [{ event_type: "checked", user_id: "u-elly", created_at: "2026-10-18T18:00:00Z" }];

test("the window starts at the later of the link and the last cook", () => {
  expect(rowWindowStart(linkOld, lastCook)).toBe(lastCook);
  expect(rowWindowStart("2026-10-17T10:00:00Z", lastCook)).toBe("2026-10-17T10:00:00Z");
  expect(rowWindowStart(linkOld, null)).toBe(linkOld);
  expect(rowWindowStart(null, lastCook)).toBe(lastCook);
});

test("a re-planned meal: a purchase before the last cook never counts for this one", () => {
  const r = boughtForThisMeal({ status: "bought", linkCreatedAt: linkOld }, boughtBeforeCook, lastCook);
  expect(r).toEqual({ boughtInWindow: false, buyerUserId: null });
  const link = { status: "bought", deletedAt: "2026-10-12T01:00:00Z", quantity: 1, linkCreatedAt: linkOld, ...r };
  // falls through: on hand reads Already have it, otherwise nothing
  expect(ingredientTag({ onWeek: true, link, onHand: true, viewerUserId: "u-dan", solo: false, firstNameOf: () => "Elly" }).text).toBe("Already have it");
  expect(ingredientTag({ onWeek: true, link, onHand: false, viewerUserId: "u-dan", solo: false, firstNameOf: () => "Elly" })).toBeNull();
});

test("a re-planned meal: a purchase after the last cook counts and is named", () => {
  expect(boughtForThisMeal({ status: "bought", linkCreatedAt: linkOld }, boughtAfterCook, lastCook)).toEqual({ boughtInWindow: true, buyerUserId: "u-elly" });
});

test("a link made after the last cook counts even without an event (nameless)", () => {
  expect(boughtForThisMeal({ status: "bought", linkCreatedAt: "2026-10-17T10:00:00Z" }, [], lastCook)).toEqual({ boughtInWindow: true, buyerUserId: null });
});

test("a never-cooked meal keeps the link's created_at as the window start", () => {
  expect(boughtForThisMeal({ status: "bought", linkCreatedAt: linkOld }, boughtBeforeCook, null)).toEqual({ boughtInWindow: true, buyerUserId: "u-elly" });
});

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
