/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the privacy classes (.op-replay-block on the root, .op-name around every copy of the name) are
   the rules under test, read as raw DOM. */
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { AskRun, cardLayout, flightFor, ARM_MS, SEND_PX, TUG_AFTER_MS } from "./AskRun";
import { HOLD_MS } from "../hooks/useHold";
import * as askTelemetry from "../lib/askTelemetry";

// jsdom 16 has no PointerEvent, so testing-library falls back to a plain Event and drops clientX — the
// swipe (H6) needs it. A MouseEvent carrying pointerId / pointerType is enough here.
if (typeof window.PointerEvent !== "function") {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? "mouse"; }
  };
}

// Running an Ask (SPEC_ask amendment A14–A17, A24; SPEC_ask_slice2 C3b).
const ASK = { id: "a-easton", label: "Easton", shelfNoun: "snacks", pickTarget: 3 };
const TILES = ["Goldfish", "Apples", "Cheese", "Yogurt"].map((name, i) => ({ id: `c-${i}`, name, glyph: "🍎", photoUrl: null }));

function setup({ onLand = jest.fn(async () => {}), tiles = TILES, ask = ASK } = {}) {
  const onExit = jest.fn();
  const view = render(<AskRun ask={ask} tiles={tiles} onLand={onLand} onExit={onExit} />);
  return { onLand, onExit, container: view.container };
}
const tile = (name) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
// H13 (rev 3): no That's it! button on either style. Shopper's full wagon says "That's it!" on the tub front,
// and a tap there sends it (the same send as the swipe).
const tub = () => document.querySelector(".ask-tub-send");
const tapTub = () => fireEvent.click(tub());
function toShelf() { fireEvent.click(screen.getByRole("button", { name: "Let's pick" })); }
// Great picks: the wagon is the summary; its label lists the picks in order ("Your picks: A, B, C").
const summary = () => screen.getByRole("img", { name: /^Your picks?: / }).getAttribute("aria-label");
// H1–H2 (fake timers): past the arm delay, a full hold on Give it back.
function holdGiveBack(btn) {
  act(() => { jest.advanceTimersByTime(ARM_MS); });
  fireEvent.pointerDown(btn);
  act(() => { jest.advanceTimersByTime(HOLD_MS); });
  fireEvent.pointerUp(btn);
}
// H6: a drag on Explorer's wagon, dx px to the right (two moves, then the release).
const wagonWrap = () => document.querySelector(".ask-wagonwrap");
const pt = (x) => ({ pointerId: 1, pointerType: "touch", clientX: x, clientY: 300, button: 0 });
function swipe(dx) {
  const w = wagonWrap();
  fireEvent.pointerDown(w, pt(100));
  fireEvent.pointerMove(w, pt(100 + dx / 2));
  fireEvent.pointerMove(w, pt(100 + dx));
  fireEvent.pointerUp(w, pt(100 + dx));
}

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
  expect(tub()).toBeNull();                                              // nothing to send yet
  fireEvent.click(tile("Cheese"));
  fireEvent.click(tile("Goldfish"));
  expect(screen.getByLabelText("2 of 3 picked")).toBeInTheDocument();
  fireEvent.click(tile("Yogurt"));
  expect(tub()).not.toBeNull();
  expect(document.querySelector(".ask-tub-words")).toHaveTextContent("That's it!");
  tapTub();
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
  // A16 amended 2026-11-09: no ↶ on either style.
  expect(screen.queryByRole("button", { name: "Take the last one out" })).toBeNull();
  expect(screen.queryByText("↶")).toBeNull();
  expect(onLand).not.toHaveBeenCalled();
});

