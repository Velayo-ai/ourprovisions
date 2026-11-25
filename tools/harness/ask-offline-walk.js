// ask-offline-walk.js — the SPEC_ask_offline pre-walk: verification 1–9, the parts a harness can drive. Dev only,
// Cody Test House, signed in already (signin.js).
//   Tab A is the phone under test: off grid by page.setOfflineMode. Its land_ask_picks requests can be held
//     by request interception: forwarded to the server from here and then failed in the page (a reply lost
//     after the server committed, V4), or answered with a made-up 400 (a real error, V7).
//   Tab B is only the second phone's TOKEN: its reads and writes go to dev's PostgREST straight from here, as
//     offline-walk.js does (same account).
// The walk makes three asks of its own ("OG Kid" Explorer pick 1, "OG Shop" Shopper pick 2, "OG Gone"
// Explorer pick 1), picks from seed items that aren't on the list, and puts everything back at the end
// (asks deleted, its rows removed, the cleanup read back as 0). V6 wraps the trip up for real, so the
// house's list must be empty to start; the walk refuses otherwise. Screenshots: out/aow-*.png.
// It prints every run id it sent: ask_landings has no client grant, so those rows are read and removed by
// SQL afterwards (see the report).
//   node ask-offline-walk.js
const fs = require("fs");
const path = require("path");
const lib = require("./lib");
const { log, sleep, connect, firstPage, shot } = lib;

const BASE = lib.DEV_URL;
const HOUSE = process.env.OP_WALK_HOUSE || "Cody Test House";
const VIEW = { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const LABELS = { kid: "OG Kid", shop: "OG Shop", gone: "OG Gone" };

function envLocal(name) {
  const raw = fs.readFileSync(path.join(lib.ROOT, ".env.local"), "utf8");
  const m = raw.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!m) throw new Error(`${name} missing from .env.local`);
  return m[1].trim();
}
const URL_ = envLocal("REACT_APP_SUPABASE_URL");
const ANON = envLocal("REACT_APP_SUPABASE_ANON_KEY");
if (!/zxwtxjjmssykhqrghouf/.test(URL_)) throw new Error("ask-offline-walk runs on dev only — .env.local is not dev");

let fails = 0;
const results = [];
const check = (name, ok, detail = "") => {
  log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? "  " + detail : ""}`);
  results.push({ name, ok, detail });
  if (!ok) fails++;
};

let A, B;
const token = () => B.evaluate(() => window.Clerk.session.getToken({ template: "supabase" }));
async function rest(method, p, body, prefer = "return=representation") {
  const t = await token();
  const r = await fetch(`${URL_}/rest/v1/${p}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json", Prefer: prefer },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!r.ok) throw new Error(`${method} ${p.replace(/\?.*/, "")} ${r.status} ${data && data.code} ${data && data.message}`);
  return data;
}
const rpc = (fn, args) => rest("POST", `rpc/${fn}`, args);
const waitFor = async (fn, ms = 10000, step = 200) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await sleep(step); } return v; };

// ── tab A: land_ask_picks, watched and (when asked) held ──
const lands = [];            // every land request the page made: { body, status }
let hold = null;             // null | "drop-reply" | "real-error"
let forwarded = null;        // V4: what the server answered the forwarded request
async function onRequest(req) {
  if (!/\/rpc\/land_ask_picks/.test(req.url()) || req.method() !== "POST") { req.continue().catch(() => {}); return; }
  const entry = { body: JSON.parse(req.postData() || "{}"), status: null, held: hold };
  lands.push(entry);
  if (hold === "drop-reply") {
    hold = null;
    try {
      const r = await fetch(req.url(), { method: "POST", headers: req.headers(), body: req.postData() });
      forwarded = { status: r.status, body: await r.text() };
    } catch (e) { forwarded = { status: 0, body: String(e.message) }; }
    entry.status = "dropped";
    req.abort("failed").catch(() => {});
    return;
  }
  if (hold === "real-error") {
    hold = null;
    entry.status = 400;
    // Cross-origin: without the CORS headers the browser rejects the answer as a network failure (transient).
    const origin = req.headers().origin || "*";
    req.respond({
      status: 400, contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", Vary: "Origin" },
      body: JSON.stringify({ code: "22023", message: "walk: a forced real error", details: null, hint: null }),
    }).catch(() => {});
    return;
  }
  req.continue().catch(() => {});
}
function watchResponses(page) {
  page.on("response", (r) => {
    if (!/\/rpc\/land_ask_picks/.test(r.url())) return;
    const body = (() => { try { return JSON.parse(r.request().postData() || "{}"); } catch (e) { return {}; } })();
    const e = [...lands].reverse().find((x) => x.body.p_run_id === body.p_run_id && x.status === null);
    if (e) e.status = r.status();
  });
}

