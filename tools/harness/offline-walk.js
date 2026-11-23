// offline-walk.js — the SPEC_offline_checkoff slice 1 pre-walk (amendment 2026-11-23, Verify 1–8, 10, 11
// is shop-burst.js). Dev only, Cody Test House, signed in already (signin.js).
//   Tab A is the phone under test: offline by page.setOfflineMode, weak signal (the shell loads, the API
//     doesn't) by aborting every *.supabase.co request.
//   Tab B is only the second phone's TOKEN: its writes go to dev's PostgREST straight from here, as
//     qty-race.js does (same account; the conflict rule is about tap times, not who calls). Tab B is
//     opened before anything is queued, and never checks anything in its UI, so it never touches the
//     shared localStorage queue.
// The walk adds six items of its own (W1–W6, seeds not on the list), snapshots every other row's status
// first, and puts the list back at the end: other rows to their old status, its own items removed, the
// sessions it opened ended. Screenshots: out/offline-*.png.
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
const shopState = (page) => page.evaluate(() => {
  const nm = (b) => (b.querySelector(".sr-only") || b).innerText.trim();
  const aisle = [...document.querySelectorAll(".list-item")].filter((r) => !r.closest(".tray-body"));
  const waiting = aisle.filter((r) => r.classList.contains("waiting")).map((r) => nm(r.querySelector("button.shop-check")));
  const unchecked = aisle.map((r) => r.querySelector('button.shop-check[aria-checked="false"]')).filter(Boolean).map(nm);
  const tray = (document.querySelector(".tray-sub") || {}).innerText || "";
  const pillEl = [...document.querySelectorAll('[role="status"]')].find((e) => /check|Syncing|Reconnecting|Offline|Back online/.test(e.innerText));
  const done = document.querySelector(".all-done");
  const err = [...document.querySelectorAll("div")].find((d) => /^Could not update item/.test((d.innerText || "").trim()));
  return {
    waiting, unchecked,
    trayCount: Number((tray.match(/\d+/) || [0])[0]),
    pill: pillEl ? pillEl.innerText.trim() : "",
    allDone: done ? done.innerText.replace(/\s+/g, " ").trim() : "",
    error: err ? err.innerText.trim().slice(0, 80) : "",
    rows: aisle.length,
  };
});
const tap = (page, name) => page.evaluate((name) => {
  const b = [...document.querySelectorAll("button.shop-check")].find((x) => !x.closest(".tray-body") && (x.querySelector(".sr-only") || x).innerText.trim() === name);
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
const cacheKeys = (page) => page.evaluate(() => { const o = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("op_list_cache:")) o.push(k); } return o; });
const waitFor = async (fn, ms = 10000, step = 200) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await sleep(step); } return v; };
const visibility = (page, state) => page.evaluate((state) => {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  Object.defineProperty(document, "hidden", { value: state === "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}, state);

let blocking = false;
async function setWeakSignal(on) {
  blocking = on;
  await A.setRequestInterception(on);
}

(async () => {
  const browser = await connect();
  A = await firstPage(browser);
  // Request interception is on only for V4's weak signal (an intercepted page stalled the session insert
  // until interception was turned off — a harness artefact, seen in the first runs).
  A.on("request", (req) => {
    if (blocking && /supabase\.co/.test(req.url())) { req.abort("internetdisconnected").catch(() => {}); return; }
    req.continue().catch(() => {});
  });
  await A.goto(BASE + "#/shop", { waitUntil: "networkidle2" });
  await A.waitForFunction(() => window.Clerk && window.Clerk.user, { timeout: 30000 });
  B = await browser.newPage();
  await B.goto(BASE + "#/home", { waitUntil: "networkidle2" });
  await B.waitForFunction(() => window.Clerk && window.Clerk.session, { timeout: 30000 });
  // Tab A is the phone in the shopper's hand: in front. A background tab has its timers throttled and its
  // geolocation request held until it's visible — startSession waits on that (seen in the first runs:
  // the trip's session was written only when tab B closed).
  await A.bringToFront();
  await sleep(2500);
  const bundle = await A.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /main\.[a-z0-9]+\.js/.test(s)) || "");
  log("bundle " + bundle.replace(/.*\//, ""));

  // ── setup ──
  const HH = (await rest("GET", `households?select=id&name=eq.${encodeURIComponent(HOUSE)}&deleted_at=is.null`))[0]?.id;
  if (!HH) throw new Error(`no ${HOUSE}`);
  const live = await rest("GET", `list_items?select=id,catalog_item_id,status,quantity&household_id=eq.${HH}&deleted_at=is.null`);
  const snapshot = new Map(live.map((r) => [r.id, r.status]));
  log(`skew server − local ${skewMs} ms; ${live.length} live rows before the walk`);
  const onList = new Set(live.map((r) => r.catalog_item_id));
  const seeds = await rest("GET", `catalog_items?select=id,name&is_global=eq.true&deleted_at=is.null&order=name&limit=300`);
  const free = seeds.filter((s) => !onList.has(s.id) && /^[A-Za-z][A-Za-z ]+$/.test(s.name)).slice(0, 6);
  if (free.length < 6) throw new Error("fewer than 6 seed items off the list");
  const W = free.map((s) => s.name);
  const CID = Object.fromEntries(free.map((s) => [s.name, s.id]));
  for (const s of free) await rpc("adjust_list_item_quantity", { p_household_id: HH, p_catalog_item_id: s.id, p_delta: 1, p_price_per_unit: null });
  const rowOf = async (name) => (await rest("GET", `list_items?select=id,status,quantity,deleted_at,status_changed_at&household_id=eq.${HH}&catalog_item_id=eq.${CID[name]}`))[0];
  const setStatus = async (name, status) => { const r = await rowOf(name); await rest("PATCH", `list_items?id=eq.${r.id}`, { status }); };
  log(`walk items: ${JSON.stringify(W)}`);
  // No open session for this house, so the trip the walk starts offline is a new one (V10).
  const openBefore = await rest("GET", `shopping_sessions?select=id&household_id=eq.${HH}&ended_at=is.null`);
  for (const s of openBefore) await rest("PATCH", `shopping_sessions?id=eq.${s.id}`, { ended_at: new Date().toISOString() });
  log(`ended ${openBefore.length} open session(s) first`);
  const t0Iso = new Date(Date.now() + (skewMs || 0) - 2000).toISOString();
  const sawAll = await waitFor(async () => { const s = await shopState(A); return W.every((n) => s.unchecked.includes(n)) && s; }, 15000);
  check("setup: tab A shows the six walk items unchecked", !!sawAll && W.every((n) => sawAll.unchecked.includes(n)));
  check("setup: no queue stored before the walk", Object.keys(await queueInStorage(A)).length === 0);

  // ── V1: offline, 3 checks → waiting rows in place, pill ──
  await A.setOfflineMode(true);
  await sleep(600);
  const trayBefore = (await shopState(A)).trayCount;
  for (const n of W.slice(0, 3)) { await tap(A, n); await sleep(350); }
  await sleep(500);
  let s = await shopState(A);
  await shot(A, "offline-v1");
  check("V1 three offline checks collapse to waiting rows, in place", W.slice(0, 3).every((n) => s.waiting.includes(n)) && s.trayCount === trayBefore, `waiting ${JSON.stringify(s.waiting)}, tray ${trayBefore}→${s.trayCount}`);
  check("V1 pill: Offline · 3 checks waiting to sync", s.pill === "Offline · 3 checks waiting to sync", JSON.stringify(s.pill));
  const srv1 = await Promise.all(W.slice(0, 3).map(rowOf));
  check("V1 nothing reached the server", srv1.every((r) => r.status === "pending"), JSON.stringify(srv1.map((r) => r.status)));

  // ── V2: Undo one, re-tap another → both restore, count 1 ──
  const undid = await undoToast(A, W[0]);
  await sleep(300);
  await tap(A, W[1]);
  await sleep(500);
  s = await shopState(A);
  await shot(A, "offline-v2");
  check("V2 Undo one and re-tap another: both full rows again, 1 waiting", undid && s.waiting.length === 1 && s.waiting[0] === W[2] && s.unchecked.includes(W[0]) && s.unchecked.includes(W[1]), `undo clicked ${undid}; waiting ${JSON.stringify(s.waiting)}`);
  check("V2 pill: Offline · 1 check waiting to sync", s.pill === "Offline · 1 check waiting to sync", JSON.stringify(s.pill));

  // ── V3: one more, background and return ──
  await tap(A, W[3]);
  await sleep(500);
  await visibility(A, "hidden"); await sleep(1500); await visibility(A, "visible"); await sleep(800);
  s = await shopState(A);
  const q3 = Object.values(await queueInStorage(A))[0] || {};
  check("V3 after background → return: the 2 waiting rows are still there (and stored)", s.waiting.length === 2 && s.waiting.includes(W[2]) && s.waiting.includes(W[3]) && Object.keys(q3).length === 2, `waiting ${JSON.stringify(s.waiting)}, stored ${Object.keys(q3).length}`);
  check("V3 pill: Offline · 2 checks waiting to sync", s.pill === "Offline · 2 checks waiting to sync", JSON.stringify(s.pill));
  const tapTimes = Object.values(q3).map((e) => e.tapAt).sort();

  // ── V4: weak-signal reload (shell loads, API blocked) → list + waiting rows restored ──
  await setWeakSignal(true);
  await A.setOfflineMode(false);
  await sleep(2500);   // a tick or two: the flush tries, fails as transient, stays queued
  const stillQueued = Object.keys(Object.values(await queueInStorage(A))[0] || {}).length;
  await A.reload({ waitUntil: "domcontentloaded" });
  const restored = await waitFor(async () => { const x = await shopState(A); return x.waiting.length === 2 && x; }, 15000, 300);
  s = restored || (await shopState(A));
  await shot(A, "offline-v4");
  check("V4 online with the API blocked, the queue stays queued (transient failures)", stillQueued === 2, `stored ${stillQueued}`);
  check("V4 weak-signal reload: the list and the 2 waiting rows are restored from the phone", s.waiting.length === 2 && s.rows >= W.length, `waiting ${JSON.stringify(s.waiting)}, rows ${s.rows}`);
  check("V4 pill (online, API unreachable): Syncing 2 checks…", s.pill === "Syncing 2 checks…", JSON.stringify(s.pill));
  const srv4 = await Promise.all([W[2], W[3]].map(rowOf));
  check("V4 still nothing on the server", srv4.every((r) => r.status === "pending"));

  // ── V5: reconnect → both sync, slide into In cart together, the second phone has them ──
  await A.evaluate(() => {
    window.__left = {};
    window.__pills = [];
    window.__sampler = setInterval(() => {
      const now = performance.now();
      const nm = (b) => (b.querySelector(".sr-only") || b).innerText.trim();
      const waiting = new Set([...document.querySelectorAll(".list-item.waiting")].map((r) => nm(r.querySelector("button.shop-check"))));
      for (const n of window.__watch || []) if (!waiting.has(n) && window.__left[n] === undefined) window.__left[n] = now;
      const p = [...document.querySelectorAll('[role="status"]')].map((e) => e.innerText.trim()).find((t) => /check/.test(t));
      if (p && window.__pills[window.__pills.length - 1] !== p) window.__pills.push(p);
    }, 25);
  });
  await A.evaluate((w) => { window.__watch = w; }, [W[2], W[3]]);
  await setWeakSignal(false);
  await visibility(A, "visible");
  const synced = await waitFor(async () => { const x = await shopState(A); return x.waiting.length === 0 && x; }, 30000, 300);
  await sleep(1500);
  const left = await A.evaluate(() => { clearInterval(window.__sampler); return { left: window.__left, pills: window.__pills }; });
  s = await shopState(A);
  await shot(A, "offline-v5");
  const dt = Math.abs((left.left[W[2]] ?? 0) - (left.left[W[3]] ?? 1e9));
  check("V5 reconnect: both waiting rows leave together (one batch)", !!synced && dt <= 60, `Δ ${Math.round(dt)} ms`);
  check("V5 they are in In cart (not in the aisle) after the slide", !s.unchecked.includes(W[2]) && !s.unchecked.includes(W[3]) && !s.waiting.length, `tray ${s.trayCount}`);
  check("V5 the pill read Syncing 2 checks… on the way, and is gone now", left.pills.includes("Syncing 2 checks…") && !/check/.test(s.pill), JSON.stringify(left.pills) + " now " + JSON.stringify(s.pill));
  const srv5 = await Promise.all([W[2], W[3]].map(rowOf));
  check("V5 the server has both bought, stamped with their TAP times", srv5.every((r) => r.status === "bought") && srv5.map((r) => Date.parse(r.status_changed_at)).sort().join() === tapTimes.map(Date.parse).join(), JSON.stringify(srv5.map((r) => [r.status, r.status_changed_at])) + " taps " + JSON.stringify(tapTimes));
  const bSees = await waitFor(() => B.evaluate((names) => {
    const tray = document.querySelector(".tray-head"); if (tray && tray.getAttribute("aria-expanded") !== "true") tray.click();
    const inTray = [...document.querySelectorAll(".tray-body button.shop-check")].map((b) => (b.querySelector(".sr-only") || b).innerText.trim());
    return names.every((n) => inTray.includes(n));
  }, [W[2], W[3]]), 12000, 500).catch(() => false);
  if (!bSees) { await B.goto(BASE + "#/shop", { waitUntil: "networkidle2" }); }
  const bSees2 = bSees || (await waitFor(() => B.evaluate((names) => {
    const tray = document.querySelector(".tray-head"); if (tray && tray.getAttribute("aria-expanded") !== "true") tray.click();
    const inTray = [...document.querySelectorAll(".tray-body button.shop-check")].map((b) => (b.querySelector(".sr-only") || b).innerText.trim());
    return names.every((n) => inTray.includes(n));
  }, [W[2], W[3]]), 12000, 500));
  check("V5 the second phone (tab B) shows both in its In cart", !!bSees2);

  // ── V10: the trip started at the first queued tap; events carry tap times ──
  const sess = await rest("GET", `shopping_sessions?select=id,started_at&household_id=eq.${HH}&started_at=gte.${encodeURIComponent(t0Iso)}&order=created_at.desc&limit=3`);
  const opened = await waitFor(async () => (await rest("GET", `shopping_sessions?select=id,started_at,created_at&household_id=eq.${HH}&ended_at=is.null&order=created_at.desc&limit=1`))[0], 15000, 1000);
  check("V10 the trip's session starts at the first queued offline tap", !!opened && Date.parse(opened.started_at) === Date.parse(tapTimes[0]), `${opened && opened.started_at} vs ${tapTimes[0]} (created ${opened && opened.created_at}; ${sess.length} since t0)`);
  const rows5 = await Promise.all([W[2], W[3]].map(rowOf));
  const ev = await rest("GET", `list_item_events?select=list_item_id,event_type,created_at&household_id=eq.${HH}&list_item_id=in.(${rows5.map((r) => r.id).join(",")})&created_at=gte.${encodeURIComponent(t0Iso)}&order=created_at.asc`);
  const evOk = rows5.every((r, i) => ev.some((e) => e.list_item_id === r.id && e.event_type === "checked" && Date.parse(e.created_at) === Date.parse(srv5[i].status_changed_at)));
  check("V10 each confirmed check is logged once, at its tap time", evOk && ev.filter((e) => e.event_type === "checked").length === 2, JSON.stringify(ev));

  // ── V5b: check every remaining item offline → offline All done; reconnect → the normal card ──
  await A.setOfflineMode(true);
  await sleep(600);
  for (let k = 0; k < 60; k++) {
    const nxt = (await shopState(A)).unchecked[0];
    if (!nxt) break;
    await tap(A, nxt); await sleep(250);
  }
  await sleep(6000);   // the Undo toasts expire; All done waits for them
  s = await shopState(A);
  await shot(A, "offline-v5b");
  check("V5b every item checked offline → All picked up · Will sync when you're back online", /^All picked up Will sync when you're back online\./.test(s.allDone) && !/Wrap up/.test(s.allDone), JSON.stringify(s.allDone));
  await A.setOfflineMode(false);
  const normal = await waitFor(async () => { const x = await shopState(A); return /^All done\./.test(x.allDone) && x; }, 30000, 300);
  await shot(A, "offline-v5b-online");
  check("V5b reconnect → the normal All done card", !!normal, JSON.stringify((normal || (await shopState(A))).allDone));

  // ── V6: A checks offline, B changes the check AFTER → B wins, silently ──
  await setStatus(W[4], "pending"); await setStatus(W[5], "pending"); await setStatus(W[0], "pending");
  await waitFor(async () => { const x = await shopState(A); return [W[4], W[5], W[0]].every((n) => x.unchecked.includes(n)); }, 10000);
  await A.setOfflineMode(true); await sleep(500);
  const v6From = new Date(Date.now() - 1000).toISOString();
  await tap(A, W[4]); await sleep(1200);
  await setStatus(W[4], "bought"); await setStatus(W[4], "pending");   // B checks and unchecks, after A's tap
  await A.setOfflineMode(false);
  await waitFor(async () => { const x = await shopState(A); return !x.waiting.length && x; }, 20000);
  await sleep(3000);
  s = await shopState(A);
  const r6 = await rowOf(W[4]);
  check("V6 B's later change wins: Milk-equivalent ends unchecked on both, no notice", r6.status === "pending" && s.unchecked.includes(W[4]) && !s.error, `server ${r6.status}; A unchecked ${s.unchecked.includes(W[4])}; error ${JSON.stringify(s.error)}`);
  const ev6 = await rest("GET", `list_item_events?select=event_type,created_at&list_item_id=eq.${r6.id}&created_at=gte.${encodeURIComponent(v6From)}`);
  check("V6 the losing check logged nothing", ev6.length === 0, JSON.stringify(ev6));

  // ── V7: B changes first, then A taps offline → A wins ──
  await setStatus(W[5], "bought"); await setStatus(W[5], "pending");
  await sleep(2500);
  await A.setOfflineMode(true); await sleep(500);
  await tap(A, W[5]); await sleep(500);
  await A.setOfflineMode(false);
  await waitFor(async () => { const x = await shopState(A); return !x.waiting.length && x; }, 20000);
  await sleep(2500);
  s = await shopState(A);
  const r7 = await rowOf(W[5]);
  check("V7 A's later tap wins: checked on the server and in A's cart", r7.status === "bought" && !s.unchecked.includes(W[5]), `server ${r7.status}`);

  // ── V7b (R1): A checks offline, B bumps +1 after → still checked, quantity 2 ──
  await A.setOfflineMode(true); await sleep(500);
  await tap(A, W[4]); await sleep(1200);
  await rpc("adjust_list_item_quantity", { p_household_id: HH, p_catalog_item_id: CID[W[4]], p_delta: 1, p_price_per_unit: null });
  await A.setOfflineMode(false);
  await waitFor(async () => { const x = await shopState(A); return !x.waiting.length && x; }, 20000);
  await sleep(2500);
  const r7b = await rowOf(W[4]);
  s = await shopState(A);
  check("V7b a +1 after the offline check doesn't cancel it: checked, quantity 2", r7b.status === "bought" && r7b.quantity === 2 && !s.unchecked.includes(W[4]), `server ${r7b.status} ×${r7b.quantity}`);

  // ── V8: B deletes the item while A checked it offline → no error, gone on both ──
  await A.setOfflineMode(true); await sleep(500);
  await tap(A, W[0]); await sleep(800);
  await rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: CID[W[0]] });
  await A.setOfflineMode(false);
  await waitFor(async () => { const x = await shopState(A); return !x.waiting.length && x; }, 20000);
  await sleep(3000);
  s = await shopState(A);
  const r8 = await rowOf(W[0]);
  const onA = await A.evaluate((n) => [...document.querySelectorAll("button.shop-check")].some((b) => (b.querySelector(".sr-only") || b).innerText.trim() === n), W[0]);
  check("V8 deleted on B while checked offline on A: no error, gone on both", !!r8.deleted_at && !onA && !s.error, `deleted ${!!r8.deleted_at}; on A ${onA}; error ${JSON.stringify(s.error)}`);

  check("the queue is empty at the end", Object.keys(await queueInStorage(A)).length === 0, JSON.stringify(await queueInStorage(A)));
  const ck = await cacheKeys(A);
  check("the cached list is stored for this person at this place only", ck.length === 1 && ck[0].endsWith(`:${HH}`), JSON.stringify(ck.map((k) => k.replace(/:user_[^:]+:/, ":<clerk>:"))));

  // ── tidy: every other row back to its status, the walk's items removed, its sessions ended ──
  const now = await rest("GET", `list_items?select=id,status&household_id=eq.${HH}&deleted_at=is.null`);
  let put = 0;
  for (const r of now) {
    if (snapshot.has(r.id) && snapshot.get(r.id) !== r.status) { await rest("PATCH", `list_items?id=eq.${r.id}`, { status: snapshot.get(r.id) }); put++; }
  }
  for (const n of W) await rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: CID[n] }).catch(() => {});
  const openAfter = await rest("GET", `shopping_sessions?select=id&household_id=eq.${HH}&ended_at=is.null`);
  for (const x of openAfter) await rest("PATCH", `shopping_sessions?id=eq.${x.id}`, { ended_at: new Date().toISOString() });
  log(`tidied: ${put} rows back to their status, ${W.length} walk items removed, ${openAfter.length} session(s) ended`);

  await B.close();
  log(`${results.filter((r) => r.ok).length}/${results.length} PASS${fails ? `, ${fails} FAILED` : ""}`);
  await browser.disconnect();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => { console.error(e); process.exit(2); });
