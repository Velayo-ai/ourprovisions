// one-list-walk.js — the SPEC_one_list pre-walk: Slice 1 (V1–V5, V10), Slice 2, the quick picker (V6, V7, V8,
// V12, with R8 revised: the row is the undo), and Slice 3 (V9 the guide, V11 the welcome, the one-list spans read
// off the wire): the parts a harness can drive. Dev only, Cody Test House, signed in already (signin.js).
//   The welcome (R12) would cover the list on this account's first List visit, so the walk marks it seen for
//   Cody Test House up front and V11 clears it on purpose. There is one test account: V11's "second account"
//   is the same account with its welcome key cleared (the per-person key is pinned in Jest).
//   Tab A is the phone under test (the deployed dev URL, 375 × 667).
//   Tab B is only the "second phone": the same account's token, writing to dev's PostgREST straight from here.
//   V4's stale case: A checks an item off (its trip opens and A holds it as activeSession), then B ends that
//   session the way a Wrap up on another phone does (ended_at), without A hearing of it. A's next add must not
//   open a session, write an added_in_store event, or keep an "added here" tag.
// The walk puts 14 seed items on the list, needs the house's list empty to start (it refuses otherwise), ends
// every open session of the house before and after, and removes its rows at the end (read back as 0). V8 makes
// one custom item ("OL walk <time>") and deletes it again (delete_custom_catalog_item), and hides one seed item
// for this account and reveals it through the picker (its user_hidden_items row is removed either way).
// Screenshots: out/olw-*.png.
//   node one-list-walk.js            (OP_EXPECT_SHA=<short sha> checks the build tag)
const fs = require("fs");
const path = require("path");
const lib = require("./lib");
const { log, sleep, connect, firstPage, shot } = lib;

const BASE = lib.DEV_URL;
const HOUSE = process.env.OP_WALK_HOUSE || "Cody Test House";
const VIEW = { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

function envLocal(name) {
  const raw = fs.readFileSync(path.join(lib.ROOT, ".env.local"), "utf8");
  const m = raw.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!m) throw new Error(`${name} missing from .env.local`);
  return m[1].trim();
}
const URL_ = envLocal("REACT_APP_SUPABASE_URL");
const ANON = envLocal("REACT_APP_SUPABASE_ANON_KEY");
if (!/zxwtxjjmssykhqrghouf/.test(URL_)) throw new Error("one-list-walk runs on dev only — .env.local is not dev");

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
const waitFor = async (fn, ms = 10000, step = 250) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await sleep(step); } return v; };
const go = (page, hash) => page.evaluate((h) => { window.location.hash = h; }, hash);

