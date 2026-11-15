/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the privacy classes (.op-replay-block on the root, .op-name around every copy of the name) are
   the rules under test, read as raw DOM. */
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { AskRun, cardLayout, flightFor } from "./AskRun";

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
// Great picks: the wagon is the summary; its label lists the picks in order ("Your picks: A, B, C").
const summary = () => screen.getByRole("img", { name: /^Your picks?: / }).getAttribute("aria-label");

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
  await screen.findByText("Your picks are on our list!");
  expect(onLand).toHaveBeenCalledTimes(1);
  expect(onLand).toHaveBeenCalledWith(["c-2", "c-0", "c-3"]);
  expect(screen.getByRole("heading")).toHaveTextContent("Great picks, Easton!");
  expect(summary()).toBe("Your picks: Cheese, Goldfish, Yogurt");
  expect(screen.queryAllByRole("listitem")).toHaveLength(0);                           // no list under the wagon
});

test("changing his mind: the tile again or the item in the wagon; a full wagon takes nothing new; no ↶", () => {
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
  expect(screen.getByLabelText("2 of 3 picked")).toBeInTheDocument();
  // A16 amended 2026-11-09: no ↶ on either style; That's it! is the only button under the wagon.
  expect(screen.queryByRole("button", { name: "Take the last one out" })).toBeNull();
  expect(screen.queryByText("↶")).toBeNull();
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
  await screen.findByText("Your picks are on our list!");
  expect(onLand).toHaveBeenCalledTimes(2);
});

