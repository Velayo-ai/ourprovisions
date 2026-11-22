import {
  askDraftProblem, createAskArgs, updateAskArgs, createAskFailure, cleanAskLabel, shelfCatalog, shapeAsks, pickLine, targetTilesMessage, findDuplicateAsk,
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

test("cleanAskLabel — trims, strips a leading 'Ask ' (any case, repeated); a bare Ask stays", () => {
  expect(cleanAskLabel("  Easton ")).toBe("Easton");
  expect(cleanAskLabel("Ask Test")).toBe("Test");
  expect(cleanAskLabel("ASK  Easton")).toBe("Easton");
  expect(cleanAskLabel("ask ask Test")).toBe("Test");
  expect(cleanAskLabel("Ask")).toBe("Ask");
  expect(cleanAskLabel(" ask ")).toBe("ask");
  expect(cleanAskLabel("Asker")).toBe("Asker");
  expect(cleanAskLabel("Askew Kid")).toBe("Askew Kid");
  expect(cleanAskLabel("")).toBe("");
  expect(cleanAskLabel(null)).toBe("");
});

test("shelfCatalog — Browse's catalog plus the editor's hidden items, once each, shown as they are", () => {
  const map = { Apples: { id: "a", name: "Apples" }, Bread: { id: "b", name: "Bread" } };
  const hidden = [{ id: "h", name: "Hidden thing" }, { id: "a", name: "Apples" }, { name: "no id" }];
  expect(shelfCatalog(map, hidden).map((i) => i.id)).toEqual(["a", "b", "h"]);
  expect(shelfCatalog(map, null).map((i) => i.id)).toEqual(["a", "b"]);
  expect(shelfCatalog(null, hidden).map((i) => i.id)).toEqual(["h", "a"]);
});

// ── 087 edit_ask: the delta save (SPEC_ask_shelf_sync B3, B4) ──────────────────────────────────
describe("the delta save (087 edit_ask)", () => {
  const { NO_PENDING, mergeShelf, togglePending, editAskArgs, createAskFailure: failure } = require("./askCreate");
  const SERVER = ["a", "b", "c"];

  test("mergeShelf: the server's shelf − removes + adds, adds at the end in order, no repeats", () => {
    expect(mergeShelf(SERVER, NO_PENDING)).toEqual(["a", "b", "c"]);
    expect(mergeShelf(SERVER, { adds: ["e", "d"], removes: ["b"] })).toEqual(["a", "c", "e", "d"]);
    // Another member added "d" first: it shows once, at the server's place.
    expect(mergeShelf([...SERVER, "d"], { adds: ["d"], removes: [] })).toEqual(["a", "b", "c", "d"]);
    // Another member removed "a" the editor had already removed: still gone.
    expect(mergeShelf(["b", "c"], { adds: [], removes: ["a"] })).toEqual(["b", "c"]);
  });

  test("togglePending: off removes (or un-adds), on adds (or un-removes); never both", () => {
    let p = togglePending(NO_PENDING, SERVER, "b");          // a server tile off
    expect(p).toEqual({ adds: [], removes: ["b"] });
    p = togglePending(p, SERVER, "b");                       // back on: un-removed, not added
    expect(p).toEqual({ adds: [], removes: [] });
    p = togglePending(p, SERVER, "d");                       // a new item on
    expect(p).toEqual({ adds: ["d"], removes: [] });
    p = togglePending(p, SERVER, "d");                       // and off again: un-added
    expect(p).toEqual({ adds: [], removes: [] });
    // An item the editor added that another member also added: off means remove it.
    p = togglePending({ adds: ["d"], removes: [] }, [...SERVER, "d"], "d");
    expect(p).toEqual({ adds: [], removes: ["d"] });
  });

  test("togglePending respects the shelf cap", () => {
    const full = Array.from({ length: 48 }, (_, i) => `t${i}`);
    expect(togglePending(NO_PENDING, full, "new")).toBe(NO_PENDING);
  });

  test("editAskArgs: the delta, and only the scalars sent; a noun of '' clears it", () => {
    expect(editAskArgs("hh", "ask", { add: ["d"], remove: ["b"] })).toEqual({
      p_household_id: "hh", p_ask_id: "ask", p_add_ids: ["d"], p_remove_ids: ["b"],
    });
    expect(editAskArgs("hh", "ask", { add: [], remove: [], label: "  Eastie ", noun: "", target: 3, style: "simple" })).toEqual({
      p_household_id: "hh", p_ask_id: "ask", p_add_ids: [], p_remove_ids: [],
      p_label: "Eastie", p_shelf_noun: "", p_pick_target: 3, p_screen_style: "simple",
    });
    expect(editAskArgs("hh", "ask")).toEqual({ p_household_id: "hh", p_ask_id: "ask", p_add_ids: [], p_remove_ids: [] });
  });

  test("P0409 reads as B5's line, never the server's message", () => {
    expect(failure("P0409", { label: "Easton", target: 2, itemIds: ["a"] }))
      .toEqual({ message: "Someone else just changed this shelf. Check it and save again.", hasName: false, field: "shelf" });
  });
});