// The List screen as A sees it.
const listState = () => A.evaluate(() => {
  const head = document.querySelector(".list-header");
  const cs = head ? getComputedStyle(head) : null;
  const rows = [...document.querySelectorAll(".list-item")].map((r) => {
    const b = r.querySelector("button.shop-check");
    const name = b ? (b.querySelector(".sr-only") || b).innerText.replace(/, not shared yet/, "").trim() : "";
    return { name, checked: b ? b.getAttribute("aria-checked") === "true" : null, tag: !!r.querySelector(".added-here-tag"), qty: r.querySelector(".li-qty")?.innerText.trim() || null };
  });
  return {
    title: document.querySelector(".list-header .list-title")?.innerText.trim() || null,
    seg: !!document.querySelector(".list-header .shop-seg"),
    add: document.querySelector(".list-header .hdr-action")?.innerText.trim() || null,
    // Chrome snaps a 1.5px border to 1px here (a bare test element does the same), so the rule as authored is
    // read from the stylesheet, plus the computed style and colour.
    hair: cs ? `${cs.borderBottomStyle} ${cs.borderBottomColor}` : null,
    hairRule: [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules]; } catch (e) { return []; } })
      .map((r) => r.cssText || "").find((x) => /^\.list-header \{/.test(x)) || null,
    count: !!document.querySelector(".list-progress"),
    bar: !!document.querySelector(".progress-bar"),
    toFind: !!document.querySelector(".az-eyebrow") || /\d+ to find/.test(document.body.innerText),
    wrapbar: document.querySelector(".wrapbar")?.innerText.replace(/\s+/g, " ").trim() || null,
    spacer: !!document.querySelector(".wrapbar-spacer"),
    allDone: !!document.querySelector(".all-done"),
    doors: [...document.querySelectorAll(".helm-door .helm-label")].map((x) => x.textContent.trim()),   // the DOM text, not the CSS uppercase
    compactPlus: !!document.querySelector(".helm.compact .helm-plus"),
    rows,
  };
});
const rowOn = (s, name) => s.rows.find((x) => x.name === name);
const tapAisle = (name) => A.evaluate((name) => {
  const b = [...document.querySelectorAll("button.shop-check")].find((x) => !x.closest(".tray-body") && (x.querySelector(".sr-only") || x).innerText.trim().startsWith(name));
  if (!b) return false; b.scrollIntoView({ block: "center" }); b.click(); return true;
}, name);
// The quick picker (Slice 2).
const PICKER = ".ask-search.item-picker";
const pickerState = () => A.evaluate((P) => {
  const v = document.querySelector(P);
  if (!v) return null;
  const rows = [...v.querySelectorAll(".pick-row:not(.pick-create)")].map((b) => ({
    name: b.querySelector(".pick-name")?.textContent.trim(),
    on: !!b.querySelector(".pick-mark.on"), fresh: b.classList.contains("fresh"), inert: b.getAttribute("aria-disabled") === "true",
    sub: b.querySelector(".pick-sub")?.textContent.trim() || null,
  }));
  return {
    open: v.classList.contains("open"),
    focused: document.activeElement === v.querySelector("input[type=search]"),
    count: document.querySelectorAll(P).length,
    title: v.querySelector(".item-search-title")?.textContent.trim() || null,
    letters: [...v.querySelectorAll(".pick-letter")].map((x) => x.textContent.trim()),
    rows,
    create: v.querySelector(".pick-create")?.textContent.trim() || null,
    reveal: [...v.querySelectorAll('[role="button"]')].map((x) => x.textContent).find((x) => /Hidden from your view/.test(x)) || null,
    toast: v.querySelector(".pick-toast-text")?.textContent.trim() || null,
  };
}, PICKER);
// Open it with a REAL tap on an opener (the keyboard rule: focus inside the tap). `how`: "header" (List's +
// Add, scrolled to the top) or "helm" (the Helm's compact +, scrolled down until it appears).
async function openPicker(how) {
  if (how === "header") {
    await A.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
    await A.click(".list-header .hdr-action");
  } else {
    await A.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(900);
    await A.waitForSelector(".helm.compact .helm-plus", { timeout: 5000 });
    await A.click(".helm.compact .helm-plus");
  }
  await sleep(350);
  return pickerState();
}
const pickerType = async (text) => {
  await A.evaluate((P) => { const i = document.querySelector(`${P} input[type=search]`); i.focus(); }, PICKER);
  await A.evaluate((P) => {
    const i = document.querySelector(`${P} input[type=search]`);
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(i, ""); i.dispatchEvent(new Event("input", { bubbles: true }));
  }, PICKER);
  if (text) await A.keyboard.type(text, { delay: 12 });
  await sleep(400);
};
const pickerTap = (name) => A.evaluate((P, name) => {
  const b = [...document.querySelectorAll(`${P} .pick-row:not(.pick-create)`)].find((x) => x.querySelector(".pick-name")?.textContent.trim() === name);
  if (!b) return false; b.scrollIntoView({ block: "center" }); b.click(); return true;
}, PICKER, name);
const pickRow = (ps, name) => (ps && ps.rows.find((r) => r.name === name)) || null;
const pickerDone = async () => { await A.evaluate((P) => document.querySelector(`${P} .item-search-done`)?.click(), PICKER); await sleep(700); };
// An add through List's "+ Add" → the picker, the way a person does it: open, type, tap, Done.
async function sheetAdd(name) {
  const st = await openPicker("header");
  if (!st || !st.open) return false;
  await pickerType(name);
  const hit = await pickerTap(name);
  await sleep(900);
  await pickerDone();
  return hit;
}

