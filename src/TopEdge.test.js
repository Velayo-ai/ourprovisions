// Run: CI=true npx react-scripts test --watchAll=false src/TopEdge
//
// The top edge is ONE colour (2026-11-12): the header's dark runs up behind the status bar in the
// installed app. Four places carry it — a CSS variable can only reach two of them — so this holds
// all four together, on the source (the header lives inside ProvisionsApp: Clerk + Supabase).
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

  test("the band behind the status bar is that token — not cream", () => {
    const band = APP.match(/^\.safe-top \{([^}]*)\}/m)[1];
    expect(band).toMatch(/background: var\(--op-header-dark\);/);
    expect(band).not.toMatch(/#FAF4EC/i);
    // still above the viewport and still sized by the measured inset: no layout change
    expect(band).toMatch(/top: calc\(-1 \* var\(--op-inset-top\)\);/);
    expect(band).toMatch(/height: var\(--op-inset-top\);/);
  });

  test("the band is above the Home banner photo, never behind it: it takes no part in the photo treatment", () => {
    expect(APP).toMatch(/<div className="safe-top" aria-hidden="true" \/>/);
    expect(APP).not.toMatch(/className="safe-top"[^>]*style=/);
  });

  test("theme-color (meta and manifest) is the same dark; the splash background is the app cream", () => {
    expect(meta("theme-color").toLowerCase()).toBe(token.toLowerCase());
    expect(MANIFEST.theme_color.toLowerCase()).toBe(token.toLowerCase());
    expect(MANIFEST.background_color).toBe("#FAF4EC");
  });

  test('status-bar style is "black": white clock, page still below the bar', () => {
    expect(meta("apple-mobile-web-app-status-bar-style")).toBe("black");
    expect(meta("viewport")).toMatch(/viewport-fit=cover/);
  });

  test("the probe renders only through probeEnabled (installed app, dev host)", () => {
    expect(APP).toMatch(/if \(!probeEnabled\(\{ hostname: window\.location\.hostname, standalone: window\.navigator\.standalone \}\)\) return undefined;/);
  });
});
