// Portrait header + status-bar area must be pixel-identical before and after a rotation cycle, on every tab.
// Also: what is actually drawn at the top in portrait, and does the JS-measured top inset survive a rotation
// (installed-app geometry emulated). LOCAL build, dev test account. node local/top-band.js
const { LOCAL_URL } = require("./use-local");
const { sleep, log, connect, firstPage, OUT } = require("../lib");
const path = require("path"), fs = require("fs"), crypto = require("crypto");
const vp = (width, height, isLandscape) => ({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape });
const UP = vp(390, 844, false), SIDE = vp(844, 390, true);
const MID = [vp(600, 600, false), vp(844, 600, true), vp(500, 390, true), vp(390, 500, false), vp(700, 700, true)];
const TOP = { x: 0, y: 0, width: 390, height: 220 };
let fails = 0, checks = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) fails++; log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sha = (buf) => crypto.createHash("sha1").update(buf).digest("hex").slice(0, 12);

(async () => {
  const browser = await connect();
  const page = await firstPage(browser);
  const go = async (hash) => { await page.evaluate((h) => { window.location.hash = h; }, hash); await sleep(1500); };
  const shotTop = async () => { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(350); return page.screenshot({ clip: TOP }); };
  // everything that paints in the top band, front to back, at three x positions
  const topStack = () => page.evaluate(() => {
    const seen = new Map();
    for (const x of [20, 195, 370]) for (const y of [2, 30, 60, 100]) {
      for (const el of document.elementsFromPoint(x, y)) {
        const cs = getComputedStyle(el);
        const key = (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase());
        if (!seen.has(key)) seen.set(key, `${key}[${cs.position}${cs.backgroundImage !== "none" ? " gradient" : ""}${(cs.backdropFilter && cs.backdropFilter !== "none") || (cs.filter && cs.filter !== "none") ? " blur/filter" : ""} bg ${cs.backgroundColor}]`);
      }
    }
    const ls = document.querySelector(".ls-root"), head = document.querySelector(".ls-head");
    const safe = document.querySelector(".safe-top");
    return {
      stack: [...seen.values()],
      lsRoot: ls ? getComputedStyle(ls).display : "absent",
      lsFadeBox: head ? `${head.getBoundingClientRect().width}x${head.getBoundingClientRect().height}` : "absent",
      safeTop: safe ? (() => { const r = safe.getBoundingClientRect(); return `top ${r.top} h ${r.height}`; })() : "absent",
      insetTop: getComputedStyle(document.documentElement).getPropertyValue("--op-inset-top").trim(),
      bodyClass: document.body.className,
      fixedCreamOnBody: [...document.body.children].filter((el) => getComputedStyle(el).position === "fixed" && getComputedStyle(el).display !== "none").map((el) => el.className),
    };
  });
  const cycle = async (kind) => {
    if (kind === "plain") { await page.setViewport(SIDE); await sleep(700); await page.setViewport(UP); }
    else if (kind === "add") { await page.setViewport(SIDE); await sleep(500); await page.evaluate(() => { const g = document.querySelector(".ls-grid"); if (g) g.scrollTop = 60; }); await sleep(300); await page.setViewport(UP); }
    else { for (let i = 0; i < 6; i++) { await page.setViewport(MID[i % MID.length]); await sleep(30); await page.setViewport(SIDE); await sleep(40 + i * 30); await page.setViewport(MID[(i + 2) % MID.length]); await sleep(20); await page.setViewport(UP); await sleep(60); } }
    await sleep(900);
  };

  await page.setViewport(UP);
  await page.goto(LOCAL_URL + "#/home", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(2500);
  await page.evaluate(() => localStorage.setItem("op_landscape_hint_visits", "3"));

  // ── A. browser tab: pixel-identical top band, every tab, three kinds of rotation cycle ──
  for (const [hash, name] of (process.argv[2] === "B" ? [] : [["#/home", "Home"], ["#/plan", "Plan"], ["#/browse", "Browse"], ["#/shop", "Shop"]])) {
    await go(hash);
    const before = await shotTop();
    fs.writeFileSync(path.join(OUT, `top-${name}-before.png`), before);
    const s0 = await topStack();
    if (name === "Shop") log("Shop top band, portrait, before: " + JSON.stringify(s0));
    for (const kind of ["plain", "add", "rapid"]) {
      await cycle(kind);
      const after = await shotTop();
      const same = Buffer.compare(before, after) === 0;
      if (!same) fs.writeFileSync(path.join(OUT, `top-${name}-after-${kind}.png`), after);
      check(`${name}: header + status-bar area pixel-identical after a ${kind} rotation cycle`, same, same ? sha(after) : `${sha(before)} → ${sha(after)}`);
    }
    const s1 = await topStack();
    check(`${name}: nothing new paints in the top band after rotating (same layers, landscape view display:none, inset unchanged)`,
      JSON.stringify(s1) === JSON.stringify(s0) && s1.lsRoot === "none" && s1.lsFadeBox === "0x0", s1.lsRoot + " / fade box " + s1.lsFadeBox + " / inset " + s1.insetTop);
  }

  // ── B. installed-app geometry: navigator.standalone + a 47px status-bar gap → the JS-measured inset through rotations ──
  const cdp = await page.createCDPSession();
  const metrics = (w, h, sw, sh, land) => cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, screenWidth: sw, screenHeight: sh, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: land ? "landscapePrimary" : "portraitPrimary", angle: land ? 90 : 0 } });
  const sid = await page.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator, "standalone", { get: () => true }); } catch (e) {} });
  await metrics(390, 797, 390, 844, false);
  await page.goto(LOCAL_URL + "#/shop", { waitUntil: "networkidle2" });
  await page.reload({ waitUntil: "networkidle2" }); await sleep(3000);   // a hash change is not a new document
  const inset = () => page.evaluate(() => ({ v: getComputedStyle(document.documentElement).getPropertyValue("--op-inset-top").trim(), safe: (() => { const r = document.querySelector(".safe-top").getBoundingClientRect(); return `${r.top}/${r.height}`; })(), standalone: navigator.standalone, gap: screen.height - innerHeight }));
  const i0 = await inset();
  log("installed-app emulation, portrait: " + JSON.stringify(i0));
  check("emulation took: standalone, 47px gap → --op-inset-top 47px", i0.v === "47px", JSON.stringify(i0));
  const seenInsets = [];
  for (let i = 0; i < 6; i++) {
    // sideways (iOS hides the bar: full height), with a half-turned size on the way out and back
    if (i % 2) { await metrics(600, 600, 844, 390, true); await sleep(30); }
    await metrics(844, 390, 844, 390, true); await sleep([60, 200, 500][i % 3]);
    const side = (await inset()).v;
    if (i % 3 === 0) { await metrics(390, 500, 390, 844, false); await sleep(40); }
    await metrics(390, 797, 390, 844, false); await sleep(900);
    seenInsets.push(`${side}→${(await inset()).v}`);
  }
  check("the measured top inset comes back after every rotation (0 sideways → 47px upright)", seenInsets.every((s) => s === "0px→47px"), seenInsets.join(" "));
  // the stale case this guards: upright again but the first readings are mid-rotation numbers
  await metrics(844, 390, 844, 390, true); await sleep(400);
  await metrics(390, 600, 390, 844, false); await sleep(100);       // not a bar height: must not be latched as "no bar"
  const mid = (await inset()).v;
  await metrics(390, 797, 390, 844, false); await sleep(900);
  check("a mid-rotation reading does not stick: settled upright → 47px", (await inset()).v === "47px", `mid ${mid} → settled ${(await inset()).v}`);
  await page.removeScriptToEvaluateOnNewDocument(sid.identifier);
  await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  await cdp.detach();
  await page.setViewport(UP);
  await page.goto(LOCAL_URL + "#/home", { waitUntil: "networkidle2" });
  log(`DONE ${checks - fails}/${checks} passed`);
  await browser.disconnect();
})().catch((e) => { console.log("TOPBAND ERROR:", e.message.split("\n")[0]); process.exit(1); });