const askQueue = (page) => page.evaluate(() => {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("op_ask_queue:")) out.push(...JSON.parse(localStorage.getItem(k))); }
  return out;
});
const checkQueue = (page) => page.evaluate(() => {
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("op_check_queue:")) return JSON.parse(localStorage.getItem(k)); }
  return {};
});
const wrapQueued = (page) => page.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { if (localStorage.key(i).startsWith("op_wrap_queue:")) return true; } return false; });
const heldKey = (page) => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem("op_ask_held")); } catch (e) { return null; } });
const shopRows = (page) => page.evaluate(() => {
  const tray = document.querySelector(".tray-head");
  if (tray && tray.getAttribute("aria-expanded") !== "true") tray.click();
  return [...document.querySelectorAll(".list-item")].map((r) => {
    const b = r.querySelector("button.shop-check");
    const name = b ? (b.querySelector(".sr-only") || b).innerText.replace(/, not shared yet/, "").trim() : "";
    return { name, checked: b ? b.getAttribute("aria-checked") === "true" : null, dot: !!r.querySelector(".sync-dot"), hl: r.classList.contains("ask-landed-hl"), text: r.innerText.replace(/\s+/g, " ").trim().slice(0, 90) };
  });
});
const tapAisle = (page, name) => page.evaluate((name) => {
  const b = [...document.querySelectorAll("button.shop-check")].find((x) => !x.closest(".tray-body") && (x.querySelector(".sr-only") || x).innerText.trim().startsWith(name));
  if (!b) return false; b.scrollIntoView({ block: "center" }); b.click(); return true;
}, name);
// The connection light: OFF GRID holds ~10 s of steady signal after a failure; a send in that window is (rightly)
// queued without a request, so the steps that hold a request wait for it to clear.
const onGrid = () => A.evaluate(() => (document.querySelector(".harbor-light")?.getAttribute("aria-label") || "") !== "Off grid");
const go = (page, hash) => page.evaluate((h) => { window.location.hash = h; }, hash);

