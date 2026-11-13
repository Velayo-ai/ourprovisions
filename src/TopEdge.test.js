// Run: CI=true npx react-scripts test --watchAll=false src/TopEdge
//
// The top edge of the installed app (settled 2026-11-12). iOS 27 draws its own blur over the top of a
// home-screen web app. Five dev trials (black-translucent, black, no tag, a colour-extension strip, a
// new install identity) could not close it, so the web app keeps PROD's chrome untouched and does one
// thing: the header's first row of content sits 12px lower, clear of the blur. The proper fix is the
// native (Expo) build, which paints behind the status bar.
// Held on the source (the header lives inside ProvisionsApp: Clerk + Supabase).
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "App.js"), "utf8");
const HTML = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", "manifest.json"), "utf8"));
const meta = (name) => (HTML.match(new RegExp(`<meta name="${name}" content="([^"]*)"`)) || [])[1];

describe("the top edge", () => {
  test("the standalone chrome is prod's: status-bar style, theme colours, viewport, start_url — no experiment left behind", () => {
    expect(meta("apple-mobile-web-app-status-bar-style")).toBe("default");
    expect(meta("theme-color")).toBe("#000000");
    expect(meta("viewport")).toMatch(/viewport-fit=cover/);
    expect(MANIFEST.theme_color).toBe("#FAF4EC");
    expect(MANIFEST.background_color).toBe("#ffffff");
    expect(MANIFEST.display).toBe("standalone");
    expect(MANIFEST.start_url).toBe(".");
    expect(MANIFEST.id).toBeUndefined();
    expect(HTML).not.toMatch(/ios-status-strip|op-status-strip|body::before|<style>/);
    expect(APP).not.toMatch(/--op-under-bar|InsetProbe|inset-probe/);
    expect(fs.existsSync(path.join(__dirname, "lib", "insetProbe.js"))).toBe(false);
  });

  test("the band above the viewport is the page cream (a black clock), sized by the measured inset", () => {
    const band = APP.match(/^\.safe-top \{([^}]*)\}/m)[1];
    expect(band).toMatch(/background: #FAF4EC;/);
    expect(band).toMatch(/top: calc\(-1 \* var\(--op-inset-top\)\);/);
  });

  test("the header's top row is its own dark", () => {
    expect(APP).toMatch(/:root \{ --op-header-dark: #1a0e06; \}/);
    expect(APP).toMatch(/background: bannerHasPhoto \? "transparent" : "var\(--op-header-dark\)"/);
  });

  test("the header's content row sits 12px lower in the installed app — inside the row, so nothing is added above the header", () => {
    expect(APP).toMatch(/:root \{ --op-header-nudge: 0px; \}/);
    expect(APP).toMatch(/@media \(display-mode: standalone\) \{ :root \{ --op-header-nudge: 12px; \} \}/);
    expect(APP).toMatch(/padding: "calc\(10px \+ var\(--op-header-nudge\)\) 16px 10px", minHeight: "calc\(44px \+ var\(--op-header-nudge\)\)"/);
  });

  test("safety net: if the page ever runs behind the status bar, the header pads by the inset (0 when the page starts below the bar)", () => {
    expect(APP).toMatch(/^\s*\.header \{ background: #2C1A0E; color: #FAF4EC; position: relative; \}/m);
    expect(APP).toMatch(/@media \(display-mode: standalone\) \{ \.header \{ padding-top: env\(safe-area-inset-top, 0px\); \} \}/);
  });

  test("it is the one header every tab shares, and the Home banner photo spans it (so the banner moves with it)", () => {
    expect(APP.match(/<div className="header"/g)).toHaveLength(1);
    expect(APP).toMatch(/position: "absolute", inset: 0, zIndex: 0,\s*backgroundColor: "#2C1A0E",/);
  });
});
