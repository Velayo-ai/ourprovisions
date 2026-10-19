import { ingredientTag, ingredientSummary, buyerFromEvents, rowWindowStart, boughtForThisMeal, wasAddedThisPlan, planAnchor } from "./ingredientTags";
import { planActionFor } from "./recipePlan";

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

// ── The four sequences from Dan's 2026-10-18 dev walk (the correction) ──────────────────
// A whole meal's state as the view builds it: links keyed by catalog item, the last cook,
// the board's left-to-buy count, and the tag per row + the summary line.
const ctx = { viewerUserId: "u-dan", solo: false, firstNameOf: (id) => ({ "u-dan": "Dan", "u-elly": "Elly" })[id] || "" };
const viewOf = (links, lastCookedAt, leftToBuy, n = 13) => {
  const list = Object.values(links);
  const added = wasAddedThisPlan(list, lastCookedAt);
  const tags = Object.fromEntries(Object.entries(links).map(([ci, l]) => {
    const row = { ...l, ...boughtForThisMeal(l, l.events, lastCookedAt) };
    return [ci, ingredientTag({ ...ctx, onWeek: true, onHand: false, link: row, addedThisPlan: added })?.text || null];
  }));
  return { added, tags, summary: ingredientSummary({ n, onWeek: true, leftToBuy, addedThisPlan: added }) };
};
const oldLink = (events) => ({ status: "bought", deletedAt: "2026-10-18T22:30:00Z", quantity: 1, linkCreatedAt: "2026-10-18T20:00:00Z", events });
const cookTonight = "2026-10-18T23:10:00Z";
const checkedTonight = [{ event_type: "checked", user_id: "u-dan", created_at: "2026-10-18T21:00:00Z" }];

test("1. shop → wrap up → Cooked it → clear → re-plan, NOT added: summary 13, no tags, pill On This Week", () => {
  const v = viewOf({ tortillas: oldLink(checkedTonight), cumin: oldLink(checkedTonight) }, cookTonight, 0);
  expect(v.added).toBe(false);
  expect(v.tags).toEqual({ tortillas: null, cumin: null });
  expect(v.summary).toBe("13");
  // the pill: planned, has ingredients, nothing added → ✓ On This Week (never Cooked it)
  expect(planActionFor({ cooked: false, ready: false, toBuy: false, planned: true, canAdd: true, rc: { total: 0, bought: 0 } })).toBe("onWeek");
});

test("2. re-planned AND re-added, one checked on the open trip: the new links tag, named (cart vs bought)", () => {
  const newLink = (events, status = "bought") => ({ status, deletedAt: null, quantity: 1, linkCreatedAt: "2026-10-19T09:00:00Z", events });
  const v = viewOf({
    tortillas: newLink([{ event_type: "checked", user_id: "u-elly", created_at: "2026-10-19T12:00:00Z" }]),
    cumin: newLink([], "pending"),
  }, cookTonight, 1);
  expect(v.added).toBe(true);
  expect(v.tags).toEqual({ tortillas: "In Elly's cart", cumin: "On the shopping list" });
  expect(v.summary).toBe("13 · 1 on the shopping list");
});

test("3. a removed-uncooked meal re-planned: no cook on record, so prior purchases may show — correct", () => {
  const v = viewOf({ tortillas: oldLink(checkedTonight) }, null, 0);
  expect(v.added).toBe(true);
  expect(v.tags).toEqual({ tortillas: "You bought it" });
  expect(v.summary).toBe("13 · All here");
});

test("4. a planned meal never added: summary is the bare count, no tags, no Cooked it", () => {
  const v = viewOf({}, null, 0);
  expect(v.added).toBe(false);
  expect(v.tags).toEqual({});
  expect(v.summary).toBe("13");
  expect(planActionFor({ cooked: false, ready: false, toBuy: false, planned: true, canAdd: true, rc: { total: 0, bought: 0 } })).toBe("onWeek");
});

