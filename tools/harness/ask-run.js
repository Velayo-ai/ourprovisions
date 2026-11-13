// ask-run.js — signed in already (signin.js): Browse → + New shelf → create an ask → select its
// pill → Hand it over → screenshot the run screen as out/ask-run.png. One process, start to end.
//   node ask-run.js [label] [target] [items]      defaults: Test 2 4   (Shopper, the first N catalog rows)
// With an ask of that label already there, the create is skipped and the pill is used as it is.
const { sleep, log, connect, firstPage, bodyText, clickText, shot } = require("./lib");

const LABEL = process.argv[2] || "Test";
const TARGET = Number(process.argv[3] || 2);
const ITEMS = Number(process.argv[4] || 4);

(async () => {
  const browser = await connect();
  const page = await firstPage(browser);
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) log("NAV " + f.url().slice(0, 100)); });
  // A fresh CDP session finds the page mid-load at times: give Clerk a moment before judging.
  await page.waitForFunction(() => window.Clerk && window.Clerk.loaded, { timeout: 30000 }).catch(() => {});
  let user = false;
  for (let i = 0; i < 10 && !user; i++) { user = await page.evaluate(() => !!(window.Clerk && window.Clerk.user)).catch(() => false); if (!user) await sleep(1000); }
  if (!user) throw new Error("not signed in — run signin.js first");
  log("tap Browse: " + await clickText(page, /^browse$/i, "button, a"));
  await sleep(3000);
  const pillRe = new RegExp(`Ask\\s*${LABEL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  const havePill = () => page.evaluate((src) => { const r = new RegExp(src); return !![...document.querySelectorAll("button.cat-pill")].find((b) => r.test(b.innerText.replace(/\s+/g, " ").trim())); }, pillRe.source);
  if (await havePill()) {
    log(`Ask ${LABEL} is already on the rail`);
  } else {
    log("tap + New shelf: " + await clickText(page, /new shelf/i));
    await page.waitForSelector("#new-shelf-label", { visible: true, timeout: 15000 });
    await page.type("#new-shelf-label", LABEL, { delay: 20 });
    log("target: " + await page.evaluate((n) => { const r = [...document.querySelectorAll("[role=radio]")].find((b) => b.innerText.trim() === String(n)); if (r) { r.click(); return n; } return "no radio " + n; }, TARGET));
    const picked = await page.evaluate((n) => { const rows = [...document.querySelectorAll("[data-testid=new-shelf-catalog] button")].slice(0, n); rows.forEach((b) => b.click()); return rows.map((b) => b.innerText.replace(/\s+/g, " ").trim()); }, ITEMS);
    log("items: " + JSON.stringify(picked));
    await sleep(500);
    log("tap Save shelf: " + await clickText(page, /^save shelf$/i));
    await sleep(4000);
    await shot(page, "browse-after-save");
  }
  log("tap pill: " + await page.evaluate((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll("button.cat-pill")].find((b) => r.test(b.innerText.replace(/\s+/g, " ").trim())); if (b) { b.click(); return b.innerText.replace(/\s+/g, " ").trim(); } return null; }, pillRe.source));
  await sleep(1500);
  await shot(page, "ask-block");
  log("block: " + await page.evaluate(() => (document.querySelector(".ask-block")?.innerText || "no .ask-block").replace(/\s+/g, " ").slice(0, 240)));
  const hand = await page.$(".ask-handover");
  if (!hand) throw new Error("no hand-over button (0 live tiles?)");
  await hand.click();
  await page.waitForSelector(".ask-run", { visible: true, timeout: 15000 });
  await sleep(2500);   // the sunrise
  await shot(page, "ask-run");
  log("run: " + await page.evaluate(() => document.querySelector(".ask-run").innerText.replace(/\s+/g, " ").slice(0, 160)));
  log("saved out/ask-run.png");
  await browser.disconnect();
})().catch((e) => { console.log("ASK-RUN ERROR:", e.message.split("\n")[0]); process.exit(1); });
