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
  test("header is the star and the word, no exit instructions; a flat grid, no filter or search UI", () => {
    render(<LandscapeStaples items={items} qtyOf={() => 0} onAdd={jest.fn()} onRemove={jest.fn()} glyph="⭐" />);
    expect(LANDSCAPE_HEADER).toBe("Staples");
    expect(document.querySelector(".ls-head").textContent).toBe("⭐Staples");
    expect(document.querySelector(".ls-root").textContent).not.toMatch(/rotate/i);
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

  test("an error shows in the hint slot with Dismiss, and outranks the quantity hint", () => {
    const onDismissError = jest.fn();
    render(<LandscapeStaples items={items} qtyOf={(i) => (i.name === "Milk" ? 3 : 0)} onAdd={jest.fn()} onRemove={jest.fn()}
      error="Could not add Milk" onDismissError={onDismissError} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not add Milk");
    expect(screen.getByRole("alert")).toHaveClass("ls-hint");
    fireEvent.click(screen.getByRole("button", { name: /Milk/ }));   // would raise the 2+ hint
    expect(screen.queryByText(QTY_HINT)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismissError).toHaveBeenCalledTimes(1);
  });

  test("no error → no alert", () => {
    setup();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("the grid sizes its own tiles, and the hint slot is outside the scroller", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8").match(/^\s*\.ls-grid \{([^}]*)\}/m)[1];
    expect(css).toMatch(/flex: 1;/);
    expect(css).toMatch(/min-height: 0;/);
    expect(css).toMatch(/overflow-y: auto;/);
    expect(css).toMatch(/grid-template-columns: repeat\(auto-fit, minmax\(120px, 1fr\)\);/);
    expect(css).toMatch(/grid-auto-rows: minmax\(48px, 1fr\);/);
    jest.useFakeTimers();
    setup({ Milk: 3 });
    fireEvent.click(screen.getByRole("button", { name: /Milk/ }));
    expect(screen.getByText(QTY_HINT).closest(".ls-grid")).toBeNull();
    act(() => { jest.advanceTimersByTime(2000); });
    jest.useRealTimers();
  });

  test("no staples → the empty line, no grid", () => {
    render(<LandscapeStaples items={[]} qtyOf={() => 0} onAdd={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.getByText(LANDSCAPE_EMPTY)).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

// Display is CSS, not JS state (2026-11-11): the view is mounted whenever Browse is up and the
// media query swaps it in, in the same frame as the rotation. Held on the source.
describe("display is CSS-driven", () => {
  const APP = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
  const flat = APP.replace(/\s+/g, " ");

  test("hidden by default; shown, with portrait Browse hidden, only inside the phone query under the body class", () => {
    expect(APP).toMatch(/^\s*\.ls-root \{[^}]*display: none;/m);
    expect(flat).toContain("@media ${LANDSCAPE_PHONE_QUERY} { body.${LANDSCAPE_ELIGIBLE_CLASS} .ls-root { display: flex; } body.${LANDSCAPE_ELIGIBLE_CLASS} .phone-frame { visibility: hidden; } }");
  });

  test("mounted on Browse (signed in, catalog loaded) — not on the debounced hook", () => {
    expect(flat).toContain('const landscapeMounted = view === "input" && !signedOutWelcome && !catalogLoading;');
    expect(flat).toContain("{landscapeMounted && ( <LandscapeStaples ");
    expect(flat).not.toContain("{landscapeStaples && ( <LandscapeStaples ");
  });

  test("the body class is Browse-up AND no text field focused", () => {
    expect(flat).toContain("const landscapeEligible = landscapeMounted && !textFocused;");
    expect(flat).toContain("document.body.classList.toggle(LANDSCAPE_ELIGIBLE_CLASS, landscapeEligible);");
  });

  test("the debounced hook only marks the visit", () => {
    expect(flat).toContain("const landscapeStaples = landscapePhone && landscapeEligible;");
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

  test("the element is handed items, the two list writes and the error to mirror, nothing else", () => {
    const m = APP.match(/<LandscapeStaples ([^>]*)\/>/);
    expect(m).not.toBeNull();
    expect(m[1].trim()).toBe("items={landscapeTiles} qtyOf={qtyFor} onAdd={landscapeAdd} onRemove={landscapeRemove} glyph={categoryGlyph(\"Staples\")} error={error} onDismissError={dismissError}");
  });
});