test("a meal with no ingredients shows no count", () => {
  expect(ingredientSummary({ n: 0, onWeek: true, leftToBuy: 0, addedThisPlan: false })).toBe("");
});

// ── planned_at is the anchor (063, 2026-10-18); meal_cooks is the backstop ────────────────
test("the anchor is planned_at, the last cook only when planned_at is null (rows older than 063)", () => {
  expect(planAnchor("2026-10-19T08:00:00Z", "2026-10-18T23:10:00Z")).toBe("2026-10-19T08:00:00Z");
  expect(planAnchor(null, "2026-10-18T23:10:00Z")).toBe("2026-10-18T23:10:00Z");
  expect(planAnchor(null, null)).toBeNull();
});

const rePlanAt = "2026-10-19T08:00:00Z";   // the re-plan's planned_at, after tonight's old links
const toBuyState = (total, bought) => ({ cooked: false, ready: false, toBuy: total > 0, planned: total === 0, canAdd: total === 0, rc: { total, bought } });

test("re-walk, with a cook on record: clear → re-plan, not added → 13, no tags, ✓ On This Week", () => {
  const anchor = planAnchor(rePlanAt, cookTonight);
  const v = viewOf({ tortillas: oldLink(checkedTonight), cumin: oldLink(checkedTonight) }, anchor, 0);
  expect(v).toEqual({ added: false, tags: { tortillas: null, cumin: null }, summary: "13" });
  expect(planActionFor(toBuyState(0, 0))).toBe("onWeek");
});

test("re-walk, NO cook on record (removed uncooked, re-planned): the old links still predate planned_at → 13, no tags", () => {
  const anchor = planAnchor(rePlanAt, null);
  const v = viewOf({ tortillas: oldLink(checkedTonight) }, anchor, 0);
  expect(v).toEqual({ added: false, tags: { tortillas: null }, summary: "13" });
});

test("re-plan + re-add + check two (not wrapped up) → two In your cart, summary 13 · 11 on the shopping list", () => {
  const anchor = planAnchor(rePlanAt, cookTonight);
  const added = (events, status) => ({ status, deletedAt: null, quantity: 1, linkCreatedAt: "2026-10-19T09:00:00Z", events });
  const me = [{ event_type: "checked", user_id: "u-dan", created_at: "2026-10-19T12:00:00Z" }];
  const v = viewOf({ tortillas: added(me, "bought"), cumin: added(me, "bought"), cheddar: added([], "pending") }, anchor, 11);
  expect(v.added).toBe(true);
  expect(v.tags).toEqual({ tortillas: "In your cart", cumin: "In your cart", cheddar: "On the shopping list" });
  expect(v.summary).toBe("13 · 11 on the shopping list");
});

test("plan → add → check all → All here and Cooked it from the same inputs", () => {
  const anchor = planAnchor("2026-10-19T08:00:00Z", null);
  const bought = { status: "bought", deletedAt: null, quantity: 1, linkCreatedAt: "2026-10-19T09:00:00Z", events: [{ event_type: "checked", user_id: "u-dan", created_at: "2026-10-19T12:00:00Z" }] };
  const v = viewOf({ tortillas: bought, cumin: bought }, anchor, 0);
  expect(v.summary).toBe("13 · All here");
  expect(planActionFor(toBuyState(13, 13))).toBe("cookIt");
});

const names = { "u-dan": "Dan", "u-elly": "Elly" };
const firstNameOf = (id) => names[id] || "";
const base = { onWeek: true, onHand: false, viewerUserId: "u-dan", solo: false, firstNameOf };
const wrappedUp = "2026-10-18T01:00:00Z";   // archived as bought at wrap-up
const bought = (buyerUserId, deletedAt = wrappedUp) => ({ status: "bought", deletedAt, quantity: 1, linkCreatedAt: "2026-10-17T10:00:00Z", buyerUserId });
const inCart = (buyerUserId) => bought(buyerUserId, null);   // checked on the open trip, not wrapped up
const pending = { status: "pending", deletedAt: null, quantity: 1, linkCreatedAt: "2026-10-17T10:00:00Z", buyerUserId: null };

