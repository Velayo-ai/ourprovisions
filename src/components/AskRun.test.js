/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the privacy classes (.op-replay-block on the root, .op-name around every copy of the name) are
   the rules under test, read as raw DOM. */
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { AskRun } from "./AskRun";

// Running an Ask (SPEC_ask amendment A14–A17, A24; SPEC_ask_slice2 C3b).
const ASK = { id: "a-easton", label: "Easton", shelfNoun: "snacks", pickTarget: 3 };
const TILES = ["Goldfish", "Apples", "Cheese", "Yogurt"].map((name, i) => ({ id: `c-${i}`, name, glyph: "🍎", photoUrl: null }));

function setup({ onLand = jest.fn(async () => {}), tiles = TILES, ask = ASK } = {}) {
  const onExit = jest.fn();
  const view = render(<AskRun ask={ask} tiles={tiles} onLand={onLand} onExit={onExit} />);
  return { onLand, onExit, container: view.container };
}
const tile = (name) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const thatsIt = () => screen.getByRole("button", { name: /That's it!|Adding…/ });
function toShelf() { fireEvent.click(screen.getByRole("button", { name: "Let's pick" })); }

test("the run is excluded from replay, and every copy of the name wears .op-name", () => {
  const { container } = setup();
  expect(container.firstChild).toHaveClass("op-replay-block");
  const names = () => [...container.querySelectorAll(".op-name")].map((n) => n.textContent);
  expect(names()).toEqual(["Easton", "Easton"]);                    // eyebrow + "Your turn, Easton!"
  expect(screen.getByText("Pick 3 snacks for our list.")).toBeInTheDocument();
  toShelf();
  expect(names()).toEqual(["Easton", "Easton"]);                    // eyebrow + "Pick 3, Easton!"
  // No other text node carries the name.
  const leaks = [...container.querySelectorAll("*")].filter((el) => !el.closest(".op-name")
    && [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.includes("Easton")));
  expect(leaks).toEqual([]);
});

test("Your turn → the shelf; picks fill the wagon in order; That's it! only when full; one write", async () => {
  const { onLand } = setup();
  toShelf();
  expect(screen.getByRole("heading")).toHaveTextContent("Pick 3, Easton!");
  expect(thatsIt()).toBeDisabled();
  fireEvent.click(tile("Cheese"));
  fireEvent.click(tile("Goldfish"));
  expect(screen.getByLabelText("2 of 3 picked")).toBeInTheDocument();
  fireEvent.click(tile("Yogurt"));
  expect(thatsIt()).toBeEnabled();
  fireEvent.click(thatsIt());
  await screen.findByText("I've added these to our list.");
  expect(onLand).toHaveBeenCalledTimes(1);
  expect(onLand).toHaveBeenCalledWith(["c-2", "c-0", "c-3"]);
  expect(screen.getByRole("heading")).toHaveTextContent("Great picks, Easton!");
  expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["🍎Cheese", "🍎Goldfish", "🍎Yogurt"]);
});

test("changing his mind: the tile again, the item in the wagon, or ↶; a full wagon takes nothing new", () => {
  const { onLand } = setup();
  toShelf();
  fireEvent.click(tile("Goldfish"));
  fireEvent.click(tile("Goldfish"));                                    // tile again → out
  expect(screen.getByLabelText("0 of 3 picked")).toBeInTheDocument();
  fireEvent.click(tile("Goldfish")); fireEvent.click(tile("Apples")); fireEvent.click(tile("Cheese"));
  fireEvent.click(tile("Yogurt"));                                      // full: nothing changes
  expect(tile("Yogurt")).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByLabelText("3 of 3 picked")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Take out Apples" }));   // the wagon
  expect(tile("Apples")).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "Take the last one out" }));   // ↶ → Cheese out
  expect(tile("Cheese")).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByLabelText("1 of 3 picked")).toBeInTheDocument();
  expect(onLand).not.toHaveBeenCalled();
});

test("a landing that fails keeps the wagon held and says so; That's it! again lands", async () => {
  const onLand = jest.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
  setup({ onLand });
  toShelf();
  ["Goldfish", "Apples", "Cheese"].forEach((n) => fireEvent.click(tile(n)));
  fireEvent.click(thatsIt());
  expect(await screen.findByRole("alert")).toHaveTextContent("That didn't reach the list.");
  expect(screen.getByLabelText("3 of 3 picked")).toBeInTheDocument();
  fireEvent.click(thatsIt());
  await screen.findByText("I've added these to our list.");
  expect(onLand).toHaveBeenCalledTimes(2);
});

