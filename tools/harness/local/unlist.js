// Take named items back off the test place's list through Browse's own stepper — for a check that died midway.
//   node local/unlist.js Apples Bananas …      (no names: just prints what Shop shows)
const { LOCAL_URL } = require("./use-local");
const { sleep, log, connect, firstPage } = require("../lib");
(async () => {
  const b = await connect(); const p = await firstPage(b);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto(LOCAL_URL + "#/browse", { waitUntil: "networkidle2" }); await p.waitForSelector(".cat-rail .cat-pill"); await sleep(2000);
  await p.evaluate(() => { [...document.querySelectorAll(".cat-rail .cat-pill.on")].forEach((x) => x.click()); }); await sleep(500);
  for (const n of process.argv.slice(2)) for (let i = 0; i < 5; i++) {
    const more = await p.evaluate((n) => { const row = [...document.querySelectorAll(".item-row")].find((r) => r.querySelector(".item-name").innerText === n); if (!row) return false; const minus = row.querySelector(".qty-btn"); if (!minus) return false; minus.click(); return true; }, n);
    if (!more) break; await sleep(800);
  }
  await sleep(800);
  await p.evaluate(() => { window.location.hash = "#/shop"; }); await sleep(2000);
  log("shop: " + (await p.evaluate(() => document.querySelector(".container").innerText.replace(/\s+/g, " "))).slice(0, 80));
  await b.disconnect();
})();
