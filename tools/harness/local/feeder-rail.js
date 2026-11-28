// One add: BOTH feeders are the same full-screen layer (ItemSearchView). For the List feeder (+ Add on List)
// and the Meals feeder (+ Add on This Week): it covers the screen (no household header, no Helm), the field has
// the focus on open (the keyboard's first-tap rule), only the list scrolls — after scrolling it to the end,
// the title bar, the field and the RAIL are where they were and still on screen — and on a desktop it sits
// inside the phone frame. Flag-on build, signed in; a local build (see one-add.js) or the preview with `remote`.
// Read-only. The Meals half fakes the household's meals + placements READS in this tab (14 meals, so the
// cards scroll and the rail shows); any write to those tables is aborted, never sent.
const lib = require("../lib.js");
const nav = require("../oneadd-nav.js");
const REMOTE = process.argv[2] === "remote";
const BASE = REMOTE ? lib.DEV_URL : require("./use-local.js").LOCAL_URL;
const { sleep, log, connect, firstPage } = lib;

let checks = 0, fails = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) fails++; log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

const now = new Date().toISOString();
const OCC = ["dinner", "lunch", "breakfast"];
const MEALS = Array.from({ length: 14 }, (_, k) => ({
  id: `00000000-0000-4000-8000-0000000000${String(k + 10)}`, name: `Harness Meal ${k + 1}`, kind: "meal", from_meal_ids: null,
  occasion: [OCC[k % 3]], attribution: null, base_servings: 1, instructions: null, created_by: null, created_at: now, meal_ingredients: [],
}));
async function fakeMeals(p, on) {
  if (!on) { p.removeAllListeners("request"); await p.setRequestInterception(false); return; }
  await p.setRequestInterception(true);
  p.on("request", (r) => {
    const hit = /\/rest\/v1\/(meals|meal_placements)\?/.exec(r.url());
    if (!hit || r.method() === "OPTIONS") return r.continue();
    if (r.method() !== "GET") { log(`aborted a ${r.method()} to ${hit[1]} (faked reads only)`); return r.abort(); }
    r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(hit[1] === "meals" ? MEALS : []) });
  });
}

async function openMeals(p) {
  await p.goto(BASE + "#/plan", { waitUntil: "networkidle2" }); await sleep(2500);
  await p.evaluate(() => (document.querySelector('.plan-ctl .hdr-action[aria-label="Add a meal to this week"]') || document.querySelector(".plan-welcome-add"))?.click());
  await p.waitForSelector(".meals-feeder.open", { visible: true, timeout: 10000 }); await sleep(600);
}
async function closeMeals(p) {
  if (await p.$(".meals-feeder.open")) { await p.evaluate(() => document.querySelector(".meals-feeder .item-search-done").click()); await sleep(700); }
}

// The layer's state: its box, what is at the top of the screen, the focus, and where the fixed parts sit.
const read = (p, sel) => p.evaluate((sel) => {
  const v = document.querySelector(sel);
  if (!v) return null;
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), width: Math.round(b.width), height: Math.round(b.height) }; };
  const list = v.querySelector(".ask-search-list");
  const rail = v.querySelector(".feeder-rail");
  const helm = document.querySelector(".helm");
  const atTop = document.elementFromPoint(innerWidth / 2, Math.min(innerHeight - 1, r(v).top + 10));
  return {
    view: r(v), win: { width: innerWidth, height: innerHeight }, frame: r(document.querySelector(".phone-frame")),
    topIsLayer: !!atTop && v.contains(atTop), helmShown: !!helm && getComputedStyle(helm).display !== "none",
    focused: document.activeElement === v.querySelector(".item-search-field input"),
    title: r(v.querySelector(".item-search-titlebar")), field: r(v.querySelector(".item-search-field")), rail: r(rail),
    railPills: rail ? rail.querySelectorAll("button").length : 0,
    scrollTop: list ? Math.round(list.scrollTop) : null, scrollable: list ? list.scrollHeight - list.clientHeight : null,
  };
}, sel);
const toEnd = (p, sel) => p.evaluate((sel) => { const l = document.querySelector(`${sel} .ask-search-list`); l.scrollTop = l.scrollHeight; }, sel);
const same = (a, b) => !!a && !!b && Math.abs(a.top - b.top) <= 1 && Math.abs(a.height - b.height) <= 1;

