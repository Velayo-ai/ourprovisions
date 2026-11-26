// one-list-walk.js — the SPEC_one_list Slice 1 pre-walk (V1–V5, V10: the parts a harness can drive). Dev only,
// Cody Test House, signed in already (signin.js).
//   Tab A is the phone under test (the deployed dev URL, 375 × 667).
//   Tab B is only the "second phone": the same account's token, writing to dev's PostgREST straight from here.
//   V4's stale case: A checks an item off (its trip opens and A holds it as activeSession), then B ends that
//   session the way a Wrap up on another phone does (ended_at), without A hearing of it. A's next add must not
//   open a session, write an added_in_store event, or keep an "added here" tag.
// The walk puts 14 seed items on the list, needs the house's list empty to start (it refuses otherwise), ends
// every open session of the house before and after, and removes its rows at the end (read back as 0).
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
// An add through List's "+ Add" sheet, the way a person does it: open, type, tap the result.
async function sheetAdd(name) {
  await A.evaluate(() => { window.scrollTo(0, 0); document.querySelector(".list-header .hdr-action")?.click(); });
  await A.waitForSelector(".add-sheet-search input", { timeout: 5000 });
  await A.focus(".add-sheet-search input");
  await A.keyboard.type(name, { delay: 15 });
  await sleep(500);
  const hit = await A.evaluate((name) => {
    const r = [...document.querySelectorAll(".add-result")].find((x) => x.querySelector(".ar-name")?.innerText.trim() === name);
    if (!r) return false; r.click(); return true;
  }, name);
  await sleep(400);
  return hit;
}

(async () => {
  const browser = await connect();
  A = await firstPage(browser);
  await A.setViewport(VIEW);
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
  const live0 = await rest("GET", `list_items?select=id&household_id=eq.${HH}&deleted_at=is.null`);
  if (live0.length) throw new Error(`${HOUSE} has ${live0.length} rows on its list — the walk needs it empty (V3 and V10 read the household's counts)`);
  const endOpen = async () => {
    const open = await rest("GET", `shopping_sessions?select=id&household_id=eq.${HH}&ended_at=is.null`);
    for (const s of open) await rest("PATCH", `shopping_sessions?id=eq.${s.id}`, { ended_at: new Date().toISOString() });
    return open.length;
  };
  log(`ended ${await endOpen()} open session(s) first`);
  const openSessions = () => rest("GET", `shopping_sessions?select=id,started_at,created_at&household_id=eq.${HH}&ended_at=is.null`);
  const seeds = await rest("GET", `catalog_items?select=id,name,category&is_global=eq.true&deleted_at=is.null&order=name&limit=400`);
  const pool = seeds.filter((s) => /^[A-Za-z][A-Za-z ]+$/.test(s.name)).slice(0, 17);
  if (pool.length < 17) throw new Error(`not enough seed items (${seeds.length} seeds, ${pool.length} in the pool)`);
  const L = pool.slice(0, 14);          // put on the list by B
  const [Y1, Y2, Y3] = pool.slice(14, 17).map((s) => s.name);   // added by A through the sheet (V4)
  const CID = Object.fromEntries(pool.map((s) => [s.name, s.id]));
  for (const s of pool) await rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: s.id }).catch(() => {});
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

  // ── V3 (all checked): the All done card, no bar ──
  const pending = (await rest("GET", `list_items?select=id&household_id=eq.${HH}&deleted_at=is.null&status=eq.pending`));
  for (const r of pending) await rest("PATCH", `list_items?id=eq.${r.id}`, { status: "bought" });
  const done = await waitFor(async () => { const x = await listState(); return x.allDone && x; }, 15000, 500);
  s = done || (await listState());
  check("V3 all checked: the All done card, no Wrap up bar, no spacer", s.allDone && s.wrapbar === null && !s.spacer, JSON.stringify({ allDone: s.allDone, bar: s.wrapbar, spacer: s.spacer }));
  await shot(A, "olw-v3-all-done");

  // ── cleanup, then V10 on the empty list ──
  for (const p of pool) await rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: p.id }).catch(() => {});
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
  check("V10 …the empty List: \"Our list\" + Add, no bar", s.title === "Our list" && s.wrapbar === null && !s.allDone);
  await shot(A, "olw-v10-empty-list");

  log(`${results.length - fails}/${results.length} PASS`);
  fs.writeFileSync(path.join(lib.OUT, "one-list-walk.json"), JSON.stringify(results, null, 2));
  await B.close().catch(() => {});
  browser.disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