(async () => {
  const browser = await connect();
  A = await firstPage(browser);
  await A.setViewport(VIEW);
  // The one-list spans, read off the wire: the RUM agent POSTs OTLP JSON to /v1/rumotlp (never log its URL:
  // the query carries the token).
  const spans = [];
  const attrVal = (v) => (v ? (v.stringValue ?? v.intValue ?? v.boolValue ?? v.doubleValue ?? null) : null);
  A.on("request", (req) => {
    if (!/\/v1\/rumotlp/.test(req.url()) || req.method() !== "POST") return;
    try {
      const body = JSON.parse(req.postData() || "{}");
      for (const rs of body.resourceSpans || []) for (const ss of rs.scopeSpans || []) for (const sp of ss.spans || []) {
        spans.push({ name: sp.name, attrs: Object.fromEntries((sp.attributes || []).map((a) => [a.key, attrVal(a.value)])) });
      }
    } catch (e) { /* not JSON: ignore */ }
  });
  await A.goto(BASE + "#/home", { waitUntil: "networkidle2" });
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
  const endOpen = async () => {
    const open = await rest("GET", `shopping_sessions?select=id&household_id=eq.${HH}&ended_at=is.null`);
    for (const s of open) await rest("PATCH", `shopping_sessions?id=eq.${s.id}`, { ended_at: new Date().toISOString() });
    return open.length;
  };
  log(`ended ${await endOpen()} open session(s) first`);
  const clerkId = await B.evaluate(() => window.Clerk.user.id);
  const WKEY = `op_list_welcome_seen:${clerkId}:${HH}`;
  const setWelcome = (v) => A.evaluate((k, v) => { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }, WKEY, v);
  await setWelcome("1");   // V11 clears it on purpose
  const openSessions = () => rest("GET", `shopping_sessions?select=id,started_at,created_at&household_id=eq.${HH}&ended_at=is.null`);
  const seeds = await rest("GET", `catalog_items?select=id,name,category&is_global=eq.true&deleted_at=is.null&order=name&limit=400`);
  const pool = seeds.filter((s) => /^[A-Za-z][A-Za-z ]+$/.test(s.name)).slice(0, 19);
  if (pool.length < 19) throw new Error(`not enough seed items (${seeds.length} seeds, ${pool.length} in the pool)`);
  const L = pool.slice(0, 14);          // put on the list by B
  const [Y1, Y2, Y3] = pool.slice(14, 17).map((s) => s.name);   // added by A through the picker (V4)
  const [P1, H1] = pool.slice(17, 19).map((s) => s.name);       // V6's add; V8's hidden item
  const CID = Object.fromEntries(pool.map((s) => [s.name, s.id]));
  // A previous run that stopped midway may have left the walk's own items on the list: those go first; anything
  // else on the list stops the walk (V3 and V10 read the household's counts).
  for (const s of pool) await rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: s.id }).catch(() => {});
  const live0 = await rest("GET", `list_items?select=id&household_id=eq.${HH}&deleted_at=is.null`);
  if (live0.length) throw new Error(`${HOUSE} has ${live0.length} rows on its list — the walk needs it empty`);
  for (const s of L) await rpc("adjust_list_item_quantity", { p_household_id: HH, p_catalog_item_id: s.id, p_delta: 1, p_price_per_unit: null });
  const Q3 = L[0].name;
  await rpc("adjust_list_item_quantity", { p_household_id: HH, p_catalog_item_id: CID[Q3], p_delta: 2, p_price_per_unit: null });   // ×3 for V5
  log(`walk items ${JSON.stringify(pool.map((s) => s.name))}`);
  const rowOf = async (name) => (await rest("GET", `list_items?select=id,status,quantity,deleted_at&household_id=eq.${HH}&catalog_item_id=eq.${CID[name]}&deleted_at=is.null`))[0] || null;
  const addedInStore = async (name, since) => rest("GET", `list_item_events?select=id,session_id,created_at&household_id=eq.${HH}&catalog_item_id=eq.${CID[name]}&event_type=eq.added_in_store&created_at=gte.${encodeURIComponent(since)}`);
  const t0 = new Date(Date.now() - 2000).toISOString();

  // ── V1: the doors, #/shop, reload on #/shop, no "Shop" door copy in the bundle ──
  await A.goto(BASE + "#/shop", { waitUntil: "networkidle2" });
  await waitFor(async () => (await listState()).rows.length >= 14, 20000, 500);
  let s = await listState();
  check("V1 the Helm reads Home · Plan · Browse · List", JSON.stringify(s.doors) === JSON.stringify(["Home", "Plan", "Browse", "List"]), JSON.stringify(s.doors));
  check("V1 #/shop opens List (\"Our list\")", s.title === "Our list", JSON.stringify(s.title));
  await A.reload({ waitUntil: "networkidle2" });
  await waitFor(async () => (await listState()).rows.length >= 14, 20000, 500);
  s = await listState();
  check("V1 a reload on #/shop lands on List", s.title === "Our list" && (await A.evaluate(() => location.hash)) === "#/shop", await A.evaluate(() => location.hash));
  const js = bundle ? await (await fetch(bundle)).text() : "";
  const shopDoorCopy = ["Add to Shop", "add to Shop", "off Shop)", "in Shop ✓", 'label:"Shop"'].filter((x) => js.includes(x));
  check("V1 no \"Shop\" door copy left in the bundle", js.length > 0 && shopDoorCopy.length === 0, JSON.stringify(shopDoorCopy));
  check("V1 …and the new copy is in it (List, Add to list, add to the list, off the list)",
    ['label:"List"', "Add to list", "add to the list", "off the list)", "Everything's on the list"].every((x) => js.includes(x)));

  // ── V2: the header ──
  check("V2 the header: \"Our list\", Aisles | A–Z, + Add", s.title === "Our list" && s.seg && /Add/.test(s.add || ""), JSON.stringify({ title: s.title, seg: s.seg, add: s.add }));
  check("V2 …over a 1.5px sand hairline (#d8bf94): the rule as authored, and computed solid sand",
    /border-bottom: 1\.5px solid rgb\(216, 191, 148\)/.test(s.hairRule || "") && s.hair === "solid rgb(216, 191, 148)", `${s.hair} · ${(s.hairRule || "").match(/border-bottom:[^;]*/)}`);
  check("V2 no header count, no progress bar, no \"N to find\" (Aisles)", !s.count && !s.bar && !s.toFind);
  await A.evaluate(() => [...document.querySelectorAll(".shop-seg button")].find((b) => b.innerText.trim() === "A–Z")?.click());
  await sleep(600);
  s = await listState();
  check("V2 …nor in A–Z", !s.count && !s.bar && !s.toFind);
  await shot(A, "olw-v2-az");
  await A.evaluate(() => [...document.querySelectorAll(".shop-seg button")].find((b) => b.innerText.trim() === "Aisles")?.click());
  await sleep(600);
  await shot(A, "olw-v2-header");
  check("V2 at rest the Helm has no compact +", !(await listState()).compactPlus);
  await A.evaluate(() => window.scrollTo(0, 600)); await sleep(900);
  s = await listState();
  const headTop = await A.evaluate(() => document.querySelector(".list-header")?.getBoundingClientRect().bottom);
  check("V2 scrolled: the header scrolls away (not pinned) and the Helm's compact + appears", headTop < 0 && s.compactPlus, `header bottom ${headTop}, compact + ${s.compactPlus}`);
  await shot(A, "olw-v2-scrolled");
  await A.evaluate(() => window.scrollTo(0, 0)); await sleep(600);

  // ── V5: quantity on the row ──
  s = await listState();
  check(`V5 a row at quantity 3 shows ×3 (${Q3})`, rowOn(s, Q3)?.qty === "×3", JSON.stringify(rowOn(s, Q3)));
  check("V5 a row at quantity 1 shows no quantity", !!rowOn(s, L[1].name) && rowOn(s, L[1].name).qty === null, JSON.stringify(rowOn(s, L[1].name)));

  // ── V3 (0 checked) ──
  check("V3 nothing checked: no Wrap up bar and no spacer", s.wrapbar === null && !s.spacer, JSON.stringify({ bar: s.wrapbar, spacer: s.spacer }));

  // ── V4a: at home, no open session — an add is plain ──
  check("V4 setup: no open session", (await openSessions()).length === 0);
  check(`V4a the sheet add of ${Y1} ran`, await sheetAdd(Y1));
  await waitFor(async () => !!(await rowOf(Y1)), 8000);
  await sleep(2500);
  s = await listState();
  check(`V4a ${Y1} is on the list, with no "added here"`, !!(await rowOf(Y1)) && !!rowOn(s, Y1) && !rowOn(s, Y1).tag, JSON.stringify(rowOn(s, Y1)));
  check("V4a no session opened", (await openSessions()).length === 0);
  check(`V4a no added_in_store row for ${Y1}`, (await addedInStore(Y1, t0)).length === 0);

  // ── V3 (1 checked) + the trip opens ──
  const X = L[2].name;
  await tapAisle(X); await sleep(4500);
  const trip = await waitFor(async () => (await openSessions())[0], 12000, 500);
  check(`V4 setup: checking ${X} off opens the trip`, !!trip, JSON.stringify(trip));
  s = await listState();
  check("V3 one checked: the Wrap up bar appears (\"1 of N · … carry forward\")", /^1 of (\d+) · (\d+) carry forward Wrap up$/.test(s.wrapbar || "") && s.spacer, JSON.stringify(s.wrapbar));
  await shot(A, "olw-v3-bar");

  // ── V4b: the trip wrapped up on the second phone (ended there) — A's activeSession is now stale ──
  await rest("PATCH", `shopping_sessions?id=eq.${trip.id}`, { ended_at: new Date().toISOString() });
  check("V4b setup: B ended the trip; no open session", (await openSessions()).length === 0);
  check(`V4b the sheet add of ${Y2} ran (A still holds the old trip)`, await sheetAdd(Y2));
  await waitFor(async () => !!(await rowOf(Y2)), 8000);
  await sleep(3500);
  s = await listState();
  check("V4b STALE activeSession: still no session opened", (await openSessions()).length === 0, JSON.stringify(await openSessions()));
  check(`V4b no added_in_store row for ${Y2}`, (await addedInStore(Y2, t0)).length === 0);
  check(`V4b ${Y2} on the list with no "added here" (the tag came off)`, !!rowOn(s, Y2) && !rowOn(s, Y2).tag, JSON.stringify(rowOn(s, Y2)));

  // ── V4c: during a trip, an add is "added here" ──
  const Z = L[3].name;
  await tapAisle(Z); await sleep(4500);
  const trip2 = await waitFor(async () => (await openSessions())[0], 12000, 500);
  check(`V4c checking ${Z} off opens a new trip`, !!trip2 && trip2.id !== trip.id, JSON.stringify(trip2));
  check(`V4c the sheet add of ${Y3} ran`, await sheetAdd(Y3));
  await waitFor(async () => !!(await rowOf(Y3)), 8000);
  await sleep(2500);
  s = await listState();
  const ev3 = await addedInStore(Y3, t0);
  check(`V4c ${Y3} shows "added here"`, !!rowOn(s, Y3) && rowOn(s, Y3).tag, JSON.stringify(rowOn(s, Y3)));
  check(`V4c one added_in_store row for ${Y3}, in that trip`, ev3.length === 1 && trip2 && ev3[0].session_id === trip2.id, JSON.stringify(ev3));
  check("V4c the add opened no second session", (await openSessions()).length === 1);
  await shot(A, "olw-v4c-added-here");

  // ── V6: one picker from every opener, the keyboard's focus in the tap ──
  let ps = await openPicker("header");
  check("V6 List's + Add opens the picker, focus in its field (in the tap), \"Add to our list\"", !!ps && ps.open && ps.focused && ps.title === "Add to our list" && ps.count === 1, JSON.stringify(ps && { open: ps.open, focused: ps.focused, title: ps.title, count: ps.count }));
  check("V6 …the catalog A–Z with letter headers; on-the-list rows read \"On the list\"", ps.letters.length > 1 && ps.letters.join("") === [...ps.letters].sort().join("") && ps.rows.some((r) => r.on && r.sub === "On the list"), JSON.stringify(ps.letters));
  await shot(A, "olw-v6-picker");
  await pickerType(P1.slice(0, 3));
  ps = await pickerState();
  check(`V6 typing filters (\"${P1.slice(0, 3)}\")`, ps.rows.length > 0 && ps.rows.every((r) => r.name.toLowerCase().includes(P1.slice(0, 3).toLowerCase())), JSON.stringify(ps.rows.map((r) => r.name)));
  await pickerTap(P1);
  await waitFor(async () => !!(await rowOf(P1)), 8000);
  await sleep(1200);
  ps = await pickerState();
  let r1 = await rowOf(P1);
  check(`V6 a tap on ${P1} puts it on the list once (quantity 1), and the picker stays open`, !!r1 && r1.quantity === 1 && ps.open, JSON.stringify(r1));
  check(`V6 …its row reads ✓ "Added · tap to undo" (the query stays), and there is no toast`, !!pickRow(ps, P1) && pickRow(ps, P1).fresh && pickRow(ps, P1).sub === "Added · tap to undo" && !ps.toast, JSON.stringify({ row: pickRow(ps, P1), toast: ps.toast }));
  // A row on the list before this visit: "On the list", inert.
  const PRE = L[1].name;
  await pickerType(PRE);
  ps = await pickerState();
  check(`V6 ${PRE} (on the list before the visit) reads "On the list" and is inert`, !!pickRow(ps, PRE) && pickRow(ps, PRE).on && pickRow(ps, PRE).inert && pickRow(ps, PRE).sub === "On the list", JSON.stringify(pickRow(ps, PRE)));
  await pickerTap(PRE); await sleep(1500);
  const rPre = await rowOf(PRE);
  check(`V6 …a tap on it adds nothing (still quantity 1)`, !!rPre && rPre.quantity === 1, JSON.stringify(rPre));
  // The undo, also two items back: three fresh adds, then a tap on the first takes it back off.
  const [U, U2, U3] = [L[4].name, L[6].name, L[7].name];
  for (const n of [U, U2, U3]) await rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: CID[n] });
  await pickerType("");
  await waitFor(async () => { const x = await pickerState(); return [U, U2, U3].every((n) => pickRow(x, n) && !pickRow(x, n).on); }, 8000, 400);
  for (const n of [U, U2, U3]) { await pickerTap(n); await sleep(700); }
  await waitFor(async () => !!(await rowOf(U3)), 8000);
  await sleep(800);
  await pickerTap(U);   // two items back
  const undone = await waitFor(async () => !(await rowOf(U)), 8000);
  await sleep(800);
  ps = await pickerState();
  check(`V6 a tap on ${U}'s fresh ✓ two items back takes it back off the list (back to +), no toast`, !!undone && !!pickRow(ps, U) && !pickRow(ps, U).on && !ps.toast, JSON.stringify({ row: pickRow(ps, U), toast: ps.toast }));
  check(`V6 …${U2} and ${U3} stay added (fresh ✓, on the server)`, [U2, U3].every((n) => pickRow(ps, n) && pickRow(ps, n).fresh) && !!(await rowOf(U2)) && !!(await rowOf(U3)));
  await pickerDone();
  ps = await openPicker("header");
  check(`V6 Done ended the visit: ${U2} now reads "On the list" (inert)`, !!pickRow(ps, U2) && pickRow(ps, U2).inert && pickRow(ps, U2).sub === "On the list", JSON.stringify(pickRow(ps, U2)));
  await pickerDone();
  ps = await pickerState();
  check("V6 Done closes it", !ps.open);
  ps = await openPicker("helm");
  check("V6 the Helm's + on List opens the same picker (one in the page), focus in the tap", !!ps && ps.open && ps.focused && ps.count === 1, JSON.stringify(ps && { open: ps.open, focused: ps.focused, count: ps.count }));
  await pickerDone();
  // Browse: type a search, then the Helm's + — the picker opens and Browse's search survives it.
  await go(A, "#/browse"); await sleep(1800);
  await A.evaluate(() => { const i = [...document.querySelectorAll("input")].find((x) => /Search your catalog/.test(x.placeholder || "")); if (i) { i.focus(); } });
  await A.keyboard.type("a", { delay: 10 }); await sleep(800);   // many matches: the page must scroll for the compact +
  ps = await openPicker("helm");
  check("V6 the Helm's + on Browse opens the same picker, focus in the tap", !!ps && ps.open && ps.focused && ps.count === 1, JSON.stringify(ps && { open: ps.open, focused: ps.focused }));
  await pickerDone();
  const browseQ = await A.evaluate(() => [...document.querySelectorAll("input")].find((x) => /Search your catalog/.test(x.placeholder || ""))?.value);
  check("V6 Browse's typed search survives the Helm's + (\"a\")", browseQ === "a", JSON.stringify(browseQ));
  await A.evaluate(() => { const i = [...document.querySelectorAll("input")].find((x) => /Search your catalog/.test(x.placeholder || "")); if (i) { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ""); i.dispatchEvent(new Event("input", { bubbles: true })); } });
  await go(A, "#/shop"); await sleep(1500);

  // ── V7: an item checked this trip — +, a tap renews it, "added again", no Undo ──
  const RZ = await rowOf(Z);
  check(`V7 setup: ${Z} is in the cart`, !!RZ && RZ.status === "bought", JSON.stringify(RZ));
  ps = await openPicker("header");
  await pickerType(Z);
  ps = await pickerState();
  check(`V7 ${Z} (checked this trip) shows +, not ✓`, !!ps.rows.find((r) => r.name === Z && !r.on), JSON.stringify(ps.rows.find((r) => r.name === Z)));
  await pickerTap(Z);
  const renewed = await waitFor(async () => { const r = await rowOf(Z); return r && r.status === "pending" && r; }, 8000);
  await sleep(600);
  ps = await pickerState();
  check(`V7 the tap is a new need of 1 (pending, quantity 1)`, !!renewed && renewed.quantity === 1, JSON.stringify(renewed));
  check(`V7 the toast: \"${Z} added again · it was in your cart\"`, ps.toast === `${Z} added again · it was in your cart`, JSON.stringify({ toast: ps.toast }));
  check(`V7 …and ${Z}'s row reads "On the list", inert (never undoable)`, !!pickRow(ps, Z) && pickRow(ps, Z).inert && pickRow(ps, Z).sub === "On the list", JSON.stringify(pickRow(ps, Z)));

  // ── V8: no match → a new item in Other; a hidden item is revealed, not duplicated ──
  const NEW = `OL walk ${Date.now().toString(36)}`;
  await pickerType(NEW);
  ps = await pickerState();
  check(`V8 no match offers \"+ Add “${NEW}” as a new item\"`, ps.create === `+ Add “${NEW}” as a new item`, JSON.stringify(ps.create));
  await A.evaluate((P) => document.querySelector(`${P} .pick-create`)?.click(), PICKER);
  const made = await waitFor(async () => (await rest("GET", `catalog_items?select=id,name,category,is_global&name=eq.${encodeURIComponent(NEW)}&deleted_at=is.null`))[0], 10000, 500);
  const madeRow = made ? (await rest("GET", `list_items?select=id,quantity&household_id=eq.${HH}&catalog_item_id=eq.${made.id}&deleted_at=is.null`))[0] : null;
  check(`V8 …it is a custom item in Other, on the list at 1`, !!made && made.category === "Other" && made.is_global === false && !!madeRow && madeRow.quantity === 1, JSON.stringify({ made, madeRow }));
  const madeShown = await waitFor(async () => { const x = await pickerState(); return pickRow(x, NEW); }, 6000, 300);
  check(`V8 …its row reads ✓ "Added · tap to undo" (undoable like any other)`, !!madeShown && madeShown.fresh, JSON.stringify(madeShown));
  // The hidden item: hide H1 for this account (B, the same account), reload so A knows it as hidden.
  await rest("POST", "user_hidden_items", { clerk_id: clerkId, catalog_item_id: CID[H1] }, "return=minimal").catch(() => {});
  await pickerDone();
  await A.reload({ waitUntil: "networkidle2" }); await sleep(2500);
  ps = await openPicker("header");
  check(`V8 setup: ${H1} is hidden, so it isn't in the picker's A–Z`, !ps.rows.find((r) => r.name === H1), "");
  await pickerType(H1);
  ps = await pickerState();
  check(`V8 typing ${H1} exactly shows the reveal card, not the create row`, !!ps.reveal && !ps.create, JSON.stringify({ reveal: ps.reveal, create: ps.create }));
  await A.evaluate((P) => [...document.querySelectorAll(`${P} [role="button"]`)].find((x) => /Hidden from your view/.test(x.textContent))?.click(), PICKER);
  const revealed = await waitFor(async () => !!(await rowOf(H1)), 8000);
  const hiddenLeft = await rest("GET", `user_hidden_items?select=catalog_item_id&clerk_id=eq.${clerkId}&catalog_item_id=eq.${CID[H1]}`);
  const dupes = await rest("GET", `catalog_items?select=id&name=eq.${encodeURIComponent(H1)}&deleted_at=is.null`);
  check(`V8 …revealed and added (on the list, no longer hidden), not duplicated (one ${H1} in the catalog)`, !!revealed && hiddenLeft.length === 0 && dupes.length === 1, JSON.stringify({ hidden: hiddenLeft.length, catalog: dupes.length }));
  await pickerDone();

  // ── V12: off grid, a picker add answers at the tap and the picker stays open ──
  const OG = L[5].name;
  await rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: CID[OG] });
  await sleep(2500);
  await A.setOfflineMode(true); await sleep(1200);
  ps = await openPicker("header");
  await pickerType(OG); await pickerTap(OG); await sleep(1200);
  ps = await pickerState();
  check("V12 off grid: the tap answers \"Adding items needs signal for now.\" and the picker stays open", ps.open && ps.toast === "Adding items needs signal for now.", JSON.stringify({ open: ps.open, toast: ps.toast }));
  await shot(A, "olw-v12-off-grid");
  await pickerDone();
  await A.setOfflineMode(false);
  await sleep(12000);   // OFF GRID holds ~10 s of steady signal
  check(`V12 …and nothing was written (${OG} not on the list)`, !(await rowOf(OG)));
  await A.reload({ waitUntil: "networkidle2" }); await sleep(2500);

  // ── V3 (all checked): the All done card, no bar ──
  const pending = (await rest("GET", `list_items?select=id&household_id=eq.${HH}&deleted_at=is.null&status=eq.pending`));
  for (const r of pending) await rest("PATCH", `list_items?id=eq.${r.id}`, { status: "bought" });
  const done = await waitFor(async () => { const x = await listState(); return x.allDone && x; }, 15000, 500);
  s = done || (await listState());
  check("V3 all checked: the All done card, no Wrap up bar, no spacer", s.allDone && s.wrapbar === null && !s.spacer, JSON.stringify({ allDone: s.allDone, bar: s.wrapbar, spacer: s.spacer }));
  await shot(A, "olw-v3-all-done");

  // ── cleanup, then V10 on the empty list ──
  for (const p of pool) await rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: p.id }).catch(() => {});
  if (made) {
    await rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: made.id }).catch(() => {});
    await rpc("delete_custom_catalog_item", { p_household_id: HH, p_catalog_item_id: made.id }).catch((e) => log(`delete ${NEW}: ${e.message}`));
  }
  await rest("DELETE", `user_hidden_items?clerk_id=eq.${clerkId}&catalog_item_id=eq.${CID[H1]}`, null, "return=minimal").catch(() => {});
  const madeLeft = await rest("GET", `catalog_items?select=id&name=eq.${encodeURIComponent(NEW)}&deleted_at=is.null`);
  check(`cleanup: the walk's custom item is gone (${NEW})`, madeLeft.length === 0, `${madeLeft.length} rows`);
  log(`ended ${await endOpen()} open session(s) after`);
  const left = await rest("GET", `list_items?select=id&household_id=eq.${HH}&deleted_at=is.null`);
  check("cleanup: the house's list is empty again (read back)", left.length === 0, `${left.length} rows`);
  check("cleanup: no open session", (await openSessions()).length === 0);

  await A.goto(BASE + "#/home", { waitUntil: "networkidle2" });
  const startLink = await waitFor(() => A.evaluate(() => [...document.querySelectorAll(".home-line-link")].find((b) => /Start a list/.test(b.innerText))?.innerText.trim() || null), 20000, 500);
  check("V10 Home reads \"Nothing on your list · Start a list →\"", !!startLink, JSON.stringify(startLink));
  await A.evaluate(() => [...document.querySelectorAll(".home-line-link")].find((b) => /Start a list/.test(b.innerText))?.click());
  await sleep(1200);
  s = await listState();
  const hash = await A.evaluate(() => location.hash);
  check("V10 Start a list → opens List (#/shop, \"Our list\")", hash === "#/shop" && s.title === "Our list", `${hash} ${s.title}`);
  check("V10 …the empty List: \"Our list\" and the guide, no bar", s.title === "Our list" && s.wrapbar === null && !s.allDone && !!(await A.$(".list-guide")));
  await shot(A, "olw-v10-empty-list");

  // ── V9: the guide — three rows, the adaptive Browse row before and after a staple, each row goes where it says ──
  const guide = () => A.evaluate(() => ({
    ask: document.querySelector(".list-guide-ask")?.textContent.trim() || null,
    rows: [...document.querySelectorAll(".list-guide-row")].map((b) => [b.querySelector(".list-guide-label").textContent.trim(), b.querySelector(".list-guide-sub").textContent.trim(), b.classList.contains("teal")]),
    foot: document.querySelector(".list-guide-foot")?.innerText.replace(/\s+/g, " ").trim() || null,
    welcome: !!document.querySelector(".list-welcome"),
  }));
  const staplesBefore = await rest("GET", `household_staples?select=id&household_id=eq.${HH}`);
  let g = await guide();
  check("V9 the guide: \"What do we need?\", Add items (teal) · Browse · Plan a meal, and the footer", g.ask === "What do we need?" && g.rows.length === 3 && g.rows[0][0] === "Add items" && g.rows[0][2] && g.rows[1][1] === "Remind me what we might need." && g.rows[2][0] === "Plan a meal" && g.foot === "One list for everyone in your household. At the store, check things off here.", JSON.stringify(g));
  const tapGuide = (i) => A.evaluate((i) => document.querySelectorAll(".list-guide-row")[i]?.click(), i);
  const staplesPillOn = () => A.evaluate(() => [...document.querySelectorAll(".cat-rail .cat-pill")].find((b) => /Staples/.test(b.innerText))?.classList.contains("on") || false);
  const STAPLE = L[8];
  if (staplesBefore.length === 0) {
    check("V9 with no staples the Browse row reads \"Browse the aisles\"", g.rows[1][0] === "Browse the aisles", JSON.stringify(g.rows[1]));
    await tapGuide(1); await sleep(1500);
    check("V9 …and opens Browse on everything (Staples not selected)", (await A.evaluate(() => location.hash)) === "#/browse" && !(await staplesPillOn()));
    await rest("POST", "household_staples", { household_id: HH, catalog_item_id: STAPLE.id }, "return=minimal");
    await A.goto(BASE + "#/shop", { waitUntil: "networkidle2" }); await sleep(3000);
    g = await guide();
  } else {
    log(`V9 note: ${HOUSE} already has ${staplesBefore.length} staple(s); the "Browse the aisles" half needs a house with none`);
  }
  check("V9 with a staple the Browse row reads \"Browse our staples\"", g.rows[1] && g.rows[1][0] === "Browse our staples", JSON.stringify(g.rows[1]));
  await tapGuide(1); await sleep(1500);
  check("V9 …and opens Browse with Staples selected", (await A.evaluate(() => location.hash)) === "#/browse" && (await staplesPillOn()));
  if (staplesBefore.length === 0) await rest("DELETE", `household_staples?household_id=eq.${HH}&catalog_item_id=eq.${STAPLE.id}`, null, "return=minimal");
  await go(A, "#/shop"); await sleep(1500);
  await tapGuide(2); await sleep(1500);
  check("V9 Plan a meal opens Plan on the meal library", (await A.evaluate(() => location.hash)) === "#/plan" && (await A.evaluate(() => document.querySelector(".plan-view.on")?.innerText.trim())) === "Meals", await A.evaluate(() => document.querySelector(".plan-view.on")?.innerText.trim()));
  await go(A, "#/shop"); await sleep(1500);
  await A.click(".list-guide-row.teal"); await sleep(400);
  ps = await pickerState();
  check("V9 Add items opens the picker, focus in its field (in the tap)", ps.open && ps.focused, JSON.stringify({ open: ps.open, focused: ps.focused }));
  await pickerType(P1); await pickerTap(P1);
  await waitFor(async () => !!(await rowOf(P1)), 8000); await sleep(800);
  await pickerDone(); await sleep(1500);
  g = await guide();
  s = await listState();
  check("V9 the first add replaces the guide with the list", g.rows.length === 0 && s.rows.some((r) => r.name === P1), JSON.stringify({ guide: g.rows.length, rows: s.rows.map((r) => r.name) }));

  // ── V11: the welcome — once on a non-empty List (this account, its key cleared), Got it for good; never on an empty one ──
  await setWelcome(null);
  await go(A, "#/home"); await sleep(1000);
  await go(A, "#/shop");
  const wel = await waitFor(() => A.evaluate(() => { const d = document.querySelector(".list-welcome"); return d ? { title: document.getElementById("list-welcome-title")?.textContent.trim(), ok: !!d.querySelector(".list-welcome-ok"), labelled: d.getAttribute("aria-labelledby"), label: d.getAttribute("aria-label") } : null; }), 8000, 300);
  check(`V11 the welcome shows on the non-empty List: "This is ${HOUSE}'s list", Got it`, !!wel && wel.title === `This is ${HOUSE}'s list` && wel.ok && wel.labelled === "list-welcome-title" && !wel.label, JSON.stringify(wel));
  await shot(A, "olw-v11-welcome");
  await A.click(".list-welcome-ok"); await sleep(600);
  check("V11 Got it dismisses it and remembers (op_list_welcome_seen = 1)", !(await A.$(".list-welcome")) && (await A.evaluate((k) => localStorage.getItem(k), WKEY)) === "1");
  await sleep(8000);   // one RUM export interval: a reload sooner drops list_welcome_dismissed from the batch
  await A.reload({ waitUntil: "networkidle2" }); await sleep(3000);
  await go(A, "#/shop"); await sleep(1500);
  check("V11 …and it never shows again on this phone (after a reload)", !(await A.$(".list-welcome")));
  await rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: CID[P1] });
  await setWelcome(null);
  await A.reload({ waitUntil: "networkidle2" }); await sleep(3000);
  await go(A, "#/shop"); await sleep(2000);
  g = await guide();
  check("V11 an empty List shows the guide, not the welcome", g.rows.length === 3 && !g.welcome, JSON.stringify({ guide: g.rows.length, welcome: g.welcome }));
  await setWelcome("1");

  // ── the one-list spans, off the wire: workflow.name on every one, added_bucket on picker_closed, no names ──
  await go(A, "#/home"); await sleep(1000);
  await A.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("pagehide")); });
  await sleep(8000);   // the agent's export interval
  const ONE = ["picker_opened", "picker_closed", "picker_tap_on_listed", "item_added_to_list", "list_guide_cta", "first_item_added", "list_welcome_dismissed"];
  const seen = spans.filter((x) => ONE.includes(x.name));
  const byName = Object.fromEntries(ONE.map((n) => [n, seen.filter((x) => x.name === n)]));
  log(`spans seen: ${JSON.stringify(Object.fromEntries(ONE.map((n) => [n, byName[n].length])))}`);
  check("spans: every one-list event was sent at least once", ONE.every((n) => byName[n].length > 0), JSON.stringify(Object.fromEntries(ONE.map((n) => [n, byName[n].length]))));
  check("spans: every one carries workflow.name = its own name", seen.length > 0 && seen.every((x) => x.attrs["workflow.name"] === x.name), JSON.stringify(seen.filter((x) => x.attrs["workflow.name"] !== x.name).map((x) => x.name)));
  check("spans: picker_closed carries added_bucket (0 · 1 · 2-4 · 5+) and open_s", byName.picker_closed.length > 0 && byName.picker_closed.every((x) => ["0", "1", "2-4", "5+"].includes(x.attrs.added_bucket) && !!x.attrs.open_s), JSON.stringify(byName.picker_closed.map((x) => x.attrs)));
  check("spans: list_guide_cta carries choice (+ browse_kind on browse); first_item_added after + s", byName.list_guide_cta.every((x) => ["add", "browse", "plan"].includes(x.attrs.choice) && (x.attrs.choice !== "browse" || ["aisles", "staples"].includes(x.attrs.browse_kind))) && byName.first_item_added.every((x) => ["guide", "welcome"].includes(x.attrs.after) && !!x.attrs.s), JSON.stringify({ cta: byName.list_guide_cta.map((x) => x.attrs), first: byName.first_item_added.map((x) => x.attrs) }));
  const names = [...pool.map((x) => x.name), HOUSE, NEW];
  const leaks = seen.filter((x) => Object.values(x.attrs).some((v) => typeof v === "string" && names.includes(v)));
  check("spans: no item or household name in any one-list span's attributes", leaks.length === 0, JSON.stringify(leaks.map((x) => x.name)));

  log(`${results.length - fails}/${results.length} PASS`);
  fs.writeFileSync(path.join(lib.OUT, "one-list-walk.json"), JSON.stringify(results, null, 2));
  await B.close().catch(() => {});
  browser.disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