async function walk(p, name, sel, open, close) {
  await open();
  const a = await read(p, sel);
  check(`${name}: full screen — the layer at the top, no Helm`, !!a && a.topIsLayer && !a.helmShown && a.view.top <= 1 && a.view.height >= a.win.height - 1, JSON.stringify(a && { view: a.view, topIsLayer: a.topIsLayer, helm: a.helmShown }));
  check(`${name}: the field has the focus on open (the first-tap keyboard rule)`, !!a && a.focused);
  check(`${name}: a rail under the field`, !!a && !!a.rail && a.railPills > 0 && a.rail.top >= a.field.bottom - 1, JSON.stringify(a && { rail: a.rail, pills: a.railPills }));
  await toEnd(p, sel); await sleep(500);
  const b = await read(p, sel);
  check(`${name}: the list scrolls (there is something to scroll)`, !!b && b.scrollable > 40 && b.scrollTop > 40, JSON.stringify(b && { scrollTop: b.scrollTop, scrollable: b.scrollable }));
  check(`${name}: after scrolling, the title bar, field and rail are where they were`, !!b && same(a.title, b.title) && same(a.field, b.field) && same(a.rail, b.rail), JSON.stringify({ before: a && [a.title, a.field, a.rail], after: b && [b.title, b.field, b.rail] }));
  check(`${name}: … and the rail is still on screen`, !!b && !!b.rail && b.rail.top >= 0 && b.rail.bottom <= b.win.height, JSON.stringify(b && b.rail));
  await close();
}

(async () => {
  const b = await connect(); const p = await firstPage(b);
  const cdp = await p.createCDPSession();
  const media = (features) => cdp.send("Emulation.setEmulatedMedia", { features });
  const phone = async () => { await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await media([{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }]); };
  await phone();
  check("a one-add build", await (async () => { await p.goto(BASE + "#/home", { waitUntil: "networkidle2" }); await sleep(2500); return nav.isOneAdd(p); })());

  await walk(p, "List feeder", ".item-picker", () => nav.openFeeder(p, BASE), () => nav.closeFeeder(p));
  await fakeMeals(p, true);
  await walk(p, "Meals feeder", ".meals-feeder", () => openMeals(p), () => closeMeals(p));
  // Done empties the search, as the List feeder's does: type, Done, open again → an empty field
  await openMeals(p);
  await p.type(".meals-feeder .item-search-field input", "zzq", { delay: 10 }); await sleep(300);
  await closeMeals(p);
  await openMeals(p);
  check("Meals feeder: Done empties the search (as the List feeder's)", (await p.$eval(".meals-feeder .item-search-field input", (i) => i.value)) === "");
  await closeMeals(p);
  // Done lands on This Week
  check("Meals feeder: Done returns to This Week", (await p.evaluate(() => document.querySelector(".plan-ctl .plan-view")?.textContent.trim())) === "This Week" && !(await p.$(".meals-feeder.open")));

  // the desktop frame: both layers take the frame's box
  await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await media([{ name: "hover", value: "hover" }, { name: "pointer", value: "fine" }]);
  for (const [name, sel, open, close] of [["List feeder", ".item-picker", () => nav.openFeeder(p, BASE), () => nav.closeFeeder(p)], ["Meals feeder", ".meals-feeder", () => openMeals(p), () => closeMeals(p)]]) {
    await open();
    const d = await read(p, sel);
    const ok = !!d && !!d.frame && ["top", "left", "width", "height"].every((k) => Math.abs(d.view[k] - d.frame[k]) <= 1);
    check(`${name}: on a desktop, inside the phone frame`, ok, JSON.stringify(d && { view: d.view, frame: d.frame }));
    await close();
  }
  await fakeMeals(p, false);
  await media([]);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  log(`${checks - fails}/${checks} ${fails ? "FAIL" : "ALL PASS"}`);
  b.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
