// Run: CI=true npx react-scripts test --watchAll=false src/TopEdge
//
// The top edge of the installed app (2026-11-12). iOS 26/27 draws its own blur over the top of a
// home-screen web app and owns the status-bar strip (the page starts BELOW it; iOS 27 ignores
// "black-translucent"), so the app does two things only: its theme colour is the header's dark, and
// the header's first row of content sits 12px lower inside the dark header, clear of the blur.
// Held on the source (the header lives inside ProvisionsApp: Clerk + Supabase).
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "App.js"), "utf8");
const HTML = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", "manifest.json"), "utf8"));
const meta = (name) => (HTML.match(new RegExp(`<meta name="${name}" content="([^"]*)"`)) || [])[1];

describe("the top edge", () => {
  const token = (APP.match(/:root \{ --op-header-dark: (#[0-9a-fA-F]{6}); \}/) || [])[1];

  test("one dark: the header's top row, theme-color and the manifest's theme_color; the splash background is the app cream", () => {
    expect(token).toBe("#1a0e06");
    expect(APP).toMatch(/background: bannerHasPhoto \? "transparent" : "var\(--op-header-dark\)"/);
    expect(meta("theme-color").toLowerCase()).toBe(token.toLowerCase());
    expect(MANIFEST.theme_color.toLowerCase()).toBe(token.toLowerCase());
    expect(MANIFEST.background_color).toBe("#FAF4EC");
  });

  test("the header's content row sits 12px lower in the installed app — inside the row, so nothing is added above the header", () => {
    expect(APP).toMatch(/:root \{ --op-header-nudge: 0px; \}/);
    expect(APP).toMatch(/@media \(display-mode: standalone\) \{ :root \{ --op-header-nudge: 12px; \} \}/);
    // the row's OWN top padding and min-height grow; its background (the header's dark, or the Home photo) covers the extra
    expect(APP).toMatch(/padding: "calc\(10px \+ var\(--op-header-nudge\)\) 16px 10px", minHeight: "calc\(44px \+ var\(--op-header-nudge\)\)"/);
    // the header itself gets no padding or margin: no space above it
    expect(APP).toMatch(/^\s*\.header \{ background: #2C1A0E; color: #FAF4EC; position: relative; \}/m);
  });

  test("it is the one header every tab shares, and the Home banner photo spans it (so the banner moves with it)", () => {
    expect(APP.match(/<div className="header"/g)).toHaveLength(1);
    expect(APP).toMatch(/position: "absolute", inset: 0, zIndex: 0,\s*backgroundColor: "#2C1A0E",/);
  });

  test('the trials are undone: status-bar style "default", the cream band above the viewport, no under-bar machinery, no probe', () => {
    expect(meta("apple-mobile-web-app-status-bar-style")).toBe("default");
    expect(HTML).not.toMatch(/body::before/);
    const band = APP.match(/^\.safe-top \{([^}]*)\}/m)[1];
    expect(band).toMatch(/background: #FAF4EC;/);
    expect(band).toMatch(/top: calc\(-1 \* var\(--op-inset-top\)\);/);
    expect(APP).not.toMatch(/--op-under-bar|InsetProbe|inset-probe/);
    expect(fs.existsSync(path.join(__dirname, "lib", "insetProbe.js"))).toBe(false);
  });
});
