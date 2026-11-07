import { tapTile, takeOut, undoLast, canConfirm, shelfTitlePrefix, shelfCanRun, tileFace } from "./askRun";

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

test("undoLast — ↶ takes the last pick out; an empty wagon stays empty", () => {
  expect(undoLast(["a", "b"])).toEqual(["a"]);
  expect(undoLast([])).toEqual([]);
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

test("shelfCanRun — at least as many tiles as the target", () => {
  expect(shelfCanRun([1, 2, 3], 3)).toBe(true);
  expect(shelfCanRun([1, 2], 3)).toBe(false);
  expect(shelfCanRun(null, 1)).toBe(false);
});
