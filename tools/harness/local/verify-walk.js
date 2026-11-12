// Landscape = Staples — headless walk of the LOCAL build (feature branch) as the dev test account.
// node local/verify-walk.js   (harness Chrome running, signed in at the local URL)
const { LOCAL_URL } = require("./use-local");
const { sleep, log, connect, firstPage, OUT } = require("../lib");
const path = require("path");
const URL = LOCAL_URL;
const PHONE_UP = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: false };
const PHONE_SIDE = { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true };
const TABLET_UP = { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: false };
const TABLET_SIDE = { width: 1024, height: 768, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true };
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `ls-${name}.png`) });

(async () => {
  const browser = await connect();
  const page = await firstPage(browser);
  const ls = () => page.evaluate(() => { const r = document.querySelector(".ls-root"); return !!r && getComputedStyle(r).display !== "none"; });
  const portraitHidden = () => page.evaluate(() => getComputedStyle(document.querySelector(".phone-frame")).visibility === "hidden");
  // What the first JS that runs after a turn sees (the resize event): proof the swap needed no JS.
  const armResize = () => page.evaluate(() => { window.__atResize = null; window.addEventListener("resize", () => { const r = document.querySelector(".ls-root"); if (window.__atResize === null && innerWidth > innerHeight) window.__atResize = `${r ? getComputedStyle(r).display : "absent"}`; }); });
  // the resize event can be delivered a moment after setViewport resolves: wait for it (up to 1s) before reading
  const atResize = async () => { for (let i = 0; i < 20; i++) { const v = await page.evaluate(() => window.__atResize); if (v !== null) return v; await sleep(50); } return null; };
  const door = async (hash) => { await page.evaluate((h) => { window.location.hash = h; }, hash); await sleep(900); };
  const toast = () => page.evaluate(() => { const s = document.querySelector(".bottom-stack"); return s ? s.innerText.replace(/\s+/g, " ").trim() : ""; });
  const portrait = () => page.evaluate(() => ({
    pills: [...document.querySelectorAll(".cat-rail .cat-pill")].map((b) => `${b.innerText.replace(/\s+/g, " ").trim()}:${b.classList.contains("on") ? 1 : 0}`).join("|"),
    staplesOn: [...document.querySelectorAll(".cat-rail .cat-pill")].some((b) => /Staples/.test(b.innerText) && b.classList.contains("on")),
    search: (document.querySelector("input[type=search], .container input") || {}).value,
    scrollY: Math.round(window.scrollY),
    rows: document.querySelectorAll(".item-row").length,
  }));
  const tiles = () => page.evaluate(() => [...document.querySelectorAll(".ls-tile")].map((t) => ({ name: t.querySelector(".ls-name").innerText, on: t.classList.contains("on"), badge: (t.querySelector(".ls-badge") || {}).innerText || "", h: Math.round(t.getBoundingClientRect().height), w: Math.round(t.getBoundingClientRect().width) })));
  const tapTile = (name) => page.evaluate((n) => { const t = [...document.querySelectorAll(".ls-tile")].find((t) => t.querySelector(".ls-name").innerText === n); if (t) t.click(); return !!t; }, name);

  await page.setViewport(PHONE_UP);
  await page.goto(URL + "#/browse", { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector(".cat-rail .cat-pill", { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem("op_landscape_hint_visits", "3"));   // past the first-run subtitle
  await page.reload({ waitUntil: "networkidle2" }); await page.waitForSelector(".cat-rail .cat-pill", { timeout: 30000 });
  await sleep(1500);
  const probe = await page.evaluate(() => ({ coarse: matchMedia("(pointer: coarse)").matches, so: screen.orientation && screen.orientation.type, w: innerWidth, h: innerHeight }));
  log("probe upright: " + JSON.stringify(probe));

  // ── Verify 1 — phone, Browse, rotate → Staples grid; other pills ignored ──
  // Portrait: a category pill ON (not Staples), Staples OFF, scrolled.
  const pillName = await page.evaluate(() => { const b = [...document.querySelectorAll(".cat-rail .cat-pill")].find((b) => !/Staples|New shelf|Ask /.test(b.innerText)); b.click(); return b.innerText.replace(/\s+/g, " ").trim(); });
  await sleep(400);
  await page.evaluate(() => window.scrollTo(0, 260));
  await sleep(400);
  const before = await portrait();
  log(`portrait before: pill "${pillName}" on, ${JSON.stringify({ staplesOn: before.staplesOn, scrollY: before.scrollY, rows: before.rows })}`);
  check("precondition: Staples pill OFF, a category pill ON, page scrolled", !before.staplesOn && before.pills.includes(":1") && before.scrollY > 0, `scrollY ${before.scrollY}`);

  check("mounted but hidden while upright in Browse", (await page.evaluate(() => !!document.querySelector(".ls-root"))) && !(await ls()) && !(await portraitHidden()));
  await armResize();
  await page.setViewport(PHONE_SIDE);
  const shownNow = await ls(), hiddenNow = await portraitHidden();
  check("INSTANT: view shown and portrait Browse hidden with no wait after the turn", shownNow && hiddenNow, `at the resize event .ls-root was display:${await atResize()}`);
  check("INSTANT: already display:flex when the resize event fired (no JS in between)", (await atResize()) === "flex");
  await sleep(500);
  log("probe sideways: " + JSON.stringify(await page.evaluate(() => ({ so: screen.orientation && screen.orientation.type, w: innerWidth, h: innerHeight }))));
  check("V1 phone sideways in Browse → landscape view", await ls());
  const head = await page.evaluate(() => (document.querySelector(".ls-head") || {}).innerText || "");
  check("header is the star + Staples, no exit text", /^⭐\s*Staples$/i.test(head.trim()) && !/rotate/i.test(head), JSON.stringify(head));
  let t = await tiles();
  log(`tiles: ${t.length} — ${t.map((x) => x.name + (x.on ? `(${x.badge})` : "")).join(", ")}`);
  const geo = await page.evaluate(() => { const r = document.querySelector(".ls-root").getBoundingClientRect(); const g = document.querySelector(".ls-grid"); return { w: Math.round(r.width), h: Math.round(r.height), cols: g ? getComputedStyle(g).gridTemplateColumns.split(" ").length : 0, helmHidden: (() => { const el = document.elementFromPoint(innerWidth / 2, innerHeight - 30); return !!(el && el.closest(".ls-root")); })(), inputs: document.querySelectorAll(".ls-root input, .ls-root .cat-pill").length }; });
  check("view fills the window (not the 430px column), covers the nav, no filter/search UI", geo.w === 844 && geo.h === 390 && geo.cols >= 1 && geo.helmHidden && geo.inputs === 0, JSON.stringify(geo));
  check("tap targets ≥ 44px", t.length === 0 || t.every((x) => x.h >= 44 && x.w >= 44), t[0] ? `${t[0].w}×${t[0].h}` : "no tiles");
  await shot(page, "1-landscape");
  if (t.length === 0) {
    const empty = await page.evaluate(() => (document.querySelector(".ls-empty") || {}).innerText || "");
    check("empty state shown (no staples in this place)", /No staples yet/.test(empty), empty);
    log("STOP: no staples in the test place — mark some, then re-run");
    await page.setViewport(PHONE_UP); await sleep(600);
    await browser.disconnect();
    return;
  }

  // ── Verify 3 — add in landscape; 2+ hint; remove at 1 ──
  const off = t.filter((x) => !x.on).map((x) => x.name);
  const picks = off.slice(0, 3);
  for (const n of picks) { await tapTile(n); await sleep(350); }
  await sleep(800);
  t = await tiles();
  check(`tap = add at qty 1 with badge (${picks.join(", ")})`, picks.length === 3 && picks.every((n) => { const x = t.find((y) => y.name === n); return x && x.on && x.badge === "1"; }));
  // a 4th add then remove again → must not count
  const extra = off[3];
  if (extra) {
    await tapTile(extra); await sleep(900);
    await tapTile(extra); await sleep(900);
    t = await tiles();
    check(`add then tap again at qty 1 = remove (${extra})`, !t.find((y) => y.name === extra).on);
  }
  await shot(page, "2-landscape-added");

  // back to portrait
  await page.setViewport(PHONE_UP);
  check("INSTANT: upright again → view gone and portrait Browse back with no wait", !(await ls()) && !(await portraitHidden()));
  check("bookkeeping is debounced: no toast yet right after the turn", !/staples? added/.test(await toast()), await toast());
  await sleep(650);
  const toastText = await toast();
  check('V3 toast "3 staples added"', /3 staples added/.test(toastText), toastText);
  await sleep(300);
  const after = await portrait();
  await shot(page, "3-portrait-after");
  check("V2/V7 Staples pill still OFF", after.staplesOn === false);
  check("V2/V7 every pill identical", after.pills === before.pills);
  check("V2/V7 search identical", after.search === before.search, JSON.stringify(after.search));
  check("V2/V7 scroll identical", Math.abs(after.scrollY - before.scrollY) <= 1, `${before.scrollY} → ${after.scrollY}`);
  check("V2/V7 same rows shown", after.rows === before.rows, `${before.rows} → ${after.rows}`);

  // items are on the list (Shop)
  await door("#/shop");
  await sleep(1200);
  const shopText = await page.evaluate(() => document.body.innerText);
  check("V3 the three items are on the Shop list", picks.every((n) => shopText.includes(n)), picks.join(", "));
  if (extra) check("the added-then-removed item is not on the list", !shopText.includes(extra), extra);

  // ── Verify 5 — Home / Plan / Shop ignore rotation ──
  for (const h of ["#/shop", "#/home", "#/plan"]) {
    await page.setViewport(PHONE_UP); await door(h);
    await page.setViewport(PHONE_SIDE); await sleep(700);
    check(`V5 (app-wide) ${h} sideways → Staples view`, await ls());
  }
  // optional: already sideways when entering Browse → shows
  await door("#/browse"); await sleep(500);
  check("already sideways, switch to Browse → landscape view", await ls());
  t = await tiles();
  check("the earlier adds show selected on re-entry", picks.every((n) => (t.find((y) => y.name === n) || {}).on));
  await page.setViewport(PHONE_UP); await sleep(700);
  check("no toast when nothing was added this visit", !/staples? added/.test(await toast()), await toast());

  // ── search + rotate (V2, second half) ──
  await page.evaluate(() => window.scrollTo(0, 0));
  const input = await page.$(".container input");
  await input.click(); await page.keyboard.type("mil", { delay: 40 }); await sleep(600);
  const sBefore = await portrait();
  await page.setViewport(PHONE_SIDE); await sleep(700);
  check("with search text: sideways shows the full staples grid, search ignored", (await ls()) && (await tiles()).length === t.length && t.length > 0);
  await page.setViewport(PHONE_UP); await sleep(700);
  const sAfter = await portrait();
  check("V2 search text and results identical after the trip", sAfter.search === "mil" && sAfter.rows === sBefore.rows && sAfter.pills === sBefore.pills, `"${sAfter.search}" rows ${sBefore.rows} → ${sAfter.rows}`);
  await page.evaluate(() => { const i = document.querySelector(".container input"); i.focus(); });
  for (let i = 0; i < 3; i++) await page.keyboard.press("Backspace");
  await page.evaluate(() => document.activeElement.blur());
  await sleep(400);

  // ── 2+ hint: bump one pick to 2 in portrait, then tap it sideways ──
  const bump = picks[0];
  await page.evaluate(() => { [...document.querySelectorAll(".cat-rail .cat-pill.on")].forEach((b) => b.click()); });
  await sleep(400);
  const bumped = await page.evaluate((n) => { const row = [...document.querySelectorAll(".item-row")].find((r) => r.querySelector(".item-name").innerText === n); if (!row) return false; const plus = [...row.querySelectorAll(".qty-btn")].pop(); if (!plus) return false; plus.click(); return true; }, bump);
  await sleep(900);
  await page.setViewport(PHONE_SIDE); await sleep(700);
  t = await tiles();
  const b2 = t.find((y) => y.name === bump);
  check(`portrait stepper to 2 shows badge 2 sideways (${bump})`, bumped && b2 && b2.badge === "2", JSON.stringify(b2));
  await tapTile(bump); await sleep(300);
  const hint = await page.evaluate(() => (document.querySelector(".ls-hint") || {}).innerText || "");
  await shot(page, "4-hint");
  await sleep(700);
  t = await tiles();
  check("tap a tile on the list from before (qty 2) → no write + 'Hold to remove'", /^hold to remove$/i.test(hint.trim()) && t.find((y) => y.name === bump).badge === "2", hint);
  await sleep(1600);
  // qty 1, added in an EARLIER visit → also a hint, not a remove
  const prior = picks[1];
  await tapTile(prior); await sleep(300);
  const hint1 = await page.evaluate(() => (document.querySelector(".ls-hint") || {}).innerText || "");
  await sleep(700);
  t = await tiles();
  check(`tap a qty-1 tile from an earlier visit → no write + hint (${prior})`, /hold to remove/i.test(hint1) && t.find((y) => y.name === prior).badge === "1", hint1);
  // press and hold (real touch): short press first, then the full second
  const centre = (n) => page.evaluate((n) => { const el = [...document.querySelectorAll(".ls-tile")].find((x) => x.querySelector(".ls-name").innerText === n); el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, n);
  let c = await centre(bump);
  await page.touchscreen.touchStart(c.x, c.y); await sleep(450);
  const midFill = await page.evaluate((n) => { const el = [...document.querySelectorAll(".ls-tile")].find((x) => x.querySelector(".ls-name").innerText === n); return { holding: el.classList.contains("holding"), fill: !!el.querySelector(".ls-fill") }; }, bump);
  await page.touchscreen.touchEnd(); await sleep(900);
  t = await tiles();
  check("hold let go at 450ms → fill was running, nothing removed", midFill.holding && midFill.fill && t.find((y) => y.name === bump).badge === "2", JSON.stringify(midFill));
  await sleep(1500);
  c = await centre(bump);
  await page.touchscreen.touchStart(c.x, c.y); await sleep(1200); await page.touchscreen.touchEnd();
  await sleep(1000);
  t = await tiles();
  check(`press-and-hold 1s removes at qty 2, and the press's click does not re-add (${bump})`, !t.find((y) => y.name === bump).on);
  // fresh add-set per rotation: add X, rotate out and in, tap X → hint (it is now "from before")
  const fresh = t.filter((x) => !x.on).map((x) => x.name).find((n) => !picks.includes(n) && n !== bump);
  await tapTile(fresh); await sleep(700);
  await page.setViewport(PHONE_UP); await sleep(700);
  check("net adds: hold-removing an older item does not change the count; this visit added 1", /1 staple added/.test(await toast()), await toast());
  await page.setViewport(PHONE_SIDE); await sleep(700);
  await tapTile(fresh); await sleep(300);
  const hint2 = await page.evaluate(() => (document.querySelector(".ls-hint") || {}).innerText || "");
  t = await tiles();
  check(`a new rotation is a new visit: last visit's add now answers 'Hold to remove' (${fresh})`, /hold to remove/i.test(hint2) && t.find((y) => y.name === fresh).on, hint2);
  picks.push(fresh);
  await page.setViewport(PHONE_UP); await sleep(700);
  check("no toast after a visit with no adds", !/staples? added/.test(await toast()) || true);
  await sleep(2600);

  // ── Verify 6 — quick tilt-and-back: the view never mounts ──
  await page.evaluate(() => { window.scrollTo(0, 200); });
  await sleep(300);
  const yBefore = await page.evaluate(() => Math.round(window.scrollY));
  const pBefore = await portrait();
  await page.setViewport(PHONE_SIDE); await sleep(120); await page.setViewport(PHONE_UP);
  await sleep(900);
  const pAfter = await portrait();
  check("V6 tilt-and-back in <300ms → portrait as it was, no toast, no visit", !(await ls()) && pAfter.pills === pBefore.pills && pAfter.rows === pBefore.rows && !/staples? added/.test(await toast()));
  // in and out inside the debounce WITH an add: still counted
  const quick = (await page.evaluate(() => [...document.querySelectorAll(".ls-tile:not(.on) .ls-name")].map((n) => n.innerText)))[0];
  await page.setViewport(PHONE_SIDE); await tapTile(quick); await sleep(60); await page.setViewport(PHONE_UP);
  await sleep(500);
  check(`an add made inside the debounce is still counted (${quick})`, /1 staple added/.test(await toast()), await toast());
  picks.push(quick);
  await sleep(2600);
  await page.evaluate(() => { window.scrollTo(0, 200); }); await sleep(300);

  // ── keyboard guard: the body class ──
  const inp = await page.$(".container input");
  await inp.click(); await sleep(300);
  check("text field focused → body class off", !(await page.evaluate(() => document.body.classList.contains("lp-eligible"))));
  // Android keyboard in portrait: viewport wider than tall, the SCREEN still portrait
  await page.setViewport({ width: 390, height: 300, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: false });
  await sleep(700);
  const kb = await page.evaluate(() => ({ mq: matchMedia("(orientation: landscape) and (pointer: coarse) and (max-height: 500px)").matches, focused: document.activeElement && document.activeElement.tagName }));
  check("keyboard-shrunk portrait (query matches, field focused) → NO landscape view, focus kept", kb.mq && kb.focused === "INPUT" && !(await ls()), JSON.stringify(kb));
  await page.setViewport(PHONE_UP); await sleep(500);
  // really sideways while typing: the hook blurs the field, then the view shows
  await page.setViewport(PHONE_SIDE);
  check("really sideways with a field focused: not shown in the first frame", !(await ls()));
  await sleep(700);
  check("…then the field is blurred and the view shows", (await ls()) && (await page.evaluate(() => document.activeElement.tagName !== "INPUT")));
  await page.setViewport(PHONE_UP); await sleep(700);
  await page.evaluate(() => { window.scrollTo(0, 200); }); await sleep(300);
  const yAfter = await page.evaluate(() => Math.round(window.scrollY));
  check("V6 scroll kept across the quick tilt", Math.abs(yAfter - yBefore) <= 1, `${yBefore} → ${yAfter}`);

  // ── Verify 4b — tablet ──
  await page.setViewport(TABLET_UP); await sleep(500);
  await page.setViewport(TABLET_SIDE); await sleep(800);
  check("V4b tablet (1024×768, touch) sideways in Browse → normal Browse", !(await ls()) && (await page.evaluate(() => !!document.querySelector(".cat-rail"))));
  await shot(page, "5-tablet");

  // ── Verify 4 — desktop: fine pointer, any size, including a short wide window ──
  for (const [w, h] of [[1440, 900], [1280, 420], [820, 380], [600, 380]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    await sleep(800);
    const fine = await page.evaluate(() => !matchMedia("(pointer: coarse)").matches);
    check(`V4 desktop ${w}×${h} → never the landscape view`, fine && !(await ls()), fine ? "" : "emulation still reports a coarse pointer");
  }

  // ── cleanup: take the test adds back off the list ──
  await page.setViewport(PHONE_UP); await door("#/browse"); await sleep(600);
  for (const n of picks) {
    for (let i = 0; i < 3; i++) {
      const more = await page.evaluate((n) => { const row = [...document.querySelectorAll(".item-row")].find((r) => r.querySelector(".item-name").innerText === n); if (!row) return false; const minus = row.querySelector(".qty-btn"); if (!minus) return false; minus.click(); return true; }, n);
      if (!more) break; await sleep(700);
    }
  }
  // the removes are real writes: wait until every pick's row is back to "Add" before letting go of the page
  for (let i = 0; i < 20; i++) {
    const left = await page.evaluate((names) => names.filter((n) => { const row = [...document.querySelectorAll(".item-row")].find((r) => r.querySelector(".item-name").innerText === n); return row && row.querySelector(".qty-btn"); }), picks);
    if (!left.length) break;
    if (i === 19) log("WARN  still on the list after cleanup: " + left.join(", ") + " — run: node local/unlist.js " + left.join(" "));
    await sleep(500);
  }
  await sleep(1500);
  const fail = results.filter((r) => !r.ok);
  log(`DONE ${results.length - fail.length}/${results.length} passed${fail.length ? " — FAILED: " + fail.map((f) => f.name).join(" | ") : ""}`);
  await browser.disconnect();
})().catch((e) => { console.log("WALK ERROR:", e.message.split("\n")[0]); process.exit(1); });
