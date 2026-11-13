import { styleWord, shelfNote, manageRow, saveOutcome, photoNudge } from "./askManage";

const item = (name, extra = {}) => ({ name, category: "Snacks", isGlobal: true, householdId: null, deletedAt: null, ...extra });
const shelf = (...rows) => rows.map(([id, it]) => ({ id, item: it }));
const everett = { id: "a", label: "Everett", householdId: "hh", screenStyle: "standard", pickTarget: 3,
  shelf: shelf(["c-1", item("Apples")], ["c-2", item("Bananas")], ["c-3", item("Bread")], ["c-4", item("Broccoli")]) };

test("styleWord — Explorer / Shopper on screen; the stored values stay simple / standard", () => {
  expect(styleWord("simple")).toBe("Explorer");
  expect(styleWord("standard")).toBe("Shopper");
  expect(styleWord(undefined)).toBe("Shopper");
});

describe("shelfNote — S4-5, the grown-up's note", () => {
  test("a whole shelf has no note; a hidden tile is still on the shelf", () => {
    expect(shelfNote(everett)).toBeNull();
  });
  test("short of the target: '{k} of {n} on the shelf', n = the pick target", () => {
    const nina = { ...everett, pickTarget: 3, shelf: shelf(["c-1", item("Apples")], ["c-2", item("Bananas")],
      ["c-3", item("Gone", { isGlobal: false, householdId: "hh", deletedAt: "2026-11-10T00:00:00Z" })]) };
    expect(shelfNote(nina)).toBe("2 of 3 on the shelf");
  });
  test("no live tile: 'Nothing on this shelf yet'", () => {
    expect(shelfNote({ ...everett, shelf: shelf(["c-1", item("Gone", { deletedAt: "2026-11-10T00:00:00Z" })]) })).toBe("Nothing on this shelf yet");
    expect(shelfNote({ ...everett, shelf: [] })).toBe("Nothing on this shelf yet");
  });
});

describe("manageRow — one row in Manage categories & asks (S4-1)", () => {
  test("whole: the style word, the target, the tile count", () => {
    expect(manageRow({ ...everett, screenStyle: "simple", pickTarget: 2 })).toEqual({
      id: "a", label: "Everett", style: "Explorer", pick: "pick 2", shelf: "4 on the shelf", short: false,
    });
  });
  test("short or empty: the note stands in for the count", () => {
    const short = { ...everett, shelf: everett.shelf.slice(0, 2) };
    expect(manageRow(short)).toMatchObject({ style: "Shopper", pick: "pick 3", shelf: "2 of 3 on the shelf", short: true });
    expect(manageRow({ ...everett, shelf: [] })).toMatchObject({ shelf: "Nothing on this shelf yet", short: true });
  });
});

describe("saveOutcome — the growth moment (S4-6)", () => {
  const was = { pickTarget: 2, screenStyle: "simple" };
  test("a raised target, or Explorer → Shopper, is growth", () => {
    expect(saveOutcome(was, { target: 3, style: "simple" })).toBe("grown");
    expect(saveOutcome(was, { target: 2, style: "standard" })).toBe("grown");
    expect(saveOutcome({ pickTarget: 1, screenStyle: "standard" }, { target: 2, style: "standard" })).toBe("grown");
  });
  test("the same, a lowered target, Shopper → Explorer, or a shelf-only change is just saved", () => {
    expect(saveOutcome(was, { target: 2, style: "simple" })).toBe("saved");
    expect(saveOutcome(was, { target: 1, style: "simple" })).toBe("saved");
    expect(saveOutcome({ pickTarget: 3, screenStyle: "standard" }, { target: 3, style: "simple" })).toBe("saved");
    expect(saveOutcome({ pickTarget: 3, screenStyle: "standard" }, { target: 2, style: "simple" })).toBe("saved");
  });
});

test("photoNudge — S4-7: one, two, or two and n more; nothing to name → null", () => {
  expect(photoNudge(["Butter"])).toBe("Explorers pick by picture. Add a photo for Butter.");
  expect(photoNudge(["Butter", "Canned tomatoes"])).toBe("Explorers pick by picture. Add a photo for Butter and Canned tomatoes.");
  expect(photoNudge(["Butter", "Canned tomatoes", "Bread"])).toBe("Explorers pick by picture. Add a photo for Butter, Canned tomatoes and 1 more.");
  expect(photoNudge(["A", "B", "C", "D"])).toBe("Explorers pick by picture. Add a photo for A, B and 2 more.");
  expect(photoNudge([])).toBeNull();
  expect(photoNudge(null)).toBeNull();
});
