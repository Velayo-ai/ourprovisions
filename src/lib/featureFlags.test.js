// Run: CI=true npx react-scripts test --watchAll=false src/lib/featureFlags
//
// Ask behind REACT_APP_FEATURE_ASK (2026-11-12): on for dev / preview, off in production, where
// 077 / 078 / 083 / 084 are not applied. Held two ways: the parser (only "on" is on), and the
// source — every Ask read, write and door is behind ASK_ENABLED, so a flag-off build makes no
// request to an Ask table or RPC and shows no Ask UI.
const fs = require("fs");
const path = require("path");
const { askFlagOn } = require("./featureFlags");

const SRC = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(SRC, "App.js"), "utf8");
const HOOK = fs.readFileSync(path.join(SRC, "hooks", "useProvisions.js"), "utf8");

describe("askFlagOn", () => {
  test('only the exact string "on" turns Ask on', () => {
    expect(askFlagOn("on")).toBe(true);
    for (const v of [undefined, null, "", "off", "true", "1", "ON", " on", "on "]) expect(askFlagOn(v)).toBe(false);
  });
});

describe("with the flag off nothing reaches the Ask schema", () => {
  const GATE = "if (!ASK_ENABLED) return";
  test.each([
    ["landAskPicks", "const landAskPicks = useCallback(async (askId, catalogItemIds) => {"],
    ["fetchAsks", "const fetchAsks = useCallback(async () => {"],
    ["createAsk", "const createAsk = useCallback(async (askId, draft) => {"],
    ["updateAsk", "const updateAsk = useCallback(async (askId, draft) => {"],
    ["deleteAsk", "const deleteAsk = useCallback(async (askId) => {"],
    ["fetchItemPhotos", "const fetchItemPhotos = useCallback(async () => {"],
    ["setItemPhoto", "const setItemPhoto = useCallback(async (catalogItemId, file) => {"],
  ])("%s returns before its first request", (name, sig) => {
    const at = HOOK.indexOf(sig);
    expect(at).toBeGreaterThan(0);
    const firstLine = HOOK.slice(at + sig.length).trimStart().split("\n")[0];
    expect(firstLine.startsWith(GATE)).toBe(true);
  });

  test("every Ask table, RPC and the item-photos bucket is touched only inside those functions", () => {
    const gatedBodies = ["landAskPicks", "fetchAsks", "createAsk", "updateAsk", "deleteAsk", "fetchItemPhotos", "setItemPhoto"];
    const calls = [...HOOK.matchAll(/from\("(asks|ask_shelf_items|household_item_photos|item-photos)"\)|rpc\("(create_ask|update_ask|land_ask_picks|set_household_item_photo|remove_household_item_photo)"/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      // the nearest useCallback that opens before the call is the function the call sits in
      const owners = [...HOOK.slice(0, c.index).matchAll(/const (\w+) = useCallback\(/g)];
      expect(gatedBodies).toContain(owners[owners.length - 1][1]);
    }
    expect(APP).not.toMatch(/from\("(asks|ask_shelf_items|household_item_photos)"\)|rpc\("(create_ask|update_ask|land_ask_picks|set_household_item_photo)"/);
  });
});

describe("with the flag off the UI has no Ask door", () => {
  test("no + New shelf (the rail's only way to make an Ask), so no Ask pills either", () => {
    expect(APP).toMatch(/askRailLayout\([^;]*, ASK_ENABLED && !!\(isSignedIn && household\?\.id\)\)/);
  });
  test("the run screen, the sheets and the delete confirm cannot mount", () => {
    expect(APP).toMatch(/const runAsk = ASK_ENABLED && runAskId \?/);
    for (const g of ["{ASK_ENABLED && moreAsksOpen && (", "{ASK_ENABLED && newShelfOpen && (", "{ASK_ENABLED && editAsk && (", "{ASK_ENABLED && deleteAskId && (() =>"]) expect(APP).toContain(g);
  });
  test("a held handover never resumes a run", () => {
    expect(APP).toContain("if (!ASK_ENABLED || !heldAskRef.current || !asksLoaded || !catalogLoaded || !landingDecided) return;");
  });
  test('Manage has no Asks section, and its title and button say "Manage categories"', () => {
    expect(APP).toContain('{ASK_ENABLED && isSignedIn && household?.id && (\n              <div className="modal-field" style={{ marginTop: "18px" }}>\n                <span className="modal-label" id="manage-asks">Asks</span>'.replace(/\n/g, APP.includes("\r\n") ? "\r\n" : "\n"));
    expect(APP.match(/ASK_ENABLED \? "Manage categories & asks" : "Manage categories"/g)).toHaveLength(2);   // the heading and the button
    expect(APP).toContain('aria-label={ASK_ENABLED ? "Manage categories and asks" : "Manage categories"}');
    expect(APP).not.toMatch(/>Manage categories &amp; asks</);
  });
  test("the build carries its flag as a marker on the app root", () => {
    expect(APP).toContain('<div className="app-root" data-op-ask={ASK_FLAG_MARKER}');
  });
});
