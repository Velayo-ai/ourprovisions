import {
  askDraftProblem, createAskArgs, updateAskArgs, createAskFailure, shapeAsks, pickLine, targetTilesMessage, findDuplicateAsk,
  ASK_LABEL_MAX, ASK_SHELF_MAX, ASK_SIMPLE_MAX,
} from "./askCreate";

const ids = (n) => Array.from({ length: n }, (_, i) => `item-${i + 1}`);

describe("askDraftProblem — the sheet refuses what create_ask would", () => {
  const ok = { label: "Easton", noun: "snacks", target: 3, itemIds: ids(6) };
  test("a good draft has no problem", () => {
    expect(askDraftProblem(ok)).toBeNull();
    expect(askDraftProblem({ ...ok, noun: "" })).toBeNull();
    expect(askDraftProblem({ ...ok, target: 3, itemIds: ids(3) })).toBeNull();
  });
  test("a name is required, trimmed, and at most 16 characters", () => {
    expect(askDraftProblem({ ...ok, label: "   " })).toMatch(/Add a name/);
    expect(askDraftProblem({ ...ok, label: "x".repeat(ASK_LABEL_MAX) })).toBeNull();
    expect(askDraftProblem({ ...ok, label: " " + "x".repeat(ASK_LABEL_MAX) + " " })).toBeNull();
    expect(askDraftProblem({ ...ok, label: "x".repeat(ASK_LABEL_MAX + 1) })).toMatch(/16 characters/);
  });
  test("the noun is optional and at most 16 characters", () => {
    expect(askDraftProblem({ ...ok, noun: "x".repeat(17) })).toMatch(/16 characters/);
  });
  test("the target is 1 to 6", () => {
    expect(askDraftProblem({ ...ok, target: 0 })).toMatch(/how many/);
    expect(askDraftProblem({ ...ok, target: 7 })).toMatch(/how many/);
    expect(askDraftProblem({ ...ok, target: 2.5 })).toMatch(/how many/);
  });
  test("the shelf holds 1 to 48 items, and never fewer than the target", () => {
    expect(askDraftProblem({ ...ok, itemIds: [] })).toMatch(/at least one item/);
    expect(askDraftProblem({ ...ok, target: 1, itemIds: ids(ASK_SHELF_MAX + 1) })).toMatch(/48 items at most/);
    expect(askDraftProblem({ ...ok, target: 3, itemIds: ids(2) })).toBe(targetTilesMessage(3));
  });
  test("Simple (Explorer) shows 4 at most; Standard keeps the 48 cap", () => {
    expect(askDraftProblem({ ...ok, style: "simple", target: 1, itemIds: ids(ASK_SIMPLE_MAX) })).toBeNull();
    expect(askDraftProblem({ ...ok, style: "simple", target: 1, itemIds: ids(ASK_SIMPLE_MAX + 1) })).toBe("Explorer shows 4 at most.");
    expect(askDraftProblem({ ...ok, style: "standard", target: 1, itemIds: ids(ASK_SIMPLE_MAX + 1) })).toBeNull();
    expect(askDraftProblem({ ...ok, style: "simple", target: 4, itemIds: ids(3) })).toBe(targetTilesMessage(4));
  });
  test("the problem never names the picker", () => {
    expect(askDraftProblem({ ...ok, label: "Easton", itemIds: ids(1) })).not.toMatch(/Easton/);
  });
});

describe("createAskArgs — 078's arguments", () => {
  test("trimmed label and noun, a blank noun as null, Standard, the shelf in tap order", () => {
    expect(createAskArgs("ask-1", "hh-1", { label: " Easton ", noun: "  ", target: 3, itemIds: ["c", "a", "b"] })).toEqual({
      p_id: "ask-1",
      p_household_id: "hh-1",
      p_label: "Easton",
      p_shelf_noun: null,
      p_screen_style: "standard",
      p_pick_target: 3,
      p_catalog_item_ids: ["c", "a", "b"],
    });
  });
  test("the chosen style; anything but simple is Standard", () => {
    const draft = { label: "Everett", target: 1, itemIds: ["a"] };
    expect(createAskArgs("ask-1", "hh-1", { ...draft, style: "simple" }).p_screen_style).toBe("simple");
    expect(createAskArgs("ask-1", "hh-1", { ...draft, style: "standard" }).p_screen_style).toBe("standard");
    expect(createAskArgs("ask-1", "hh-1", { ...draft, style: "bogus" }).p_screen_style).toBe("standard");
  });
  test("the item list is a copy", () => {
    const itemIds = ["a"];
    const args = createAskArgs("ask-1", "hh-1", { label: "E", target: 1, itemIds });
    itemIds.push("b");
    expect(args.p_catalog_item_ids).toEqual(["a"]);
  });
});

