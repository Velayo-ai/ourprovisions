// The installed app with the page UNDER the status bar (status-bar style black-translucent, 2026-11-12):
// a 62px top safe-area inset is emulated, and the page's own display-mode: standalone rules are switched on. Checks that the dark strip is
// there, that the header's content and every top-anchored surface stay out from under it on each tab,
// that nothing is left sideways, and that a browser tab (no inset) is unchanged.
// LOCAL build, dev test account. node local/under-bar.js
// Emulation only: whether iOS really reports the inset, and how its own blur looks, is a phone check.
const { LOCAL_URL } = require("./use-local");
const { sleep, log, connect, firstPage, OUT } = require("../lib");
const path = require("path");
const BAR = 62;
let fails = 0, checks = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) fails++; log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

(async () => {
  const browser = await connect();
  const page = await firstPage(browser);
  const cdp = await page.createCDPSession();
  const metrics = (w, h, land) => cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, screenWidth: w, screenHeight: h, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: land ? "landscapePrimary" : "portraitPrimary", angle: land ? 90 : 0 } });
  const insets = (top) => cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top, topMax: top } });
  const go = async (hash) => { await page.evaluate((h) => { window.location.hash = h; }, hash); await sleep(1500); };
  const top = () => page.evaluate(() => {
    const strip = getComputedStyle(document.getElementById("op-status-strip"));
    const rect = (sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect() : null; };
    const header = rect(".header"), row1 = document.querySelector(".header > div");
    const firstHeaderThing = row1 ? Math.min(...[...row1.querySelectorAll("button, span, svg, img")].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => r.top)) : null;
    return {
      strip: `${strip.position} top ${strip.top} h ${strip.height} ${strip.backgroundColor} z ${strip.zIndex}`, stripH: parseFloat(strip.height) || 0, stripBg: strip.backgroundColor,
      underBar: getComputedStyle(document.documentElement).getPropertyValue("--op-under-bar").trim(),
      headerTop: header ? Math.round(header.top) : null, headerPad: getComputedStyle(document.querySelector(".header")).paddingTop,
      row1Top: row1 ? Math.round(row1.getBoundingClientRect().top) : null, firstHeaderThing: firstHeaderThing == null ? null : Math.round(firstHeaderThing),
      legacyBand: (() => { const r = rect(".safe-top"); return `${r.top}/${r.height}`; })(),
      probe: (document.querySelector(".inset-probe") || {}).innerText || null,
    };
  });
  // the highest (smallest top) visible box among the given selectors, i.e. the top of an open sheet/modal's panel
  const panelTop = (sels) => page.evaluate((sels) => { const tops = sels.flatMap((s) => [...document.querySelectorAll(s)]).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0).map((r) => r.top); return tops.length ? Math.round(Math.min(...tops)) : null; }, sels);

  try {
    // ── A. browser tab: no inset, nothing changes ──
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(LOCAL_URL + "#/shop", { waitUntil: "networkidle2", timeout: 60000 }); await page.reload({ waitUntil: "networkidle2" }); await sleep(2500);
    const tab = await top();
    check("browser tab: no strip, no padding, header at the top", tab.stripH === 0 && tab.underBar === "0px" && tab.headerPad === "0px" && tab.headerTop === 0 && tab.probe === null, JSON.stringify({ strip: tab.strip, underBar: tab.underBar, headerPad: tab.headerPad }));

    // ── B. installed app, page under a 62px bar ──
    const sid = await page.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator, "standalone", { get: () => true }); } catch (e) {} });
    await metrics(390, 844, false); await insets(BAR);
    await page.goto(LOCAL_URL + "#/home", { waitUntil: "networkidle2" }); await page.reload({ waitUntil: "networkidle2" }); await sleep(3000);
    // This Chrome cannot emulate display-mode: standalone (neither puppeteer nor the protocol call takes it), so the
    // page's OWN standalone rules are switched on by hand: every rule inside an "@media (display-mode: standalone)"
    // block, from index.html and from the app's style block, is copied out of its media query unchanged.
    const forced = await page.evaluate(() => {
      let css = "", n = 0;
      for (const sheet of document.styleSheets) { let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
        for (const r of rules) if (r.type === CSSRule.MEDIA_RULE && /display-mode:\s*standalone/.test(r.conditionText)) for (const inner of r.cssRules) { css += inner.cssText + " "; n++; } }
      const el = document.createElement("style"); el.id = "forced-standalone"; el.textContent = css; document.body.appendChild(el);   // last in the document, as the real rule is last in its sheet: it must beat the ":root { --op-under-bar: 0px }" default
      return n;
    });
    log(`standalone rules switched on by hand: ${forced}`);
    // the probe read its numbers at load, before those rules were on: a resize makes it read again
    await page.evaluate(() => window.dispatchEvent(new Event("resize"))); await sleep(600);
    const env = await page.evaluate(() => { const d = document.createElement("div"); d.style.cssText = "position:fixed;padding-top:env(safe-area-inset-top,0px)"; document.body.appendChild(d); const v = getComputedStyle(d).paddingTop; d.remove(); return v; });
    check(`emulation took: env(safe-area-inset-top) = ${BAR}px, and the page's standalone rules are on`, env === `${BAR}px` && forced >= 2, `${env}, ${forced} rules`);
    if (env !== `${BAR}px`) throw new Error("this Chrome cannot emulate a safe-area inset — nothing below would mean anything");

    for (const [hash, name] of [["#/home", "Home"], ["#/plan", "Plan"], ["#/browse", "Browse"], ["#/shop", "Shop"]]) {
      await go(hash); await page.evaluate(() => window.scrollTo(0, 0)); await sleep(400);
      const t = await top();
      check(`${name}: dark strip behind the clock — fixed at the top, ${BAR}px, the header's dark, above everything`, t.stripH === BAR && t.stripBg === "rgb(26, 14, 6)" && /fixed top 0px/.test(t.strip) && / z 5000$/.test(t.strip), t.strip);
      check(`${name}: header box runs to the top of the screen; its content starts below the bar`, t.headerTop === 0 && t.headerPad === `${BAR}px` && t.row1Top === BAR && t.firstHeaderThing >= BAR, `header top ${t.headerTop}, row 1 at ${t.row1Top}, first control at ${t.firstHeaderThing}`);
      check(`${name}: the old-icon band is 0 tall here (the page is not below the bar)`, t.legacyBand === "0/0", t.legacyBand);
      if (name === "Home") { log("probe: " + (t.probe || "").replace(/\n/g, " | ")); check("probe reads the inset: env 62px, --op-under-bar 62px", /env\(safe-area-inset-top\): 62px/.test(t.probe || "") && /--op-under-bar: 62px/.test(t.probe || ""), ""); await page.screenshot({ path: path.join(OUT, "under-bar-home.png"), clip: { x: 0, y: 0, width: 390, height: 300 } }); await page.evaluate(() => { const p = document.querySelector(".inset-probe"); if (p) p.click(); }); }
    }

    // Browse: the sticky search sticks below the bar
    await go("#/browse"); await page.evaluate(() => window.scrollTo(0, 900)); await sleep(500);
    const stuck = await page.evaluate(() => { const el = [...document.querySelectorAll(".container div")].find((d) => getComputedStyle(d).position === "sticky"); const r = el.getBoundingClientRect(); return { top: Math.round(r.top), inputTop: Math.round(el.querySelector("input").getBoundingClientRect().top) }; });
    await page.screenshot({ path: path.join(OUT, "under-bar-browse-stuck.png"), clip: { x: 0, y: 0, width: 390, height: 200 } });
    check("Browse: sticky search sticks at the bar's lower edge, its field clear of the clock", stuck.top === BAR && stuck.inputTop > BAR, JSON.stringify(stuck));

    // sheets and modals: the top of every panel is at or below the bar
    await go("#/shop"); await page.evaluate(() => window.scrollTo(0, 0));
    const opened = [];
    const tryOpen = async (label, open, sels, close) => {
      const did = await open().catch(() => false);
      await sleep(900);
      const t = await panelTop(sels);
      if (!did || t === null) { log(`SKIP  ${label}: could not open (${did}, ${t})`); return; }
      opened.push(label);
      check(`${label}: its panel starts at or below the bar`, t >= BAR, `panel top ${t}px`);
      await close().catch(() => {}); await sleep(700);
    };
    const esc = () => page.keyboard.press("Escape");
    await tryOpen("Shop Add sheet", () => page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((b) => /^\+?\s*Add$/i.test(b.innerText.trim())); if (b) { b.click(); return true; } return false; }), [".add-sheet"], async () => { await page.evaluate(() => { const s = document.querySelector(".add-sheet-scrim"); if (s) s.click(); }); });
    await tryOpen("Profile sheet", () => page.evaluate(() => { const b = document.querySelector(".header button[aria-label*='ccount'], .header button[aria-label*='rofile']") || [...document.querySelectorAll(".header button")].pop(); if (b) { b.click(); return true; } return false; }), ["[role=dialog]"], esc);
    await tryOpen("Place modal (household name)", () => page.evaluate(() => { const b = [...document.querySelectorAll(".header button")].find((b) => /cody test house/i.test(b.innerText)); if (b) { b.click(); return true; } return false; }), [".modal", "[role=dialog]"], esc);
    await go("#/browse");
    await tryOpen("New item modal (Browse)", () => page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((b) => /New item/.test(b.innerText)); if (b) { b.click(); return true; } return false; }), [".modal"], esc);
    await tryOpen("New shelf sheet (Browse)", () => page.evaluate(() => { const b = [...document.querySelectorAll("button.cat-pill")].find((b) => /New shelf/.test(b.innerText)); if (b) { b.click(); return true; } return false; }), ["[role=dialog]"], esc);
    await go("#/plan");
    await tryOpen("New meal (Plan)", () => page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((b) => /^\+?\s*(New|Add a meal)$/i.test(b.innerText.trim())); if (b) { b.click(); return true; } return false; }), [".modal", "[role=dialog]"], esc);
    check("at least three sheets / modals were opened and measured", opened.length >= 3, opened.join(", "));

    // sideways: iOS hides the bar → inset 0 → no strip, Staples from the top edge
    await go("#/browse");
    await insets(0); await metrics(844, 390, true); await sleep(900);
    const side = await page.evaluate(() => { const s = getComputedStyle(document.getElementById("op-status-strip")); const ls = document.querySelector(".ls-root"); const head = document.querySelector(".ls-head .cat-title"); return { stripH: parseFloat(s.height) || 0, lsShown: !!ls && getComputedStyle(ls).display !== "none", lsTop: ls ? Math.round(ls.getBoundingClientRect().top) : null, titleTop: head ? Math.round(head.getBoundingClientRect().top) : null }; });
    check("sideways (bar hidden, inset 0): no strip, no gap — Staples starts at the top edge with its own 18px of air", side.stripH === 0 && side.lsShown && side.lsTop === 0 && side.titleTop >= 18 && side.titleTop <= 22, JSON.stringify(side));
    await metrics(390, 844, false); await insets(BAR); await sleep(900);
    const back = await top();
    check("upright again: strip and header padding are back", back.stripH === BAR && back.row1Top === BAR, back.strip);
    await page.removeScriptToEvaluateOnNewDocument(sid.identifier);
  } finally {
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: {} }).catch(() => {});
    await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
    await cdp.detach().catch(() => {});
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(LOCAL_URL + "#/home", { waitUntil: "networkidle2" }).catch(() => {});
    await page.reload({ waitUntil: "networkidle2" }).catch(() => {});
  }
  log(`DONE ${checks - fails}/${checks} passed`);
  await browser.disconnect();
})().catch((e) => { console.log("UNDER-BAR ERROR:", e.message.split("\n")[0]); process.exit(1); });