// ── the run ──
async function openRun(label) {
  await go(A, "#/browse"); await sleep(1500);
  const hit = await A.evaluate((label) => {
    const b = [...document.querySelectorAll(".cat-rail .people-pill")].find((x) => x.innerText.trim() === `Ask ${label}`);
    if (b) { b.click(); return "pill"; }
    const more = document.querySelector(".cat-rail .cat-pill-more"); if (more) { more.click(); return "more"; }
    return null;
  }, label);
  if (hit === "more") {
    await sleep(700);
    await A.evaluate((label) => [...document.querySelectorAll(".more-asks-row")].find((b) => b.innerText.trim().endsWith(`Ask ${label}`))?.click(), label);
  }
  const opened = await A.waitForSelector(".ask-run", { visible: true, timeout: 15000 }).catch(() => null);
  if (!opened) {
    const rail = await A.evaluate(() => ({ pills: [...document.querySelectorAll(".cat-rail .people-pill, .cat-rail .cat-pill-more")].map((b) => b.innerText.trim()), rows: [...document.querySelectorAll(".more-asks-row")].map((b) => b.innerText.trim()), online: navigator.onLine }));
    throw new Error(`the run for ${label} didn't open (via ${hit}): ${JSON.stringify(rail)}`);
  }
  await sleep(3200);
  // Your turn: Explorer's ▶ (.ask-go) or Shopper's Let's pick (.ask-turn .ask-primary); a resumed run is already on the shelf.
  if (await A.evaluate(() => { const b = document.querySelector(".ask-go, .ask-turn .ask-primary"); if (b) b.click(); return !!b; })) await sleep(900);
}
const pick = (name) => A.evaluate((name) => {
  const t = [...document.querySelectorAll(".ask-tile")].find((b) => (b.getAttribute("aria-label") || b.innerText || "").trim().startsWith(name));
  if (!t) return false; t.click(); return true;
}, name);
const runState = () => A.evaluate(() => ({
  run: !!document.querySelector(".ask-run"), shelf: !!document.querySelector(".ask-shelf"), finale: !!document.querySelector(".ask-finale"),
  failed: document.querySelector(".ask-failed[role=alert]")?.innerText || null, done: document.querySelector(".ask-top .ask-done")?.getAttribute("aria-label") || null,
  picks: document.querySelectorAll(".ask-shelf .ask-wagon-pick").length,
}));
async function swipe() {
  const box = await A.evaluate(() => { const r = document.querySelector(".ask-wagonwrap").getBoundingClientRect(); return { x: r.left + r.width * 0.4, y: r.top + r.height * 0.85 }; });
  await A.mouse.move(box.x, box.y); await A.mouse.down();
  await A.mouse.move(box.x + 120, box.y, { steps: 8 }); await A.mouse.up();
}
// The tub's That's it! is an SVG part: no .click(), so a dispatched click.
const tubTap = () => A.evaluate(() => { const t = document.querySelector(".ask-tub-send"); if (!t) return false; t.dispatchEvent(new MouseEvent("click", { bubbles: true })); return true; });
const holdDone = () => A.evaluate(async () => {
  const b = document.querySelector(".ask-top .ask-done"); if (!b) return false;
  b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 9 }));
  await new Promise((r) => setTimeout(r, 1300));
  document.querySelector(".ask-top .ask-done")?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 9 }));
  return true;
});
async function giveBack() {
  await sleep(1700);   // armed 1500 ms after Great picks
  await A.evaluate(async () => {
    const b = document.querySelector(".ask-give-back"); if (!b) return;
    b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7 }));
    await new Promise((r) => setTimeout(r, 1800));
    document.querySelector(".ask-give-back")?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7 }));
  });
  await sleep(900);
  return A.evaluate(() => (document.body.innerText.match(/[^\n]*added \d+/) || [null])[0]);
}
// One full run: open, pick, send (swipe | tub | done), Great picks, give back. Returns what it saw.
async function run(label, names, how) {
  await openRun(label);
  for (const n of names) { await pick(n); await sleep(500); }
  await sleep(2600);   // the fill, the fireworks
  const before = await runState();
  if (how === "swipe") await swipe(); else if (how === "tub") await tubTap(); else await holdDone();
  await waitFor(async () => { const s = await runState(); return (s.finale || s.failed) && s; }, 9000, 150);
  const after = await runState();
  return { before, after };
}