describe("Close and Done need a hold (A17; W6)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  test("the turn screen's quiet 'Close': a short tap only says 'Hold to close'; a one-second hold exits", () => {
    const { onExit } = setup();
    const close = screen.getByRole("button", { name: "Hold to close" });
    expect(close).toHaveTextContent("Close");
    expect(close).toHaveClass("ask-done");
    fireEvent.pointerDown(close);
    act(() => { jest.advanceTimersByTime(400); });
    fireEvent.pointerUp(close);
    expect(onExit).not.toHaveBeenCalled();
    expect(close).toHaveTextContent("Hold to close");
    fireEvent.pointerDown(close);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(onExit).toHaveBeenCalledTimes(1);
  });
  test("the shelf's 'Done': a short tap only says 'Hold to finish'; a one-second hold exits", () => {
    const { onExit } = setup();
    toShelf();
    expect(screen.queryByRole("button", { name: "Hold to close" })).toBeNull();
    const done = screen.getByRole("button", { name: "Hold to finish" });
    expect(done).toHaveTextContent("Done");
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

test("after the confirm: no top-right control (W6); without onHandBack, 'Give it back' just leaves", async () => {
  const { onExit } = setup({ ask: { ...ASK, pickTarget: 1 } });
  toShelf();
  expect(screen.getByRole("heading")).toHaveTextContent("Pick one, Easton!");
  fireEvent.click(tile("Apples"));
  fireEvent.click(thatsIt());
  await screen.findByText("Your pick is on our list!");
  expect(screen.getByRole("heading")).toHaveTextContent("Great pick, Easton!");   // one landed: singular
  expect(screen.queryByText("Your picks are on our list!")).toBeNull();
  expect(screen.queryByRole("button", { name: /Hold to|^Done$|^Close$/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Give it back" }));
  await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
});

// S4-5: a short shelf runs at the effective target, end to end; no grown-up screen for the child.
test("a shelf with fewer tiles than the target runs at the tiles it has: Pick 2, two dots, two land", async () => {
  const { onLand } = setup({ tiles: TILES.slice(0, 2) });
  expect(screen.getByText("Pick 2 snacks for our list.")).toBeInTheDocument();
  expect(screen.queryByText(/fewer things/)).toBeNull();
  toShelf();
  expect(screen.getByRole("heading")).toHaveTextContent("Pick 2, Easton!");
  expect(screen.getByLabelText("0 of 2 picked")).toBeInTheDocument();
  fireEvent.click(tile("Goldfish"));
  expect(thatsIt()).toBeDisabled();
  fireEvent.click(tile("Apples"));
  expect(thatsIt()).toBeEnabled();
  fireEvent.click(thatsIt());
  await screen.findByText("Your picks are on our list!");
  expect(onLand).toHaveBeenCalledWith(["c-0", "c-1"]);
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
  expect(wagonText).toEqual(["Apples", "Bananas", "Greekyogurt"]);              // a long two-word name wraps to two lines
  expect([...container.querySelectorAll(".ask-wagon text")][2].querySelectorAll("tspan")).toHaveLength(2);
  fireEvent.click(thatsIt());
  await screen.findByText("Your picks are on our list!");
  expect(summary()).toBe("Your picks: Apples, Bananas, Greek yogurt");
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
    expect(screen.getByRole("button", { name: "Hold to close" })).toHaveTextContent("Close");
    fireEvent.click(go);
    expect(container.querySelector(".ask-tiles")).toHaveClass("ask-tiles-simple");
    expect(screen.queryByRole("button", { name: "Take the last one out" })).toBeNull();   // no ↶ here either
    expect(container.querySelectorAll(".ask-actions button")).toHaveLength(1);         // ✓ alone, centred
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
    await screen.findByText("Your pick is on our list!");
    expect(onLand).toHaveBeenCalledWith(["s-0"]);
    expect(screen.getByRole("heading")).toHaveTextContent("Great pick, Everett!");
    expect(summary()).toBe("Your pick: Apples");
    expect(screen.getByRole("button", { name: "Give it back" })).toHaveTextContent("Give it back");
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
    await screen.findByText("Your picks are on our list!");
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

// SPEC_ask_wagon_handback (W1–W10).
describe("the wagon (W1–W4)", () => {
  test("cards spread evenly about the tub's centre and tilt symmetrically for 1–4 picks; taller than wide", () => {
    for (let n = 1; n <= 4; n++) {
      const boxes = cardLayout(n);
      expect(boxes).toHaveLength(n);
      const centres = boxes.map((b) => b.x + b.w / 2);
      const mid = (centres[0] + centres[n - 1]) / 2;
      expect(Math.abs(mid - 144)).toBeLessThan(0.001);                        // centred on the tub
      const gaps = centres.slice(1).map((c, k) => c - centres[k]);
      gaps.forEach((g) => expect(Math.abs(g - gaps[0])).toBeLessThan(0.001));  // even spacing
      boxes.forEach((b, k) => expect(b.tilt).toBeCloseTo(-boxes[n - 1 - k].tilt)); // symmetric tilt
      boxes.forEach((b) => expect(b.h).toBeGreaterThan(b.w));
      boxes.forEach((b) => expect(b.y + b.h).toBeGreaterThan(56));             // bottoms behind the front panel
      boxes.forEach((b) => { expect(b.x).toBeGreaterThan(50); expect(b.x + b.w).toBeLessThan(238); });  // within the rim
    }
    expect(cardLayout(1)[0].tilt).toBe(0);
    expect(cardLayout(3).map((b) => b.tilt)).toEqual([-8, 0, 8]);
  });
  test("one drawing everywhere: the turn, the shelf and Great picks draw the same wagon (handle, bracket, tongue, 4 wheels)", async () => {
    const { container } = setup({ ask: { ...ASK, pickTarget: 1 } });
    const parts = () => [...container.querySelectorAll(".ask-wagon")].map((w) => ({
      viewBox: w.getAttribute("viewBox"), wheels: w.querySelectorAll(".ask-wheel-spin").length,
      handle: !!w.querySelector(".ask-wagon-handle"), bracket: !!w.querySelector(".ask-wagon-bracket"), tongue: !!w.querySelector(".ask-wagon-tongue"),
    }));
    const one = { viewBox: "0 0 260 150", wheels: 4, handle: true, bracket: true, tongue: true };
    expect(parts()).toEqual([one]);                                                         // turn
    toShelf();
    expect(parts()).toEqual([one]);                                                         // shelf (small)
    expect(container.querySelector(".ask-wagon")).toHaveClass("ask-wagon-small");
    fireEvent.click(tile("Cheese"));
    fireEvent.click(thatsIt());
    await screen.findByText("Your pick is on our list!");
    expect(parts()).toEqual([one]);                                                         // Great picks
    // The bracket and tongue are drawn BEFORE the near wheels (so the wheel hides the bracket), and the
    // handle after them (in front of the tub).
    const w = container.querySelector(".ask-wagon");
    const order = [...w.querySelectorAll(".ask-wagon-bracket, .ask-wheel-spin, .ask-wagon-handle")].map((e) => e.getAttribute("class"));
    expect(order).toEqual(["ask-wheel-spin", "ask-wheel-spin", "ask-wagon-bracket", "ask-wheel-spin", "ask-wheel-spin", "ask-wagon-handle"]);
  });
  test("picks are cards in the wagon: a photo, a glyph and a name card each render; still tappable on the shelf", () => {
    const { container } = setup({ ask: { ...ASK, pickTarget: 3 }, tiles: [
      { id: "p", name: "Apples", glyph: "🍎", photoUrl: "https://x/apples.webp" },
      { id: "g", name: "Bananas", glyph: "🍌", photoUrl: null },
      { id: "n", name: "Bread", glyph: null, photoUrl: null },
    ] });
    toShelf();
    ["Apples", "Bananas", "Bread"].forEach((n) => fireEvent.click(tile(n)));
    const cards = [...container.querySelectorAll(".ask-wagon .ask-wagon-pick")];
    expect(cards).toHaveLength(3);
    expect(cards[0].querySelector("image")).toHaveAttribute("href", "https://x/apples.webp");
    expect(cards[1].querySelector("text").textContent).toBe("🍌");
    expect(cards[2].querySelector("text").textContent).toBe("Bread");
    cards.forEach((c) => expect(c.getAttribute("transform")).toMatch(/^rotate\(/));        // tilted
    fireEvent.click(screen.getByRole("button", { name: "Take out Bananas" }));
    expect(container.querySelectorAll(".ask-wagon .ask-wagon-pick")).toHaveLength(2);
  });
});

describe("the hand-back (W7–W9)", () => {
  async function toGreatPicks(props = {}, n = 3) {
    const onExit = jest.fn();
    const onHandBack = jest.fn();
    const view = render(<AskRun ask={{ ...ASK, pickTarget: n }} tiles={TILES} onLand={jest.fn(async () => {})} onExit={onExit} onHandBack={onHandBack} {...props} />);
    toShelf();
    TILES.slice(0, n).forEach((t) => fireEvent.click(tile(t.name)));
    fireEvent.click(thatsIt());
    await screen.findByText(n === 1 ? "Your pick is on our list!" : "Your picks are on our list!");
    return { onExit, onHandBack, container: view.container };
  }
  test("W7: 'Great picks, … / Your picks are on our list!'; one pick reads 'Great pick, … / Your pick is on our list!'", async () => {
    await toGreatPicks({}, 3);
    expect(screen.getByRole("heading")).toHaveTextContent("Great picks, Easton!");
  });
  test("W8: 'Give it back to {Parent}' with the parent's name in .op-name; one tap hands back once with the count and ids", async () => {
    const { onHandBack, onExit, container } = await toGreatPicks({ parentName: "Paige" }, 3);
    const btn = screen.getByRole("button", { name: "Give it back to Paige" });
    expect(btn.querySelector(".op-name")).toHaveTextContent(/^Paige$/);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onHandBack).toHaveBeenCalledTimes(1);
    expect(onHandBack).toHaveBeenCalledWith({ count: 3, ids: ["c-0", "c-1", "c-2"] });
    expect(onExit).not.toHaveBeenCalled();
    // No name in any attribute (K3).
    const attrs = [...container.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((a) => a.value));
    expect(attrs.filter((v) => /Paige|Easton/.test(v))).toEqual([]);
  });
  test("W8: no first name reads 'Give it back'", async () => {
    await toGreatPicks({ parentName: null }, 1);
    expect(screen.getByRole("button", { name: "Give it back" })).toBeInTheDocument();
    expect(screen.getByRole("heading")).toHaveTextContent("Great pick, Easton!");
  });
  test("W9 (App, source): the hand-back closes the run, lands on Browse, and shows '{Label} added {N} · See' once; See opens the list highlighted", () => {
    const app = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
    const mount = app.slice(app.indexOf("<AskRun"), app.indexOf("{/* \"+N more\" (C4.2)"));
    expect(mount).toContain("parentName={user?.firstName?.trim() || null}");
    expect(mount).toContain("setRunAskId(null);");
    expect(mount).toContain('setView("input");');
    expect(mount).toContain('showToast(<><span className="op-name">{label}</span> added {count}</>, {');
    expect(mount).toContain('label: "See",');
    expect(mount).toContain('setView("list");');
    expect(mount).toContain('onClick: () => { setView("list"); landed.start(label, ids); },');
    expect(mount).toContain("}, { ms: 10000 });");                                        // the toast waits ~10s (2026-11-15)
    expect(app.match(/ask-landed-hl/g).length).toBeGreaterThanOrEqual(3);                   // both Shop lenses + the style
  });
});

describe("W10 and the motion section", () => {
  const css = () => [...document.querySelectorAll("style")].map((s) => s.textContent).join("");
  test("fonts: Playfair for the titles, Lato for everything else including the buttons", () => {
    setup();
    expect(css()).toMatch(/\.ask-h1 \{[^}]*'Playfair Display'/);
    expect(css()).toMatch(/\.ask-primary \{[^}]*'Lato'/);
    expect(css()).toMatch(/\.ask-done \{[^}]*'Lato'/);
  });
  test("only the wheels rotate; the bracket and tongue never animate; reduced motion turns every animation off", () => {
    setup();
    const c = css();
    expect(c).toMatch(/\.ask-roll-turn \.ask-wheel-spin \{ animation: ask-wheel-roll/);
    expect(c).toMatch(/\.ask-wagon\.hop \.ask-wheel-spin \{ animation: ask-wheel-quarter/);
    expect(c).toMatch(/\.ask-roll-turn \.ask-wagon-handle \{ animation: ask-swing/);
    expect(c).not.toMatch(/ask-wagon-bracket[^{]*\{[^}]*animation/);
    expect(c).not.toMatch(/ask-wagon-tongue[^{]*\{[^}]*animation/);
    expect(c).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.ask-run \*, \.ask-run \*::before, \.ask-run \*::after \{ animation: none !important; transition: none !important; \}/);
  });
});

// Great picks keeps the order the picks were made (2026-11-14): the shelf wagon's order, fixed when they
// land — not shelf / list order, not land order, and not changed by a refresh of the tiles after the land.
test("Great picks: wagon cards and the landed list keep pick order, even when the tiles change after the land", async () => {
  const onLand = jest.fn(async () => {});
  const { container, rerender } = render(<AskRun ask={ASK} tiles={TILES} onLand={onLand} onExit={jest.fn()} />);
  toShelf();
  ["Yogurt", "Goldfish", "Cheese"].forEach((n) => fireEvent.click(tile(n)));            // shelf order is Goldfish, Apples, Cheese, Yogurt
  fireEvent.click(screen.getByRole("button", { name: "Take out Goldfish" }));              // out, then back in last
  fireEvent.click(tile("Goldfish"));
  const shelfOrder = [...container.querySelectorAll(".ask-wagon .ask-wagon-pick")].map((g) => g.getAttribute("aria-label").replace("Take out ", ""));
  expect(shelfOrder).toEqual(["Yogurt", "Cheese", "Goldfish"]);
  fireEvent.click(thatsIt());
  await screen.findByText("Your picks are on our list!");
  expect(onLand).toHaveBeenCalledWith(["c-3", "c-2", "c-0"]);
  const cards = () => [...container.querySelectorAll(".ask-finale .ask-wagon-pick")].map((g) => g.getAttribute("aria-label"));
  const listed = () => summary().replace(/^Your picks?: /, "").split(", ");
  expect(cards()).toEqual(["Yogurt", "Cheese", "Goldfish"]);
  expect(listed()).toEqual(["Yogurt", "Cheese", "Goldfish"]);
  // The land refreshes the list: the tiles come back reordered and one is gone. Great picks doesn't move.
  rerender(<AskRun ask={ASK} tiles={[...TILES].reverse().filter((t) => t.name !== "Cheese")} onLand={onLand} onExit={jest.fn()} />);
  expect(cards()).toEqual(["Yogurt", "Cheese", "Goldfish"]);
  expect(listed()).toEqual(["Yogurt", "Cheese", "Goldfish"]);
});

test("the turn scene has the sun's faint blurred path on the water (0.25) and no glint lines", () => {
  const { container } = setup();
  const path = container.querySelector(".ask-scene .ask-sun-path");
  expect(path).not.toBeNull();
  expect(path.getAttribute("opacity")).toBe(".25");
  expect(path.getAttribute("filter")).toMatch(/^url\(#ask-blur\)$/);
  expect(container.querySelectorAll(".ask-scene path[stroke='#FBE7C2']")).toHaveLength(0);   // the old glint strokes
});

// Shopper picker polish (2026-11-14): numbered picks, no dots, a bigger footer wagon.
describe("numbered picks (Shopper)", () => {
  const ASK4 = { ...ASK, pickTarget: 4 };
  const badge = (name) => tile(name).querySelector(".ask-order-num").textContent;
  const wagonOrder = (c) => [...c.querySelectorAll(".ask-shelf .ask-wagon .ask-wagon-pick")].map((g) => g.getAttribute("aria-label").replace("Take out ", ""));
  test("each selected card shows its pick number; its label reads '{name}, pick {n} of {N}'", () => {
    setup({ ask: ASK4 });
    toShelf();
    ["Cheese", "Goldfish", "Yogurt"].forEach((n) => fireEvent.click(tile(n)));
    expect([badge("Cheese"), badge("Goldfish"), badge("Yogurt")]).toEqual(["1", "2", "3"]);
    expect(tile("Cheese")).toHaveAttribute("aria-label", "Cheese, pick 1 of 4");
    expect(tile("Yogurt")).toHaveAttribute("aria-label", "Yogurt, pick 3 of 4");
    expect(tile("Apples")).not.toHaveAttribute("aria-label");                       // unpicked: the name from its content
    expect(tile("Apples").querySelector(".ask-order-num").textContent).toBe("");
  });
  test("an unpick renumbers the rest at once, keeping their order; the wagon closes up to match", () => {
    const { container } = setup({ ask: ASK4 });
    toShelf();
    ["Cheese", "Goldfish", "Yogurt", "Apples"].forEach((n) => fireEvent.click(tile(n)));
    expect(wagonOrder(container)).toEqual(["Cheese", "Goldfish", "Yogurt", "Apples"]);
    fireEvent.click(tile("Goldfish"));                                              // 1,2,3,4 minus 2
    expect([badge("Cheese"), badge("Yogurt"), badge("Apples")]).toEqual(["1", "2", "3"]);
    expect(wagonOrder(container)).toEqual(["Cheese", "Yogurt", "Apples"]);
    expect(tile("Apples")).toHaveAttribute("aria-label", "Apples, pick 3 of 4");
  });
  test("the wagon's order = the badge order = Great picks' order", async () => {
    const { container } = setup({ ask: ASK4 });
    toShelf();
    ["Yogurt", "Cheese", "Apples", "Goldfish"].forEach((n) => fireEvent.click(tile(n)));
    fireEvent.click(screen.getByRole("button", { name: "Take out Cheese" }));      // from the wagon this time
    fireEvent.click(tile("Cheese"));                                                // back in, last
    const byBadge = ["Yogurt", "Cheese", "Apples", "Goldfish"].sort((a, b) => Number(badge(a)) - Number(badge(b)));
    expect(byBadge).toEqual(["Yogurt", "Apples", "Goldfish", "Cheese"]);
    expect(wagonOrder(container)).toEqual(byBadge);
    fireEvent.click(thatsIt());
    await screen.findByText("Your picks are on our list!");
    expect([...container.querySelectorAll(".ask-finale .ask-wagon-pick")].map((g) => g.getAttribute("aria-label"))).toEqual(byBadge);
    expect(summary()).toBe(`Your picks: ${byBadge.join(", ")}`);
  });
  test("no progress dots on Shopper; the count stays for screen readers; the footer wagon is the 185px drawing", () => {
    const { container } = setup({ ask: ASK4 });
    toShelf();
    fireEvent.click(tile("Cheese"));
    expect(container.querySelector(".ask-dots")).toBeNull();
    expect(screen.getByLabelText("1 of 4 picked")).toHaveClass("ask-sr");
    const css = [...document.querySelectorAll("style")].map((el) => el.textContent).join("");
    expect(css).toMatch(/\.ask-wagon-small \{ width: 185px; \}/);
    expect(container.querySelector(".ask-cartrow .ask-wagon")).toHaveClass("ask-wagon-small");
  });
  test("Explorer keeps its plain ✓ (no number) and its dots, at the same 185px wagon", () => {
    const { container } = setup({ ask: { id: "a-k", label: "Kid", shelfNoun: null, pickTarget: 2, screenStyle: "simple" } });
    fireEvent.click(screen.getByRole("button", { name: "Let's pick" }));
    fireEvent.click(screen.getByRole("button", { name: "Cheese" }));
    const picked = screen.getByRole("button", { name: "Cheese, pick 1 of 2" });
    expect(picked.querySelector(".ask-tile-check")).toHaveTextContent(/^✓$/);
    expect(picked.querySelector(".ask-order-num")).toBeNull();
    expect(container.querySelector(".ask-dots")).not.toBeNull();
    expect(container.querySelector(".ask-cartrow .ask-wagon")).toHaveClass("ask-wagon-small");
  });
});

// Great picks: the wagon is the summary (2026-11-14).
describe("the summary wagon", () => {
  const SIX = ["Apples", "Bananas", "Carrots", "Cheddar cheese", "Hummus", "Greek yogurt"].map((name, i) => ({ id: `s-${i}`, name, glyph: null, photoUrl: null }));
  async function land(n) {
    const view = render(<AskRun ask={{ ...ASK, pickTarget: n }} tiles={SIX} onLand={jest.fn(async () => {})} onExit={jest.fn()} />);
    toShelf();
    SIX.slice(0, n).forEach((t) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${t.name}`) })));
    fireEvent.click(thatsIt());
    await screen.findByText(n === 1 ? "Your pick is on our list!" : "Your picks are on our list!");
    return view.container;
  }
  test("no landed list; the wagon's label is the list, in pick order — 'Your picks: Apples, Bananas, Carrots, Cheddar cheese, Hummus'", async () => {
    const container = await land(5);
    expect(container.querySelector("ul")).toBeNull();
    expect(summary()).toBe("Your picks: Apples, Bananas, Carrots, Cheddar cheese, Hummus");
    expect(container.querySelector(".ask-rollin")).toHaveClass("ask-rollin-tall");     // room for the raised back tier
  });
  test("one pick: 'Your pick: Apples', no raised tier", async () => {
    const container = await land(1);
    expect(summary()).toBe("Your pick: Apples");
    expect(container.querySelector(".ask-rollin")).not.toHaveClass("ask-rollin-tall");
  });
  test("5–6 picks pile in two tiers: left to right is pick order, front/back alternate, the back tier stands higher and is painted first", () => {
    for (const n of [5, 6]) {
      const boxes = cardLayout(n);
      expect(boxes).toHaveLength(n);
      const xs = boxes.map((b) => b.x + b.w / 2);
      xs.slice(1).forEach((x, k) => expect(x).toBeGreaterThan(xs[k]));               // left → right = pick order
      boxes.forEach((b, k) => expect(b.back).toBe(k % 2 === 1));
      boxes.filter((b) => b.back).forEach((b) => expect(b.y).toBeLessThan(0));        // raised above the drawing's top
      boxes.forEach((b) => { expect(b.x).toBeGreaterThan(44); expect(b.x + b.w).toBeLessThan(244); });   // over the rim (a hair of overhang at 6)
      boxes.forEach((b) => expect(b.w).toBeGreaterThanOrEqual(46));                  // room for a two-word name
      boxes.filter((b) => !b.back).forEach((b) => expect(b.y + b.h).toBeGreaterThan(56));   // front bottoms behind the panel
    }
    expect(cardLayout(4).every((b) => !b.back)).toBe(true);
  });
  test("a two-word name on a 5-pick card wraps to two lines on a card at least 46 units wide; back cards are painted before front cards", async () => {
    const container = await land(5);
    const cards = [...container.querySelectorAll(".ask-finale .ask-wagon-pick")];
    expect(cards.map((g) => g.getAttribute("aria-label"))).toEqual(["Bananas", "Cheddar cheese", "Apples", "Carrots", "Hummus"]);   // paint order: back (2nd, 4th) first
    const cheddar = cards[1];
    expect([...cheddar.querySelectorAll("tspan")].map((t) => t.textContent)).toEqual(["Cheddar", "cheese"]);
    expect(Number(cheddar.querySelector(".ask-card > rect").getAttribute("width"))).toBeGreaterThanOrEqual(46);   // the card itself, not its clip
  });
  test("the summary wagon is as large as fits: the full width less a 12px gutter, up to 380px", () => {
    setup();
    const css = [...document.querySelectorAll("style")].map((el) => el.textContent).join("");
    expect(css).toMatch(/\.ask-rollin \.ask-wagon \{ width: calc\(100% - 24px\); max-width: 380px; \}/);
  });
});

// Great picks: the wagon sits lower, on a space that gives way first; centred on its tub (2026-11-15).
describe("Great picks layout", () => {
  test("title, rule, then a flexible ~7% drop, then the wagon and its line; only the drop shrinks; room is kept above the button", async () => {
    const { container } = setup({ ask: { ...ASK, pickTarget: 1 } });
    toShelf();
    fireEvent.click(tile("Cheese"));
    fireEvent.click(thatsIt());
    await screen.findByText("Your pick is on our list!");
    const kids = [...container.querySelector(".ask-finale").children].map((el) => el.className || el.tagName);
    const at = (re) => kids.findIndex((k) => re.test(k));
    expect(at(/ask-rule/)).toBeGreaterThan(at(/^H1$|ask-h1/));
    expect(at(/ask-finale-drop/)).toBe(at(/ask-rule/) + 1);
    expect(at(/ask-rollin/)).toBe(at(/ask-finale-drop/) + 1);
    const css = [...document.querySelectorAll("style")].map((el) => el.textContent).join("");
    expect(css).toMatch(/\.ask-finale > \* \{ flex-shrink: 0; \}/);
    expect(css).toMatch(/\.ask-finale > \.ask-finale-drop \{ flex: 0 1 7vh; flex-basis: 7dvh; min-height: 0; \}/);
    expect(css).toMatch(/\.ask-finale \.ask-line \{ margin-bottom: 24px; \}/);
  });
  test("the summary wagon is centred on its tub: shifted LEFT by (tub centre − drawing centre) / width = 14/260", () => {
    setup();
    const css = [...document.querySelectorAll("style")].map((el) => el.textContent).join("");
    expect(css).toMatch(/\.ask-finale \.ask-rollin \.ask-wagon \{ transform: translateX\(calc\(100% \* -14 \/ 260\)\); \}/);
    // 14 and 260 are the drawing's own numbers: the tub's centre line (rim 50..238 → 144) and its width.
    const src = fs.readFileSync(path.join(__dirname, "AskRun.js"), "utf8");
    expect(src).toMatch(/const WAGON_W = 260,/);
    expect(src).toMatch(/const RIM_CX = 144;/);
    expect(144 - 260 / 2).toBe(14);
    expect(css).toMatch(/\.ask-finale \{[^}]*overflow-x: hidden;/);               // the shift never scrolls sideways
  });
});

// The pick celebration (2026-11-15; docs/mockups/mockup_ask_pick_celebration.html).
describe("the pick celebration", () => {
  const css = () => [...document.querySelectorAll("style")].map((el) => el.textContent).join("");
  const PHOTOS = ["Apples", "Bananas", "Bread", "Cheese"].map((name, i) => ({ id: `ph-${i}`, name, glyph: null, photoUrl: `https://x/${name}.webp` }));
  test("beats 1–3 in CSS: press 0.94 → 1.05 (~420ms spring); a 44px badge over the corner that pops with a −30° spin and springs to the number at 380ms; one 600ms ring to 2.4×", () => {
    setup();
    const c = css();
    expect(c).toMatch(/\.ask-tile\.press \{ animation: ask-press 0\.42s cubic-bezier\(\.3,1\.6,\.5,1\); \}/);
    expect(c).toMatch(/@keyframes ask-press \{ 0% \{ transform: scale\(1\); \} 30% \{ transform: scale\(\.94\); \} 70% \{ transform: scale\(1\.05\); \} 100% \{ transform: scale\(1\); \} \}/);
    expect(c).toMatch(/\.ask-badge \{ position: absolute; top: -10px; right: -10px;[^}]*width: 44px; height: 44px;[^}]*border: 3px solid #FAF4EC;[^}]*box-shadow: 0 3px 8px rgba\(13,148,136,\.35\);[^}]*font: 900 22px 'Lato'/);
    expect(c).toMatch(/@keyframes ask-badge-pop \{ 0% \{ transform: scale\(0\) rotate\(-30deg\); \} 100% \{ transform: scale\(1\) rotate\(0deg\); \} \}/);
    expect(c).toMatch(/\.ask-tile\.picked \.ask-order-num \{ animation: ask-num-in 0\.25s cubic-bezier\(\.3,1\.6,\.5,1\) 0\.38s both; \}/);
    expect(c).toMatch(/\.ask-tile\.press \.ask-ring \{ animation: ask-ring 0\.6s ease-out; \}/);
    expect(c).toMatch(/@keyframes ask-ring \{ 0% \{ opacity: \.7; transform: scale\(1\); \} 100% \{ opacity: 0; transform: scale\(2\.4\); \} \}/);
    // resting state = the number at full size: what reduced motion (animations off) shows, with no movement
    expect(c).toMatch(/\.ask-tile\.picked \.ask-badge \{ transform: scale\(1\);/);
    expect(c).toMatch(/\.ask-order-check \{ opacity: 0; transform: scale\(\.4\); \}/);
    expect(c).toMatch(/\.ask-order-num \{ opacity: 1; transform: none; \}/);
    expect(c).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.ask-run \*, \.ask-run \*::before, \.ask-run \*::after \{ animation: none !important; transition: none !important; \}/);
  });
  test("only the card just picked celebrates (press + ring); an unpick drops it and the badge shrinks away", () => {
    setup({ ask: { ...ASK, pickTarget: 4 } });
    toShelf();
    fireEvent.click(tile("Cheese"));
    expect(tile("Cheese")).toHaveClass("press");
    fireEvent.click(tile("Apples"));
    expect(tile("Apples")).toHaveClass("press");
    expect(tile("Cheese")).not.toHaveClass("press");
    expect(tile("Cheese").querySelector(".ask-badge")).not.toBeNull();
    expect(tile("Cheese").querySelector(".ask-ring")).not.toBeNull();
    fireEvent.click(tile("Apples"));                                                  // unpick
    expect(tile("Apples")).not.toHaveClass("press");
    expect(tile("Apples")).not.toHaveClass("picked");                                // the badge's scale(1) rule no longer applies
    expect(css()).toMatch(/\.ask-badge \{[^}]*transform: scale\(0\); transition: transform 0\.2s ease-in; \}/);
  });
  test("Explorer keeps its ✓ but gets the press and the ring (beats 1 and 3)", () => {
    setup({ ask: { id: "a-k", label: "Kid", shelfNoun: null, pickTarget: 2, screenStyle: "simple" } });
    fireEvent.click(screen.getByRole("button", { name: "Let's pick" }));
    fireEvent.click(screen.getByRole("button", { name: "Cheese" }));
    const t = screen.getByRole("button", { name: "Cheese, pick 1 of 2" });
    expect(t).toHaveClass("press");
    expect(t.querySelector(".ask-tile-check")).toHaveTextContent(/^✓$/);
    expect(t.querySelector(".ask-badge")).toBeNull();
    expect(t.querySelector(".ask-ring.ask-ring-simple")).not.toBeNull();
  });
  describe("beat 4: a copy flies into the wagon", () => {
    let animations;
    beforeEach(() => {
      animations = [];
      Element.prototype.animate = function animate(frames, opts) {
        const a = { frames, opts, onfinish: null, cancel: jest.fn(), el: this };
        animations.push(a);
        return a;
      };
    });
    afterEach(() => { delete Element.prototype.animate; delete window.matchMedia; });
    test("a photo copy flies (~550ms, ease-in-out); the wagon card waits hidden until it lands, then the wagon hops", () => {
      const { container } = setup({ ask: { ...ASK, pickTarget: 3 }, tiles: PHOTOS });
      toShelf();
      fireEvent.click(tile("Bananas"));
      const fly = container.querySelector(".ask-fly");
      expect(fly).not.toBeNull();
      expect(fly.querySelector("img")).toHaveAttribute("src", "https://x/Bananas.webp");
      const a = animations.find((x) => x.el === fly);
      expect(a.opts).toMatchObject({ duration: 550, easing: "cubic-bezier(.5,0,.3,1)" });
      expect(a.frames[1].transform).toMatch(/rotate\(0deg\)$/);                        // one pick: straight
      const card = () => container.querySelector(".ask-shelf .ask-wagon .ask-wagon-pick");
      expect(card()).toHaveAttribute("visibility", "hidden");
      expect(container.querySelector(".ask-shelf .ask-wagon")).not.toHaveClass("hop");
      act(() => { a.onfinish(); });
      expect(container.querySelector(".ask-fly")).toBeNull();
      expect(card()).not.toHaveAttribute("visibility");
      expect(container.querySelector(".ask-shelf .ask-wagon")).toHaveClass("hop");
    });
    test("a later pick flies with its slot's tilt", () => {
      const { container } = setup({ ask: { ...ASK, pickTarget: 3 }, tiles: PHOTOS });
      toShelf();
      fireEvent.click(tile("Apples")); act(() => { animations[animations.length - 1].onfinish(); });
      fireEvent.click(tile("Bread"));
      const a = animations.find((x) => x.el === container.querySelector(".ask-fly"));
      expect(a.frames[1].transform).toMatch(/rotate\(5deg\)$/);                        // 2 picks: −5 / +5
    });
    test("unpicking while the copy is in the air takes the copy away too", () => {
      const { container } = setup({ ask: { ...ASK, pickTarget: 3 }, tiles: PHOTOS });
      toShelf();
      fireEvent.click(tile("Bread"));
      expect(container.querySelector(".ask-fly")).not.toBeNull();
      fireEvent.click(tile("Bread"));
      expect(container.querySelector(".ask-fly")).toBeNull();
    });
    test("reduced motion: no flight — the card is in the wagon at once", () => {
      window.matchMedia = (q) => ({ matches: /reduce/.test(q), addListener() {}, removeListener() {} });
      const { container } = setup({ ask: { ...ASK, pickTarget: 3 }, tiles: PHOTOS });
      toShelf();
      fireEvent.click(tile("Apples"));
      expect(container.querySelector(".ask-fly")).toBeNull();
      expect(container.querySelector(".ask-shelf .ask-wagon .ask-wagon-pick")).not.toHaveAttribute("visibility");
    });
  });
  test("flightFor lands the copy on its slot's centre at the slot's size and tilt", () => {
    const tileRect = { left: 20, top: 200, width: 160, height: 150 };
    const wagonRect = { left: 95, top: 520, width: 185, height: 107 };
    const box = cardLayout(3)[2];
    const f = flightFor(tileRect, wagonRect, box);
    const k = 185 / 260;
    expect(f.from).toEqual({ x: 20 + 80 - 26, y: 200 + 75 - 29, w: 52, h: 58 });
    expect(f.from.x + 26 + f.dx).toBeCloseTo(95 + (box.x + box.w / 2) * k);
    expect(f.from.y + 29 + f.dy).toBeCloseTo(520 + (box.y + box.h / 2) * k);
    expect(f.scale).toBeCloseTo((box.w * k) / 52);
    expect(f.tilt).toBe(8);
  });
});
