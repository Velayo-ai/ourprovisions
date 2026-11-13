// The landscape view with NO staples: the three-line empty state, centred under the header rule.
// The test place keeps its staples — this page's own reads of household_staples are answered with [].
// LOCAL build, dev test account. node local/empty-state.js   → out/ls-empty.png
const { LOCAL_URL } = require("./use-local");
const { sleep, log, connect, firstPage, OUT } = require("../lib");
const path = require("path");
const UP = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: false };
const SIDE = { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true };
let fails = 0, checks = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) fails++; log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

(async () => {
  const browser = await connect();
  const page = await firstPage(browser);
  await page.setRequestInterception(true);
  const onReq = (req) => {
    if (req.method() === "GET" && /\/rest\/v1\/household_staples\b/.test(req.url())) {
      return req.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "[]" });
    }
    return req.continue();
  };
  page.on("request", onReq);
  try {
    await page.setViewport(UP);
    await page.goto(LOCAL_URL + "#/browse", { waitUntil: "networkidle2", timeout: 60000 });
    await page.reload({ waitUntil: "networkidle2" });
    await page.waitForSelector(".cat-rail .cat-pill", { timeout: 30000 }); await sleep(2000);
    await page.evaluate(() => localStorage.setItem("op_landscape_hint_visits", "3"));
    await page.setViewport(SIDE); await sleep(700);
    const e = await page.evaluate(() => {
      const root = document.querySelector(".ls-root"), block = document.querySelector(".ls-empty");
      if (!block) return { block: false, tiles: document.querySelectorAll(".ls-tile").length };
      const r = block.getBoundingClientRect(), head = document.querySelector(".ls-head").getBoundingClientRect(), rr = root.getBoundingClientRect();
      const line = (sel) => { const el = block.querySelector(sel); const c = getComputedStyle(el); return { text: el.innerText, size: c.fontSize, weight: c.fontWeight, color: c.color, align: getComputedStyle(block).textAlign }; };
      return { block: true, tiles: document.querySelectorAll(".ls-tile").length, title: line(".ls-empty-title"), body: line(".ls-empty-body"), how: line(".ls-empty-how"),
        width: Math.round(r.width), leftGap: Math.round(r.left - rr.left), rightGap: Math.round(rr.right - r.right),
        spaceAbove: Math.round(r.top - head.bottom), spaceBelow: Math.round(rr.bottom - r.bottom),
        header: document.querySelector(".ls-head .cat-title").innerText, buttons: block.querySelectorAll("button, img, svg").length,
        headerColor: getComputedStyle(document.querySelector(".ls-head .cat-title")).color };
    });
    await page.screenshot({ path: path.join(OUT, "ls-empty.png") });
    log(JSON.stringify(e));
    check("no staples → the empty block, no tiles", e.block && e.tiles === 0);
    if (e.block) {
      check('line 1 "Your everyday essentials": header colour, 17px', e.title.text === "Your everyday essentials" && e.title.size === "17px" && e.title.color === e.headerColor, JSON.stringify(e.title));
      check("line 2: muted, body size (15px)", /^Star the items you buy most/.test(e.body.text) && e.body.size === "15px" && e.body.color !== e.title.color, JSON.stringify(e.body));
      check("line 3: smaller (13px), muted", e.how.text === "In Browse, swipe left on any item and tap Staple." && e.how.size === "13px" && e.how.color === e.body.color, JSON.stringify(e.how));
      check("centred: text-align centre, equal side gaps, max-width 440", e.title.align === "center" && Math.abs(e.leftGap - e.rightGap) <= 1 && e.width <= 440, `${e.leftGap}/${e.rightGap}, ${e.width}px wide`);
      check("vertically centred under the header rule (24px bottom padding is part of the block)", Math.abs(e.spaceAbove - e.spaceBelow) <= 1, `${e.spaceAbove} above, ${e.spaceBelow} below`);
      check("header keeps its star; text only in the block", /^⭐\s*STAPLES$/i.test(e.header.trim()) && e.buttons === 0, e.header);
    }
    await page.setViewport(UP); await sleep(600);
  } finally {
    page.off("request", onReq);
    await page.setRequestInterception(false);
    await page.reload({ waitUntil: "networkidle2" }).catch(() => {});
  }
  log(`DONE ${checks - fails}/${checks} passed`);
  await browser.disconnect();
})().catch((e) => { console.log("EMPTY-STATE ERROR:", e.message.split("\n")[0]); process.exit(1); });