test("off This Week (unplanned or cooked) shows no tag at all", () => {
  expect(ingredientTag({ ...base, onWeek: false, link: bought("u-elly"), onHand: true })).toBeNull();
});

test("row 1: bought for this meal (archived at wrap-up) names the buyer, you, or nobody", () => {
  expect(ingredientTag({ ...base, link: bought("u-elly") })).toEqual({ kind: "bought", text: "Elly bought it" });
  expect(ingredientTag({ ...base, link: bought("u-dan") })).toEqual({ kind: "bought", text: "You bought it" });
  expect(ingredientTag({ ...base, link: bought(null) }).text).toBe("Bought");
  expect(ingredientTag({ ...base, link: bought("u-gone") }).text).toBe("Bought");   // a buyer who left: never guess
});

// "cart vs bought" (Dan's dev re-walk, 2026-10-18): a check puts an item in the cart;
// wrap-up is the purchase. The same link, flipping only deleted_at.
test("row 2: checked on the open trip, not wrapped up, is in the cart — named, you, or nobody", () => {
  expect(ingredientTag({ ...base, link: inCart("u-elly") })).toEqual({ kind: "cart", text: "In Elly's cart" });
  expect(ingredientTag({ ...base, link: inCart("u-dan") })).toEqual({ kind: "cart", text: "In your cart" });
  expect(ingredientTag({ ...base, link: inCart(null) }).text).toBe("In cart");
  expect(ingredientTag({ ...base, link: inCart("u-gone") }).text).toBe("In cart");   // never guess
});

test("cart vs bought: the same row reads In … cart until wrap-up archives it, then … bought it", () => {
  const live = inCart("u-elly");
  expect(ingredientTag({ ...base, link: live }).text).toBe("In Elly's cart");
  expect(ingredientTag({ ...base, link: { ...live, deletedAt: wrappedUp } }).text).toBe("Elly bought it");
  const mine = inCart("u-dan");
  expect(ingredientTag({ ...base, link: mine }).text).toBe("In your cart");
  expect(ingredientTag({ ...base, link: { ...mine, deletedAt: wrappedUp } }).text).toBe("You bought it");
});

test("rows 1 and 2 in a solo household are nameless: Bought once wrapped up, In cart before", () => {
  expect(ingredientTag({ ...base, solo: true, link: bought("u-dan") }).text).toBe("Bought");
  expect(ingredientTag({ ...base, solo: true, link: inCart("u-dan") }).text).toBe("In cart");
});

test("rows 1 and 2 share the window: a cart row from before this plan falls through too", () => {
  expect(ingredientTag({ ...base, link: { ...inCart("u-elly"), boughtInWindow: false } })).toBeNull();
  expect(ingredientTag({ ...base, link: inCart("u-elly"), addedThisPlan: false })).toBeNull();
});

test("row 3: a live pending row with quantity is On the shopping list; archived or zeroed is not", () => {
  expect(ingredientTag({ ...base, link: pending }).text).toBe("On the shopping list");
  expect(ingredientTag({ ...base, link: { ...pending, deletedAt: "2026-10-18T01:00:00Z" } })).toBeNull();
  expect(ingredientTag({ ...base, link: { ...pending, quantity: 0 } })).toBeNull();
});

test("row 4: on hand reads Already have it, but a list state wins first", () => {
  expect(ingredientTag({ ...base, link: null, onHand: true }).text).toBe("Already have it");
  expect(ingredientTag({ ...base, link: pending, onHand: true }).text).toBe("On the shopping list");
  expect(ingredientTag({ ...base, link: inCart("u-elly"), onHand: true }).text).toBe("In Elly's cart");
  expect(ingredientTag({ ...base, link: bought("u-elly"), onHand: true }).text).toBe("Elly bought it");
});

test("row 5: nothing known, no tag", () => {
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
