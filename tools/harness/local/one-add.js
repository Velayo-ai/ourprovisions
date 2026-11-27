// One add (SPEC_results_feeder_standard, the exp/one-add experiment) — the harness half of its Verify list.
// Against a FLAG-ON build: a local one (REACT_APP_FEATURE_ONE_ADD=on CI=true npx react-scripts build →
// node local/serve.js → node -r ./local/use-local.js signin.js → this) or the branch preview
// (OP_BASE_URL=<alias> node signin.js → OP_BASE_URL=<alias> node local/one-add.js remote).
// Signed in as the dev test account (dev DB). It adds through the app's own controls and takes its adds
// back off at the end (the item names it touched are printed; local/unlist.js if a run dies midway).
const lib = require("../lib.js");
const { restFor } = require("./rest.js");
const REMOTE = process.argv[2] === "remote";
const HOUSE = process.env.OP_HOUSE || "Cody Test House";
// --clean A,B: also take these names off at the end (a run that died midway).
const CLEAN = (process.argv.find((a) => a.startsWith("--clean=")) || "--clean=").slice(8).split(",").filter(Boolean);
const BASE = REMOTE ? lib.DEV_URL : require("./use-local.js").LOCAL_URL;
const { sleep, log, connect, firstPage, shot } = lib;

let checks = 0, fails = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) fails++; log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

