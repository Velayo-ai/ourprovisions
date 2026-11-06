// Run: CI=true npx react-scripts test --watchAll=false src/AddSheetClip
//
// The Add sheet clips (2026-11-05). In landscape the keyboard cap shrank the sheet's background
// but not its contents: the hint painted below the sheet's edge, over the page behind the scrim.
// Proves, on the source (the sheet lives inside ProvisionsApp, which needs Clerk + Supabase):
//   - the sheet's own rule is a flex column with overflow hidden;
//   - grab, title and search row hold their height (flex none);
//   - .add-sheet-body is the only scroller (flex 1, min-height 0, overflow-y auto) and holds
//     the results and the hint, after the search row (the head; AddSheetPanel since 2026-11-05);
//   - the same rules, applied in jsdom, compute to those values.
const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "App.js"), "utf8");
const PANEL = fs.readFileSync(path.join(__dirname, "components", "AddSheetPanel.js"), "utf8");

// The one declaration block for `selector {`, at the start of a line (no media-query copies).
function rule(selector) {
  const re = new RegExp(`^\\s*${selector.replace(/[.-]/g, (c) => `\\${c}`)} \\{([^}]*)\\}`, "m");
  const m = SRC.match(re);
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1];
}

// The sheet's JSX, from its scrim to the next sibling surface.
function sheetJsx() {
  const start = SRC.indexOf('<div className="add-sheet-scrim"');
  const end = SRC.indexOf("{showProfileSheet && (", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe("Add sheet clips its contents", () => {
  test("the sheet is a flex column with overflow hidden", () => {
    const sheet = rule(".add-sheet");
    expect(sheet).toMatch(/display: flex;/);
    expect(sheet).toMatch(/flex-direction: column;/);
    expect(sheet).toMatch(/overflow: hidden;/);
  });

  test("grab, title and search row never shrink", () => {
    for (const sel of [".add-sheet-head", ".add-sheet-grab", ".add-sheet-title", ".add-sheet-search"]) {
      expect(rule(sel)).toMatch(/flex: none;/);
    }
  });

  test("the body is the scroll container", () => {
    const body = rule(".add-sheet-body");
    expect(body).toMatch(/flex: 1 1 auto;/);
    expect(body).toMatch(/min-height: 0;/);
    expect(body).toMatch(/overflow-y: auto;/);
    expect(body).toMatch(/-webkit-overflow-scrolling: touch;/);
    // Results no longer scroll on their own: one scroller, not two nested.
    expect(SRC).not.toMatch(/^\s*\.add-sheet-results \{/m);
  });

  test("results and hint sit inside the body, after the search row", () => {
    // The panel renders head, then body; the call site passes the search row as `head` and
    // the results + hint as children (the body).
    expect(PANEL.indexOf('className="add-sheet-body"')).toBeGreaterThan(PANEL.indexOf('className="add-sheet-head"'));
    expect(PANEL).toMatch(/className="add-sheet-body"[^>]*>\s*\{children\}/);
    const jsx = sheetJsx();
    const head = jsx.indexOf("head={");
    const search = jsx.indexOf('className="add-sheet-search"');
    const body = jsx.indexOf("\n          >\n", search);   // the panel's opening tag closes: children follow
    expect(head).toBeGreaterThan(-1);
    expect(search).toBeGreaterThan(head);
    expect(body).toBeGreaterThan(search);
    const inBody = jsx.slice(body);
    expect(inBody).toContain('className="add-sheet-results"');
    expect(inBody).toContain("<SearchResultsList");
    expect(inBody).toContain('className="add-sheet-hint"');
    expect(inBody).not.toContain("<CatalogSearchBox");
    // Exactly one search field in the sheet: no clone behind the hint.
    expect(jsx.match(/<CatalogSearchBox/g)).toHaveLength(1);
  });

  test("applied in the DOM, the rules compute to clip + one scroller", () => {
    const style = document.createElement("style");
    style.textContent = [".add-sheet", ".add-sheet-search", ".add-sheet-body"]
      .map((sel) => `${sel} {${rule(sel)}}`).join("\n");
    document.head.appendChild(style);
    document.body.innerHTML = `
      <div class="add-sheet">
        <div class="add-sheet-search"></div>
        <div class="add-sheet-body"><div class="add-sheet-results"></div><div class="add-sheet-hint"></div></div>
      </div>`;
    const sheet = getComputedStyle(document.querySelector(".add-sheet"));
    const body = getComputedStyle(document.querySelector(".add-sheet-body"));
    expect(sheet.overflow).toBe("hidden");
    expect(sheet.flexDirection).toBe("column");
    expect(body.overflowY).toBe("auto");
    expect(parseFloat(body.minHeight)).toBe(0);   // jsdom reports "0", a browser "0px"
    expect(getComputedStyle(document.querySelector(".add-sheet-results")).overflowY).not.toBe("auto");
    style.remove();
  });
});

describe("nothing behind the open sheet scrolls (2026-11-05)", () => {
  test("the scrim takes no touches: touch-action none, overscroll contained; a tap still closes", () => {
    const scrim = rule(".add-sheet-scrim");
    expect(scrim).toMatch(/touch-action: none;/);
    expect(scrim).toMatch(/overscroll-behavior: contain;/);
    expect(sheetJsx()).toMatch(/<div className="add-sheet-scrim" onClick=\{closeAddSheet\}>/);
  });

  test("the sheet locks the real scroller: .phone-scroll by ref, handed down to ProvisionsApp", () => {
    expect(SRC).toContain('<div className="phone-scroll" ref={phoneScrollRef}>');
    expect(SRC).toContain("<ProvisionsApp scrollRootRef={phoneScrollRef} />");
    expect(SRC).toContain("useScrollLock(addSheetOpen, scrollRootRef);");
    // The old body-only lock for the sheet is gone (the splash keeps its own).
    expect(SRC).not.toMatch(/if \(!addSheetOpen\) return undefined;\s*const prev = document\.body\.style\.overflow/);
  });
});