describe("createAskFailure — our copy, never the server's message", () => {
  const draft = { label: " Easton ", target: 3, itemIds: ids(4) };
  test("23505: You already have Ask {Label}., marked as carrying the name", () => {
    expect(createAskFailure("23505", draft)).toEqual({ message: "You already have Ask Easton.", hasName: true, field: "label" });
  });
  test("22023: the target-vs-tiles message when that is the cause, else a shelf message", () => {
    expect(createAskFailure("22023", { ...draft, itemIds: ids(2) })).toEqual({ message: targetTilesMessage(3), hasName: false, field: "shelf" });
    expect(createAskFailure("22023", draft)).toMatchObject({ field: "shelf" });
    expect(createAskFailure("22023", draft).message).toMatch(/isn't available/);
  });
  test("anything else names nobody", () => {
    for (const code of ["42501", "42710", undefined, "PGRST301"]) {
      const f = createAskFailure(code, draft);
      expect(f.hasName).toBe(false);
      expect(f.field).toBeNull();
      expect(f.message).not.toMatch(/Easton/);
    }
  });
});

describe("findDuplicateAsk — K2 as the name is typed", () => {
  const asks = [{ id: "a", label: "Easton" }, { id: "b", label: "Everett" }];
  test("trimmed and case-insensitive; returns the existing ask, with its own spelling", () => {
    expect(findDuplicateAsk(" easton ", asks)).toEqual({ id: "a", label: "Easton" });
    expect(findDuplicateAsk("EVERETT", asks).label).toBe("Everett");
  });
  test("no match, a blank name, or no asks is null", () => {
    expect(findDuplicateAsk("Nina", asks)).toBeNull();
    expect(findDuplicateAsk("   ", asks)).toBeNull();
    expect(findDuplicateAsk("Easton", null)).toBeNull();
    expect(findDuplicateAsk("Easto", asks)).toBeNull();
  });
});

describe("shapeAsks — the asks read", () => {
  test("oldest first; each shelf in position order with its catalog item (S4-9); missing fields are safe", () => {
    const rows = [
      { id: "b", household_id: "hh", label: "Everett", shelf_noun: null, screen_style: "standard", pick_target: 1, created_at: "2026-11-07T10:00:00Z",
        ask_shelf_items: [
          { catalog_item_id: "y", position: 1, catalog_items: { name: "Yogurt", category: "Dairy", is_global: false, household_id: "hh", deleted_at: "2026-11-10T00:00:00Z" } },
          { catalog_item_id: "x", position: 0, catalog_items: { name: "Apples", category: "Produce", is_global: true, household_id: null, deleted_at: null } },
          { catalog_item_id: "z", position: 2 },
        ] },
      { id: "a", label: "Easton", shelf_noun: "snacks", screen_style: "standard", pick_target: 3, created_at: "2026-11-06T10:00:00Z" },
    ];
    expect(shapeAsks(rows)).toEqual([
      { id: "a", householdId: null, label: "Easton", shelfNoun: "snacks", screenStyle: "standard", pickTarget: 3, createdAt: "2026-11-06T10:00:00Z", itemIds: [], shelf: [] },
      { id: "b", householdId: "hh", label: "Everett", shelfNoun: null, screenStyle: "standard", pickTarget: 1, createdAt: "2026-11-07T10:00:00Z", itemIds: ["x", "y", "z"], shelf: [
        { id: "x", item: { name: "Apples", category: "Produce", isGlobal: true, householdId: null, deletedAt: null } },
        { id: "y", item: { name: "Yogurt", category: "Dairy", isGlobal: false, householdId: "hh", deletedAt: "2026-11-10T00:00:00Z" } },
        { id: "z", item: null },
      ] },
    ]);
    expect(shapeAsks(null)).toEqual([]);
  });
});

describe("pickLine — A14 / A25", () => {
  test("with and without a noun; a target of one is its own line, noun or not", () => {
    expect(pickLine(3, "snacks")).toBe("Pick 3 snacks for our list.");
    expect(pickLine(3, " ")).toBe("Pick 3 for our list.");
    expect(pickLine(1, "")).toBe("Pick one for our list.");
    expect(pickLine(1, "snacks")).toBe("Pick one for our list.");
  });
});

test("updateAskArgs — 083's arguments: create's shape with the ask's id, the whole form every time", () => {
  expect(updateAskArgs("hh-1", "ask-1", { label: " Easton ", noun: "  ", target: 2, itemIds: ["c", "a"], style: "simple" })).toEqual({
    p_household_id: "hh-1", p_ask_id: "ask-1", p_label: "Easton", p_shelf_noun: null, p_screen_style: "simple",
    p_pick_target: 2, p_catalog_item_ids: ["c", "a"],
  });
  expect(updateAskArgs("hh-1", "ask-1", { label: "E", noun: "snacks", target: 1, itemIds: ["a"] }).p_screen_style).toBe("standard");
});