(async () => {
  const b = await connect(); const p = await firstPage(b);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const txt = (sel) => p.evaluate((s) => (document.querySelector(s)?.innerText || "").replace(/\s+/g, " ").trim(), sel);
  const clickText = (sel, re) => p.evaluate((s, src) => { const r = new RegExp(src); const el = [...document.querySelectorAll(s)].find((e) => r.test(e.innerText.replace(/\s+/g, " ").trim())); if (el) el.click(); return !!el; }, sel, re.source);
  const pickerOpen = () => p.evaluate(() => !!document.querySelector(".item-picker.open"));
  const visible = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const cs = getComputedStyle(e); return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0"; }, sel);
  const touched = new Set();

  // ── Step 0 reads: the build, the doors ──
  await p.goto(BASE + "#/home", { waitUntil: "networkidle2" }); await p.reload({ waitUntil: "networkidle2" }); await sleep(3500);
  check("the build's marker reads op-one-add:on", (await p.evaluate(() => document.querySelector(".app-root")?.getAttribute("data-op-one-add"))) === "op-one-add:on");
  const doors = await p.evaluate(() => [...document.querySelectorAll(".helm .helm-label")].map((e) => e.innerText.trim()));
  check("V2 the Helm is HOME · PLAN · LIST (no BROWSE)", JSON.stringify(doors.map((d) => d.toUpperCase())) === JSON.stringify(["HOME", "PLAN", "LIST"]), JSON.stringify(doors));

  // ── V2 #/browse lands on List, picker closed ──
  await p.goto(BASE + "#/browse", { waitUntil: "networkidle2" }); await p.reload({ waitUntil: "networkidle2" }); await sleep(3500);
  const at = await p.evaluate(() => ({ hash: location.hash, list: !!document.querySelector(".list-header, .list-guide"), browse: !!document.querySelector(".cat-rail-wrap") }));
  check("V2 #/browse lands on List (hash #/shop), no Browse screen", at.hash === "#/shop" && at.list && !at.browse, JSON.stringify(at));
  check("V2 … with the picker closed", !(await pickerOpen()));

  // ── R1 Our list: status line, or the two entry cards when empty ──
  const empty = await p.evaluate(() => !!document.querySelector(".list-guide"));
  if (empty) {
    const rows = await p.evaluate(() => [...document.querySelectorAll(".list-guide-label")].map((e) => e.innerText.trim()));
    check("R1 empty List: Add items, Plan a meal (no Browse our staples)", JSON.stringify(rows) === JSON.stringify(["Add items", "Plan a meal"]), JSON.stringify(rows));
  } else {
    const st = await txt(".list-status");
    check("R1 Our list has its status line", /^\d+ (items?|to get) · \d+ /.test(st) || /in the cart$/.test(st), st);
  }

  // ── V4 Plan: This Week only; + Add opens the Meals feeder; Done comes back ──
  await p.evaluate(() => [...document.querySelectorAll(".helm .helm-door")].find((e) => /plan/i.test(e.innerText))?.click()); await sleep(1500);
  const plan = await p.evaluate(() => ({ title: document.querySelector(".plan-ctl .plan-view")?.innerText.trim(), meals: [...document.querySelectorAll(".plan-ctl .plan-view")].some((e) => /^Meals$/.test(e.innerText.trim())) }));
  check("R1 Plan's title is This Week, no Meals switch", plan.title === "This Week" && !plan.meals, JSON.stringify(plan));
  const opened = await p.evaluate(() => { const b = document.querySelector('.plan-ctl .hdr-action[aria-label="Add a meal to this week"]') || [...document.querySelectorAll(".plan-welcome button, .plan-ctl button")].find((e) => /Add/.test(e.innerText)); if (b) b.click(); return !!b; });
  await sleep(1200);
  const feederMeals = await p.evaluate(() => ({ title: document.querySelector(".plan-ctl .plan-view")?.innerText.trim(), done: !!document.querySelector(".plan-ctl .hdr-done"), search: document.querySelector(".lib-search input")?.placeholder || null }));
  check("V4 + Add opens the Meals feeder: \"Add to this week\" + Done", opened && feederMeals.title === "Add to this week" && feederMeals.done, JSON.stringify(feederMeals));
  await shot(p, "one-add-meals-feeder");
  await p.click(".plan-ctl .hdr-done"); await sleep(800);
  check("V4 Done returns to This Week", (await txt(".plan-ctl .plan-view")) === "This Week");

  // ── V3 List → + Add → the feeder ──
  await p.evaluate(() => [...document.querySelectorAll(".helm .helm-door")].find((e) => /list/i.test(e.innerText))?.click()); await sleep(1500);
  const opener = (await p.$('.list-header .hdr-action')) ? ".list-header .hdr-action" : ".list-guide-row.teal";
  await p.click(opener); await sleep(900);
  check("V3 + Add opens the feeder", await pickerOpen());
  const focus = await p.evaluate(() => document.activeElement?.name || null);
  check("V3 the field has the focus on the first tap (keyboard up)", focus === "list-pick-search", String(focus));
  const head = await p.evaluate(() => ({ title: document.querySelector(".item-picker .item-search-title")?.innerText.trim(), ph: document.querySelector('.item-picker input[name="list-pick-search"]')?.placeholder, aisles: [...document.querySelectorAll(".item-picker .pick-aisle-name")].map((e) => e.innerText.trim()).slice(0, 4), newItem: !!document.querySelector(".item-picker .pick-aisle-new"), tool: !!document.querySelector(".item-picker .pick-tool") }));
  check("R2 title \"Add to our list\", \"Search our provisions…\"", head.title === "Add to our list" && head.ph === "Search our provisions…", JSON.stringify(head));
  check("R2 aisle sections, each with + New item; the layout toggle", head.aisles.length > 0 && head.newItem && head.tool, JSON.stringify(head.aisles));
  await shot(p, "one-add-feeder-list");

  // grid / list toggle
  await p.click(".item-picker .pick-tool"); await sleep(400);
  check("R2 the toggle shows the grid", await p.evaluate(() => !!document.querySelector(".item-picker .pick-grid")));
  await shot(p, "one-add-feeder-grid");
  await p.click(".item-picker .pick-tool"); await sleep(400);
  check("R2 … and back to the list", await p.evaluate(() => !document.querySelector(".item-picker .pick-grid")));

  // tap adds, ✓ shows
  const name = await p.evaluate(() => { const r = [...document.querySelectorAll(".item-picker .pick-row:not(.on):not(.pick-create)")][0]; if (!r) return null; const n = r.querySelector(".pick-name")?.innerText.trim(); r.click(); return n; });
  if (name) touched.add(name);
  await sleep(1500);
  const row = await p.evaluate((n) => { const r = [...document.querySelectorAll(".item-picker .pick-row")].find((e) => e.querySelector(".pick-name")?.innerText.trim() === n); return r ? { on: r.classList.contains("on"), sub: r.querySelector(".pick-sub")?.innerText.trim() || "" } : null; }, name);
  check("V3 a tap adds and the row shows ✓", !!row && row.on, JSON.stringify({ name, row }));

  // + New item: the feeder steps aside for the sheet, and comes back when it closes
  await p.click(".item-picker .pick-aisle-new"); await sleep(700);
  const aside = await p.evaluate(() => ({ suspended: !!document.querySelector(".item-picker.open.suspended"), sheet: !!document.querySelector(".modal-overlay") }));
  check("R2 + New item: the New item sheet shows, the feeder steps aside", aside.suspended && aside.sheet, JSON.stringify(aside));
  await p.evaluate(() => document.querySelector(".modal-overlay")?.click()); await sleep(600);
  check("R2 … and the feeder is back when it closes", (await pickerOpen()) && (await visible(".item-picker")) && !(await p.evaluate(() => !!document.querySelector(".item-picker.suspended"))));

  // Done → "N added"
  await p.click(".item-picker .item-search-done"); await sleep(700);
  const toast = await p.evaluate(() => (document.body.innerText.match(/(?:^|\n)\s*(\d+ added)\s*(?:\n|$)/) || [])[1] || null);
  check("V3 Done → \"N added\"", !name || toast === "1 added", String(toast));

  // ── cleanup: the walk's adds come back off (read back) ──
  const left = await restFor(p).unlist(HOUSE, [...touched, ...CLEAN]);
  check("cleanup: the walk's adds are off the list again (read back)", left.length === 0, JSON.stringify(left));
  log(`touched: ${JSON.stringify([...touched])}`);
  log(`DONE ${checks - fails}/${checks} passed`);
  await b.disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log("ERROR", e.message.split("\n")[0]); process.exit(1); });
