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
  test("short of the target: '{k} of {n} on the ask', n = the pick target", () => {
    const nina = { ...everett, pickTarget: 3, shelf: shelf(["c-1", item("Apples")], ["c-2", item("Bananas")],
      ["c-3", item("Gone", { isGlobal: false, householdId: "hh", deletedAt: "2026-11-10T00:00:00Z" })]) };
    expect(shelfNote(nina)).toBe("2 of 3 on the ask");
  });
  test("no live tile: 'Nothing on this ask yet'", () => {
    expect(shelfNote({ ...everett, shelf: shelf(["c-1", item("Gone", { deletedAt: "2026-11-10T00:00:00Z" })]) })).toBe("Nothing on this ask yet");
    expect(shelfNote({ ...everett, shelf: [] })).toBe("Nothing on this ask yet");
  });
});

describe("manageRow — one row under Asks in View & organize (S4-1)", () => {
  test("whole (more tiles than the target): the summary 'Pick {n} of {count} · {look}', no second line", () => {
    expect(manageRow({ ...everett, screenStyle: "simple", pickTarget: 2 })).toEqual({
      id: "a", label: "Everett", style: "Explorer", pick: "pick 2", shelf: "4 on the ask", short: false,
      summary: "Pick 2 of 4 · Explorer", needMore: null,
    });
  });
  test("exact (tiles = target): the summary alone, no second line", () => {
    expect(manageRow({ ...everett, pickTarget: 4 })).toMatchObject({ summary: "Pick 4 of 4 · Shopper", needMore: null, short: false });
  });
  test("short (some tiles, fewer than the target): the second line counts what is missing, singular and plural", () => {
    const two = { ...everett, shelf: everett.shelf.slice(0, 2) };          // target 3
    expect(manageRow(two)).toMatchObject({ style: "Shopper", pick: "pick 3", shelf: "2 of 3 on the ask", short: true,
      summary: "Pick 3 of 2 · Shopper", needMore: "Add 1 more item so they can finish" });
    const one = { ...everett, shelf: everett.shelf.slice(0, 1) };
    expect(manageRow(one).needMore).toBe("Add 2 more items so they can finish");
    // Another household's custom item is not a live tile, so it does not count toward the target.
    const foreign = { ...everett, pickTarget: 2, shelf: shelf(["c-1", item("Apples")], ["c-2", item("Theirs", { isGlobal: false, householdId: "other" })]) };
    expect(manageRow(foreign).needMore).toBe("Add 1 more item so they can finish");
  });
  test("empty (no live tile): 'No items yet · {look}' and no second line — the summary is the message", () => {
    expect(manageRow({ ...everett, shelf: [] })).toMatchObject({ shelf: "Nothing on this ask yet", short: true, summary: "No items yet · Shopper", needMore: null });
    // A deleted tile is not live.
    expect(manageRow({ ...everett, shelf: shelf(["c-1", item("Gone", { deletedAt: "2026-11-10T00:00:00Z" })]) })).toMatchObject({ summary: "No items yet · Shopper", needMore: null });
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
