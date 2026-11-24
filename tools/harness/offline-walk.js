// offline-walk.js — the offline pre-walk: SPEC_offline_calm_2026-11-23 Verify 1–9 (C9: the Harbor dots; C10: off grid), on top of slice 1
// (SPEC_offline_checkoff amendment 2026-11-23; its V6, V7, V7b, V8 and V10 are Verify 8 here; online
// unchanged is shop-burst.js). Dev only, Cody Test House, signed in already (signin.js).
//   Tab A is the phone under test: offline by page.setOfflineMode, weak signal (the shell loads, the API
//     doesn't) by aborting every *.supabase.co request.
//   Tab B is only the second phone's TOKEN: its writes go to dev's PostgREST straight from here, as
//     qty-race.js does (same account; the conflict rule is about tap times, not who calls). Tab B is
//     opened before anything is queued, and never checks anything in its UI, so it never touches the
//     shared localStorage queue.
// The walk adds seven items of its own (W0–W6, seeds not on the list), snapshots every other row first,
// and puts the list back at the end. Verify 7 wraps the trip up for real (the house's list must hold only
// the walk's items; the walk refuses to start otherwise). Screenshots: out/offline-*.png.
//   node offline-walk.js
const fs = require("fs");
const path = require("path");
const lib = require("./lib");
const { log, sleep, connect, firstPage, shot } = lib;

const BASE = lib.DEV_URL;
const HOUSE = process.env.OP_WALK_HOUSE || "Cody Test House";

function envLocal(name) {
  const raw = fs.readFileSync(path.join(lib.ROOT, ".env.local"), "utf8");
  const m = raw.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!m) throw new Error(`${name} missing from .env.local`);
  return m[1].trim();
}
const URL_ = envLocal("REACT_APP_SUPABASE_URL");
const ANON = envLocal("REACT_APP_SUPABASE_ANON_KEY");
if (!/zxwtxjjmssykhqrghouf/.test(URL_)) throw new Error("offline-walk runs on dev only — .env.local is not dev");

let fails = 0;
const results = [];
const check = (name, ok, detail = "") => {
  log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? "  " + detail : ""}`);
  results.push({ name, ok, detail });
  if (!ok) fails++;
};

let A, B;   // pages
const token = () => B.evaluate(() => window.Clerk.session.getToken({ template: "supabase" }));
let skewMs = null;
async function rest(method, p, body, prefer = "return=representation") {
  const t = await token();
  const r = await fetch(`${URL_}/rest/v1/${p}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json", Prefer: prefer },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (skewMs === null && r.headers.get("date")) skewMs = Date.parse(r.headers.get("date")) - Date.now();
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!r.ok) throw new Error(`${method} ${p.replace(/\?.*/, "")} ${r.status} ${data && data.code} ${data && data.message}`);
  return data;
}
const rpc = (fn, args) => rest("POST", `rpc/${fn}`, args);

