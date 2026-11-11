import { render, screen, fireEvent, act } from "@testing-library/react";
import { LandscapeStaples } from "./LandscapeStaples";
import { LANDSCAPE_HEADER, LANDSCAPE_EMPTY, QTY_HINT } from "../lib/landscapeStaples";

const fs = require("fs");
const path = require("path");

const items = [
  { name: "Bananas", rawCategory: "Produce" },
  { name: "Milk", rawCategory: "Dairy" },
  { name: "Eggs", rawCategory: "Dairy" },
];
const setup = (qty = {}) => {
  const onAdd = jest.fn();
  const onRemove = jest.fn();
  render(<LandscapeStaples items={items} qtyOf={(i) => qty[i.name] || 0} onAdd={onAdd} onRemove={onRemove} />);
  return { onAdd, onRemove };
};

describe("LandscapeStaples", () => {
  test("header explains the gesture; a flat grid, no filter or search UI", () => {
    setup();
    expect(screen.getByText(LANDSCAPE_HEADER)).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Bananas", "Milk", "Eggs"]);
    expect(document.querySelector("input")).toBeNull();
    expect(document.querySelector(".cat-pill")).toBeNull();
  });

  test("tap a tile that is off the list → add; nothing else", () => {
    const { onAdd, onRemove } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Milk" }));
    expect(onAdd).toHaveBeenCalledWith(items[1]);
    expect(onRemove).not.toHaveBeenCalled();
  });

  test("a tile on the list is selected and shows its quantity", () => {
    setup({ Milk: 2 });
    const tile = screen.getByRole("button", { name: /Milk/ });
    expect(tile).toHaveClass("on");
    expect(tile).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Quantity 2")).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: "Eggs" })).not.toHaveClass("on");
  });

  test("tap at quantity 1 → remove", () => {
    const { onAdd, onRemove } = setup({ Milk: 1 });
    fireEvent.click(screen.getByRole("button", { name: /Milk/ }));
    expect(onRemove).toHaveBeenCalledWith(items[1]);
    expect(onAdd).not.toHaveBeenCalled();
  });

  test("tap at quantity 2+ → no write, a brief hint", () => {
    jest.useFakeTimers();
    const { onAdd, onRemove } = setup({ Milk: 3 });
    expect(screen.queryByText(QTY_HINT)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Milk/ }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByText(QTY_HINT)).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(2000); });
    expect(screen.queryByText(QTY_HINT)).toBeNull();
    jest.useRealTimers();
  });

  test("no staples → the empty line, no grid", () => {
    render(<LandscapeStaples items={[]} qtyOf={() => 0} onAdd={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.getByText(LANDSCAPE_EMPTY)).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

// The decision in the spec: landscape is a separate view, NOT a filter state. With the
// Staples pill off in portrait, a trip through landscape must leave it off — and the
// category pills, search and declutter phase alone. Held on the source, because the wiring
// lives inside ProvisionsApp (Clerk + Supabase), like AddSheetClip.test.js.
describe("landscape never touches portrait filter state", () => {
  const APP = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
  const read = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");
  const PORTRAIT_STATE = /stapleFilter|setStapleFilter|selectedCategories|setSelectedCategories|searchQuery|setSearchQuery|browsePhase|setBrowsePhase|displayCategories/;
  const code = (src) => src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*")).join("\n");

  test("the component, the rules and the gate name no portrait state at all", () => {
    [["components", "LandscapeStaples.js"], ["lib", "landscapeStaples.js"], ["hooks", "useLandscapePhone.js"]].forEach((p) => {
      expect(code(read(...p))).not.toMatch(PORTRAIT_STATE);
    });
  });

  test("the App.js wiring block names none either, and is fed the unfiltered categories", () => {
    const start = APP.indexOf("// ── Landscape = Staples (SPEC_landscape_staples) ──");
    const end = APP.indexOf("const totalItems = shoppingList.reduce", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = code(APP.slice(start, end));
    expect(block).not.toMatch(PORTRAIT_STATE);
    expect(block).toMatch(/landscapeItems\(categories, catalogMap\)/);
  });

  test("the element is handed items and the two list writes, nothing else", () => {
    const m = APP.match(/<LandscapeStaples ([^>]*)\/>/);
    expect(m).not.toBeNull();
    expect(m[1].trim()).toBe("items={landscapeTiles} qtyOf={qtyFor} onAdd={landscapeAdd} onRemove={landscapeRemove}");
  });
});
