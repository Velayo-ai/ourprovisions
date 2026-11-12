// Rapid rotate cycles, with mid-rotation resize sequences, must leave the Helm at the bottom.
// LOCAL build, dev test account. node local/rotation.js
const { LOCAL_URL } = require("./use-local");
const { sleep, log, connect, firstPage } = require("../lib");
const vp = (width, height, isLandscape) => ({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape });
const UP = vp(390, 844, false), SIDE = vp(844, 390, true);
// What iOS can report on the way round: half-turned squares, the new width with the old height, and back.
const MID = [vp(600, 600, false), vp(844, 600, true), vp(500, 390, true), vp(390, 500, false), vp(700, 700, true), vp(844, 844, true)];
let fails = 0, checks = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) { fails++; log(`FAIL  ${name}  — ${detail}`); } };

(async () => {
  const browser = await connect();
  const page = await firstPage(browser);
  const chrome = () => page.evaluate(() => {
    const r = (sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect() : null; };
    const helm = r(".helm"), fade = r(".helm-fade"), ls = document.querySelector(".ls-root"), vv = window.visualViewport;
    return {
      ih: innerHeight, iw: innerWidth,
      helmBottomGap: helm ? Math.round(innerHeight - helm.bottom) : null, helmH: helm ? Math.round(helm.height) : null,
      helmLeft: helm ? Math.round(helm.left) : null, helmRight: helm ? Math.round(innerWidth - helm.right) : null,
      fadeBottomGap: fade ? Math.round(innerHeight - fade.bottom) : null,
      vvTop: vv ? Math.round(vv.offsetTop) : 0, vvH: vv ? Math.round(vv.height) : null,
      lsShown: !!ls && getComputedStyle(ls).display !== "none",
      frameVisible: getComputedStyle(document.querySelector(".phone-frame")).visibility,
      frameTransform: getComputedStyle(document.querySelector(".phone-frame")).transform,
      insetTop: getComputedStyle(document.documentElement).getPropertyValue("--op-inset-top").trim(),
      scrollY: Math.round(window.scrollY),
    };
  });
  const assertPortrait = async (where, wantScroll) => {
    const c = await chrome();
    const ok = c.ih === 844 && c.helmBottomGap === 18 && c.fadeBottomGap === 0 && c.helmLeft === c.helmRight && c.vvTop === 0 && c.vvH === c.ih
      && !c.lsShown && c.frameVisible === "visible" && c.frameTransform === "none" && (wantScroll == null || Math.abs(c.scrollY - wantScroll) <= 1);
    check(where, ok, JSON.stringify(c) + (wantScroll != null ? ` wantScroll ${wantScroll}` : ""));
    return c;
  };

  for (const [hash, name] of [["#/browse", "Browse"], ["#/shop", "Shop"], ["#/home", "Home"], ["#/plan", "Plan"]]) {
    await page.setViewport(UP);
    await page.goto(LOCAL_URL + "" + hash, { waitUntil: "networkidle2", timeout: 60000 });
    await sleep(2500);
    const maxY = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
    const before = await assertPortrait(`${name}: baseline`);
    let seed = 7;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let i = 0; i < 12; i++) {
      const y = Math.min(maxY, 60 + rnd(400));
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await sleep(120);
      const startY = await page.evaluate(() => Math.round(window.scrollY));
      // out: 0–3 mid-rotation sizes, then sideways; dwell 0–500ms; back: 0–3 mid sizes, then upright
      for (let k = rnd(4); k > 0; k--) { await page.setViewport(MID[rnd(MID.length)]); await sleep(rnd(60)); }
      await page.setViewport(SIDE);
      // At least two frames sideways: a flip-and-back INSIDE one frame reaches the page as a single resize with the
      // portrait size (it never sees landscape) — an emulation artefact; a real rotation takes hundreds of ms.
      await sleep([34, 60, 150, 320, 500][rnd(5)]);
      if (name === "Browse" && i % 3 === 0) await page.evaluate(() => { const g = document.querySelector(".ls-grid"); if (g) g.scrollTop = 80; });
      for (let k = rnd(4); k > 0; k--) { await page.setViewport(MID[rnd(MID.length)]); await sleep(rnd(60)); }
      await page.setViewport(UP);
      // immediately after the turn: chrome must already be at the bottom (CSS), before anything settles
      const now = await chrome();
      check(`${name} #${i}: Helm at the bottom in the first frame upright`, now.helmBottomGap === 18 && now.fadeBottomGap === 0 && now.vvTop === 0, JSON.stringify(now));
      await sleep(750);
      await assertPortrait(`${name} #${i}: settled`, name === "Browse" ? startY : null);
    }
    // a burst: 10 full turns with no pause at all
    for (let i = 0; i < 10; i++) { await page.setViewport(SIDE); await page.setViewport(MID[i % MID.length]); await page.setViewport(UP); }
    await sleep(750);
    const after = await assertPortrait(`${name}: after a 10-turn burst`);
    log(`${name}: baseline helm gap ${before.helmBottomGap}, after ${after.helmBottomGap}; --op-inset-top "${after.insetTop}"`);
  }
  // Browse, field focused while turning (keyboard path): settle must not scroll the page under a focused field
  await page.setViewport(UP);
  await page.goto(LOCAL_URL + "#/browse", { waitUntil: "networkidle2" }); await sleep(2000);
  await page.evaluate(() => window.scrollTo(0, 180)); await sleep(150);
  await (await page.$(".container input")).click(); await sleep(200);
  await page.setViewport(SIDE); await sleep(700); await page.setViewport(UP); await sleep(750);
  await assertPortrait("Browse: turned with the search field focused");
  log(`DONE ${checks - fails}/${checks} passed`);
  await browser.disconnect();
})().catch((e) => { console.log("ROTATE ERROR:", e.message.split("\n")[0]); process.exit(1); });