(async () => {
  const browser = await connect();
  A = await firstPage(browser);
  await A.setViewport(VIEW);
  await A.setRequestInterception(true);
  A.on("request", (req) => { onRequest(req); });
  watchResponses(A);
  await A.goto(BASE + "#/browse", { waitUntil: "networkidle2" });
  await A.waitForFunction(() => window.Clerk && window.Clerk.user, { timeout: 30000 });
  B = await browser.newPage();
  await B.goto(BASE + "#/home", { waitUntil: "networkidle2" });
  await B.waitForFunction(() => window.Clerk && window.Clerk.session, { timeout: 30000 });
  await A.bringToFront();
  const bundle = await A.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /main\.[a-z0-9]+\.js/.test(s)) || "");
  const tag = await A.evaluate(() => document.querySelector(".op-build-tag")?.innerText || "");
  log(`bundle ${bundle.replace(/.*\//, "")} · build tag "${tag}"`);
  if (process.env.OP_EXPECT_SHA) check(`the build is ${process.env.OP_EXPECT_SHA}`, tag.includes(process.env.OP_EXPECT_SHA), tag);

  // ── setup ──
  const HH = (await rest("GET", `households?select=id&name=eq.${encodeURIComponent(HOUSE)}&deleted_at=is.null`))[0]?.id;
  if (!HH) throw new Error(`no ${HOUSE}`);
  const stale = await rest("GET", `asks?select=id,label&household_id=eq.${HH}&deleted_at=is.null`);
  for (const a of stale.filter((x) => Object.values(LABELS).includes(x.label))) await rest("PATCH", `asks?id=eq.${a.id}`, { deleted_at: new Date().toISOString() });
  const seeds = await rest("GET", `catalog_items?select=id,name&is_global=eq.true&deleted_at=is.null&order=name&limit=300`);
  const free = seeds.filter((s) => /^[A-Za-z][A-Za-z ]+$/.test(s.name)).slice(20, 31);
  if (free.length < 11) throw new Error("not enough seed items");
  // A previous run that stopped midway may have left the walk's own items on the list: those go first.
  for (const s of free) await rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: s.id }).catch(() => {});
  const live = await rest("GET", `list_items?select=id&household_id=eq.${HH}&deleted_at=is.null`);
  if (live.length) throw new Error(`${HOUSE} has ${live.length} rows on its list — V6 wraps the trip up for real; clear the list first`);
  const [S0, S1, S2, S3, S4, X1, X2, X3, G1, G2, S5] = free.map((s) => s.name);
  const CID = Object.fromEntries(free.map((s) => [s.name, s.id]));
  const ids = (...names) => names.map((n) => CID[n]);
  const ASK = { kid: crypto.randomUUID(), shop: crypto.randomUUID(), gone: crypto.randomUUID() };
  await rpc("create_ask", { p_id: ASK.kid, p_household_id: HH, p_label: LABELS.kid, p_shelf_noun: null, p_screen_style: "simple", p_pick_target: 1, p_catalog_item_ids: ids(S0, X1, X2, X3) });
  await rpc("create_ask", { p_id: ASK.shop, p_household_id: HH, p_label: LABELS.shop, p_shelf_noun: "snacks", p_screen_style: "standard", p_pick_target: 2, p_catalog_item_ids: ids(S1, S2, S3, S4, S5) });
  await rpc("create_ask", { p_id: ASK.gone, p_household_id: HH, p_label: LABELS.gone, p_shelf_noun: null, p_screen_style: "simple", p_pick_target: 1, p_catalog_item_ids: ids(G1, G2) });
  // X1 is on the list (pending) before the walk: V5's check-then-pick.
  await rpc("adjust_list_item_quantity", { p_household_id: HH, p_catalog_item_id: CID[X1], p_delta: 1, p_price_per_unit: null });
  log(`walk items ${JSON.stringify(free.map((s) => s.name))}`);
  const rowOf = async (name) => (await rest("GET", `list_items?select=id,status,quantity,deleted_at,status_changed_at,picked_by_labels&household_id=eq.${HH}&catalog_item_id=eq.${CID[name]}`))[0] || null;
  await A.goto(BASE + "#/browse", { waitUntil: "networkidle2" });   // the new asks, and X1 on the list
  const railReady = await waitFor(async () => {
    await A.evaluate(() => document.querySelector(".cat-rail .cat-pill-more")?.click());
    await sleep(500);
    const seen = await A.evaluate(() => [...document.querySelectorAll(".cat-rail .people-pill, .more-asks-row")].map((b) => b.innerText.trim()));
    await A.evaluate(() => document.querySelector(".modal-overlay")?.click());
    return Object.values(LABELS).every((l) => seen.includes(`Ask ${l}`)) && seen;
  }, 30000, 1000);
  check("setup: the walk's three asks are on the rail (or in +N more)", !!railReady, JSON.stringify(railReady));
  await sleep(1500);

  // ── V1: Explorer off grid — swipe → Great pick → the hand-back → the toast → See, with the dot ──
  await A.setOfflineMode(true); await sleep(800);
  const landsAtStart = lands.length;
  let r = await run(LABELS.kid, [S0], "swipe");
  await shot(A, "aow-v1-finale");
  check("V1 Explorer off grid: the swipe reaches Great pick, no red line", r.after.finale && !r.after.failed, JSON.stringify(r.after));
  check("V1 …the send waits on the phone (op_ask_queue 1), no request made", (await askQueue(A)).length === 1 && lands.length === landsAtStart, `queue ${(await askQueue(A)).length}, requests ${lands.length - landsAtStart}`);
  let toast = await giveBack();
  check(`V1 the hand-back toast is the online one: "${LABELS.kid} added 1"`, (toast || "").includes(`${LABELS.kid} added 1`), JSON.stringify(toast));
  await A.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "See")?.click());
  await sleep(1300);
  let rows = await shopRows(A);
  const s0 = rows.find((x) => x.name === S0);
  await shot(A, "aow-v1-see");
  check("V1 See: the picked row on the list, highlighted, with the dot and \"Picked by\"", !!s0 && s0.hl && s0.dot && new RegExp(`Picked by ${LABELS.kid}`).test(s0.text), JSON.stringify(s0));

  // ── V2: Shopper off grid — the tub's That's it!, then Done held full ──
  r = await run(LABELS.shop, [S1, S2], "tub");
  check("V2 Shopper off grid: a tap on the tub's That's it! reaches Great picks, no red line", r.after.finale && !r.after.failed, JSON.stringify(r.after));
  toast = await giveBack();
  check(`V2 …"${LABELS.shop} added 2"`, (toast || "").includes(`${LABELS.shop} added 2`), JSON.stringify(toast));
  r = await run(LABELS.shop, [S3, S4], "done");
  check("V2 Shopper off grid: Done held with a full wagon ('Hold to send') sends it, Great picks", r.before.done === "Hold to send" && r.after.finale && !r.after.failed, JSON.stringify(r));
  await giveBack();

  // ── V5: tap order, both halves, still off grid ──
  await go(A, "#/shop"); await sleep(1500);
  await tapAisle(A, X1); await sleep(4500);   // check X1 off (queued), then pick it
  r = await run(LABELS.kid, [X1], "swipe");
  await giveBack();
  r = await run(LABELS.kid, [X2], "swipe");   // pick X2 (a new item), then check it off
  await giveBack();
  await go(A, "#/shop"); await sleep(1500);
  rows = await shopRows(A);
  const x2row = rows.find((x) => x.name === X2);
  check("V5 the new pick shows on the list off grid (an overlay row, with the dot)", !!x2row && x2row.dot, JSON.stringify(x2row));
  await tapAisle(A, X2); await sleep(4500);
  const cq = await checkQueue(A);
  const x2key = Object.keys(cq).find((k) => k.startsWith("ask:") && k.endsWith(`:${CID[X2]}`));
  check("V5 the check of the overlay row waits under its synthetic key ask:<run>:<item>", !!x2key, JSON.stringify(Object.keys(cq)));
  const x2tap = x2key ? cq[x2key].tapAt : null;

  // ── V6: a pick, then an offline Wrap up ──
  r = await run(LABELS.kid, [X3], "swipe");
  await giveBack();
  await go(A, "#/shop"); await sleep(1500);
  await A.evaluate(() => document.querySelector(".wrapbar")?.click()); await sleep(900);
  await A.evaluate(() => document.querySelector('[role="dialog"][aria-label="Wrap up this trip"] .modal-confirm')?.click());
  await sleep(1500);
  check("V6 Wrap up off grid waits on the phone (op_wrap_queue)", await wrapQueued(A));
  await A.evaluate(() => { const d = document.querySelector('[role="dialog"][aria-label="Trip wrapped"]'); const o = d && d.closest(".modal-overlay"); if (o) o.click(); });
  await sleep(500);

  // ── V8 (O5): a pick off grid, then the ask is deleted on the other phone ──
  r = await run(LABELS.gone, [G1], "swipe");
  await giveBack();
  await rest("PATCH", `asks?id=eq.${ASK.gone}`, { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  const queuedRuns = (await askQueue(A)).map((e) => e.runId);
  check("V1–V8 every off-grid send waited on the phone (7 runs), and no request was made", queuedRuns.length === 7 && lands.length === landsAtStart, `queued ${queuedRuns.length}, requests ${lands.length - landsAtStart}`);
  await shot(A, "aow-offgrid");

  // ── V3: back on grid ──
  const landsBefore = lands.length;
  await A.setOfflineMode(false);
  const flushed = await waitFor(async () => (await askQueue(A)).length === 0 && Object.keys(await checkQueue(A)).length === 0 && !(await wrapQueued(A)), 60000, 500);
  await sleep(3000);
  check("V3 on grid: the queued landings, the checks and the Wrap up all go out", !!flushed);
  const replays = lands.slice(landsBefore);
  check("V3 one land_ask_picks per queued run, each with p_run_id and p_tapped_at, each answered 200",
    replays.length === 7 && replays.every((x) => x.status === 200 && x.body.p_run_id && x.body.p_tapped_at) && new Set(replays.map((x) => x.body.p_run_id)).size === 7 && queuedRuns.every((id) => replays.some((x) => x.body.p_run_id === id)),
    JSON.stringify(replays.map((x) => [x.status, !!x.body.p_tapped_at])));
  rows = await shopRows(A);
  check("V3 no dots left on the list, and nothing said", rows.every((x) => !x.dot) && !(await A.evaluate(() => /will send|syncing|back online/i.test(document.body.innerText))), JSON.stringify(rows.filter((x) => x.dot)));
  const srv = Object.fromEntries(await Promise.all([S0, S1, S2, S3, S4, X1, X2, X3, G1].map(async (n) => [n, await rowOf(n)])));
  const labelled = (n, label) => srv[n] && Array.isArray(srv[n].picked_by_labels) && srv[n].picked_by_labels.includes(label);
  check("V3 the second phone sees every pick, \"Picked by\" each one", [S0].every((n) => labelled(n, LABELS.kid)) && [S1, S2, S3, S4].every((n) => labelled(n, LABELS.shop)), JSON.stringify(Object.fromEntries(Object.entries(srv).map(([k, v]) => [k, v && v.picked_by_labels]))));
  check("V5 check-then-pick: X1 lands as a new need at 1, labelled", srv[X1] && srv[X1].quantity === 1 && srv[X1].status === "pending" && labelled(X1, LABELS.kid), JSON.stringify(srv[X1]));
  check("V5 pick-then-check: X2 exists and is bought, with status_changed_at = the check's tap time",
    srv[X2] && srv[X2].status === "bought" && x2tap && Math.abs(Date.parse(srv[X2].status_changed_at) - Date.parse(x2tap)) < 2, JSON.stringify({ row: srv[X2], tap: x2tap }));
  check("V6 the unchecked pick before the offline Wrap up is carried forward, not archived", srv[X3] && srv[X3].status === "pending" && !srv[X3].deleted_at, JSON.stringify(srv[X3]));
  check("V8 (O5) the pick on an ask deleted while off grid lands anyway, labelled", srv[G1] && !srv[G1].deleted_at && labelled(G1, LABELS.gone), JSON.stringify(srv[G1]));

  // ── V4: a reply lost after the server committed — the replay lands once ──
  check("V4 setup: the connection light is back (not OFF GRID)", !!(await waitFor(onGrid, 30000, 300)));
  const q0 = (await rowOf(S0)).quantity;
  hold = "drop-reply";
  const lv4 = lands.length;
  r = await run(LABELS.kid, [S0], "swipe");
  check("V4 a send whose reply is lost goes on to Great pick (queued), no red line", r.after.finale && !r.after.failed, JSON.stringify(r.after));
  await giveBack();
  await waitFor(async () => (await askQueue(A)).length === 0, 20000, 300);
  const v4 = lands.slice(lv4);
  const sameRun = v4.length === 2 && v4[0].body.p_run_id === v4[1].body.p_run_id;
  const q1 = (await rowOf(S0)).quantity;
  check("V4 the retry carries the same run id and gets the first count back", sameRun && forwarded && forwarded.status === 200 && v4[1].status === 200, JSON.stringify({ forwarded, v4: v4.map((x) => [x.status, x.body.p_run_id && x.body.p_run_id.slice(0, 8)]) }));
  check("V4 the pick counted once: +1, not +2", q1 === q0 + 1, `${q0} → ${q1}`);
  log(`V4 run id ${v4[0] && v4[0].body.p_run_id} (read ask_landings for exactly one row)`);

  // ── V7 (O4): a real error → Done 'Hold to finish' → the run closes, kept → the hand-over resumes it ──
  check("V7 setup: the connection light is back after the lost reply", !!(await waitFor(onGrid, 30000, 300)));
  const q7 = (await rowOf(S1)).quantity;
  hold = "real-error";
  r = await run(LABELS.shop, [S1, S2], "tub");
  check("V7 a real error: the red line, and Done reads 'Hold to finish'", !!r.after.failed && r.after.done === "Hold to finish", JSON.stringify(r.after));
  await holdDone(); await sleep(1200);
  const closed = await runState();
  const kept = await heldKey(A);
  check("V7 holding Done closes the run and keeps the picks (op_ask_held, parked)", !closed.run && kept && kept.parked === true && kept.catalog_item_ids.length === 2, JSON.stringify({ run: closed.run, kept }));
  await openRun(LABELS.shop);
  const resumed = await runState();
  check("V7 the next hand-over of the same ask opens the shelf with the wagon full, 'Hold to send'", resumed.shelf && resumed.picks === 2 && resumed.done === "Hold to send", JSON.stringify(resumed));
  await tubTap();
  await waitFor(async () => (await runState()).finale, 9000, 150);
  check("V7 …and it sends for real", (await runState()).finale && (await rowOf(S1)).quantity === q7 + 1, `${q7} → ${(await rowOf(S1)).quantity}`);
  await giveBack();

  // ── V9: the prod bundle's call — three named args — against dev through PostgREST ──
  const q9 = (await rowOf(S0)).quantity;
  const n9 = await rpc("land_ask_picks", { p_household_id: HH, p_ask_id: ASK.kid, p_catalog_item_ids: [CID[S0]] });
  check("V9 the old client's 3-arg call shape still lands on 089 (PostgREST resolves the defaults)", n9 === 1 && (await rowOf(S0)).quantity === q9 + 1, `returned ${JSON.stringify(n9)}, ${q9} → ${(await rowOf(S0)).quantity}`);

  // ── tidy: the walk's rows and asks, read back as 0 ──
  const allRuns = [...new Set(lands.map((x) => x.body.p_run_id).filter(Boolean))];
  for (const n of free.map((s) => s.name)) await rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: CID[n] }).catch(() => {});
  for (const id of Object.values(ASK)) await rest("PATCH", `asks?id=eq.${id}&deleted_at=is.null`, { deleted_at: new Date().toISOString() }).catch(() => {});
  const openS = await rest("GET", `shopping_sessions?select=id&household_id=eq.${HH}&ended_at=is.null`);
  for (const x of openS) await rest("PATCH", `shopping_sessions?id=eq.${x.id}`, { ended_at: new Date().toISOString() });
  const leftRows = await rest("GET", `list_items?select=id&household_id=eq.${HH}&deleted_at=is.null`);
  const leftAsks = await rest("GET", `asks?select=id&household_id=eq.${HH}&deleted_at=is.null&id=in.(${Object.values(ASK).join(",")})`);
  check("tidy: the list is empty and the walk's asks are deleted (read back 0 / 0)", leftRows.length === 0 && leftAsks.length === 0, `rows ${leftRows.length}, asks ${leftAsks.length}`);
  await A.evaluate(() => { try { sessionStorage.removeItem("op_ask_held"); } catch (e) { /* ignore */ } });
  log(`RUN IDS ${JSON.stringify(allRuns)}`);
  log(`HOUSEHOLD ${HH}`);

  await A.setRequestInterception(false);
  await B.close();
  log(`${results.filter((x) => x.ok).length}/${results.length} PASS${fails ? `, ${fails} FAILED` : ""}`);
  await browser.disconnect();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => { console.error(e); process.exit(2); });
