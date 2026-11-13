import { render, screen, fireEvent, act } from "@testing-library/react";
import { LandscapeStaples } from "./LandscapeStaples";
import { LANDSCAPE_HEADER, LANDSCAPE_EMPTY, HOLD_HINT } from "../lib/landscapeStaples";
import { HOLD_MS } from "../hooks/useHold";

const fs = require("fs");
const path = require("path");

const items = [
  { name: "Bananas", rawCategory: "Produce" },
  { name: "Milk", rawCategory: "Dairy" },
  { name: "Eggs", rawCategory: "Dairy" },
];
// `qty` = what is on the list; `visit` = names added during this landscape visit.
const setup = (qty = {}, visit = []) => {
  const onAdd = jest.fn();
  const onRemove = jest.fn();
  render(<LandscapeStaples items={items} qtyOf={(i) => qty[i.name] || 0} addedThisVisit={(i) => visit.includes(i.name)} onAdd={onAdd} onRemove={onRemove} />);
  return { onAdd, onRemove };
};

describe("LandscapeStaples", () => {
  test("header is the star and the word, no exit instructions; a flat grid, no filter or search UI", () => {
    render(<LandscapeStaples items={items} qtyOf={() => 0} onAdd={jest.fn()} onRemove={jest.fn()} glyph="⭐" />);
    expect(LANDSCAPE_HEADER).toBe("Staples");
    expect(document.querySelector(".ls-head").textContent).toBe("⭐ Staples");
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

  test("tap a tile added during THIS visit → take it back off", () => {
    const { onAdd, onRemove } = setup({ Milk: 1 }, ["Milk"]);
    fireEvent.click(screen.getByRole("button", { name: /Milk/ }));
    expect(onRemove).toHaveBeenCalledWith(items[1]);
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.queryByText(HOLD_HINT)).toBeNull();
  });

  test("tap a tile that was on the list before the visit → no write, 'Hold to remove' — at 1 and at 3", () => {
    jest.useFakeTimers();
    const { onAdd, onRemove } = setup({ Milk: 1, Eggs: 3 });
    expect(screen.queryByText(HOLD_HINT)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Milk/ }));
    expect(screen.getByText(HOLD_HINT)).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(2000); });
    expect(screen.queryByText(HOLD_HINT)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Eggs/ }));
    expect(screen.getByText(HOLD_HINT)).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(2000); });
    jest.useRealTimers();
  });

  test("the old quantity hint is gone", () => {
    setup({ Milk: 3 });
    fireEvent.click(screen.getByRole("button", { name: /Milk/ }));
    expect(document.querySelector(".ls-root").textContent).not.toMatch(/edit quantity/i);
  });

  describe("press and hold", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test("holding an on-list tile for HOLD_MS removes it at any quantity; the press's own click is swallowed", () => {
      const { onAdd, onRemove } = setup({ Eggs: 3 });
      const tile = screen.getByRole("button", { name: /Eggs/ });
      expect(tile.querySelector(".ls-fill")).not.toBeNull();
      fireEvent.pointerDown(tile);
      expect(tile).toHaveClass("holding");
      act(() => { jest.advanceTimersByTime(HOLD_MS - 1); });
      expect(onRemove).not.toHaveBeenCalled();
      act(() => { jest.advanceTimersByTime(1); });
      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(onRemove).toHaveBeenCalledWith(items[2]);
      expect(tile).not.toHaveClass("holding");
      fireEvent.pointerUp(tile);
      fireEvent.click(tile);   // the browser's click for the same press
      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(onAdd).not.toHaveBeenCalled();
      expect(screen.queryByText(HOLD_HINT)).toBeNull();
    });

    test("a tile added this visit can be held off too", () => {
      const { onRemove } = setup({ Milk: 1 }, ["Milk"]);
      const tile = screen.getByRole("button", { name: /Milk/ });
      fireEvent.pointerDown(tile);
      act(() => { jest.advanceTimersByTime(HOLD_MS); });
      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    test("letting go early is just a tap: no remove by hold; a scroll that cancels the press does nothing", () => {
      const { onRemove } = setup({ Eggs: 3 });
      const tile = screen.getByRole("button", { name: /Eggs/ });
      fireEvent.pointerDown(tile);
      act(() => { jest.advanceTimersByTime(400); });
      fireEvent.pointerUp(tile);
      fireEvent.click(tile);
      act(() => { jest.advanceTimersByTime(HOLD_MS); });
      expect(onRemove).not.toHaveBeenCalled();
      expect(screen.getByText(HOLD_HINT)).toBeInTheDocument();   // the tap's own answer
      act(() => { jest.advanceTimersByTime(2000); });
      fireEvent.pointerDown(tile);
      act(() => { jest.advanceTimersByTime(300); });
      fireEvent.pointerCancel(tile);   // the browser took the gesture for scrolling: no click follows
      act(() => { jest.advanceTimersByTime(HOLD_MS); });
      expect(onRemove).not.toHaveBeenCalled();
      expect(screen.queryByText(HOLD_HINT)).toBeNull();
    });

    test("a tile that is not on the list has no hold: holding it does nothing, the tap adds", () => {
      const { onAdd, onRemove } = setup();
      const tile = screen.getByRole("button", { name: "Milk" });
      expect(tile.querySelector(".ls-fill")).toBeNull();
      fireEvent.pointerDown(tile);
      act(() => { jest.advanceTimersByTime(HOLD_MS * 2); });
      expect(tile).not.toHaveClass("holding");
      fireEvent.pointerUp(tile);
      fireEvent.click(tile);
      expect(onRemove).not.toHaveBeenCalled();
      expect(onAdd).toHaveBeenCalledTimes(1);
    });

    test("after a hold whose click never came, the next tap still works", () => {
      const { onAdd, onRemove } = setup({ Eggs: 3 });
      const eggs = screen.getByRole("button", { name: /Eggs/ });
      fireEvent.pointerDown(eggs);
      act(() => { jest.advanceTimersByTime(HOLD_MS); });
      expect(onRemove).toHaveBeenCalledTimes(1);
      fireEvent.pointerLeave(eggs);   // finger slid off: no click
      fireEvent.pointerDown(eggs);
      fireEvent.pointerUp(eggs);
      fireEvent.click(eggs);
      expect(screen.getByText(HOLD_HINT)).toBeInTheDocument();   // (the fake qty is still 3)
      expect(onAdd).not.toHaveBeenCalled();
    });

    test("the fill is the Ask Done pill's: both stylesheets take it from holdFillCss", () => {
      const APP = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
      const ASK = fs.readFileSync(path.join(__dirname, "AskRun.js"), "utf8");
      expect(APP).toContain('${holdFillCss(".ls-fill", ".ls-tile.holding .ls-fill")}');
      expect(ASK).toContain('${holdFillCss(".ask-done-fill", ".ask-done.holding .ask-done-fill")}');
      expect(ASK).toMatch(/const \{ holding, bind \} = useHold\(/);
      expect(ASK).not.toMatch(/const HOLD_MS/);
    });
  });

  test("an error shows in the hint slot with Dismiss, and outranks the hold hint", () => {
    const onDismissError = jest.fn();
    render(<LandscapeStaples items={items} qtyOf={(i) => (i.name === "Milk" ? 3 : 0)} onAdd={jest.fn()} onRemove={jest.fn()}
      error="Could not add Milk" onDismissError={onDismissError} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not add Milk");
    expect(screen.getByRole("alert")).toHaveClass("ls-hint");
    fireEvent.click(screen.getByRole("button", { name: /Milk/ }));   // would raise "Hold to remove"
    expect(screen.queryByText(HOLD_HINT)).toBeNull();
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
    expect(css).toMatch(/grid-auto-rows: minmax\(48px, 140px\);/);
    expect(css).toMatch(/align-content: start;/);
    jest.useFakeTimers();
    setup({ Milk: 3 });
    fireEvent.click(screen.getByRole("button", { name: /Milk/ }));
    expect(screen.getByText(HOLD_HINT).closest(".ls-grid")).toBeNull();
    act(() => { jest.advanceTimersByTime(2000); });
    jest.useRealTimers();
  });

  test("an on-list tile looks like an on-list portrait row: one shared rule, no dark fill; label 17px × the knob", () => {
    const APP = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
    expect(APP).toMatch(/^\s*\.item-row\.has-qty, \.ls-tile\.on \{ border-color: #c8973a; background: #FAF4EC; \}/m);
    expect(APP.match(/\.ls-tile\.on \{/g)).toHaveLength(1);
    const tile = APP.match(/^\s*\.ls-tile \{([^}]*)\}/m)[1];
    expect(tile).toMatch(/border: 2px solid #E8D5B7;/);
    expect(tile).toMatch(/font-size: calc\(17px \* var\(--op-text-scale\)\);/);
    expect(tile).not.toMatch(/#2C1A0E;\s*border/);
  });

  test("scrolled: the header's fade comes on, and goes again at the top; it is the Helm fade's stops turned upwards", () => {
    setup();
    const root = document.querySelector(".ls-root"), grid = document.querySelector(".ls-grid");
    expect(root).not.toHaveClass("scrolled");
    grid.scrollTop = 40; fireEvent.scroll(grid);
    expect(root).toHaveClass("scrolled");
    grid.scrollTop = 0; fireEvent.scroll(grid);
    expect(root).not.toHaveClass("scrolled");
    const APP = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
    expect(APP).toMatch(/:root \{ --op-fade-stops: rgba\(250,244,236,0\), rgba\(250,244,236,0\.85\) 55%, #FAF4EC; \}/);
    expect(APP).toMatch(/\.helm-fade \{[^}]*background: linear-gradient\(to bottom, var\(--op-fade-stops\)\);/);
    expect(APP).toMatch(/\.ls-head::after \{[^}]*background: linear-gradient\(to top, var\(--op-fade-stops\)\); opacity: 0;/);
    expect(APP).toMatch(/\.ls-root\.scrolled \.ls-head::after \{ opacity: 1; \}/);
  });

  test("first-run subtitle: beside the header only when asked; the header itself is unchanged", () => {
    const { unmount } = render(<LandscapeStaples items={items} qtyOf={() => 0} onAdd={jest.fn()} onRemove={jest.fn()} glyph="⭐" showHint />);
    expect(document.querySelector(".ls-head .ls-sub")).toHaveTextContent("Tap to add · Hold to remove");
    expect(document.querySelector(".ls-head").textContent).toBe("⭐ StaplesTap to add · Hold to remove");
    unmount();
    render(<LandscapeStaples items={items} qtyOf={() => 0} onAdd={jest.fn()} onRemove={jest.fn()} glyph="⭐" />);
    expect(document.querySelector(".ls-sub")).toBeNull();
    expect(document.querySelector(".ls-head").textContent).toBe("⭐ Staples");
  });

  test("the header IS portrait's section header: one component, the same title class, rule and action style", () => {
    const APP = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
    const LS = fs.readFileSync(path.join(__dirname, "LandscapeStaples.js"), "utf8");
    // both render CategoryHeader; neither carries its own copy of the header's styles
    expect(APP).toMatch(/<CategoryHeader title=\{cat\.name\}>/);
    expect(APP).toMatch(/style=\{CATEGORY_HEADER_ACTION\}\s*>＋ New item<\/button>/);
    expect(LS).toMatch(/<CategoryHeader title=/);
    expect(APP).not.toMatch(/\.ls-em \{|\.ls-sub \{/);
    render(<LandscapeStaples items={items} qtyOf={() => 0} onAdd={jest.fn()} onRemove={jest.fn()} glyph="⭐" showHint />);
    const title = document.querySelector(".ls-head .cat-title");
    expect(title).toHaveTextContent("⭐ Staples");            // .cat-title uppercases and tracks it
    const row = title.parentElement;
    expect(row).toHaveStyle({ borderBottom: "2px solid #E8D5B7" });   // the gold rule, #E8D5B7
    expect(row.style.justifyContent).toBe("space-between");
    expect(row.style.paddingBottom).toBe("8px");
    const hint = document.querySelector(".ls-sub");
    expect(hint.parentElement).toBe(row);                    // on the header line, at the right end
    expect(hint.style.fontSize).toBe("12.5px");
    expect(hint).toHaveStyle({ color: "#8A5F3A" });        // ＋ New item's own #8A5F3A
    expect(hint.style.letterSpacing).toBe("0.5px");
  });

  test("breathing room: 18px above the header, 14px from the rule to the first row; the grid stays top-anchored", () => {
    const APP = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
    expect(APP).toMatch(/^\s*\.ls-head \{[^}]*padding-top: calc\(18px \+ env\(safe-area-inset-top, 0px\)\);/m);
    const grid = APP.match(/^\s*\.ls-grid \{([^}]*)\}/m)[1];
    expect(grid).toMatch(/padding-top: 14px;/);
    expect(grid).toMatch(/align-content: start;/);
  });

  test("the subtitle is counted per visit: pre-rendered for the next visit, counted when one starts", () => {
    const APP = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8").replace(/\s+/g, " ");
    expect(APP).toContain("const [landscapeHintOn, setLandscapeHintOn] = useState(() => hintForNextVisit());");
    expect(APP).toContain("if (!landscapeStaples) return undefined; setLandscapeHintOn(beginHintVisit());");
    expect(APP).toContain("setLandscapeHintOn(hintForNextVisit());");
  });

  test("add palette only: no checked / in-cart / list state reaches the view", () => {
    const LIST_STATE = /checked|toggleChecked|listRows|shoppingList|inCart|activeSession|checkedCount/;
    const strip = (src) => src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*")).join("\n");
    ["components/LandscapeStaples.js", "lib/landscapeStaples.js", "lib/landscapeHint.js"].forEach((p) => {
      expect(strip(fs.readFileSync(path.join(__dirname, "..", p), "utf8"))).not.toMatch(LIST_STATE);
    });
    setup({ Milk: 1 });
    const tile = screen.getByRole("button", { name: /Milk/ });
    expect([...tile.classList].sort()).toEqual(["ls-tile", "on"]);   // on-list + quantity is all a tile can say
  });

  test("no staples → three lines of text under the header, no grid, no button, no emoji in the text", () => {
    render(<LandscapeStaples items={[]} qtyOf={() => 0} onAdd={jest.fn()} onRemove={jest.fn()} glyph="⭐" />);
    expect(LANDSCAPE_EMPTY).toEqual({
      title: "Your everyday essentials",
      body: "Star the items you buy most, and they'll be one turn of your phone away.",
      how: "In Browse, swipe left on any item and tap Staple.",
    });
    const block = document.querySelector(".ls-empty");
    expect([...block.children].map((p) => `${p.className}|${p.textContent}`)).toEqual([
      `ls-empty-title|${LANDSCAPE_EMPTY.title}`, `ls-empty-body|${LANDSCAPE_EMPTY.body}`, `ls-empty-how|${LANDSCAPE_EMPTY.how}`,
    ]);
    expect(block.textContent).not.toMatch(/[\u2B50\u{1F300}-\u{1FAFF}]/u);
    expect(block.querySelector("button, img, svg")).toBeNull();
    expect(document.querySelector(".ls-head .cat-title")).toHaveTextContent("⭐ Staples");   // the header keeps its star
    expect(document.querySelector(".ls-grid")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    const APP = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
    expect(APP).toMatch(/^\s*\.ls-empty \{ margin: auto; max-width: 440px;[^}]*text-align: center; text-wrap: balance;/m);   // no orphaned last line
    expect(APP).toMatch(/\.ls-empty-title \{ font-size: calc\(17px \* var\(--op-text-scale\)\); font-weight: 700; color: #8A5F3A;/);
    expect(APP).toMatch(/\.ls-empty-body \{ font-size: calc\(15px \* var\(--op-text-scale\)\); color: #8a7a60;/);
    expect(APP).toMatch(/\.ls-empty-how \{ font-size: calc\(13px \* var\(--op-text-scale\)\); color: #8a7a60;/);
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

  test("mounted app-wide (signed in, catalog loaded, no screen claiming landscape) — not on a tab, not on the debounced hook", () => {
    expect(flat).toContain("const landscapeMounted = !signedOutWelcome && !catalogLoading && !claimsLandscape;");
    expect(flat).not.toMatch(/const landscapeMounted = [^;]*view ===/);
    expect(flat).toContain("{landscapeMounted && ( <LandscapeStaples ");
    expect(flat).not.toContain("{landscapeStaples && ( <LandscapeStaples ");
  });

  test("the opt-out flag: an Ask run in progress claims landscape, so the view is not mounted and the class is off", () => {
    expect(flat).toContain("const claimsLandscape = !!runAskId;");
    // mounted → eligible → class: with claimsLandscape true none of the three can be on
    expect(flat).toContain("const landscapeEligible = landscapeMounted && !textFocused;");
    expect(flat).toContain("{landscapeMounted && ( <LandscapeStaples ");
  });

  test("the body class is mounted AND no text field focused", () => {
    expect(flat).toContain("const landscapeEligible = landscapeMounted && !textFocused;");
    expect(flat).toContain("document.body.classList.toggle(LANDSCAPE_ELIGIBLE_CLASS, landscapeEligible);");
  });

  test("the debounced hook only marks the visit", () => {
    expect(flat).toContain("const landscapeStaples = landscapePhone && landscapeEligible;");
  });
});

// The bottom chrome is CSS-only, and nothing moves the page mid-rotation (2026-11-11: the Helm
// and its fade were seen ~200pt too high on a real iPhone after a rotation). Held on the source.
describe("rotation: bottom chrome is CSS-only; scroll restore and inset wait for the settled viewport", () => {
  const APP = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
  const rule = (sel) => APP.match(new RegExp(`^\\s*${sel.replace(/[.-]/g, (c) => `\\${c}`)} \\{([^}]*)\\}`, "m"))[1];

  test("the Helm, its fade and the status stack are placed by CSS from the bottom edge — no JS height", () => {
    expect(rule(".helm")).toMatch(/position: fixed;[^}]*bottom: calc\(18px \+ var\(--op-inset-bottom\)\);/);
    expect(rule(".helm-fade")).toMatch(/position: fixed;[^}]*bottom: 0;/);
    expect(rule(".bottom-stack")).toMatch(/bottom: calc\(92px \+ var\(--op-inset-bottom\)\);/);
    expect(APP).toMatch(/:root \{ --op-inset-bottom: env\(safe-area-inset-bottom, 0px\);/);
    expect(APP).not.toMatch(/setProperty\("--op-inset-bottom"/);
  });

  test("the scroll restore runs from onViewportSettled, after a real trip sideways, never off an animation frame", () => {
    const start = APP.indexOf("// Portrait scroll survives the trip");
    const block = APP.slice(start, APP.indexOf("const totalItems = shoppingList.reduce", start));
    expect(block).toMatch(/onViewportSettled\(window, \(\) => \{/);
    expect(block).toMatch(/if \(!browseAwayRef\.current\) return;/);
    expect(block).toMatch(/if \(isTextEntry\(document\.activeElement\)\) return;/);
    expect(block).not.toMatch(/requestAnimationFrame/);
    expect(block.match(/window\.scrollTo\(/g)).toHaveLength(1);
  });

  test("the measured top inset is re-read on the settled viewport", () => {
    expect(APP).toMatch(/const offSettled = onViewportSettled\(window, apply\);/);
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

  test("the element is handed items, the visit's add-set test, the two list writes and the error to mirror, nothing else", () => {
    const m = APP.match(/<LandscapeStaples ([^>]*)\/>/);
    expect(m).not.toBeNull();
    expect(m[1].trim()).toBe("items={landscapeTiles} qtyOf={qtyFor} addedThisVisit={landscapeAddedThisVisit} onAdd={landscapeAdd} onRemove={landscapeRemove} glyph={categoryGlyph(\"Staples\")} showHint={landscapeHintOn} error={error} onDismissError={dismissError}");
  });
});
