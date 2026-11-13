// Run: CI=true npx react-scripts test --watchAll=false src/TopEdge
//
// The top edge is ONE colour (2026-11-12): the header's dark runs up behind the status bar in the
// installed app. Four places carry it — a CSS variable can only reach one of them — so this holds
// them together, with the rules that keep content out from under the bar, on the source (the header lives inside ProvisionsApp: Clerk + Supabase).
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "App.js"), "utf8");
const HTML = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", "manifest.json"), "utf8"));
const meta = (name) => (HTML.match(new RegExp(`<meta name="${name}" content="([^"]*)"`)) || [])[1];

describe("the top edge: the header's dark behind the status bar", () => {
  const token = (APP.match(/:root \{ --op-header-dark: (#[0-9a-fA-F]{6}); \}/) || [])[1];

  test("one token, and it is the header's top-row colour", () => {
    expect(token).toBe("#1a0e06");
    expect(APP).toMatch(/background: bannerHasPhoto \? "transparent" : "var\(--op-header-dark\)"/);
  });

  test("the status bar's strip is a REAL fixed element in index.html, the same dark: installed app only, sized by the real inset, above everything", () => {
    expect(HTML).toMatch(/<div id="op-status-strip" aria-hidden="true"><\/div>\s*<div id="root">/);
    expect(HTML).toMatch(/#op-status-strip \{ display: none; \}/);
    const m = HTML.match(/@media \(display-mode: standalone\) \{[\s\S]*?#op-status-strip \{([^}]*)\}/);
    expect(m).not.toBeNull();
    const strip = m[1].replace(/\s+/g, " ");
    expect(strip).toMatch(/position: fixed; top: 0; left: 0; right: 0; height: env\(safe-area-inset-top, 0px\);/);
    expect(strip.toLowerCase()).toContain(`background-color: ${token.toLowerCase()};`);
    expect(strip).toMatch(/z-index: 5000;/);
    expect(strip).not.toMatch(/pointer-events/);
    expect(HTML).not.toMatch(/body::before/);
  });

  test("the canvas behind the bar is the dark too: html, and body with its cream starting below the bar", () => {
    expect(HTML.toLowerCase()).toContain(`html { background-color: ${token.toLowerCase()}; }`);
    expect(HTML).toMatch(/html body \{ background: linear-gradient\(#FAF4EC, #FAF4EC\) 0 env\(safe-area-inset-top, 0px\) \/ 100% 100% no-repeat #1a0e06; \}/);
  });

  test("Home: the strip meets the photo with a soft edge, 0 tall where the page is not under the bar", () => {
    expect(APP).toMatch(/className="banner-top-soft"[^>]*top: "var\(--op-under-bar, 0px\)", height: "min\(24px, var\(--op-under-bar, 0px\)\)"/);
  });

  test("--op-under-bar is the real inset in an installed app and 0 everywhere else", () => {
    expect(APP).toMatch(/:root \{ --op-under-bar: 0px; \}/);
    expect(APP).toMatch(/@media \(display-mode: standalone\) \{\s*:root \{ --op-inset-bottom: env\(safe-area-inset-bottom, 0px\); --op-under-bar: env\(safe-area-inset-top, 0px\); \}/);
  });

  test("the header's box runs up behind the bar; its content starts below it", () => {
    expect(APP).toMatch(/^\s*\.header \{ background: #2C1A0E; color: #FAF4EC; position: relative; padding-top: var\(--op-under-bar\); \}/m);
  });

  test("the content row keeps its 12px nudge on top of the bar's inset, so the text stays where the nudge-only build put it", () => {
    expect(APP).toMatch(/:root \{ --op-header-nudge: 0px; \}/);
    expect(APP).toMatch(/@media \(display-mode: standalone\) \{ :root \{ --op-header-nudge: 12px; \} \}/);
    expect(APP).toMatch(/padding: "calc\(10px \+ var\(--op-header-nudge\)\) 16px 10px", minHeight: "calc\(44px \+ var\(--op-header-nudge\)\)"/);
    expect(MANIFEST.display).toBe("standalone");
  });

  test("the Home banner photo and its dissolve start below the bar — the strip sits above the photo, not behind it", () => {
    expect(APP.match(/position: "absolute", inset: 0, top: "var\(--op-under-bar, 0px\)", zIndex: 0/g)).toHaveLength(2);
  });

  test("nothing top-anchored hides under the clock: sticky search, the top toast, every full-height sheet, modal and viewer", () => {
    expect(APP).toMatch(/position: "sticky",\s*top: "var\(--op-under-bar, 0px\)",/);
    expect(APP).toMatch(/body:has\(\.modal-overlay\) \.bottom-stack \{ bottom: auto; top: calc\(10px \+ var\(--op-under-bar\)\); \}/);
    expect(APP).toMatch(/\.lib-type-scrim, \.rv-scrim, \.rv-psheet-scrim, \.add-sheet-scrim \{ padding-top: var\(--op-under-bar\); \}/);
    expect(APP).toMatch(/body \.rv-viewer \{ padding-top: var\(--op-under-bar\); \}/);
    expect(APP).toMatch(/body \.modal-overlay \{ padding-top: calc\(20px \+ var\(--op-under-bar\)\); \}/);
    // the four inline bottom-sheet scrims, and the two 94vh sheets capped to the scrim's box
    expect(APP.match(/paddingTop: "var\(--op-under-bar, 0px\)"/g)).toHaveLength(4);
    expect(APP.match(/maxHeight: "min\(94vh, 100%\)"/g)).toHaveLength(2);
    expect(APP).not.toMatch(/maxHeight: "94vh"/);
    const PANEL = fs.readFileSync(path.join(__dirname, "components", "SheetPanel.js"), "utf8");
    expect(PANEL).toMatch(/maxHeight: "calc\(100dvh - 24px - var\(--op-under-bar, 0px\)\)",/);
    const ASK = fs.readFileSync(path.join(__dirname, "components", "AskRun.js"), "utf8");
    expect(ASK).toMatch(/\.ask-run \{[^}]*padding: env\(safe-area-inset-top\)/);
  });

  test("the legacy band (old-icon installs) is the header's dark too, above the viewport, sized by the measured inset", () => {
    const band = APP.match(/^\.safe-top \{([^}]*)\}/m)[1];
    expect(band).toMatch(/background: var\(--op-header-dark\);/);
    expect(band).toMatch(/top: calc\(-1 \* var\(--op-inset-top\)\);/);
    expect(band).toMatch(/height: var\(--op-inset-top\);/);
    expect(APP).toMatch(/<div className="safe-top" aria-hidden="true" \/>/);
  });

  test("theme-color (meta and manifest) is the same dark; the splash background is the app cream", () => {
    expect(meta("theme-color").toLowerCase()).toBe(token.toLowerCase());
    expect(MANIFEST.theme_color.toLowerCase()).toBe(token.toLowerCase());
    expect(MANIFEST.background_color).toBe("#FAF4EC");
  });

  test('status-bar style is "black-translucent": white clock, the page under the bar', () => {
    expect(meta("apple-mobile-web-app-status-bar-style")).toBe("black-translucent");
    expect(meta("viewport")).toMatch(/viewport-fit=cover/);
  });

  test("the probe renders only through probeEnabled (installed app, dev host)", () => {
    expect(APP).toMatch(/if \(!probeEnabled\(\{ hostname: window\.location\.hostname, standalone: window\.navigator\.standalone \}\)\) return undefined;/);
  });
});