// ── page readers (tab A) ──
// Retired copy, and (C10) the word "offline" anywhere the person can read.
const OLD_COPY = /waiting to sync|Syncing|Reconnecting|Back online|showing last saved|Will sync|All picked up|[Oo]ffline|OFFLINE/;
const shopState = (page) => page.evaluate((oldSrc) => {
  const OLD = new RegExp(oldSrc);
  const nm = (b) => (b.querySelector(".sr-only") || b).innerText.trim();
  const tray = document.querySelector(".tray-head");
  if (tray && tray.getAttribute("aria-expanded") !== "true") tray.click();   // the walk reads In cart rows
  const rows = [...document.querySelectorAll(".list-item")];
  const aisle = rows.filter((r) => !r.closest(".tray-body"));
  const inCart = rows.filter((r) => r.closest(".tray-body"));
  const nameOf = (r) => { const b = r.querySelector("button.shop-check"); return b ? nm(b) : ""; };
  const done = document.querySelector(".all-done");
  const err = [...document.querySelectorAll("div")].find((d) => /^Could not /.test((d.innerText || "").trim()));
  const statuses = [...document.querySelectorAll('[role="status"]')].map((e) => e.innerText.trim()).filter(Boolean);
  return {
    unchecked: aisle.map((r) => r.querySelector('button.shop-check[aria-checked="false"]')).filter(Boolean).map(nm),
    holding: aisle.filter((r) => r.classList.contains("checking")).map(nameOf),
    inCart: inCart.map(nameOf),
    dotsInCart: inCart.filter((r) => r.querySelector(".sync-dot")).map(nameOf),
    dotsAisle: aisle.filter((r) => r.querySelector(".sync-dot")).map(nameOf),
    trayCount: Number(((document.querySelector(".tray-sub") || {}).innerText || "").match(/\d+/)?.[0] || 0),
    // C9: the Velayo dots are the connection light. indicator = OFFLINE is showing in their place.
    indicator: ((document.querySelector(".harbor-light") || { getAttribute: () => "" }).getAttribute("aria-label") || "") === "Off grid",
    harborLabel: (document.querySelector(".harbor-light") || { getAttribute: () => "" }).getAttribute("aria-label") || "",
    harborText: ((document.querySelector(".harbor-light") || {}).innerText || "").trim(),
    harborDots: !!document.querySelector(".harbor-light svg.harbor-dots"),
    note: (document.querySelector(".offline-note") || {}).innerText || "",
    toasts: [...document.querySelectorAll(".check-undo-text")].map((e) => e.innerText.trim()),
    oldCopy: [...statuses, document.body.innerText].some((t) => OLD.test(t)),
    allDone: done && !done.closest('[role="dialog"]') ? done.innerText.replace(/\s+/g, " ").trim() : "",
    summary: !!document.querySelector('[role="dialog"][aria-label="Trip wrapped"]'),
    error: err ? err.innerText.trim().slice(0, 80) : "",
    rows: aisle.length + inCart.length,
  };
}, OLD_COPY.source);
const tapAisle = (page, name) => page.evaluate((name) => {
  const b = [...document.querySelectorAll("button.shop-check")].find((x) => !x.closest(".tray-body") && (x.querySelector(".sr-only") || x).innerText.trim().startsWith(name));
  if (!b) return false; b.scrollIntoView({ block: "center" }); b.click(); return true;
}, name);
const tapCart = (page, name) => page.evaluate((name) => {
  const tray = document.querySelector(".tray-head");
  if (tray && tray.getAttribute("aria-expanded") !== "true") tray.click();
  const b = [...document.querySelectorAll(".tray-body button.shop-check")].find((x) => (x.querySelector(".sr-only") || x).innerText.trim().startsWith(name));
  if (!b) return false; b.scrollIntoView({ block: "center" }); b.click(); return true;
}, name);
const undoToast = (page, name) => page.evaluate((name) => {
  const t = [...document.querySelectorAll(".check-undo")].find((x) => (x.querySelector(".check-undo-text") || x).innerText.includes(name));
  const b = t && t.querySelector(".check-undo-btn");
  if (!b) return false; b.click(); return true;
}, name);
const queueInStorage = (page) => page.evaluate(() => {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("op_check_queue:")) out[k] = JSON.parse(localStorage.getItem(k)); }
  return out;
});
const queued = async (page) => Object.values(await queueInStorage(page))[0] || {};
const wrapInStorage = (page) => page.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("op_wrap_queue:")) return JSON.parse(localStorage.getItem(k)); } return null; });
const cacheKeys = (page) => page.evaluate(() => { const o = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("op_list_cache:")) o.push(k); } return o; });
const waitFor = async (fn, ms = 10000, step = 200) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await sleep(step); } return v; };
const visibility = (page, state) => page.evaluate((state) => {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  Object.defineProperty(document, "hidden", { value: state === "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}, state);
// Samples the Harbor light and the note every 25 ms: did OFFLINE or the note ever flick, and how many
// beacons started (C9)?
const startSampler = (page) => page.evaluate(() => {
  window.__s = { ind: [], notes: 0, noteWas: false, beacons: 0, beaconWas: false };
  window.__sampler = setInterval(() => {
    const light = document.querySelector(".harbor-light");
    const on = !!light && light.getAttribute("aria-label") === "Off grid";
    const s = window.__s;
    if (s.ind[s.ind.length - 1] !== on) s.ind.push(on);
    const note = !!document.querySelector(".offline-note");
    if (note && !s.noteWas) s.notes++;
    s.noteWas = note;
    const b = !!light && light.getAttribute("data-beacon") === "on";
    if (b && !s.beaconWas) s.beacons++;
    s.beaconWas = b;
  }, 25);
});
const sampled = (page) => page.evaluate(() => ({ ...window.__s }));
// The beacon's shape (C9, revised 23:58 and 00:24): every 20 ms for `ms`, from rest before the beacon to rest
// after it, each dot's fill brightness (r+g+b) and opacity (its own × the SVG's), and whether the SVG
// element was ever replaced (a remount). Peaks = the brightest moment of each spell above the threshold.
// Clockwise = top-left (hd1) → top-right (hd3) → bottom (hd2); a turn = top-left's second peak − its first.
// REST_SUM = #C9A97A (201+169+122): the beam only adds light, so no sample may fall below it.
const REST_SUM = 492;
const measureBeacon = async (page, run, ms = 9500) => {
  await page.evaluate(() => {
    window.__bm = { t0: performance.now(), rows: [], svgs: new Set(), svgCount: 0, low: [] };
    window.__bmt = setInterval(() => {
      const svg = document.querySelector(".harbor-light svg.harbor-dots");
      if (!svg) { window.__bm.low.push(["no-svg", Math.round(performance.now() - window.__bm.t0)]); return; }
      if (!window.__bm.svgs.has(svg)) { window.__bm.svgs.add(svg); window.__bm.svgCount++; }
      const op = (el) => parseFloat(getComputedStyle(el).opacity || "1");
      const f = (c) => { const m = (getComputedStyle(c).fill || "").match(/\d+/g); return m ? (+m[0]) + (+m[1]) + (+m[2]) : 0; };
      const d = ["hd1", "hd3", "hd2"].map((k) => svg.querySelector(`.${k}`));
      const svgOp = op(svg);
      window.__bm.rows.push([performance.now() - window.__bm.t0, ...d.map(f), ...d.map((c) => op(c) * svgOp), svg.getAttribute("class")]);
    }, 20);
  });
  await run();
  await sleep(ms);
  const bm = await page.evaluate(() => { clearInterval(window.__bmt); return { rows: window.__bm.rows, svgCount: window.__bm.svgCount, low: window.__bm.low }; });
  const rows = bm.rows;
  const peaks = [1, 2, 3].map((col) => {
    const out = []; let best = null;
    for (const r of rows) {
      if (r[col] > 560) { if (!best || r[col] > best[1]) best = [r[0], r[col]]; }
      else if (best) { out.push(Math.round(best[0])); best = null; }
    }
    if (best) out.push(Math.round(best[0]));
    return out;
  });
  // Below rest: any fill under #C9A97A, any opacity under 1, or the SVG missing.
  const below = rows.filter((r) => r[1] < REST_SUM || r[2] < REST_SUM || r[3] < REST_SUM || r[4] < 0.999 || r[5] < 0.999 || r[6] < 0.999)
    .map((r) => [Math.round(r[0]), r[1], r[2], r[3], +r[4].toFixed(2), +r[5].toFixed(2), +r[6].toFixed(2)]);
  const firstBeacon = rows.findIndex((r) => /beacon/.test(r[7]));
  const lastBeacon = rows.length - 1 - [...rows].reverse().findIndex((r) => /beacon/.test(r[7]));
  const peakSum = Math.max(...rows.map((r) => Math.max(r[1], r[2], r[3])));
  return {
    tl: peaks[0], tr: peaks[1], bottom: peaks[2], samples: rows.length, below: below.concat(bm.low), svgCount: bm.svgCount, peakSum,
    restBefore: firstBeacon > 0, restAfter: firstBeacon >= 0 && lastBeacon < rows.length - 1,
  };
};
const stopSampler = (page) => page.evaluate(() => { clearInterval(window.__sampler); return window.__s; });
// Reconnected and settled: nothing queued, no dots.
const settled = async () => { const x = await shopState(A); return Object.keys(await queued(A)).length === 0 && !x.dotsInCart.length && !x.dotsAisle.length && x; };

let blocking = false;
async function setWeakSignal(on) {
  blocking = on;
  await A.setRequestInterception(on);
}
const HOLD_AND_MOVE_MS = 4000;   // the 3 s hold + beat 2

(async () => {
  const browser = await connect();
  A = await firstPage(browser);
  // Request interception is on only while the walk blocks the API (an intercepted page stalled the
  // session insert until interception was turned off — a harness artefact, seen in slice 1's first runs).
  A.on("request", (req) => {
    if (blocking && /supabase\.co/.test(req.url())) { req.abort("internetdisconnected").catch(() => {}); return; }
    req.continue().catch(() => {});
  });
  await A.goto(BASE + "#/shop", { waitUntil: "networkidle2" });
  await A.waitForFunction(() => window.Clerk && window.Clerk.user, { timeout: 30000 });
  // C3's note is once per trip: start this walk as a new one.
  await A.evaluate(() => { try { localStorage.removeItem("op_offline_note_at"); } catch (e) { /* ignore */ } });
  B = await browser.newPage();
  await B.goto(BASE + "#/home", { waitUntil: "networkidle2" });
  await B.waitForFunction(() => window.Clerk && window.Clerk.session, { timeout: 30000 });
  // Tab A is the phone in the shopper's hand: in front (a background tab's timers and geolocation are held).
  await A.bringToFront();
  await sleep(2500);
  const bundle = await A.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /main\.[a-z0-9]+\.js/.test(s)) || "");
  log("bundle " + bundle.replace(/.*\//, ""));

  // ── setup ──
  const HH = (await rest("GET", `households?select=id&name=eq.${encodeURIComponent(HOUSE)}&deleted_at=is.null`))[0]?.id;
  if (!HH) throw new Error(`no ${HOUSE}`);
  const live = await rest("GET", `list_items?select=id,catalog_item_id,status,quantity&household_id=eq.${HH}&deleted_at=is.null`);
  if (live.length) throw new Error(`${HOUSE} has ${live.length} rows on its list — Verify 7 wraps the trip up for real; clear the list first`);
  log(`skew server − local ${skewMs} ms`);
  const seeds = await rest("GET", `catalog_items?select=id,name&is_global=eq.true&deleted_at=is.null&order=name&limit=300`);
  const free = seeds.filter((s) => /^[A-Za-z][A-Za-z ]+$/.test(s.name)).slice(0, 8);
  const W = free.slice(0, 7).map((s) => s.name);
  const PARTNER = free[7].name;   // Verify 7: added by "the second phone" while A is offline
  const CID = Object.fromEntries(free.map((s) => [s.name, s.id]));
  for (const n of W) await rpc("adjust_list_item_quantity", { p_household_id: HH, p_catalog_item_id: CID[n], p_delta: 1, p_price_per_unit: null });
  const rowOf = async (name) => (await rest("GET", `list_items?select=id,status,quantity,deleted_at,status_changed_at&household_id=eq.${HH}&catalog_item_id=eq.${CID[name]}`))[0];
  const setStatus = async (name, status) => { const r = await rowOf(name); await rest("PATCH", `list_items?id=eq.${r.id}`, { status }); };
  // W3 is bought on the server before the walk: Verify 3's offline uncheck of a bought row.
  await setStatus(W[3], "bought");
  log(`walk items: ${JSON.stringify(W)}; partner's add ${JSON.stringify(PARTNER)}`);
  const openBefore = await rest("GET", `shopping_sessions?select=id&household_id=eq.${HH}&ended_at=is.null`);
  for (const s of openBefore) await rest("PATCH", `shopping_sessions?id=eq.${s.id}`, { ended_at: new Date().toISOString() });
  log(`ended ${openBefore.length} open session(s) first`);
  const t0Iso = new Date(Date.now() + (skewMs || 0) - 2000).toISOString();
  // Tab A loaded on an empty list, so the landing rule put it on Home: to the Shop now the items are there.
  await waitFor(() => A.evaluate(() => /things? to get/.test(document.body.innerText)), 15000, 300);
  await A.evaluate(() => { window.location.hash = "#/shop"; });
  await sleep(1500);
  const sawAll = await waitFor(async () => { const s = await shopState(A); return W.filter((n) => n !== W[3]).every((n) => s.unchecked.includes(n)) && s.inCart.includes(W[3]) && s; }, 15000);
  check("setup: tab A shows six walk items to find and one in the cart", !!sawAll);
  const s0 = await shopState(A);
  check("setup: nothing queued; the dots steady, named \"Connected to the Harbor\"", Object.keys(await queueInStorage(A)).length === 0 && !s0.indicator && s0.harborDots && s0.harborLabel === "Connected to the Harbor", JSON.stringify({ label: s0.harborLabel, dots: s0.harborDots }));

  // ── Verify 1: offline → the note once, then the icon; flaky signal → no repeat note, no flicker ──
  await startSampler(A);
  await A.setOfflineMode(true);
  const noted = await waitFor(async () => { const x = await shopState(A); return x.note && x; }, 3000, 50);
  check("V1 going off grid shows the calm note: Off grid · everything's saved", !!noted && noted.note.trim() === "Off grid · everything's saved", JSON.stringify(noted && noted.note));
  check("V1 …and OFF GRID replaces the dots (gold small caps, named \"Off grid\")", !!noted && noted.indicator && noted.harborText === "OFF GRID" && !noted.harborDots, JSON.stringify(noted && { text: noted.harborText, label: noted.harborLabel, dots: noted.harborDots }));
  await sleep(3600);
  let s = await shopState(A);
  check("V1 the note goes after about 3 s; OFF GRID stays", !s.note && s.indicator);
  // One bar, dropping in and out: device offline/online flaps, then the API failing with the device online.
  for (let k = 0; k < 3; k++) { await A.setOfflineMode(false); await sleep(1200); await A.setOfflineMode(true); await sleep(1200); }
  await setWeakSignal(true); await A.setOfflineMode(false); await sleep(2500);
  await A.setOfflineMode(true); await setWeakSignal(false);
  await sleep(500);
  const samp = await stopSampler(A);
  check("V1 flaky signal: the note never repeats", samp.notes === 1, `notes shown ${samp.notes}`);
  check("V1 flaky signal: OFF GRID never flicks back to the dots", samp.ind.join() === "false,true" || samp.ind.join() === "true", JSON.stringify(samp.ind));
  await shot(A, "offline-v1");

  // ── Verify 2: three offline checks look and move exactly as online, with a dot in In cart ──
  const trayBefore = (await shopState(A)).trayCount;
  for (const n of W.slice(0, 3)) { await tapAisle(A, n); await sleep(300); }
  s = await shopState(A);
  check("V2 each check holds in place, struck through (as online)", W.slice(0, 3).every((n) => s.holding.includes(n)), JSON.stringify(s.holding));
  const toasts2 = s.toasts;
  await sleep(HOLD_AND_MOVE_MS);
  s = await shopState(A);
  await shot(A, "offline-v2");
  check("V2 …then moves to In cart (tray +3)", W.slice(0, 3).every((n) => s.inCart.includes(n)) && s.trayCount === trayBefore + 3, `in cart ${JSON.stringify(s.inCart)}, tray ${trayBefore}→${s.trayCount}`);
  check("V2 a small dot on each of the three In cart rows, nowhere else", W.slice(0, 3).every((n) => s.dotsInCart.includes(n)) && s.dotsInCart.length === 3 && !s.dotsAisle.length, `cart dots ${JSON.stringify(s.dotsInCart)}, aisle dots ${JSON.stringify(s.dotsAisle)}`);
  check("V2 the toasts read as online", toasts2.length > 0 && toasts2.every((t) => /^✓ .+ (checked|in cart)$/.test(t)), JSON.stringify(toasts2));
  check("V2 none of the old offline copy anywhere (pill, waiting row, Syncing…)", !s.oldCopy);
  const srv2 = await Promise.all(W.slice(0, 3).map(rowOf));
  check("V2 nothing reached the server", srv2.every((r) => r.status === "pending"), JSON.stringify(srv2.map((r) => r.status)));

  // ── Verify 3: Undo, re-tap, and an offline uncheck of a bought row — as online ──
  await tapCart(A, W[0]);   // re-tap: back to find, its queued check withdrawn
  await sleep(1200);
  await tapAisle(A, W[5]); await sleep(300);
  const undid = await undoToast(A, W[5]);   // Undo on its toast, inside the hold
  await sleep(1200);
  await tapCart(A, W[3]);   // bought on the server: an offline UNcheck
  await sleep(1200);
  s = await shopState(A);
  await shot(A, "offline-v3");
  check("V3 a re-tap and an Undo put both back to find, with no dot (nothing left to share)", undid && s.unchecked.includes(W[0]) && s.unchecked.includes(W[5]) && !s.dotsAisle.includes(W[0]) && !s.dotsAisle.includes(W[5]), `undo clicked ${undid}; aisle dots ${JSON.stringify(s.dotsAisle)}`);
  check("V3 the offline uncheck of a bought row moves back to find, with the dot on its circle", s.unchecked.includes(W[3]) && s.dotsAisle.includes(W[3]), `aisle dots ${JSON.stringify(s.dotsAisle)}`);
  const q3 = await queued(A);
  check("V3 three changes wait on the phone (W1 ✓, W2 ✓, W3 uncheck)", Object.keys(q3).length === 3 && s.dotsInCart.length === 2 && s.dotsAisle.length === 1, `stored ${Object.keys(q3).length}; cart dots ${JSON.stringify(s.dotsInCart)}; aisle dots ${JSON.stringify(s.dotsAisle)}`);
  const tapTimes = Object.values(q3).filter((e) => e.want).map((e) => e.tapAt).sort();

  // ── Verify 4: tap the dots off grid (the words OFF GRID) → the Velayo menu with the off-grid lines at its top ──
  // Cody Test House has one member: the one-member words (C10), with no changes line (no one to share with).
  // The many-member words are covered by lib/offlineMode.test.js (the test account may not join another place).
  await A.click(".harbor-light");
  await sleep(500);
  const menu = await A.evaluate(() => {
    const d = document.querySelector(".offline-lines");
    const card = d && d.parentElement;
    return { lines: d ? d.innerText.replace(/\s+/g, " ").trim() : "", card: card ? card.innerText.replace(/\s+/g, " ").trim() : "" };
  });
  await shot(A, "offline-v4");
  check("V4 tap OFF GRID: the Velayo menu opens with the one-member off-grid words at its top", menu.lines === "You're off grid. Everything's kept on this phone and syncs when you're back in signal." && /Live Better\. Live Smarter\./i.test(menu.card), JSON.stringify(menu.lines));
  check("V4 …the OurProvisions row reads Working off grid", /OurProvisions\s*Working off grid/i.test(menu.card), JSON.stringify(menu.card));
  check("V4 …no changes line for one member, and no 'offline' anywhere in the menu", !/changes? will share/.test(menu.lines) && !/offline/i.test(menu.card), JSON.stringify(menu.card));
  await A.evaluate(() => { const d = document.querySelector(".offline-lines"); const overlay = d && d.parentElement && d.parentElement.parentElement; if (overlay) overlay.click(); });
  await sleep(400);

  // ── Verify 5: background and return; a weak-signal reload — the dots and the list are still there ──
  await visibility(A, "hidden"); await sleep(1500); await visibility(A, "visible"); await sleep(800);
  s = await shopState(A);
  check("V5 after background → return: the dots and the list are still there", s.dotsInCart.length === 2 && s.dotsAisle.length === 1 && s.rows >= W.length, `cart dots ${s.dotsInCart.length}, aisle dots ${s.dotsAisle.length}, rows ${s.rows}`);
  await setWeakSignal(true);
  await A.setOfflineMode(false);
  await sleep(2500);   // a tick or two: the flush tries, fails as transient, stays queued
  await A.reload({ waitUntil: "domcontentloaded" });
  const restored = await waitFor(async () => { const x = await shopState(A); return x.dotsInCart.length === 2 && x.dotsAisle.length === 1 && x; }, 15000, 300);
  s = restored || (await shopState(A));
  await shot(A, "offline-v5");
  check("V5 weak-signal reload: the list and the three dots are restored from the phone", !!restored && s.rows >= W.length, `cart dots ${JSON.stringify(s.dotsInCart)}, aisle dots ${JSON.stringify(s.dotsAisle)}, rows ${s.rows}`);
  check("V5 the icon shows on one bar (the API failing, the device online)", s.indicator);
  const srv5 = await Promise.all([W[1], W[2], W[3]].map(rowOf));
  check("V5 still nothing on the server", srv5.map((r) => r.status).join() === "pending,pending,bought", JSON.stringify(srv5.map((r) => r.status)));

  // ── Verify 6: reconnect — no message; the dots clear; the icon goes; the second phone has it ──
  await startSampler(A);
  const statusTexts = [];
  await A.exposeFunction("__statusSeen", (t) => statusTexts.push(t)).catch(() => {});
  await A.evaluate(() => { window.__obs = new MutationObserver(() => { document.querySelectorAll('[role="status"]').forEach((e) => window.__statusSeen(e.innerText.trim())); }); window.__obs.observe(document.body, { subtree: true, childList: true, characterData: true }); });
  await setWeakSignal(false);
  await visibility(A, "visible");
  const synced = await waitFor(settled, 30000, 300);
  const goneIcon = await waitFor(async () => !(await shopState(A)).indicator, 15000, 300);
  const beaconed = await waitFor(async () => (await sampled(A)).beacons >= 1, 4000, 100);
  await sleep(7000);   // the sweep's two turns, then rest: it never loops
  await A.evaluate(() => window.__obs && window.__obs.disconnect());
  const samp6 = await stopSampler(A);
  s = await shopState(A);
  await shot(A, "offline-v6");
  check("V6 reconnect: the dots clear and nothing is left queued", !!synced);
  check("V6 the dots return in place of OFF GRID", !!goneIcon);
  check("V6 …with exactly one beacon, then rest", !!beaconed && samp6.beacons === 1 && !(await A.evaluate(() => document.querySelector(".harbor-light").getAttribute("data-beacon") === "on")), `beacons ${samp6.beacons}`);
  check("V6 no message on the way back (no Back online, no Syncing…)", !statusTexts.some((t) => OLD_COPY.test(t) || /online/i.test(t)) && !s.oldCopy, JSON.stringify([...new Set(statusTexts)]));
  const srv6 = await Promise.all([W[1], W[2], W[3]].map(rowOf));
  check("V6 the server has W1 ✓, W2 ✓, W3 unchecked, checks stamped with their TAP times", srv6.map((r) => r.status).join() === "bought,bought,pending" && [srv6[0], srv6[1]].map((r) => Date.parse(r.status_changed_at)).sort().join() === tapTimes.map(Date.parse).join(), JSON.stringify(srv6.map((r) => [r.status, r.status_changed_at])) + " taps " + JSON.stringify(tapTimes));
  const bSees = async () => B.evaluate((inCart, toFind) => {
    const tray = document.querySelector(".tray-head"); if (tray && tray.getAttribute("aria-expanded") !== "true") tray.click();
    const nm = (b) => (b.querySelector(".sr-only") || b).innerText.trim();
    const cart = [...document.querySelectorAll(".tray-body button.shop-check")].map(nm);
    const find = [...document.querySelectorAll("button.shop-check")].filter((b) => !b.closest(".tray-body")).map(nm);
    return inCart.every((n) => cart.includes(n)) && toFind.every((n) => find.includes(n));
  }, [W[1], W[2]], [W[3]]);
  await B.goto(BASE + "#/shop", { waitUntil: "networkidle2" });
  check("V6 the second phone (tab B) shows W1 and W2 in its cart, W3 to find", !!(await waitFor(bSees, 15000, 500)));
  // Slice 1 V10 (R3): the trip started at the first queued tap; events carry tap times.
  const opened = await waitFor(async () => (await rest("GET", `shopping_sessions?select=id,started_at,created_at&household_id=eq.${HH}&ended_at=is.null&order=created_at.desc&limit=1`))[0], 15000, 1000);
  check("V8·V10 the trip's session starts at the first queued offline tap", !!opened && Date.parse(opened.started_at) === Date.parse(tapTimes[0]), `${opened && opened.started_at} vs ${tapTimes[0]}`);
  const ev = await rest("GET", `list_item_events?select=list_item_id,event_type,created_at&household_id=eq.${HH}&list_item_id=in.(${[srv6[0], srv6[1]].map((r) => r.id).join(",")})&created_at=gte.${encodeURIComponent(t0Iso)}&order=created_at.asc`);
  check("V8·V10 each confirmed check is logged once, at its tap time", ev.filter((e) => e.event_type === "checked").length === 2 && [srv6[0], srv6[1]].every((r) => ev.some((e) => e.list_item_id === r.id && Date.parse(e.created_at) === Date.parse(r.status_changed_at))), JSON.stringify(ev));

  // ── Verify 8: slice 1's conflict cases still pass ──
  await setStatus(W[5], "pending"); await setStatus(W[6], "pending"); await setStatus(W[0], "pending");
  await waitFor(async () => { const x = await shopState(A); return [W[5], W[6], W[0]].every((n) => x.unchecked.includes(n)); }, 10000);
  // V6: A checks offline, B changes the check AFTER → B wins, silently
  await A.setOfflineMode(true); await sleep(500);
  const v6From = new Date(Date.now() - 1000).toISOString();
  await tapAisle(A, W[5]); await sleep(1200);
  await setStatus(W[5], "bought"); await setStatus(W[5], "pending");
  await A.setOfflineMode(false);
  await waitFor(settled, 20000); await sleep(3000);
  s = await shopState(A);
  const r6 = await rowOf(W[5]);
  check("V8·V6 B's later change wins: unchecked on both, no notice", r6.status === "pending" && s.unchecked.includes(W[5]) && !s.error, `server ${r6.status}; error ${JSON.stringify(s.error)}`);
  const ev6 = await rest("GET", `list_item_events?select=event_type,created_at&list_item_id=eq.${r6.id}&created_at=gte.${encodeURIComponent(v6From)}`);
  check("V8·V6 the losing check logged nothing", ev6.length === 0, JSON.stringify(ev6));
  // V7: B changes first, then A taps offline → A wins
  await setStatus(W[6], "bought"); await setStatus(W[6], "pending");
  await sleep(2500);
  await A.setOfflineMode(true); await sleep(500);
  await tapAisle(A, W[6]); await sleep(500);
  await A.setOfflineMode(false);
  await waitFor(settled, 20000); await sleep(2500);
  s = await shopState(A);
  const r7 = await rowOf(W[6]);
  check("V8·V7 A's later tap wins: checked on the server and in A's cart", r7.status === "bought" && s.inCart.includes(W[6]), `server ${r7.status}`);
  // V7b (R1): A checks offline, B bumps +1 after → still checked, quantity 2
  await A.setOfflineMode(true); await sleep(500);
  await tapAisle(A, W[5]); await sleep(1200);
  await rpc("adjust_list_item_quantity", { p_household_id: HH, p_catalog_item_id: CID[W[5]], p_delta: 1, p_price_per_unit: null });
  await A.setOfflineMode(false);
  await waitFor(settled, 20000); await sleep(2500);
  const r7b = await rowOf(W[5]);
  s = await shopState(A);
  check("V8·V7b a +1 after the offline check doesn't cancel it: checked, quantity 2", r7b.status === "bought" && r7b.quantity === 2 && !s.unchecked.includes(W[5]), `server ${r7b.status} ×${r7b.quantity}`);
  // V8: B deletes the item while A checked it offline → no error, gone on both
  await A.setOfflineMode(true); await sleep(500);
  await tapAisle(A, W[0]); await sleep(800);
  await rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: CID[W[0]] });
  await A.setOfflineMode(false);
  await waitFor(settled, 20000); await sleep(3000);
  s = await shopState(A);
  const r8 = await rowOf(W[0]);
  const onA = await A.evaluate((n) => [...document.querySelectorAll("button.shop-check")].some((b) => (b.querySelector(".sr-only") || b).innerText.trim().startsWith(n)), W[0]);
  check("V8·V8 deleted on B while checked offline on A: no error, gone on both", !!r8.deleted_at && !onA && !s.error, `deleted ${!!r8.deleted_at}; on A ${onA}; error ${JSON.stringify(s.error)}`);

  // ── Verify 7: finish the list offline and Wrap up — the normal card; the trip closes after reconnect ──
  const cycleBefore = (await rest("GET", `provision_cycles?select=id&household_id=eq.${HH}&closed_at=is.null&limit=1`))[0];
  await A.setOfflineMode(true); await sleep(600);
  for (let k = 0; k < 20; k++) {
    const nxt = (await shopState(A)).unchecked[0];
    if (!nxt) break;
    await tapAisle(A, nxt); await sleep(250);
  }
  await sleep(HOLD_AND_MOVE_MS + 5500);   // the holds, then the Undo toasts expire; All done waits for them
  s = await shopState(A);
  await shot(A, "offline-v7-done");
  check("V7 every item checked offline → the normal All done card with Wrap up", /^All done\. Everything on your list is in the cart\./.test(s.allDone) && /Wrap up trip/i.test(s.allDone), JSON.stringify(s.allDone));
  // The second phone adds something while A is still offline: the Wrap up must never archive it.
  await rpc("adjust_list_item_quantity", { p_household_id: HH, p_catalog_item_id: CID[PARTNER], p_delta: 1, p_price_per_unit: null });
  const wrapTapFrom = Date.now() + (skewMs || 0);
  await A.evaluate(() => { const b = document.querySelector(".all-done .all-done-btn"); if (b) b.click(); });
  const summary = await waitFor(async () => { const x = await shopState(A); return x.summary && x; }, 5000, 200);
  await shot(A, "offline-v7-wrapped");
  check("V7 Wrap up offline: the trip summary, as online", !!summary);
  const wq = await wrapInStorage(A);
  check("V7 the Wrap up waits on the phone, behind the checks", !!wq && Object.keys(await queued(A)).length > 0, `wrap ${!!wq}; checks queued ${Object.keys(await queued(A)).length}`);
  await A.evaluate(() => { const d = document.querySelector('[role="dialog"][aria-label="Trip wrapped"]'); const o = d && d.closest(".modal-overlay"); if (o) o.click(); });
  await sleep(500);
  s = await shopState(A);
  check("V7 on the phone the list is wrapped up (no rows left)", s.rows === 0, `rows ${s.rows}`);
  const stillLive = await rest("GET", `list_items?select=id&household_id=eq.${HH}&deleted_at=is.null&catalog_item_id=in.(${W.slice(1).map((n) => CID[n]).join(",")})`);
  check("V7 …and nothing is archived on the server yet", stillLive.length === 6, `live ${stillLive.length}`);
  await A.setOfflineMode(false);
  const closed = await waitFor(async () => (await wrapInStorage(A)) === null && Object.keys(await queued(A)).length === 0, 30000, 500);
  await sleep(2500);
  check("V7 reconnect: the queued checks and the Wrap up have gone out", !!closed);
  const after = await rest("GET", `list_items?select=id,catalog_item_id,status,deleted_at&household_id=eq.${HH}&catalog_item_id=in.(${[...W.slice(1), PARTNER].map((n) => CID[n]).join(",")})&deleted_at=is.null`);
  const partnerLive = after.find((r) => r.catalog_item_id === CID[PARTNER]);
  check("V7 the trip's items are archived on the server", after.filter((r) => r.catalog_item_id !== CID[PARTNER]).length === 0, JSON.stringify(after));
  check("V7 the partner's add made during the offline trip is NOT archived (carried forward)", !!partnerLive && partnerLive.status === "pending", JSON.stringify(partnerLive));
  const cyc = await rest("GET", `provision_cycles?select=id,closed_at&id=eq.${cycleBefore && cycleBefore.id}`);
  check("V7 the trip's cycle is closed on the server", !!cyc[0] && !!cyc[0].closed_at, JSON.stringify(cyc));
  const sessEnded = await rest("GET", `shopping_sessions?select=id,started_at,ended_at&id=eq.${opened && opened.id}`);
  const endedAt = sessEnded[0] && Date.parse(sessEnded[0].ended_at);
  check("V7 the trip's session ended at the Wrap up TAP, not at the reconnect", !!endedAt && Math.abs(endedAt - wrapTapFrom) < 4000, `${sessEnded[0] && sessEnded[0].ended_at} vs tap ≈ ${new Date(wrapTapFrom).toISOString()}`);
  s = await shopState(A);
  check("V7 tab A now shows the server's list: the partner's add, to find", s.unchecked.includes(PARTNER) && s.rows === 1, `rows ${s.rows}; unchecked ${JSON.stringify(s.unchecked)}`);

  // ── Verify 9: switch tabs online — one beacon after each tab's first fetch; none if it fails; none with Reduce Motion ──
  const switchTab = (hash) => A.evaluate((h) => { window.location.hash = h; }, hash);
  await waitFor(async () => !(await shopState(A)).indicator, 15000, 300);
  await sleep(7000);   // any sweep still playing has rested
  // The beacon's shape, on the switch to Home: clockwise, ~3 s a turn, two turns.
  const bm = await measureBeacon(A, () => switchTab("#/home"));
  const clockwise = bm.tl.length === 2 && bm.tr.length === 2 && bm.bottom.length === 2 && bm.tl[0] < bm.tr[0] && bm.tr[0] < bm.bottom[0] && bm.bottom[0] < bm.tl[1];
  const turn = bm.tl.length === 2 ? bm.tl[1] - bm.tl[0] : null;
  check("V9 the beacon turns clockwise (top-left → top-right → bottom), two turns", clockwise, JSON.stringify(bm));
  check("V9 a turn takes ~3 s", turn !== null && Math.abs(turn - 3000) <= 300 && bm.tr.length === 2 && Math.abs((bm.tr[1] - bm.tr[0]) - 3000) <= 300, `turn ${turn} ms; top-right ${bm.tr.length === 2 ? bm.tr[1] - bm.tr[0] : "?"} ms`);
  check("V9 the beam only adds light: no dot below its resting brightness or opacity — before, during or after; no remount", bm.below.length === 0 && bm.svgCount === 1 && bm.restBefore && bm.restAfter, `samples ${bm.samples}; below rest ${bm.below.length} ${JSON.stringify(bm.below.slice(0, 5))}; SVG elements seen ${bm.svgCount}; rest before ${bm.restBefore}, after ${bm.restAfter}`);
  check("V9 …and it does lift above rest (the brighter gold #F2D49B = 609)", bm.peakSum >= 600, `peak r+g+b ${bm.peakSum}`);
  check("V9 a travelling beam: each dot's light overlaps the next (≈1 s apart, not steps)", bm.tr[0] - bm.tl[0] > 700 && bm.tr[0] - bm.tl[0] < 1300 && bm.bottom[0] - bm.tr[0] > 700 && bm.bottom[0] - bm.tr[0] < 1300, `gaps ${bm.tr[0] - bm.tl[0]} / ${bm.bottom[0] - bm.tr[0]} ms`);
  for (const tab of ["#/plan", "#/browse", "#/shop", "#/home"]) {
    await startSampler(A);
    await switchTab(tab);
    const one = await waitFor(async () => (await sampled(A)).beacons >= 1, 6000, 100);
    await sleep(7000);
    const sv = await stopSampler(A);
    check(`V9 ${tab.slice(2)}: one beacon after the tab's first fetch`, !!one && sv.beacons === 1, `beacons ${sv.beacons}`);
  }
  await A.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await startSampler(A);
  await switchTab("#/plan");
  await sleep(5000);
  let sv = await stopSampler(A);
  check("V9 Reduce Motion: no beacon on a tab switch", sv.beacons === 0, `beacons ${sv.beacons}`);
  await A.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
  await sleep(3500);
  await setWeakSignal(true);
  await startSampler(A);
  await switchTab("#/shop");
  await sleep(5000);
  sv = await stopSampler(A);
  check("V9 a tab whose first fetch fails: no beacon (and OFF GRID shows)", sv.beacons === 0 && (await shopState(A)).indicator, `beacons ${sv.beacons}`);
  await setWeakSignal(false);
  await waitFor(async () => !(await shopState(A)).indicator, 20000, 300);
  await shot(A, "offline-v9");

  check("the queue is empty at the end", Object.keys(await queueInStorage(A)).length === 0 && !(await wrapInStorage(A)), JSON.stringify(await queueInStorage(A)));
  const ck = await cacheKeys(A);
  check("the cached list is stored for this person at this place only", ck.length === 1 && ck[0].endsWith(`:${HH}`), JSON.stringify(ck.map((k) => k.replace(/:user_[^:]+:/, ":<clerk>:"))));

  // ── tidy: the walk's items removed, its sessions ended ──
  for (const n of [...W, PARTNER]) await rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: CID[n] }).catch(() => {});
  const openAfter = await rest("GET", `shopping_sessions?select=id&household_id=eq.${HH}&ended_at=is.null`);
  for (const x of openAfter) await rest("PATCH", `shopping_sessions?id=eq.${x.id}`, { ended_at: new Date().toISOString() });
  log(`tidied: walk items removed, ${openAfter.length} session(s) ended`);

  await B.close();
  log(`${results.filter((r) => r.ok).length}/${results.length} PASS${fails ? `, ${fails} FAILED` : ""}`);
  await browser.disconnect();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => { console.error(e); process.exit(2); });
