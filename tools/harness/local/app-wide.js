// Landscape = Staples, app-wide — headless walk of the LOCAL build as the dev test account.
const { LOCAL_URL } = require("./use-local");
const { sleep, log, connect, firstPage, OUT } = require("../lib");
const path = require("path");
const URL = LOCAL_URL;
const UP = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: false };
const SIDE = { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true };
const KEY = "op_landscape_hint_visits";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

(async () => {
  const browser = await connect();
  const page = await firstPage(browser);
  const ls = () => page.evaluate(() => { const r = document.querySelector(".ls-root"); return !!r && getComputedStyle(r).display !== "none"; });
  const toast = () => page.evaluate(() => { const s = document.querySelector(".bottom-stack"); return s ? s.innerText.replace(/\s+/g, " ").trim() : ""; });
  const state = () => page.evaluate(() => ({
    hash: location.hash, scrollY: Math.round(window.scrollY),
    activeDoor: (document.querySelector(".helm-door.on, .helm-door[aria-current]") || {}).innerText || "",
    text: document.querySelector(".container").innerText.replace(/\s+/g, " ").trim(),
    planSwitch: [...document.querySelectorAll(".plan-switch button")].map((b) => `${b.innerText.trim()}:${b.getAttribute("aria-current") || b.getAttribute("aria-pressed") || b.className}`).join("|"),
  }));
  const tiles = () => page.evaluate(() => [...document.querySelectorAll(".ls-tile")].map((t) => ({ name: t.querySelector(".ls-name").innerText, on: t.classList.contains("on") })));
  const tapTile = (name) => page.evaluate((n) => { const t = [...document.querySelectorAll(".ls-tile")].find((t) => t.querySelector(".ls-name").innerText === n); if (t) t.click(); return !!t; }, name);
  const go = async (hash) => { await page.evaluate((h) => { window.location.hash = h; }, hash); await sleep(1200); };

  await page.setViewport(UP);
  await page.goto(URL + "#/home", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(2500);
  // start past the first-run subtitle, so the tab checks see the plain header; the hint has its own section
  await page.evaluate((k) => localStorage.setItem(k, "3"), KEY);
  await page.reload({ waitUntil: "networkidle2" }); await sleep(2500);

  // ── 1. every tab: rotate → Staples; rotate back → the same tab and state ──
  for (const [hash, name] of [["#/home", "Home"], ["#/plan", "Plan"], ["#/browse", "Browse"], ["#/shop", "Shop"]]) {
    await go(hash);
    const maxY = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
    await page.evaluate((y) => window.scrollTo(0, y), Math.min(maxY, 140)); await sleep(300);
    const before = await state();
    await page.setViewport(SIDE);
    const shown = await ls();
    const head = await page.evaluate(() => (document.querySelector(".ls-head") || {}).innerText || "");
    check(`${name}: sideways → Staples view, at once`, shown && /Staples/i.test(head), head.replace(/\s+/g, " "));
    await sleep(600);
    await page.setViewport(UP); await sleep(800);
    const after = await state();
    check(`${name}: back upright → same tab`, after.hash === before.hash && !(await ls()), `${before.hash} → ${after.hash}`);
    check(`${name}: same content`, after.text === before.text && after.planSwitch === before.planSwitch, after.text === before.text ? "" : `before "${before.text.slice(0, 70)}" after "${after.text.slice(0, 70)}"`);
    check(`${name}: same scroll`, Math.abs(after.scrollY - before.scrollY) <= 1, `${before.scrollY} → ${after.scrollY}`);
  }
  // Plan's second screen survives too
  await go("#/plan");
  const switched = await page.evaluate(() => { const b = [...document.querySelectorAll(".plan-switch button, .plan-switch a")].find((b) => !/board|this week/i.test(b.innerText)); if (b) { b.click(); return b.innerText.trim(); } return null; });
  await sleep(900);
  const pBefore = await state();
  await page.setViewport(SIDE); await sleep(600);
  check(`Plan (${switched}): sideways → Staples view`, await ls());
  await page.setViewport(UP); await sleep(800);
  const pAfter = await state();
  check(`Plan (${switched}): back on the same Plan screen`, pAfter.text === pBefore.text && pAfter.hash === pBefore.hash, `"${pAfter.text.slice(0, 60)}"`);

  // ── 2. Shop: add a staple sideways → it is on the Shop list after rotating back ──
  await go("#/shop");
  const shopBefore = (await state()).text;
  await page.setViewport(SIDE); await sleep(600);
  const pick = (await tiles()).find((t) => !t.on).name;
  await tapTile(pick); await sleep(900);
  await page.screenshot({ path: path.join(OUT, "ls-appwide-shop-side.png") });
  const palette = await page.evaluate(() => ({ checks: document.querySelectorAll(".ls-root [role=checkbox], .ls-root input, .ls-root .checked").length, classes: [...new Set([...document.querySelectorAll(".ls-tile")].flatMap((t) => [...t.classList]))].sort().join(" ") }));
  check("add palette only: no checkbox / checked state in the view; a tile is only ever on or off", palette.checks === 0 && /^(holding )?ls-tile on$/.test(palette.classes), JSON.stringify(palette));
  await page.setViewport(UP); await sleep(800);
  const shopAfter = await state();
  check(`Shop: "${pick}" added sideways is on the Shop list after rotating back`, shopAfter.hash === "#/shop" && shopAfter.text.includes(pick) && !shopBefore.includes(pick), shopAfter.text.slice(0, 90));
  check('Shop: toast "1 staple added"', /1 staple added/.test(await toast()), await toast());
  await page.screenshot({ path: path.join(OUT, "ls-appwide-shop-after.png") });

  // ── 3. first-run subtitle: visits 1–3 only, on this device ──
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await page.reload({ waitUntil: "networkidle2" }); await sleep(2500);
  const seen = [];
  for (let v = 1; v <= 5; v++) {
    await page.setViewport(SIDE);
    const first = await page.evaluate(() => (document.querySelector(".ls-sub") || {}).innerText || "");   // in the first frame
    await sleep(700);
    const settled = await page.evaluate(() => (document.querySelector(".ls-sub") || {}).innerText || "");
    seen.push(`${first ? 1 : 0}${settled ? 1 : 0}`);
    if (v === 1) await page.screenshot({ path: path.join(OUT, "ls-appwide-hint.png") });
    await page.setViewport(UP); await sleep(700);
  }
  const count = await page.evaluate((k) => localStorage.getItem(k), KEY);
  check("subtitle shows on visits 1–3 only (first frame and settled), then never", seen.join(" ") === "11 11 11 00 00", `${seen.join(" ")}; stored count ${count}`);
  const sub = await page.evaluate(async () => "");
  // storage failing → never shown
  await page.evaluate((k) => { localStorage.removeItem(k); });
  // only the hint's own key throws, on read and on write — the rest of the app keeps its storage
  const blockId = await page.evaluateOnNewDocument((k) => { const g = Storage.prototype.getItem, st = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) { if (key === k) throw new Error("blocked"); return g.apply(this, arguments); };
    Storage.prototype.setItem = function (key) { if (key === k) throw new Error("blocked"); return st.apply(this, arguments); }; }, KEY);
  await page.reload({ waitUntil: "networkidle2" }); await sleep(3000);
  await page.setViewport(SIDE); await sleep(700);
  const blocked = await page.evaluate(() => ({ shown: (() => { const r = document.querySelector(".ls-root"); return !!r && getComputedStyle(r).display !== "none"; })(), sub: !!document.querySelector(".ls-sub") }));
  check("storage blocked → the view still works, the subtitle never shows", blocked.shown && !blocked.sub, JSON.stringify(blocked));
  await page.setViewport(UP); await sleep(600);
  await page.removeScriptToEvaluateOnNewDocument(blockId.identifier);
  await page.evaluate((k) => localStorage.setItem(k, "3"), KEY).catch(() => {});
  await page.reload({ waitUntil: "networkidle2" }); await sleep(3000);
  await page.evaluate((k) => localStorage.setItem(k, "3"), KEY);

  // ── 4. opt-out: an Ask run in progress claims landscape ──
  await go("#/browse"); await sleep(800);
  const pill = await page.evaluate(() => { const b = [...document.querySelectorAll("button.cat-pill")].find((b) => /^Ask\s/.test(b.innerText.replace(/\s+/g, " ").trim()) || /Ask Test/.test(b.innerText)); if (b) { b.click(); return b.innerText.replace(/\s+/g, " ").trim(); } return null; });
  await sleep(1500);
  const hand = await page.$(".ask-handover");
  if (!pill || !hand) { check("Ask run could be started (an ask with live tiles exists)", false, `pill ${pill}, hand-over ${!!hand}`); }
  else {
    await hand.click();
    await page.waitForSelector(".ask-run", { visible: true, timeout: 15000 }); await sleep(2500);
    await page.setViewport(SIDE); await sleep(800);
    const run = await page.evaluate(() => ({ lsMounted: !!document.querySelector(".ls-root"), cls: document.body.classList.contains("lp-eligible"), askVisible: (() => { const a = document.querySelector(".ask-run"); if (!a) return false; const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(a).visibility !== "hidden"; })(), frame: getComputedStyle(document.querySelector(".phone-frame")).visibility }));
    await page.screenshot({ path: path.join(OUT, "ls-appwide-askrun.png") });
    check(`opt-out: sideways during an Ask run (${pill}) → no Staples view, the run stays on screen`, !run.lsMounted && !run.cls && run.askVisible && run.frame === "visible" && !(await ls()), JSON.stringify(run));
    await page.setViewport(UP); await sleep(800);
    check("opt-out: upright again, the run is still up", await page.evaluate(() => !!document.querySelector(".ask-run")));
    // leave the run: hold Done
    const done = await page.$(".ask-done");
    const box = await done.boundingBox();
    await page.touchscreen.touchStart(box.x + box.width / 2, box.y + box.height / 2); await sleep(1300); await page.touchscreen.touchEnd();
    await sleep(1200);
    const gone = await page.evaluate(() => !document.querySelector(".ask-run"));
    check("the run closes on its own Done hold (the shared hold hook)", gone);
    await page.setViewport(SIDE); await sleep(700);
    check("after the run: sideways shows Staples again", await ls());
    await page.setViewport(UP); await sleep(700);
  }

  // ── cleanup: take the Shop add back off (Browse stepper) ──
  await go("#/browse"); await sleep(800);
  await page.evaluate(() => { [...document.querySelectorAll(".cat-rail .cat-pill.on")].forEach((b) => b.click()); }); await sleep(500);
  for (let i = 0; i < 3; i++) {
    const more = await page.evaluate((n) => { const row = [...document.querySelectorAll(".item-row")].find((r) => r.querySelector(".item-name").innerText === n); if (!row) return false; const minus = row.querySelector(".qty-btn"); if (!minus) return false; minus.click(); return true; }, pick);
    if (!more) break; await sleep(700);
  }
  // the removes are real writes: wait until every pick's row is back to "Add" before letting go of the page
  for (let i = 0; i < 20; i++) {
    const left = await page.evaluate((names) => names.filter((n) => { const row = [...document.querySelectorAll(".item-row")].find((r) => r.querySelector(".item-name").innerText === n); return row && row.querySelector(".qty-btn"); }), [pick]);
    if (!left.length) break;
    if (i === 19) log("WARN  still on the list after cleanup: " + left.join(", ") + " — run: node local/unlist.js " + left.join(" "));
    await sleep(500);
  }
  await sleep(1500);
  const fail = results.filter((r) => !r.ok);
  log(`DONE ${results.length - fail.length}/${results.length} passed${fail.length ? " — FAILED: " + fail.map((f) => f.name).join(" | ") : ""}`);
  await browser.disconnect();
})().catch((e) => { console.log("APPWIDE ERROR:", e.message.split("\n")[0]); process.exit(1); });
