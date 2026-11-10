import { tapTile, takeOut, canConfirm, shelfTitlePrefix, liveTiles, effectiveTarget, tileFace, heldAskWrite, heldAskRead } from "./askRun";

describe("tapTile — A16", () => {
  test("adds in tap order until the target", () => {
    let r = tapTile([], "a", 3);
    expect(r).toEqual({ picks: ["a"], effect: "added" });
    r = tapTile(r.picks, "c", 3);
    expect(r.picks).toEqual(["a", "c"]);
  });
  test("a picked tile tapped again comes out", () => {
    expect(tapTile(["a", "b"], "a", 3)).toEqual({ picks: ["b"], effect: "removed" });
  });
  test("a new tile when the wagon is full changes nothing (the wagon shakes)", () => {
    const picks = ["a", "b", "c"];
    const r = tapTile(picks, "d", 3);
    expect(r.effect).toBe("full");
    expect(r.picks).toBe(picks);
  });
  test("a picked tile still comes out when the wagon is full", () => {
    expect(tapTile(["a", "b", "c"], "b", 3)).toEqual({ picks: ["a", "c"], effect: "removed" });
  });
});

test("takeOut — a tap on the item in the wagon", () => {
  expect(takeOut(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  expect(takeOut(["a"], "z")).toEqual(["a"]);
});

test("canConfirm — only with the wagon exactly full", () => {
  expect(canConfirm(["a", "b"], 3)).toBe(false);
  expect(canConfirm(["a", "b", "c"], 3)).toBe(true);
  expect(canConfirm([], 1)).toBe(false);
});

test("shelfTitlePrefix — 'Pick 3, ' / 'Pick one, '", () => {
  expect(shelfTitlePrefix(3)).toBe("Pick 3, ");
  expect(shelfTitlePrefix(1)).toBe("Pick one, ");
});

test("tileFace — the photo, else the item's own glyph, else a plain name tile; never the aisle", () => {
  expect(tileFace({ photoUrl: "https://x/t.webp", glyph: "🍌" })).toBe("photo");
  expect(tileFace({ photoUrl: null, glyph: "🍌" })).toBe("glyph");
  expect(tileFace({ photoUrl: null, glyph: null })).toBe("name");
  expect(tileFace({})).toBe("name");
});

// S4-9: the live-tile rule, the one 083 computes. The shelf's rows decide, never Browse's list.
const row = (id, item) => ({ id, item });
const live = (name, extra = {}) => ({ name, category: "Snacks", isGlobal: true, householdId: null, deletedAt: null, ...extra });
describe("liveTiles / effectiveTarget — S4-9, S4-5", () => {
  const ask = { id: "a", householdId: "hh", pickTarget: 3, shelf: [
    row("c-1", live("Apples")),
    row("c-2", live("Ours", { isGlobal: false, householdId: "hh" })),
    row("c-3", live("Gone", { isGlobal: false, householdId: "hh", deletedAt: "2026-11-10T00:00:00Z" })),
    row("c-4", live("Theirs", { isGlobal: false, householdId: "other" })),
    row("c-5", null),
  ] };
  test("live = not deleted, and global or this household's own; in shelf order; a hidden tile is still a tile", () => {
    expect(liveTiles(ask)).toEqual([{ id: "c-1", name: "Apples", category: "Snacks" }, { id: "c-2", name: "Ours", category: "Snacks" }]);
    expect(liveTiles({ id: "x", householdId: "hh", shelf: [] })).toEqual([]);
    expect(liveTiles(null)).toEqual([]);
  });
  test("short (2 of 3) → 2; exact → the target; 0 live → 0", () => {
    expect(effectiveTarget(ask, liveTiles(ask))).toBe(2);
    expect(effectiveTarget({ pickTarget: 2 }, [{ id: "c-1" }, { id: "c-2" }])).toBe(2);
    expect(effectiveTarget({ pickTarget: 1 }, [{ id: "c-1" }, { id: "c-2" }])).toBe(1);
    expect(effectiveTarget({ pickTarget: 3 }, [])).toBe(0);
    expect(effectiveTarget(null, null)).toBe(0);
  });
});

describe("heldAskWrite / heldAskRead — A26 resume (SPEC_ask_slice3 S3-6)", () => {
  const ASKS = [{ id: "a-easton", label: "Easton", householdId: "hh", pickTarget: 3,
    shelf: ["c-1", "c-2", "c-3", "c-4"].map((id) => row(id, live(id))) }];
  const held = (v) => JSON.stringify(v);
  test("the value holds the ask id, the screen and the ids — nothing else", () => {
    const v = JSON.parse(heldAskWrite("a-easton", "shelf", ["c-2", "c-1"]));
    expect(v).toEqual({ ask_id: "a-easton", screen: "shelf", catalog_item_ids: ["c-2", "c-1"] });
    expect(Object.keys(v).sort()).toEqual(["ask_id", "catalog_item_ids", "screen"]);
    expect(JSON.stringify(v)).not.toMatch(/Easton/);
  });
  test("a held run reads back", () => {
    expect(heldAskRead(heldAskWrite("a-easton", "shelf", ["c-2", "c-1"]), ASKS)).toEqual({ askId: "a-easton", screen: "shelf", ids: ["c-2", "c-1"] });
    expect(heldAskRead(heldAskWrite("a-easton", "turn", []), ASKS)).toEqual({ askId: "a-easton", screen: "turn", ids: [] });
  });
  test("a bad value or a missing key is nothing to resume", () => {
    for (const raw of [null, "", "{", "null", "42", held({ screen: "shelf" }), held({ ask_id: 7 })]) expect(heldAskRead(raw, ASKS)).toBeNull();
  });
  test("an ask that isn't one of this place's live asks is nothing to resume", () => {
    expect(heldAskRead(heldAskWrite("a-gone", "shelf", ["c-1"]), ASKS)).toBeNull();
    expect(heldAskRead(heldAskWrite("a-easton", "shelf", ["c-1"]), [])).toBeNull();
  });
  test("ids off the shelf drop, duplicates collapse, and the picks cap at the target", () => {
    expect(heldAskRead(held({ ask_id: "a-easton", screen: "shelf", catalog_item_ids: ["c-9", "c-1", 5] }), ASKS).ids).toEqual(["c-1"]);
    expect(heldAskRead(held({ ask_id: "a-easton", screen: "shelf", catalog_item_ids: ["c-1", "c-1", "c-2"] }), ASKS).ids).toEqual(["c-1", "c-2"]);
    expect(heldAskRead(held({ ask_id: "a-easton", screen: "shelf", catalog_item_ids: ["c-1", "c-2", "c-3", "c-4"] }), ASKS).ids).toEqual(["c-1", "c-2", "c-3"]);
    expect(heldAskRead(held({ ask_id: "a-easton", screen: "shelf", catalog_item_ids: "c-1" }), ASKS).ids).toEqual([]);
  });
  test("the picks are filtered to the LIVE tiles and capped at the effective target; a shelf with nothing live is nothing to resume", () => {
    const short = [{ ...ASKS[0], shelf: [row("c-1", live("A")), row("c-2", live("B")), row("c-3", live("C", { deletedAt: "2026-11-10T00:00:00Z" }))] }];
    expect(heldAskRead(held({ ask_id: "a-easton", screen: "shelf", catalog_item_ids: ["c-3", "c-1", "c-2"] }), short).ids).toEqual(["c-1", "c-2"]);
    const dead = [{ ...ASKS[0], shelf: [row("c-1", null)] }];
    expect(heldAskRead(held({ ask_id: "a-easton", screen: "shelf", catalog_item_ids: [] }), dead)).toBeNull();
  });
  test("an unknown screen reads as the hand-over", () => {
    expect(heldAskRead(held({ ask_id: "a-easton", screen: "done", catalog_item_ids: [] }), ASKS).screen).toBe("turn");
    expect(heldAskRead(held({ ask_id: "a-easton", catalog_item_ids: [] }), ASKS).screen).toBe("turn");
  });
});
