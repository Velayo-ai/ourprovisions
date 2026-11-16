// qty-race.js — SPEC_qty_increment V3: two writes at the same moment on dev, Cody Test House.
// Signed in already (signin.js); the harness Chrome is only the token source. Two independent request
// clients (the same account: the race is about the household lock, not who is calling — ruled
// 2026-11-16) call dev's PostgREST straight, fired together with Promise.all, 20 rounds a case, the
// row reset between rounds:
//   (a) pick ∥ +1 on Carrots at 1                    → 3 every round
//   (b) +1 ∥ +1 on Carrots at 1                      → 3
//   (c) pick ∥ −1 on Carrots at 1                    → 1, live, labelled
//   (d) a meal's −contributed (2) ∥ pick, start 3/2   → start − 2 + 1, or 1 when it reached 0
// --legacy runs (a) with the pre-085 read-then-write `.update({ quantity })` instead of +1 — the
// negative control: it must lose a pick at least once in 20 rounds, proving the harness can see the
// failure. With no loss at 0 ms it reruns with a delay between the read and the write.
// Leaves Carrots as it found it (removed, or back at its quantity) and soft-deletes its "Race" ask.
//   node qty-race.js            the four cases          node qty-race.js --legacy   the control
const fs = require("fs");
const path = require("path");
const lib = require("./lib");
const { log, sleep, connect, firstPage } = lib;

const ROUNDS = Number(process.env.OP_RACE_ROUNDS || 20);
const LEGACY = process.argv.includes("--legacy");
const ITEM = process.env.OP_RACE_ITEM || "Carrots";
const HOUSE = process.env.OP_RACE_HOUSE || "Cody Test House";
const LABEL = "Race";

// Dev's URL and anon key from the repo's .env.local (dev); never printed.
function envLocal(name) {
  const raw = fs.readFileSync(path.join(lib.ROOT, ".env.local"), "utf8");
  const m = raw.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!m) throw new Error(`${name} missing from .env.local`);
  return m[1].trim();
}
const URL_ = envLocal("REACT_APP_SUPABASE_URL");
const ANON = envLocal("REACT_APP_SUPABASE_ANON_KEY");
if (!/zxwtxjjmssykhqrghouf/.test(URL_)) throw new Error("qty-race runs on dev only — .env.local is not dev");

let page;
const token = () => page.evaluate(() => window.Clerk.session.getToken({ template: "supabase" }));

// One request client: its own token fetch per call, its own HTTP request.
function client(name) {
  const call = async (method, p, body) => {
    const t = await token();
    const r = await fetch(`${URL_}/rest/v1/${p}`, {
      method,
      headers: { apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!r.ok) { const e = new Error(`${name} ${method} ${p.replace(/\?.*/, "")} ${r.status} ${data && data.code} ${data && data.message}`); e.data = data; throw e; }
    return data;
  };
  return {
    rpc: (fn, args) => call("POST", `rpc/${fn}`, args),
    get: (p) => call("GET", p),
    patch: (p, body) => call("PATCH", p, body),
  };
}
const A = client("A");
const B = client("B");

let HH, CID, ASK;
const row = async () => (await A.get(`list_items?select=id,quantity,status,deleted_at,picked_by_labels&household_id=eq.${HH}&catalog_item_id=eq.${CID}`))[0] || null;
const adjust = (c, delta) => c.rpc("adjust_list_item_quantity", { p_household_id: HH, p_catalog_item_id: CID, p_delta: delta, p_price_per_unit: null });
const pick = (c) => c.rpc("land_ask_picks", { p_household_id: HH, p_ask_id: ASK, p_catalog_item_ids: [CID] });
const reset = async (q) => {
  await A.rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: CID });
  const r = await adjust(A, q);
  if (r.quantity !== q) throw new Error(`reset to ${q} gave ${JSON.stringify(r)}`);
};
// The pre-085 manual +: read the shown quantity, add one on the phone, write the total.
const legacyPlus = async (c, delayMs) => {
  const r = (await c.get(`list_items?select=quantity&household_id=eq.${HH}&catalog_item_id=eq.${CID}`))[0];
  if (delayMs) await sleep(delayMs);
  await c.patch(`list_items?household_id=eq.${HH}&catalog_item_id=eq.${CID}`, { quantity: (r ? r.quantity : 0) + 1, status: "pending", deleted_at: null });
};