describe("Done needs a hold (A17)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  test("a short tap only says 'Hold to finish'; a one-second hold exits", () => {
    const { onExit } = setup();
    const done = screen.getByRole("button", { name: "Hold to finish" });
    fireEvent.pointerDown(done);
    act(() => { jest.advanceTimersByTime(400); });
    fireEvent.pointerUp(done);
    expect(onExit).not.toHaveBeenCalled();
    expect(done).toHaveTextContent("Hold to finish");
    fireEvent.pointerDown(done);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

test("after the confirm, Done and Back to the list both just leave", async () => {
  const { onExit } = setup({ ask: { ...ASK, pickTarget: 1 } });
  toShelf();
  expect(screen.getByRole("heading")).toHaveTextContent("Pick one, Easton!");
  fireEvent.click(tile("Apples"));
  fireEvent.click(thatsIt());
  await screen.findByText("I've added these to our list.");
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  fireEvent.click(screen.getByRole("button", { name: "Back to the list" }));
  await waitFor(() => expect(onExit).toHaveBeenCalledTimes(2));
});

test("a shelf with fewer tiles than the target says so and does not start", () => {
  setup({ tiles: TILES.slice(0, 2) });
  expect(screen.getByText(/fewer things on it than there are to pick/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Let's pick" })).toBeNull();
});

// C3b.1 (Dan, 2026-11-07): with no photo, a tile shows the ITEM's own glyph if the catalog has one,
// else a plain name tile — never the aisle's glyph (Bananas showed Produce's 🥦). The shelf grid,
// the wagon and Great picks alike.
test("no photo and no item glyph → plain name tiles everywhere, no glyph or art box", async () => {
  const plain = ["Apples", "Bananas", "Greek yogurt"].map((name, i) => ({ id: `p-${i}`, name, glyph: null, photoUrl: null }));
  const { container } = setup({ tiles: plain });
  toShelf();
  const bananas = screen.getByRole("button", { name: /^Bananas/ });
  expect(bananas).toHaveClass("plain");
  expect(bananas.querySelector(".ask-tile-art")).toBeNull();
  expect(bananas.textContent.replace("✓", "")).toBe("Bananas");
  ["Apples", "Bananas", "Greek yogurt"].forEach((n) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${n}`) })));
  // The wagon draws each pick's name, not a glyph.
  const wagonText = [...container.querySelectorAll(".ask-wagon text")].map((t) => t.textContent);
  expect(wagonText).toEqual(["Apples", "Bananas", "Greek yogurt"]);
  fireEvent.click(thatsIt());
  await screen.findByText("I've added these to our list.");
  expect(container.querySelectorAll(".ask-landed-art")).toHaveLength(0);
  expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Apples", "Bananas", "Greek yogurt"]);
  expect(container.textContent).not.toMatch(/[🥦🥫🥛🍞📦]/u);
});

test("an item glyph, when the catalog has one, is shown; a photo wins over it", () => {
  setup({ tiles: [
    { id: "g", name: "Bananas", glyph: "🍌", photoUrl: null },
    { id: "p", name: "Apples", glyph: "🍎", photoUrl: "https://x/apples.webp" },
    { id: "n", name: "Bread", glyph: null, photoUrl: null },
  ], ask: { ...ASK, pickTarget: 1 } });
  toShelf();
  expect(screen.getByRole("button", { name: /^Bananas/ })).toHaveTextContent("🍌");
  const apples = screen.getByRole("button", { name: /^Apples/ });
  expect(apples).not.toHaveTextContent("🍎");
  expect(apples.querySelector("img")).toHaveAttribute("src", "https://x/apples.webp");
});

// Simple (SPEC_ask_slice3 S3-1–S3-4): one component; only the grid, the tile names and the child's
// two buttons change. The grown-up's controls and the titles stay words.
describe("Simple", () => {
  const SIMPLE = { id: "a-everett", label: "Everett", shelfNoun: null, pickTarget: 1, screenStyle: "simple" };
  const FOUR = [
    { id: "s-0", name: "Apples", glyph: "🍎", photoUrl: null },
    { id: "s-1", name: "Bananas", glyph: null, photoUrl: "https://x/bananas.webp" },
    { id: "s-2", name: "Cheese", glyph: "🧀", photoUrl: null },
    { id: "s-3", name: "Bread", glyph: null, photoUrl: null },
  ];
  test("▶ on Your turn; 2×2 tiles with no names but the plain tile's; ✓ for That's it!; words for the grown-up", async () => {
    const { container, onLand } = setup({ ask: SIMPLE, tiles: FOUR });
    expect(screen.getByRole("heading")).toHaveTextContent("Your turn, Everett!");
    const go = screen.getByRole("button", { name: "Let's pick" });
    expect(go).toHaveClass("ask-icon");
    expect(go.textContent).toBe("");
    expect(screen.getByRole("button", { name: "Hold to finish" })).toHaveTextContent("Done");
    fireEvent.click(go);
    expect(container.querySelector(".ask-tiles")).toHaveClass("ask-tiles-simple");
    expect(container.querySelectorAll(".ask-tile-name")).toHaveLength(1);       // Bread, the plain tile
    expect(screen.getByRole("button", { name: "Bread" })).toHaveTextContent("Bread");
    for (const n of ["Apples", "Bananas", "Cheese"]) {
      const t = screen.getByRole("button", { name: n });
      expect(t).toHaveAttribute("aria-label", n);
      expect(t.textContent).not.toMatch(n);
    }
    const ok = screen.getByRole("button", { name: "That's it!" });
    expect(ok).toHaveClass("ask-icon");
    expect(ok.textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Apples" }));
    fireEvent.click(ok);
    await screen.findByText("I've added these to our list.");
    expect(onLand).toHaveBeenCalledWith(["s-0"]);
    expect(screen.getByRole("heading")).toHaveTextContent("Great picks, Everett!");
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["🍎Apples"]);
    expect(screen.getByRole("button", { name: "Back to the list" })).toHaveTextContent("Back to the list");
  });
  test("a failed land on Simple keeps the wagon and points at ✓", async () => {
    setup({ ask: SIMPLE, tiles: FOUR, onLand: jest.fn().mockRejectedValueOnce(new Error("offline")) });
    toShelf();
    fireEvent.click(screen.getByRole("button", { name: "Cheese" }));
    fireEvent.click(screen.getByRole("button", { name: "That's it!" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't reach the list. Tap ✓ again.");
    expect(screen.getByLabelText("1 of 1 picked")).toBeInTheDocument();
  });
  test("Standard keeps its words and names", () => {
    const { container } = setup();
    expect(screen.getByRole("button", { name: "Let's pick" })).toHaveTextContent("Let's pick");
    toShelf();
    expect(container.querySelector(".ask-tiles")).not.toHaveClass("ask-tiles-simple");
    expect(container.querySelectorAll(".ask-tile-name")).toHaveLength(4);
    expect(thatsIt()).toHaveTextContent("That's it!");
  });
});

// A26 resume (S3-6): op_ask_held tracks the screen and the picks while the run is up.
describe("op_ask_held", () => {
  const held = () => JSON.parse(sessionStorage.getItem("op_ask_held"));
  beforeEach(() => sessionStorage.clear());
  test("written on every change of screen or picks; ids only; cleared when the picks land", async () => {
    setup();
    expect(held()).toEqual({ ask_id: "a-easton", screen: "turn", catalog_item_ids: [] });
    toShelf();
    expect(held()).toEqual({ ask_id: "a-easton", screen: "shelf", catalog_item_ids: [] });
    fireEvent.click(tile("Cheese")); fireEvent.click(tile("Apples"));
    expect(held()).toEqual({ ask_id: "a-easton", screen: "shelf", catalog_item_ids: ["c-2", "c-1"] });
    expect(sessionStorage.getItem("op_ask_held")).not.toMatch(/Easton|Cheese|standard/);
    fireEvent.click(tile("Yogurt"));
    fireEvent.click(thatsIt());
    await screen.findByText("I've added these to our list.");
    expect(sessionStorage.getItem("op_ask_held")).toBeNull();
  });
  test("a failed land keeps the key with the wagon", async () => {
    setup({ onLand: jest.fn().mockRejectedValueOnce(new Error("offline")) });
    toShelf();
    ["Goldfish", "Apples", "Cheese"].forEach((n) => fireEvent.click(tile(n)));
    fireEvent.click(thatsIt());
    await screen.findByRole("alert");
    expect(held().catalog_item_ids).toEqual(["c-0", "c-1", "c-2"]);
  });
  test("a resumed run opens on its screen with its picks", () => {
    render(<AskRun ask={ASK} tiles={TILES} onLand={jest.fn()} onExit={jest.fn()} resume={{ screen: "shelf", ids: ["c-3", "c-0"] }} />);
    expect(screen.getByRole("heading")).toHaveTextContent("Pick 3, Easton!");
    expect(screen.getByLabelText("2 of 3 picked")).toBeInTheDocument();
    expect(tile("Yogurt")).toHaveAttribute("aria-pressed", "true");
    expect(held().catalog_item_ids).toEqual(["c-3", "c-0"]);
  });
  test("a run resumed on Your turn opens there", () => {
    render(<AskRun ask={ASK} tiles={TILES} onLand={jest.fn()} onExit={jest.fn()} resume={{ screen: "turn", ids: [] }} />);
    expect(screen.getByRole("heading")).toHaveTextContent("Your turn, Easton!");
  });
});