test("a landing that fails keeps the wagon held and says so; That's it! again lands", async () => {
  const onLand = jest.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
  setup({ onLand });
  toShelf();
  ["Goldfish", "Apples", "Cheese"].forEach((n) => fireEvent.click(tile(n)));
  tapTub();
  expect(await screen.findByRole("alert")).toHaveTextContent("That didn't reach the list.");
  expect(screen.getByLabelText("3 of 3 picked")).toBeInTheDocument();
  tapTub();
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

test("after the confirm: no top-right control (W6); without onHandBack, holding 'Give it back' just leaves", async () => {
  jest.useFakeTimers();
  try {
    const { onExit } = setup({ ask: { ...ASK, pickTarget: 1 } });
    toShelf();
    expect(screen.getByRole("heading")).toHaveTextContent("Pick one, Easton!");
    fireEvent.click(tile("Apples"));
    tapTub();
    await screen.findByText("Your pick is on our list!");
    expect(screen.getByRole("heading")).toHaveTextContent("Great pick, Easton!");   // one landed: singular
    expect(screen.queryByText("Your picks are on our list!")).toBeNull();
    expect(screen.queryByRole("button", { name: /Hold to (close|finish|send)|^Done$|^Close$/ })).toBeNull();
    holdGiveBack(screen.getByRole("button", { name: "Hold to give it back" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  } finally { jest.useRealTimers(); }
});

// S4-5: a short shelf runs at the effective target, end to end; no grown-up screen for the child.
test("a shelf with fewer tiles than the target runs at the tiles it has: Pick 2, a two-step tide, two land", async () => {
  const { onLand } = setup({ tiles: TILES.slice(0, 2) });
  expect(screen.getByText("Pick 2 snacks for our list.")).toBeInTheDocument();
  expect(screen.queryByText(/fewer things/)).toBeNull();
  toShelf();
  expect(screen.getByRole("heading")).toHaveTextContent("Pick 2, Easton!");
  expect(screen.getByLabelText("0 of 2 picked")).toBeInTheDocument();
  fireEvent.click(tile("Goldfish"));
  expect(tub()).toBeNull();
  fireEvent.click(tile("Apples"));
  expect(tub()).not.toBeNull();
  tapTub();
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
  const wagonText = [...container.querySelectorAll(".ask-wagon .ask-wagon-pick text")].map((t) => t.textContent);
  expect(wagonText).toEqual(["Apples", "Bananas", "Greekyogurt"]);              // a long two-word name wraps to two lines
  expect([...container.querySelectorAll(".ask-wagon .ask-wagon-pick text")][2].querySelectorAll("tspan")).toHaveLength(2);
  tapTub();
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
  test("▶ on Your turn; 2×2 tiles with no names but the plain tile's; no ✓ — the full wagon is swiped (H5, H6); words for the grown-up", async () => {
    const { container, onLand } = setup({ ask: SIMPLE, tiles: FOUR });
    expect(screen.getByRole("heading")).toHaveTextContent("Your turn, Everett!");
    const go = screen.getByRole("button", { name: "Let's pick" });
    expect(go).toHaveClass("ask-icon");
    expect(go.textContent).toBe("");
    expect(screen.getByRole("button", { name: "Hold to close" })).toHaveTextContent("Close");
    fireEvent.click(go);
    expect(container.querySelector(".ask-tiles")).toHaveClass("ask-tiles-simple");
    expect(screen.queryByRole("button", { name: "Take the last one out" })).toBeNull();   // no ↶ here either
    expect(container.querySelector(".ask-actions")).toBeNull();                          // H5: no ✓
    expect(screen.queryByRole("button", { name: "That's it!" })).toBeNull();
    expect(container.querySelectorAll(".ask-tile-name")).toHaveLength(1);       // Bread, the plain tile
    expect(screen.getByRole("button", { name: "Bread" })).toHaveTextContent("Bread");
    for (const n of ["Apples", "Bananas", "Cheese"]) {
      const t = screen.getByRole("button", { name: n });
      expect(t).toHaveAttribute("aria-label", n);
      expect(t.textContent).not.toMatch(n);
    }
    fireEvent.click(screen.getByRole("button", { name: "Apples" }));
    swipe(SEND_PX + 20);
    await screen.findByText("Your pick is on our list!");
    expect(onLand).toHaveBeenCalledWith(["s-0"]);
    expect(screen.getByRole("heading")).toHaveTextContent("Great pick, Everett!");
    expect(summary()).toBe("Your pick: Apples");
    expect(screen.getByRole("button", { name: "Hold to give it back" })).toHaveTextContent("Give it back");
  });
  test("H10: a failed land on Simple rolls the wagon back, still full, and says to swipe again", async () => {
    setup({ ask: SIMPLE, tiles: FOUR, onLand: jest.fn().mockRejectedValueOnce(new Error("offline")) });
    toShelf();
    fireEvent.click(screen.getByRole("button", { name: "Cheese" }));
    swipe(SEND_PX + 20);
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't reach the list. Swipe the wagon again.");
    expect(screen.queryByText(/Tap ✓ again/)).toBeNull();
    expect(screen.getByLabelText("1 of 1 picked")).toBeInTheDocument();
    expect(wagonWrap()).toHaveClass("full");
  });
  test("Standard keeps its words and names; its That's it! is on the tub, not a button (H13)", () => {
    const { container } = setup();
    expect(screen.getByRole("button", { name: "Let's pick" })).toHaveTextContent("Let's pick");
    toShelf();
    expect(container.querySelector(".ask-tiles")).not.toHaveClass("ask-tiles-simple");
    expect(container.querySelectorAll(".ask-tile-name")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "That's it!" })).toBeNull();
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
    tapTub();
    await screen.findByText("Your picks are on our list!");
    expect(sessionStorage.getItem("op_ask_held")).toBeNull();
  });
  test("a failed land keeps the key with the wagon", async () => {
    setup({ onLand: jest.fn().mockRejectedValueOnce(new Error("offline")) });
    toShelf();
    ["Goldfish", "Apples", "Cheese"].forEach((n) => fireEvent.click(tile(n)));
    tapTub();
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
    expect(parts()).toEqual([one]);                                                         // shelf (the bigger wagon, H5 / H13)
    expect(container.querySelector(".ask-wagon")).toHaveClass("ask-wagon-big");
    fireEvent.click(tile("Cheese"));
    tapTub();
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

describe("the hand-back (W7–W9; W8 amended by H1)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  async function toGreatPicks(props = {}, n = 3) {
    const onExit = jest.fn();
    const onHandBack = jest.fn();
    const view = render(<AskRun ask={{ ...ASK, pickTarget: n }} tiles={TILES} onLand={jest.fn(async () => {})} onExit={onExit} onHandBack={onHandBack} {...props} />);
    toShelf();
    TILES.slice(0, n).forEach((t) => fireEvent.click(tile(t.name)));
    tapTub();
    await screen.findByText(n === 1 ? "Your pick is on our list!" : "Your picks are on our list!");
    return { onExit, onHandBack, container: view.container };
  }
  test("W7: 'Great picks, … / Your picks are on our list!'; one pick reads 'Great pick, … / Your pick is on our list!'", async () => {
    await toGreatPicks({}, 3);
    expect(screen.getByRole("heading")).toHaveTextContent("Great picks, Easton!");
  });
  test("W8 + H1: 'Give it back to {Parent}' with the parent's name in .op-name; a hold hands back once with the count and ids", async () => {
    const { onHandBack, onExit, container } = await toGreatPicks({ parentName: "Paige" }, 3);
    const btn = screen.getByRole("button", { name: "Hold to give it back to Paige" });
    expect(btn.querySelector(".op-name")).toHaveTextContent(/^Paige$/);
    expect(btn.querySelector(".ask-give-text")).toHaveTextContent(/^Give it back to Paige$/);
    holdGiveBack(btn);
    holdGiveBack(btn);
    expect(onHandBack).toHaveBeenCalledTimes(1);
    expect(onHandBack).toHaveBeenCalledWith({ count: 3, ids: ["c-0", "c-1", "c-2"] });
    expect(onExit).not.toHaveBeenCalled();
    // No name in any attribute (K3).
    const attrs = [...container.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((a) => a.value));
    expect(attrs.filter((v) => /Paige|Easton/.test(v))).toEqual([]);
  });
  test("W8: no first name reads 'Give it back'", async () => {
    await toGreatPicks({ parentName: null }, 1);
    expect(screen.getByRole("button", { name: "Hold to give it back" }).querySelector(".ask-give-text")).toHaveTextContent(/^Give it back$/);
    expect(screen.getByRole("heading")).toHaveTextContent("Great pick, Easton!");
  });
  test("H1: a plain tap never hands back; it only says 'Hold to give back' for ~1.6 s", async () => {
    const { onHandBack, onExit } = await toGreatPicks({ parentName: "Paige" }, 3);
    const btn = screen.getByRole("button", { name: "Hold to give it back to Paige" });
    act(() => { jest.advanceTimersByTime(ARM_MS); });
    fireEvent.click(btn);
    expect(onHandBack).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
    expect(btn.querySelector(".ask-give-text")).toHaveTextContent(/^Hold to give back$/);
    fireEvent.pointerDown(btn);                                           // a short press: same hint, nothing else
    act(() => { jest.advanceTimersByTime(300); });
    fireEvent.pointerUp(btn);
    expect(onHandBack).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1700); });
    expect(btn.querySelector(".ask-give-text")).toHaveTextContent(/^Give it back to Paige$/);
    expect(screen.getByRole("heading")).toHaveTextContent("Great picks, Easton!");
  });
  test("H1: the fill runs inside the teal pill (the same holdFillCss as Done)", async () => {
    await toGreatPicks({}, 3);
    const btn = screen.getByRole("button", { name: "Hold to give it back" });
    expect(btn.querySelector(".ask-give-fill")).not.toBeNull();
    act(() => { jest.advanceTimersByTime(ARM_MS); });
    fireEvent.pointerDown(btn);
    expect(btn).toHaveClass("holding");
    fireEvent.pointerUp(btn);
    const css = [...document.querySelectorAll("style")].map((el) => el.textContent).join("");
    expect(css).toMatch(new RegExp(`\\.ask-give-back\\.holding \\.ask-give-fill \\{ transform: scaleX\\(1\\); transition: transform ${HOLD_MS}ms linear; \\}`));
  });
  test("H2: a hold started within 1500 ms of Great picks appearing does nothing (and shows no hint); after, it hands back", async () => {
    const { onHandBack } = await toGreatPicks({ parentName: "Paige" }, 3);
    const btn = screen.getByRole("button", { name: "Hold to give it back to Paige" });
    fireEvent.pointerDown(btn);
    act(() => { jest.advanceTimersByTime(HOLD_MS + 100); });
    fireEvent.pointerUp(btn);
    fireEvent.click(btn);
    expect(onHandBack).not.toHaveBeenCalled();
    expect(btn).not.toHaveClass("holding");
    expect(btn.querySelector(".ask-give-text")).toHaveTextContent(/^Give it back to Paige$/);   // no hint while unarmed
    expect(btn).toBeEnabled();                                                                    // and no disabled grey
    act(() => { jest.advanceTimersByTime(ARM_MS); });
    fireEvent.pointerDown(btn);
    act(() => { jest.advanceTimersByTime(HOLD_MS); });
    fireEvent.pointerUp(btn);
    expect(onHandBack).toHaveBeenCalledTimes(1);
  });
  test("the real bug (Everett, 2026-11-24): That's it!, then the same mash on the footer, stays on Great picks", async () => {
    const { onHandBack, onExit } = await toGreatPicks({ parentName: "Dan" }, 3);
    const btn = screen.getByRole("button", { name: "Hold to give it back to Dan" });
    for (let k = 0; k < 6; k++) { fireEvent.pointerDown(btn); fireEvent.pointerUp(btn); fireEvent.click(btn); }
    act(() => { jest.advanceTimersByTime(3000); });
    for (let k = 0; k < 6; k++) { fireEvent.pointerDown(btn); fireEvent.pointerUp(btn); fireEvent.click(btn); }
    expect(onHandBack).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.getByRole("heading")).toHaveTextContent("Great picks, Easton!");
  });
  test("H3: a tap on the Great picks wagon makes it hop; not under reduced motion; taps elsewhere do nothing", async () => {
    const animate = jest.fn(() => ({ onfinish: null, cancel() {} }));
    const had = Element.prototype.animate;
    const mm = window.matchMedia;
    try {
      const { container } = await toGreatPicks({}, 3);
      Element.prototype.animate = animate;                 // after the shelf: the pick fly-in uses it too
      const hop = container.querySelector(".ask-finale .ask-finale-hop");
      fireEvent.click(screen.getByRole("heading"));
      expect(animate).not.toHaveBeenCalled();
      fireEvent.click(hop);
      expect(animate).toHaveBeenCalledTimes(1);
      expect(animate.mock.contexts ? animate.mock.contexts[0] : hop).toBe(hop);
      window.matchMedia = (q) => ({ matches: /reduce/.test(q), media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      fireEvent.click(hop);
      expect(animate).toHaveBeenCalledTimes(1);
    } finally { window.matchMedia = mm; if (had) Element.prototype.animate = had; else delete Element.prototype.animate; }
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
    expect(mount).toContain('onClick: () => { emitAskEvent("ask_see_tapped", count, style); setView("list"); landed.start(label, ids); },');
    expect(mount).toContain("}, { ms: 10000 });");                                        // the toast waits ~10s (2026-11-15)
    expect(app.match(/ask-landed-hl/g).length).toBeGreaterThanOrEqual(3);                   // both Shop lenses + the style
    expect(app).toMatch(/\.list-item\.ask-landed-hl\.fading \{[^}]*transition: background 1\.2s ease-out/);   // the final ~1.2s fade
    expect(app).not.toMatch(/landed-bar/);                                                  // no bar (2026-11-15 revised)
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
  tapTub();
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
    tapTub();
    await screen.findByText("Your picks are on our list!");
    expect([...container.querySelectorAll(".ask-finale .ask-wagon-pick")].map((g) => g.getAttribute("aria-label"))).toEqual(byBadge);
    expect(summary()).toBe(`Your picks: ${byBadge.join(", ")}`);
  });
  test("no progress dots on Shopper; the count stays for screen readers; the footer wagon is the bigger drawing (H13)", () => {
    const { container } = setup({ ask: ASK4 });
    toShelf();
    fireEvent.click(tile("Cheese"));
    expect(container.querySelector(".ask-dots")).toBeNull();
    expect(screen.getByLabelText("1 of 4 picked")).toHaveClass("ask-sr");
    const css = [...document.querySelectorAll("style")].map((el) => el.textContent).join("");
    expect(css).toMatch(/\.ask-wagonwrap \{ position: relative; width: min\(88vw, 360px\);/);
    expect(container.querySelector(".ask-cartrow .ask-wagon")).toHaveClass("ask-wagon-big");
  });
  test("Shopper's wagon has no tide and never bursts", () => {
    jest.useFakeTimers();
    try {
      const { container } = setup({ ask: { ...ASK, pickTarget: 2 } });
      toShelf();
      ["Cheese", "Apples"].forEach((n) => fireEvent.click(tile(n)));
      act(() => { jest.advanceTimersByTime(1000); });
      expect(container.querySelector(".ask-tide")).toBeNull();
      expect(document.querySelector(".ask-fireworks")).toBeNull();
    } finally { jest.useRealTimers(); }
  });
});

test("the titles use lining figures, so the 5 in \"Pick 5\" stands at cap height", () => {
  setup();
  const css = [...document.querySelectorAll("style")].map((el) => el.textContent).join("");
  expect(css).toMatch(/\.ask-h1 \{ font-variant-numeric: lining-nums; \}/);
});

// Explorer's progress (2026-11-15, Dan): no numbers, no dots — the tub fills turquoise; full, it bursts.
describe("Explorer's tide and finish", () => {
  const KID = { id: "a-k", label: "Kid", shelfNoun: null, pickTarget: 2, screenStyle: "simple" };
  const tide = (c) => c.querySelector(".ask-cartrow .ask-tide");
  test("a plain ✓ on the tile (no number), no dots, the bigger wagon (H5); the tub fills one step per pick", () => {
    const { container } = setup({ ask: KID });
    fireEvent.click(screen.getByRole("button", { name: "Let's pick" }));
    expect(tide(container)).toHaveAttribute("data-fill", "0");
    fireEvent.click(screen.getByRole("button", { name: "Cheese" }));
    const picked = screen.getByRole("button", { name: "Cheese, pick 1 of 2" });
    expect(picked.querySelector(".ask-tile-check")).toHaveTextContent(/^✓$/);
    expect(picked.querySelector(".ask-order-num")).toBeNull();
    expect(container.querySelector(".ask-dots")).toBeNull();
    expect(container.querySelector(".ask-dot")).toBeNull();
    expect(screen.getByLabelText("1 of 2 picked")).toHaveClass("ask-sr");
    expect(container.querySelector(".ask-cartrow .ask-wagon")).toHaveClass("ask-wagon-big");
    expect(container.querySelector(".ask-cartrow .ask-wagonwrap")).not.toBeNull();
    expect(tide(container)).toHaveAttribute("data-fill", "50");
    expect(tide(container)).not.toHaveClass("full");
    fireEvent.click(screen.getByRole("button", { name: "Apples" }));
    expect(tide(container)).toHaveAttribute("data-fill", "100");
    expect(tide(container)).toHaveClass("full");
    fireEvent.click(screen.getByRole("button", { name: /^Apples, pick/ }));       // unpick: the tide drops back
    expect(tide(container)).toHaveAttribute("data-fill", "50");
  });
  test("filling the cart bursts fireworks once, after the last card lands; they clear themselves", () => {
    jest.useFakeTimers();
    try {
      setup({ ask: KID });
      fireEvent.click(screen.getByRole("button", { name: "Let's pick" }));
      fireEvent.click(screen.getByRole("button", { name: "Cheese" }));
      act(() => { jest.advanceTimersByTime(1000); });
      expect(document.querySelector(".ask-fireworks")).toBeNull();               // half full: no burst
      fireEvent.click(screen.getByRole("button", { name: "Apples" }));
      expect(document.querySelector(".ask-fireworks")).toBeNull();               // not before the card lands
      act(() => { jest.advanceTimersByTime(600); });
      const fw = document.querySelector(".ask-fireworks");
      expect(fw).not.toBeNull();
      expect(fw).toHaveAttribute("aria-hidden", "true");
      expect(fw.querySelectorAll(".ask-burst")).toHaveLength(3);
      act(() => { jest.advanceTimersByTime(2500); });
      expect(document.querySelector(".ask-fireworks")).toBeNull();
    } finally { jest.useRealTimers(); }
  });
  test("an unpick in the moment before the burst cancels it", () => {
    jest.useFakeTimers();
    try {
      setup({ ask: KID });
      fireEvent.click(screen.getByRole("button", { name: "Let's pick" }));
      fireEvent.click(screen.getByRole("button", { name: "Cheese" }));
      fireEvent.click(screen.getByRole("button", { name: "Apples" }));
      fireEvent.click(screen.getByRole("button", { name: /^Apples, pick/ }));
      act(() => { jest.advanceTimersByTime(3000); });
      expect(document.querySelector(".ask-fireworks")).toBeNull();
    } finally { jest.useRealTimers(); }
  });
  test("no burst under reduced motion; the full tide still shows", () => {
    const mm = window.matchMedia;
    window.matchMedia = (q) => ({ matches: /reduce/.test(q), media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    jest.useFakeTimers();
    try {
      const { container } = setup({ ask: KID });
      fireEvent.click(screen.getByRole("button", { name: "Let's pick" }));
      ["Cheese", "Apples"].forEach((n) => fireEvent.click(screen.getByRole("button", { name: n })));
      act(() => { jest.advanceTimersByTime(3000); });
      expect(document.querySelector(".ask-fireworks")).toBeNull();
      expect(tide(container)).toHaveClass("full");
    } finally { jest.useRealTimers(); window.matchMedia = mm; }
  });
  test("a resumed run that is already full doesn't burst again", () => {
    jest.useFakeTimers();
    try {
      render(<AskRun ask={KID} tiles={TILES} onLand={jest.fn(async () => {})} onExit={jest.fn()} resume={{ screen: "shelf", ids: ["c-0", "c-1"] }} />);
      act(() => { jest.advanceTimersByTime(3000); });
      expect(document.querySelector(".ask-fireworks")).toBeNull();
    } finally { jest.useRealTimers(); }
  });
});

// H5–H11: Explorer swipes the wagon to send (docs/mockups/mockup_ask_swipe_wagon.html).
describe("Explorer swipes the wagon (H5–H11)", () => {
  const KID = { id: "a-k", label: "Kid", shelfNoun: null, pickTarget: 2, screenStyle: "simple" };
  const fill = () => ["Cheese", "Apples"].forEach((n) => fireEvent.click(screen.getByRole("button", { name: n })));
  const kid = (props = {}) => {
    const r = setup({ ask: KID, ...props });
    fireEvent.click(screen.getByRole("button", { name: "Let's pick" }));
    return r;
  };
  test("H5: no ✓ is rendered, full or not", () => {
    kid();
    expect(screen.queryByRole("button", { name: "That's it!" })).toBeNull();
    fill();
    expect(screen.queryByRole("button", { name: "That's it!" })).toBeNull();
    expect(document.querySelector(".ask-thats-it")).toBeNull();
  });
  test("H6: a drag of ≥ 60px to the right on a full wagon lands once and reaches Great picks", async () => {
    const { onLand } = kid();
    fill();
    swipe(SEND_PX);
    expect(onLand).toHaveBeenCalledTimes(1);
    expect(onLand).toHaveBeenCalledWith(["c-2", "c-1"]);
    await screen.findByText("Your picks are on our list!");
    expect(screen.getByRole("heading")).toHaveTextContent("Great picks, Kid!");
  });
  test("H6: short of 60px it springs back; a drag on a not-full wagon does nothing", () => {
    const { onLand } = kid();
    fireEvent.click(screen.getByRole("button", { name: "Cheese" }));
    swipe(SEND_PX + 40);                                                    // not full
    expect(onLand).not.toHaveBeenCalled();
    expect(wagonWrap().style.transform).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Apples" }));
    swipe(SEND_PX - 1);                                                     // full, but short
    expect(onLand).not.toHaveBeenCalled();
    expect(wagonWrap().style.transform).toBe("");
    expect(screen.getByRole("heading")).toHaveTextContent("Pick 2, Kid!");
  });
  test("H6: only rightward travel moves the wagon", () => {
    kid();
    fill();
    const w = wagonWrap();
    fireEvent.pointerDown(w, pt(200));
    fireEvent.pointerMove(w, pt(120));
    expect(w.style.transform).toBe("");
    fireEvent.pointerMove(w, pt(240));
    expect(w.style.transform).toBe("translateX(40px)");
    fireEvent.pointerUp(w, pt(240));
  });
  test("H7: taps keep working on a full wagon — a card comes out, a tile unpicks; the wagon stops being sendable", () => {
    const { onLand } = kid();
    fill();
    expect(wagonWrap()).toHaveClass("full");
    fireEvent.click(screen.getByRole("button", { name: "Take out Apples" }));
    expect(screen.getByLabelText("1 of 2 picked")).toBeInTheDocument();
    expect(wagonWrap()).not.toHaveClass("full");
    fireEvent.click(screen.getByRole("button", { name: "Apples" }));
    fireEvent.click(screen.getByRole("button", { name: /^Cheese, pick/ }));
    expect(screen.getByLabelText("1 of 2 picked")).toBeInTheDocument();
    expect(onLand).not.toHaveBeenCalled();
  });
  test("H7: a press that moves (a drag) doesn't also take the card out", () => {
    kid();
    fill();
    const card = screen.getByRole("button", { name: "Take out Apples" });
    const w = wagonWrap();
    fireEvent.pointerDown(w, pt(100));
    fireEvent.pointerMove(w, pt(130));
    fireEvent.pointerUp(w, pt(130));                                        // 30px: a drag, short of sending
    fireEvent.click(card);                                                  // the click that follows the release
    expect(screen.getByLabelText("2 of 2 picked")).toBeInTheDocument();
  });
  test("H8: the first tug ~1.7 s after it fills (as the fireworks fade), with a → beside it; unpicking stops it; no adult text", () => {
    jest.useFakeTimers();
    try {
      const { container } = kid();
      fill();
      expect(TUG_AFTER_MS).toBe(1700);
      act(() => { jest.advanceTimersByTime(TUG_AFTER_MS - 100); });
      expect(wagonWrap()).not.toHaveClass("tug");
      act(() => { jest.advanceTimersByTime(150); });
      expect(wagonWrap()).toHaveClass("tug");
      expect(container.querySelector(".ask-send-hint")).toHaveTextContent("→");
      expect(container.querySelector(".ask-send-hint")).toHaveAttribute("aria-hidden", "true");
      expect(screen.queryByText(/grown-up|swipe/i)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Take out Apples" }));
      expect(wagonWrap()).not.toHaveClass("tug");
      const css = [...document.querySelectorAll("style")].map((el) => el.textContent).join("");
      expect(css).toMatch(/\.ask-wagonwrap\.tug \.ask-wagon-tug \{ animation: ask-tug 1\.1s ease-in-out infinite; \}/);   // ~1.1 s loops
      expect(css).toMatch(/@keyframes ask-tug \{ 0%, 55%, 100% \{ transform: none; \}/);                                 // ~0.5 s of rest in each
      expect(css).toMatch(/\.ask-send-hint \{[^}]*opacity: 0;/);         // reduced motion (no animation) leaves it hidden
    } finally { jest.useRealTimers(); }
  });
  test("H9: Done held with a full wagon sends it (not ask_abandoned); with a wagon that isn't full it abandons", async () => {
    const emit = jest.spyOn(askTelemetry, "emitAskEvent").mockImplementation(() => {});
    jest.useFakeTimers();
    try {
      const { onLand, onExit } = kid();
      fill();
      const done = screen.getByRole("button", { name: "Hold to send" });
      fireEvent.pointerDown(done);
      act(() => { jest.advanceTimersByTime(HOLD_MS); });
      fireEvent.pointerUp(done);
      await screen.findByText("Your picks are on our list!");
      expect(onLand).toHaveBeenCalledTimes(1);
      expect(onExit).not.toHaveBeenCalled();
      expect(emit.mock.calls.map((c) => c[0])).not.toContain("ask_abandoned");
    } finally { jest.useRealTimers(); emit.mockRestore(); }
  });
  test("H9: Done with a wagon that isn't full abandons, as today", () => {
    jest.useFakeTimers();
    try {
      const { onLand, onExit } = kid();
      fireEvent.click(screen.getByRole("button", { name: "Cheese" }));
      const done = screen.getByRole("button", { name: "Hold to finish" });
      fireEvent.pointerDown(done);
      act(() => { jest.advanceTimersByTime(HOLD_MS); });
      expect(onExit).toHaveBeenCalledTimes(1);
      expect(onLand).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });
  test("H10: onLand throwing after a swipe — still on the shelf, wagon full, the new copy; a second swipe lands", async () => {
    const onLand = jest.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    kid({ onLand });
    fill();
    swipe(SEND_PX + 10);
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't reach the list. Swipe the wagon again.");
    expect(screen.getByRole("heading")).toHaveTextContent("Pick 2, Kid!");
    expect(screen.getByLabelText("2 of 2 picked")).toBeInTheDocument();
    expect(wagonWrap()).toHaveClass("full");
    expect(wagonWrap().style.transform).toBe("");                          // rolled back in
    swipe(SEND_PX + 10);
    await screen.findByText("Your picks are on our list!");
    expect(onLand).toHaveBeenCalledTimes(2);
  });
  test("H11: the full wagon is a 'Send the wagon' button for keyboards and screen readers", async () => {
    const { onLand } = kid();
    expect(screen.queryByRole("button", { name: "Send the wagon" })).toBeNull();      // not until it's full
    fill();
    expect(screen.getByRole("button", { name: "Send the wagon" })).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(screen.getByRole("button", { name: "Take out Apples" }), { key: "Enter" });   // Enter on a card is the card's:
    expect(screen.getByLabelText("1 of 2 picked")).toBeInTheDocument();                             // it comes out, nothing is sent
    expect(onLand).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apples" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Send the wagon" }), { key: "Enter" });
    expect(onLand).toHaveBeenCalledTimes(1);
    await screen.findByText("Your picks are on our list!");
  });
  test("H12: picked is unmistakable — a ~5px outline, a pale teal wash, a 44px ✓ with a white ring", () => {
    kid();
    fireEvent.click(screen.getByRole("button", { name: "Cheese" }));
    expect(screen.getByRole("button", { name: /^Cheese, pick/ }).querySelector(".ask-tile-check")).toHaveTextContent(/^✓$/);
    const css = [...document.querySelectorAll("style")].map((el) => el.textContent).join("");
    expect(css).toMatch(/\.ask-tiles-simple \.ask-tile\.picked \{ background: #E3F4F1; box-shadow: 0 0 0 3px #0D9488; \}/);
    expect(css).toMatch(/\.ask-tiles-simple \.ask-tile-check \{ width: 44px; height: 44px; font-size: 24px;[^}]*box-shadow: 0 0 0 3px #fff;/);
    expect(css).toMatch(/\.ask-tile \{[^}]*border: 2px solid/);                      // 2px border + 3px ring ≈ 5px
  });
  test("H13: Explorer's tub is wordless and a tap on its front sends nothing", () => {
    const { onLand } = kid();
    fill();
    expect(document.querySelector(".ask-tub-words")).toBeNull();
    expect(tub()).toBeNull();
    fireEvent.click(document.querySelector(".ask-cartrow .ask-wagon"));
    expect(onLand).not.toHaveBeenCalled();
  });
});

// H13 (rev 3): Shopper sends with the wagon too — no That's it! button; "That's it!" pops onto the tub front.
describe("Shopper sends with the wagon (H13)", () => {
  const shopper = (props = {}) => { const r = setup(props); toShelf(); return r; };
  const fillThree = () => ["Cheese", "Apples", "Yogurt"].forEach((n) => fireEvent.click(tile(n)));
  test("no That's it! button is rendered; full, the tub says That's it!; the numbered badges are unchanged", () => {
    shopper();
    expect(screen.queryByRole("button", { name: /That's it!/ })).toBeNull();
    expect(document.querySelector(".ask-tub-words")).toBeNull();
    fillThree();
    expect(screen.queryByRole("button", { name: /That's it!/ })).toBeNull();
    const words = document.querySelector(".ask-tub-words");
    expect(words).toHaveTextContent(/^That's it!$/);
    expect(words).toHaveAttribute("aria-hidden", "true");                                // the wagon is "Send the wagon" for readers
    expect(words.getAttribute("font-weight")).toBe("900");
    expect(screen.getByRole("button", { name: "Yogurt, pick 3 of 3" }).querySelector(".ask-order-num")).toHaveTextContent("3");
    // the tap area is the tub front below the stripe (y 92) and between the wheels — never under a card
    const r = tub();
    expect(+r.getAttribute("y")).toBeGreaterThanOrEqual(92);
    expect([+r.getAttribute("x"), +r.getAttribute("width")]).toEqual([66, 156]);
  });
  test("a tap on the tub front sends: onLand once, then Great picks", async () => {
    const { onLand } = shopper();
    fillThree();
    tapTub();
    tapTub();
    expect(onLand).toHaveBeenCalledTimes(1);
    expect(onLand).toHaveBeenCalledWith(["c-2", "c-1", "c-3"]);
    await screen.findByText("Your picks are on our list!");
  });
  test("a swipe sends too", async () => {
    const { onLand } = shopper();
    fillThree();
    swipe(SEND_PX + 15);
    expect(onLand).toHaveBeenCalledTimes(1);
    await screen.findByText("Your picks are on our list!");
  });
  test("a card tap still takes the pick out (and the tub's words go)", () => {
    const { onLand } = shopper();
    fillThree();
    fireEvent.click(screen.getByRole("button", { name: "Take out Apples" }));
    expect(screen.getByLabelText("2 of 3 picked")).toBeInTheDocument();
    expect(document.querySelector(".ask-tub-words")).toBeNull();
    expect(onLand).not.toHaveBeenCalled();
  });
  test("a press on the tub that turns into a short drag doesn't send", () => {
    const { onLand } = shopper();
    fillThree();
    const w = wagonWrap();
    fireEvent.pointerDown(w, pt(100));
    fireEvent.pointerMove(w, pt(130));
    fireEvent.pointerUp(w, pt(130));
    tapTub();                                                                            // the click after the release
    expect(onLand).not.toHaveBeenCalled();
  });
  test("Done held full sends; the tug and → come ~1.7 s after it fills; Send the wagon for assistive tech", async () => {
    jest.useFakeTimers();
    try {
      const { onLand, onExit } = shopper();
      fillThree();
      expect(screen.getByRole("button", { name: "Send the wagon" })).toBeInTheDocument();
      act(() => { jest.advanceTimersByTime(TUG_AFTER_MS + 50); });
      expect(wagonWrap()).toHaveClass("tug");
      const done = screen.getByRole("button", { name: "Hold to send" });
      fireEvent.pointerDown(done);
      act(() => { jest.advanceTimersByTime(HOLD_MS); });
      fireEvent.pointerUp(done);
      await screen.findByText("Your picks are on our list!");
      expect(onLand).toHaveBeenCalledTimes(1);
      expect(onExit).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });
  test("a failed land: the wagon rolls back full, and Shopper's copy is 'Try That's it! again.'", async () => {
    shopper({ onLand: jest.fn().mockRejectedValueOnce(new Error("offline")) });
    fillThree();
    tapTub();
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't reach the list. Try That's it! again.");
    expect(screen.getByLabelText("3 of 3 picked")).toBeInTheDocument();
    expect(document.querySelector(".ask-tub-words")).toHaveTextContent("That's it!");
  });
});

// Great picks: the wagon is the summary (2026-11-14).
describe("the summary wagon", () => {
  const SIX = ["Apples", "Bananas", "Carrots", "Cheddar cheese", "Hummus", "Greek yogurt"].map((name, i) => ({ id: `s-${i}`, name, glyph: null, photoUrl: null }));
  async function land(n) {
    const view = render(<AskRun ask={{ ...ASK, pickTarget: n }} tiles={SIX} onLand={jest.fn(async () => {})} onExit={jest.fn()} />);
    toShelf();
    SIX.slice(0, n).forEach((t) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${t.name}`) })));
    tapTub();
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
    tapTub();
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


// Telemetry (lib/askTelemetry; A24 as amended 2026-11-15): the funnel and the failures, no names.
describe("telemetry", () => {
  let emit;
  beforeEach(() => { emit = jest.spyOn(askTelemetry, "emitAskEvent").mockImplementation(() => {}); });
  afterEach(() => emit.mockRestore());
  const calls = () => emit.mock.calls;
  test("a fresh run emits ask_started once, with the Ask's screen style", () => {
    setup();
    expect(calls()).toEqual([["ask_started", undefined]]);          // Shopper (no style set)
  });
  test("an Explorer run passes its style along", () => {
    setup({ ask: { ...ASK, screenStyle: "simple" } });
    expect(calls()).toEqual([["ask_started", "simple"]]);
  });
  test("a reloaded run emits ask_resumed with its screen, not ask_started", () => {
    render(<AskRun ask={ASK} tiles={TILES} onLand={jest.fn(async () => {})} onExit={jest.fn()} resume={{ screen: "shelf", ids: ["c-0"] }} />);
    expect(calls()).toEqual([["ask_resumed", "shelf", undefined]]);
  });
  test("holding Done on the shelf emits ask_abandoned with the screen and the count, then exits", () => {
    jest.useFakeTimers();
    try {
      const { onExit } = setup();
      toShelf();
      fireEvent.click(tile("Cheese"));
      const done = screen.getByRole("button", { name: "Hold to finish" });
      fireEvent.pointerDown(done);
      act(() => { jest.advanceTimersByTime(1500); });
      expect(calls()).toContainEqual(["ask_abandoned", "shelf", 1, undefined]);
      expect(onExit).toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });
  test("a failed land emits ask_land_failed with the error and the count; the wagon stays", async () => {
    const err = { code: "42501", message: "permission denied for Easton" };
    setup({ onLand: jest.fn(async () => { throw err; }) });
    toShelf();
    ["Cheese", "Apples", "Yogurt"].forEach((n) => fireEvent.click(tile(n)));
    tapTub();
    await screen.findByRole("alert");
    expect(calls()).toContainEqual(["ask_land_failed", err, 3, undefined]);
  });
  test("a landed run emits no failure and no abandon", async () => {
    setup();
    toShelf();
    ["Cheese", "Apples", "Yogurt"].forEach((n) => fireEvent.click(tile(n)));
    tapTub();
    await screen.findByText("Your picks are on our list!");
    expect(calls().map((c) => c[0])).toEqual(["ask_started"]);
  });
});

// ── 087 (SPEC_ask_shelf_sync B7, B9.3): a pick whose item is gone is skipped ─────────────────────
test("B7: some picks skipped — Great picks with the landed ones and one line naming the rest", async () => {
  const onLand = jest.fn(async () => ({ landed: 2, skippedIds: ["c-0"] }));
  setup({ onLand });
  toShelf();
  fireEvent.click(tile("Goldfish"));
  fireEvent.click(tile("Cheese"));
  fireEvent.click(tile("Yogurt"));
  tapTub();
  await screen.findByText("Goldfish isn't available any more. The rest are on the list.");
  expect(screen.getByRole("heading")).toHaveTextContent("Great picks, Easton!");
  expect(summary()).toBe("Your picks: Cheese, Yogurt");
  expect(screen.queryByText(/Tap ✓ again|Try That's it! again/)).toBeNull();
});

test("B9.3: nothing landed — no celebration; the dead tiles leave the run and the wagon; the run stays open", async () => {
  const onLand = jest.fn()
    .mockResolvedValueOnce({ landed: 0, skippedIds: ["c-0", "c-1", "c-2"] })
    .mockResolvedValueOnce({ landed: 1, skippedIds: [] });
  setup({ onLand });
  toShelf();
  fireEvent.click(tile("Goldfish"));
  fireEvent.click(tile("Apples"));
  fireEvent.click(tile("Cheese"));
  tapTub();
  await screen.findByText("Goldfish, Apples and Cheese aren't available any more.");
  expect(screen.queryByText("Your picks are on our list!")).toBeNull();
  expect(screen.queryByRole("button", { name: /^Goldfish/ })).toBeNull();          // the dead tiles are gone
  expect(screen.queryByRole("button", { name: /^Cheese/ })).toBeNull();
  expect(screen.getByLabelText("0 of 1 picked")).toBeInTheDocument();             // the target follows the tiles left
  expect(screen.queryByText(/Tap ✓ again|Try That's it! again/)).toBeNull();
  fireEvent.click(tile("Yogurt"));                                                  // pick again: the line goes
  expect(screen.queryByText(/aren't available any more/)).toBeNull();
  tapTub();
  await screen.findByText("Your pick is on our list!");
  expect(onLand).toHaveBeenLastCalledWith(["c-3"]);
});