async function runCase(name, start, race, expectFn) {
  let losses = 0;
  const seen = {};
  for (let i = 0; i < ROUNDS; i++) {
    const s = typeof start === "function" ? start(i) : start;
    await reset(s);
    await race(i);
    const r = await row();
    const live = r && !r.deleted_at;
    const got = live ? `${r.quantity}${r.picked_by_labels ? " [" + r.picked_by_labels.join(",") + "]" : ""}` : "removed";
    seen[got] = (seen[got] || 0) + 1;
    const want = expectFn(s);
    if (got !== want) { losses++; log(`  round ${i + 1}: start ${s} → ${got}, want ${want}`); }
  }
  log(`${losses === 0 ? "PASS" : "FAIL"} ${name}: ${ROUNDS - losses}/${ROUNDS} rounds right, ${losses} lost  outcomes ${JSON.stringify(seen)}`);
  return losses;
}

(async () => {
  const browser = await connect();
  page = await firstPage(browser);
  if (!/dev\.ourprovisions/.test(page.url())) await page.goto(lib.DEV_URL, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => window.Clerk && window.Clerk.session, { timeout: 30000 });

  HH = (await A.get(`households?select=id&name=eq.${encodeURIComponent(HOUSE)}&deleted_at=is.null`))[0]?.id;
  CID = (await A.get(`catalog_items?select=id&name=eq.${encodeURIComponent(ITEM)}&is_global=eq.true&deleted_at=is.null`))[0]?.id;
  if (!HH || !CID) throw new Error(`no ${HOUSE} or no global ${ITEM}`);
  const before = await row();
  log(`dev ${URL_.replace(/^https:\/\//, "").slice(0, 8)}… · ${HOUSE} · ${ITEM} · before: ${before && !before.deleted_at ? before.quantity + " " + before.status : "not on the list"} · ${ROUNDS} rounds a case · two clients, one account`);

  // A throw-away ask with the item on its shelf, target 1, for the picks.
  ASK = require("crypto").randomUUID();
  await A.rpc("create_ask", { p_id: ASK, p_household_id: HH, p_label: LABEL, p_shelf_noun: null, p_screen_style: "standard", p_pick_target: 1, p_catalog_item_ids: [CID] });

  let total = 0;
  try {
    if (LEGACY) {
      log("--legacy: (a) with the pre-085 read-then-write .update({ quantity }) — must LOSE at least once");
      let lost = await runCase("legacy (a) pick ∥ read-then-write +1, 0 ms", 1, () => Promise.all([pick(B), legacyPlus(A, 0)]), () => "3 [Race]");
      if (lost === 0) {
        log("no loss at 0 ms — rerunning with 150 ms between the read and the write");
        lost = await runCase("legacy (a) pick ∥ read-then-write +1, 150 ms", 1, () => Promise.all([pick(B), legacyPlus(A, 150)]), () => "3 [Race]");
      }
      log(lost > 0 ? `CONTROL OK: the harness sees the lost update (${lost} of ${ROUNDS})` : "CONTROL FAILED: no lost update seen — the harness can't prove the fix");
      total = lost > 0 ? 0 : 1;
    } else {
      total += await runCase("(a) pick ∥ +1 at 1 → 3", 1, () => Promise.all([pick(B), adjust(A, 1)]), () => "3 [Race]");
      total += await runCase("(b) +1 ∥ +1 at 1 → 3", 1, () => Promise.all([adjust(A, 1), adjust(B, 1)]), () => "3");
      total += await runCase("(c) pick ∥ −1 at 1 → 1, live, labelled", 1, () => Promise.all([pick(B), adjust(A, -1)]), () => "1 [Race]");
      total += await runCase("(d) −contributed(2) ∥ pick, start 3 / 2 → start − 2 + 1 or 1", (i) => (i % 2 ? 2 : 3),
        () => Promise.all([adjust(A, -2), pick(B)]), (s) => `${Math.max(s - 2, 0) + 1} [Race]`);
      log(total === 0 ? `ALL PASS: 0 losses in ${ROUNDS * 4} rounds` : `FAIL: ${total} lost in ${ROUNDS * 4} rounds`);
    }
  } finally {
    // Put the item back, retire the ask.
    await A.rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: CID });
    if (before && !before.deleted_at && before.quantity > 0) await adjust(A, Math.min(before.quantity, 99));
    await A.patch(`asks?id=eq.${ASK}`, { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const after = await row();
    log(`after: ${after && !after.deleted_at ? after.quantity + " " + after.status : "not on the list"} · ask "${LABEL}" soft-deleted`);
    browser.disconnect();
  }
  process.exit(total === 0 ? 0 : 1);
})().catch((e) => { console.error(e.message); process.exit(2); });
