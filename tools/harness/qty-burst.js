// qty-burst.js — SPEC_qty_increment V5: fast + taps on one Browse row over a throttled connection.
// Signed in already (signin.js). 10 bursts of 5 quick + taps on Carrots, each followed by 5 quick −
// taps back down. Per up-burst: the number on screen never goes DOWN mid-burst, settles at start + 5,
// and the server reads start + 5 (PostgREST, the page's own token). Per down-burst: never goes UP,
// settles back at start, the server agrees. The page's displayed quantity is sampled every 25 ms.
// Leaves Carrots as it found it. Throttle: OP_BURST_LATENCY ms (default 400) each way, 750 kbps.
//   node qty-burst.js                       dev
//   node -r ./local/use-local.js qty-burst.js   a local build
const fs = require("fs");
const path = require("path");
const lib = require("./lib");
const { log, sleep, connect, firstPage } = lib;
const BASE = lib.DEV_URL;
const ITEM = process.env.OP_BURST_ITEM || "Carrots";
const BURSTS = Number(process.env.OP_BURST_N || 10);
const TAPS = 5;
const LATENCY = Number(process.env.OP_BURST_LATENCY || 400);

function envLocal(name) {
  const raw = fs.readFileSync(path.join(lib.ROOT, ".env.local"), "utf8");
  const m = raw.match(new RegExp(`^${name}=(.*)$`, "m"));
  return m[1].trim();
}
const URL_ = envLocal("REACT_APP_SUPABASE_URL");
const ANON = envLocal("REACT_APP_SUPABASE_ANON_KEY");
if (!/zxwtxjjmssykhqrghouf/.test(URL_)) throw new Error("qty-burst runs on dev data only");

let fails = 0;
const check = (name, ok, detail = "") => { log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? "  " + detail : ""}`); if (!ok) fails++; };

(async () => {
  const browser = await connect();
  const page = await firstPage(browser);
  const rest = async (method, p, body) => {
    const t = await page.evaluate(() => window.Clerk.session.getToken({ template: "supabase" }));
    const r = await fetch(`${URL_}/rest/v1/${p}`, { method, headers: { apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${text.slice(0, 120)}`);
    return text ? JSON.parse(text) : null;
  };

  await page.goto(BASE + "#/browse", { waitUntil: "networkidle2" });
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForFunction(() => window.Clerk && window.Clerk.user, { timeout: 30000 });
  await sleep(3500);
  const bundle = await page.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /main\.[a-z0-9]+\.js/.test(s)) || "");
  log("bundle " + bundle.replace(/.*\//, ""));

  const HH = await page.evaluate(() => { try { return localStorage.getItem("op_active_household") ; } catch (e) { return null; } });
  const house = (await rest("GET", `households?select=id,name&deleted_at=is.null`));
  const hh = house.find((h) => h.id === HH) || house.find((h) => h.name === "Cody Test House");
  const CID = (await rest("GET", `catalog_items?select=id&name=eq.${encodeURIComponent(ITEM)}&is_global=eq.true&deleted_at=is.null`))[0].id;
  const server = async () => {
    const r = (await rest("GET", `list_items?select=quantity,deleted_at&household_id=eq.${hh.id}&catalog_item_id=eq.${CID}`))[0];
    return r && !r.deleted_at ? r.quantity : 0;
  };
  const before = await server();
  log(`${hh.name} · ${ITEM} · server before: ${before} · ${BURSTS} bursts of ${TAPS} · throttle ${LATENCY} ms`);

  // In-page: the row's displayed quantity (0 when it shows "Add"), and a tap on its + / − / Add.
  await page.evaluate((item) => {
    const rowEl = () => [...document.querySelectorAll(".item-row")].find((r) => (r.querySelector(".item-name") || {}).innerText === item);
    window.__qty = () => { const r = rowEl(); if (!r) return null; const d = r.querySelector(".qty-display"); return d ? Number(d.innerText) : 0; };
    window.__tap = (sign) => {
      const r = rowEl(); if (!r) return false;
      if (sign > 0 && r.querySelector(".add-btn")) { r.querySelector(".add-btn").click(); return true; }
      const btns = r.querySelectorAll(".qty-btn");
      if (!btns.length) return false;
      (sign > 0 ? btns[1] : btns[0]).click();
      return true;
    };
    window.__sample = () => { window.__samples = []; window.__sampler = setInterval(() => window.__samples.push(window.__qty()), 25); };
    window.__stop = () => { clearInterval(window.__sampler); return window.__samples; };
  }, ITEM);
  if ((await page.evaluate(() => window.__qty())) === null) throw new Error(`no Browse row named ${ITEM}`);

  const cdp = await page.target().createCDPSession();
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: LATENCY, downloadThroughput: 750 * 128, uploadThroughput: 750 * 128 });

  const settle = async (want) => {
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      const [shown, srv] = [await page.evaluate(() => window.__qty()), await server()];
      if (shown === want && srv === want) { await sleep(2500); if ((await page.evaluate(() => window.__qty())) === want) return { shown: want, srv }; }
      await sleep(300);
    }
    return { shown: await page.evaluate(() => window.__qty()), srv: await server() };
  };
  const burst = async (sign) => {
    await page.evaluate(() => window.__sample());
    for (let i = 0; i < TAPS; i++) { await page.evaluate((s) => window.__tap(s), sign); await sleep(90); }
  };
  const monotone = (xs, sign) => xs.filter((x) => x != null).every((x, i, a) => i === 0 || (sign > 0 ? x >= a[i - 1] : x <= a[i - 1]));

  let start = await page.evaluate(() => window.__qty());
  for (let b = 1; b <= BURSTS; b++) {
    await burst(+1);
    let end = await settle(start + TAPS);
    let samples = await page.evaluate(() => window.__stop());
    check(`burst ${b} up: ${start} → ${start + TAPS}`, monotone(samples, +1) && end.shown === start + TAPS && end.srv === start + TAPS,
      `shown ${end.shown} · server ${end.srv} · ${monotone(samples, +1) ? "never went down" : "WENT DOWN: " + JSON.stringify([...new Set(samples)])}`);
    await burst(-1);
    end = await settle(start);
    samples = await page.evaluate(() => window.__stop());
    check(`burst ${b} down: ${start + TAPS} → ${start}`, monotone(samples, -1) && end.shown === start && end.srv === start,
      `shown ${end.shown} · server ${end.srv} · ${monotone(samples, -1) ? "never went up" : "WENT UP: " + JSON.stringify([...new Set(samples)])}`);
    start = end.shown;
  }

  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const after = await server();
  if (after !== before) log(`note: server ${after} after vs ${before} before`);
  log(fails === 0 ? `ALL PASS: ${BURSTS * 2} bursts` : `FAIL: ${fails} of ${BURSTS * 2}`);
  browser.disconnect();
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error(e.message); process.exit(2); });
