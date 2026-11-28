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

  // the ONE sheet's shape (R4), read off whatever dialog is open: title, section order, footer
  const sheetShape = () => p.evaluate(() => {
    const d = document.querySelector('[role=dialog][aria-label="View and filter"]');
    if (!d) return null;
    const lbls = [...d.querySelectorAll(".lib-sheet-lbl")].map((e) => e.textContent.trim()).filter((t) => ["View", "Filter", "Manage"].includes(t));
    const btns = [...d.querySelectorAll(".lib-sheet-btns button")].map((e) => e.innerText.trim());
    return { h2: d.querySelector("h2")?.innerText.trim(), lbls, btns };
  });
  const shapeOk = (sh, noun) => !!sh && sh.h2 === "View & filter" && JSON.stringify(sh.lbls) === JSON.stringify(["View", "Filter", "Manage"]) && sh.btns[0] === "Clear" && new RegExp("^Show [0-9]+ " + noun + "s?$").test(sh.btns[1] || "");

  // ── Step 0 reads: the build, the doors ──
  await p.goto(BASE + "#/home", { waitUntil: "networkidle2" }); await p.reload({ waitUntil: "networkidle2" }); await sleep(3500);
  check("the build's marker reads op-one-add:on", (await p.evaluate(() => document.querySelector(".app-root")?.getAttribute("data-op-one-add"))) === "op-one-add:on");
  const doors = await p.evaluate(() => [...document.querySelectorAll(".helm .helm-label")].map((e) => e.innerText.trim()));
  check("V2 the Helm is HOME · PLAN · LIST (no BROWSE)", JSON.stringify(doors.map((d) => d.toUpperCase())) === JSON.stringify(["HOME", "PLAN", "LIST"]), JSON.stringify(doors));

  // ── V2 #/browse lands on List, picker closed ──
  await p.goto(BASE + "#/browse", { waitUntil: "networkidle2" }); await p.reload({ waitUntil: "networkidle2" }); await sleep(3500);
  const at = await p.evaluate(() => ({ hash: location.hash, list: !!document.querySelector(".list-header, .list-guide"), browse: !!document.querySelector('button[aria-label="Filters"]') }));
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
  // The Meals feeder is the List feeder's layer: its title bar, Done, and the field (focused on open).
  const feederMeals = await p.evaluate(() => { const v = document.querySelector(".meals-feeder.open"); return v && { title: v.querySelector(".item-search-title")?.textContent.trim(), done: !!v.querySelector(".item-search-done"), search: v.querySelector(".item-search-field input")?.placeholder || null, focused: document.activeElement === v.querySelector(".item-search-field input") }; });
  check("V4 + Add opens the Meals feeder on the List feeder's layer: \"Add to this week\" + Done, the field focused", opened && !!feederMeals && feederMeals.title === "Add to this week" && feederMeals.done && feederMeals.search === "Search our meals…" && feederMeals.focused, JSON.stringify(feederMeals));
  await shot(p, "one-add-meals-feeder");
  // V6 the Meals feeder's View & filter
  if (await p.$('.meals-feeder .pick-tool[aria-label^="View and filter"]')) {
    await p.evaluate(() => document.querySelector('.meals-feeder .pick-tool[aria-label^="View and filter"]')?.click()); await sleep(600);
    const ms = await sheetShape();
    check("V6 Meals: View & filter — View → Filter → Manage → Clear / Show N meals", shapeOk(ms, "meal"), JSON.stringify(ms));
    await p.evaluate(() => document.querySelector(".modal-overlay")?.click()); await sleep(500);
  } else log("SKIP  V6 Meals: this place has no meals, so no tools or sheet (Jest renders the sheet; local/feeder-rail.js fakes meals for the layer)");
  await p.evaluate(() => document.querySelector(".meals-feeder .item-search-done").click()); await sleep(800);
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

  // ── R3 the rail: ★ Staples · one Ask pill | categories ──
  const rail = await p.evaluate(() => [...document.querySelectorAll(".item-picker .feeder-rail .cat-rail > *")].map((e) => e.classList.contains("cat-rail-divider") ? "|" : e.innerText.replace(/\s+/g, " ").trim()));
  const asks = rail.filter((t) => /^Ask/.test(t));
  const div = rail.indexOf("|");
  check("R3 rail order: Staples first, then at most ONE Ask pill, a divider, then the aisles", /Staples$/.test(rail[0]) && asks.length <= 1 && div === 1 + asks.length && rail.length > div + 1, JSON.stringify(rail.slice(0, 5)));
  if (asks[0] === "Ask…") {
    await p.evaluate(() => [...document.querySelectorAll(".item-picker .feeder-rail .people-pill")][0].click()); await sleep(800);
    const ch = await p.evaluate(() => { const d = document.querySelector('[role=dialog][aria-label="More asks"]'); return d ? { h2: d.querySelector("h2")?.innerText.trim(), rows: [...d.querySelectorAll(".more-asks-row")].map((e) => e.innerText.replace(/\s+/g, " ").trim()) } : null; });
    check("R3 2+ asks: \"Ask…\" opens the chooser of every ask with + New ask", !!ch && ch.h2 === "Ask…" && ch.rows.filter((r) => /^Ask /.test(r)).length >= 2 && /New ask$/.test(ch.rows[ch.rows.length - 1]), JSON.stringify(ch));
    check("R3 … the feeder steps aside for it", await p.evaluate(() => !!document.querySelector(".item-picker.open.suspended")));
    await p.evaluate(() => document.querySelector(".modal-overlay")?.click()); await sleep(600);
    check("R3 … and is back when it closes", (await pickerOpen()) && !(await p.evaluate(() => !!document.querySelector(".item-picker.suspended"))));
    // V5: a chooser row starts the run as today (the feeder closes first); Close (held) ends it on List.
    await p.evaluate(() => [...document.querySelectorAll(".item-picker .feeder-rail .people-pill")][0].click()); await sleep(700);
    const label = await p.evaluate(() => { const r = [...document.querySelectorAll(".more-asks-row")].find((e) => /^Ask Test$/.test(e.innerText.replace(/\s+/g, " ").trim())) || [...document.querySelectorAll(".more-asks-row")][0]; r.click(); return r.innerText.replace(/\s+/g, " ").trim(); });
    await sleep(3500);
    const run = await p.evaluate(() => ({ run: !!document.querySelector(".ask-run"), picker: !!document.querySelector(".item-picker.open") }));
    check("V5 a chooser row starts the run (the feeder has closed)", run.run && !run.picker, JSON.stringify({ label, ...run }));
    await shot(p, "one-add-ask-run");
    await p.evaluate(() => document.querySelector(".ask-top .ask-done")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))); await sleep(1400);
    await p.evaluate(() => document.querySelector(".ask-top .ask-done")?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }))); await sleep(1200);
    const back = await p.evaluate(() => ({ run: !!document.querySelector(".ask-run"), hash: location.hash }));
    check("V5 … Close (held) ends it, back on List", !back.run && back.hash === "#/shop", JSON.stringify(back));
    await p.click((await p.$(".list-header .hdr-action")) ? ".list-header .hdr-action" : ".list-guide-row.teal"); await sleep(900);
  } else {
    check(`R3 ${asks.length} ask(s): ${asks.length ? "one pill by name" : "no Ask pill"}`, asks.length === 0 || /^Ask \S/.test(asks[0]), JSON.stringify(asks));
  }
  // Staples narrows to staples (every row ★); a category pill narrows to its aisle
  await p.evaluate(() => document.querySelector(".item-picker .feeder-rail .cat-pill").click()); await sleep(500);
  const st = await p.evaluate(() => ({ rows: document.querySelectorAll(".item-picker .pick-group .pick-row").length, starred: document.querySelectorAll(".item-picker .pick-group .pick-row .pick-star").length }));
  check("R3 ★ Staples shows only staples (each row ★)", st.rows === st.starred, JSON.stringify(st));
  await p.evaluate(() => document.querySelector(".item-picker .feeder-rail .cat-pill").click()); await sleep(400);
  const firstAisle = await p.evaluate(() => { const pills = [...document.querySelectorAll(".item-picker .feeder-rail .cat-rail-divider ~ .cat-pill")]; pills[0].click(); return pills[0].innerText.replace(/\s+/g, " ").trim(); });
  await sleep(500);
  const secs = await p.evaluate(() => [...document.querySelectorAll(".item-picker .pick-aisle-name")].map((e) => e.innerText.trim()));
  check("R3 an aisle pill narrows the feeder to that aisle", secs.length === 1, JSON.stringify({ firstAisle, secs }));
  await p.evaluate(() => [...document.querySelectorAll(".item-picker .feeder-rail .cat-rail-divider ~ .cat-pill")][0].click()); await sleep(400);
  await shot(p, "one-add-feeder-rail");

  // grid / list toggle
  await p.click(".item-picker .pick-tool"); await sleep(400);
  check("R2 the toggle shows the grid", await p.evaluate(() => !!document.querySelector(".item-picker .pick-grid")));
  await shot(p, "one-add-feeder-grid");
  await p.click(".item-picker .pick-tool"); await sleep(400);
  check("R2 … and back to the list", await p.evaluate(() => !document.querySelector(".item-picker .pick-grid")));

  // tap adds, ✓ shows
  const nameOf = (el) => (el.querySelector(".pick-name")?.innerText || "").replace(/^★\s*/, "").trim();
  const rowState = (n) => p.evaluate((n) => {
    const r = [...document.querySelectorAll(".item-picker .pick-group .pick-row")].find((e) => (e.querySelector(".pick-name")?.innerText || "").replace(/^★\s*/, "").trim() === n);
    return r ? { on: r.classList.contains("on"), sub: r.querySelector(".pick-sub")?.innerText.trim() || "", qty: r.querySelector(".pick-qty")?.innerText.trim() || null, plus: !!r.querySelector(".pick-mark:not(.on)"), tick: !!r.querySelector(".pick-mark.on") } : null;
  }, n);
  const tapRow = (n) => p.evaluate((n) => { const r = [...document.querySelectorAll(".item-picker .pick-group .pick-row")].find((e) => (e.querySelector(".pick-name")?.innerText || "").replace(/^★\s*/, "").trim() === n); (r.querySelector(".pick-hit") || r).click(); }, n);
  const stepRow = (n, label) => p.evaluate((n, label) => { const r = [...document.querySelectorAll(".item-picker .pick-group .pick-row")].find((e) => (e.querySelector(".pick-name")?.innerText || "").replace(/^★\s*/, "").trim() === n); r.querySelector(`.pick-step-btn[aria-label="${label}"]`).click(); }, n, label);
  const name = await p.evaluate(`(${nameOf.toString()})([...document.querySelectorAll(".item-picker .pick-group .pick-row:not(.on)")][0])`);
  if (name) touched.add(name);
  await tapRow(name); await sleep(1500);
  const row = await rowState(name);
  check("V3/R5 a tap adds: \"On the list\" under the name and the stepper on the right at 1, no ✓", !!row && row.on && !row.tick && !row.plus && row.sub === "On the list" && row.qty === "1", JSON.stringify({ name, row }));
  await stepRow(name, "One more"); await sleep(1500);
  check("R5 the stepper's + makes it 2", (await rowState(name))?.qty === "2");
  await stepRow(name, "One fewer"); await sleep(1500);
  await stepRow(name, "One fewer"); await sleep(1800);
  const off = await rowState(name);
  check("R5 − at 1 takes it off: the circle + is back, no ✓, no stepper", !!off && !off.on && off.plus && !off.tick && off.qty === null, JSON.stringify(off));
  await tapRow(name); await sleep(1500);
  check("R5 … and a tap adds it again", (await rowState(name))?.on === true);

  // + New item: the feeder steps aside for the sheet, and comes back when it closes
  await p.click(".item-picker .pick-aisle-new"); await sleep(700);
  const aside = await p.evaluate(() => ({ suspended: !!document.querySelector(".item-picker.open.suspended"), sheet: !!document.querySelector(".modal-overlay") }));
  check("R2 + New item: the New item sheet shows, the feeder steps aside", aside.suspended && aside.sheet, JSON.stringify(aside));
  await p.evaluate(() => document.querySelector(".modal-overlay")?.click()); await sleep(600);
  check("R2 … and the feeder is back when it closes", (await pickerOpen()) && (await visible(".item-picker")) && !(await p.evaluate(() => !!document.querySelector(".item-picker.suspended"))));

  // V6 the List feeder's View & filter: the feeder steps aside; Staples narrows the count live; Show brings it back
  await p.click('.item-picker .pick-tool[aria-label="View and filter"]'); await sleep(700);
  const ls = await sheetShape();
  check("V6 List: View & filter — View → Filter → Manage → Clear / Show N items", shapeOk(ls, "item"), JSON.stringify(ls));
  check("V6 … the feeder steps aside for it", await p.evaluate(() => !!document.querySelector(".item-picker.open.suspended")));
  const before = ls ? parseInt(ls.btns[1].replace(/\D+/g, ""), 10) : NaN;
  await p.evaluate(() => [...document.querySelectorAll('[role=dialog][aria-label="View and filter"] .lib-sw')].find((e) => /Staples/.test(e.innerText))?.click()); await sleep(400);
  const narrowed = await sheetShape();
  const after = narrowed ? parseInt(narrowed.btns[1].replace(/\D+/g, ""), 10) : NaN;
  check("V6 … Staples narrows Show N", after > 0 && after <= before, JSON.stringify({ before, after }));
  await p.evaluate(() => [...document.querySelectorAll('[role=dialog][aria-label="View and filter"] .lib-clear')][0]?.click()); await sleep(300);
  const cleared = await sheetShape();
  check("V6 … Clear puts it back", cleared && parseInt(cleared.btns[1].replace(/\D+/g, ""), 10) === before, JSON.stringify(cleared && cleared.btns));
  await p.evaluate(() => document.querySelector('[role=dialog][aria-label="View and filter"] .lib-show')?.click()); await sleep(600);
  check("V6 … Show closes it and the feeder is back", (await pickerOpen()) && !(await p.evaluate(() => !!document.querySelector(".item-picker.suspended, [role=dialog][aria-label=\"View and filter\"]"))));
  await shot(p, "one-add-feeder-after-sheet");

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
