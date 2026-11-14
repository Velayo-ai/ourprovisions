// shop-burst.js — signed in already (signin.js): Shop → a 6-item check burst → the undo fold.
// Checks, in order: 3 separate toasts; the 4th check folds into "✓ 4 items in cart · Undo all"; a tap
// on a held row lowers n; 6 checks → n; Undo all puts the still-checked rows back; a second burst
// expires as one group after UNDO_MS from the last check; "All done" never shows while a toast is up.
// Screenshots: out/burst-3.png, burst-4.png, burst-6.png, burst-undone.png. Needs ≥ 6 unchecked rows
// on Cody Test House's list; with fewer, it adds staples from Browse first and says so.
const { sleep, log, connect, firstPage, shot } = require("./lib");

const toasts = (page) => page.evaluate(() => [...document.querySelectorAll(".check-undo")].map((t) => ({
  group: t.classList.contains("check-undo-group"), text: t.innerText.replace(/\s+/g, " ").trim() })));
const unchecked = (page) => page.evaluate(() => [...document.querySelectorAll('button.shop-check[role="checkbox"][aria-checked="false"]')].length);
const checkNth = (page, n) => page.evaluate((n) => {
  const b = [...document.querySelectorAll('button.shop-check[role="checkbox"][aria-checked="false"]')][n];
  if (!b) return null; b.scrollIntoView({ block: "center" }); b.click(); return b.innerText.trim();
}, n);
const allDone = (page) => page.evaluate(() => /All done/i.test(document.body.innerText));

let fails = 0;
let addedNames = [];
const check = (name, ok, detail = "") => { log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? "  " + detail : ""}`); if (!ok) fails++; };

(async () => {
  const browser = await connect();
  const page = await firstPage(browser);
  await page.goto("https://dev.ourprovisions.velayo.ai/#/shop", { waitUntil: "networkidle2" });
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForFunction(() => window.Clerk && window.Clerk.user, { timeout: 30000 });
  await sleep(3000);
  const bundle = await page.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /main\.[a-z0-9]+\.js/.test(s)) || "");
  log("bundle " + bundle.replace(/.*\//, ""));

  let free = await unchecked(page);
  log(`unchecked rows on Shop: ${free}`);
  if (free < 7) {
    // Top up from Browse: add staples (qty 0 → 1) until 7 rows are free.
    await page.goto("https://dev.ourprovisions.velayo.ai/#/browse", { waitUntil: "networkidle2" }); await sleep(2500);
    addedNames = await page.evaluate(async (need) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const rows = [...document.querySelectorAll("button.add-btn")].filter((b) => b.offsetParent && b.innerText.trim() === "Add");
      const names = [];
      for (const b of rows.slice(0, need)) {
        const row = b.closest(".item-row") || b.parentElement.parentElement;
        names.push((row.querySelector(".item-name") || row).innerText.split("\n")[0].trim());
        b.click(); await sleep(400);
      }
      return names;
    }, 7 - free);
    log(`added ${addedNames.length} items from Browse to make room: ${JSON.stringify(addedNames)}`);
    await sleep(2500);
    await page.goto("https://dev.ourprovisions.velayo.ai/#/shop", { waitUntil: "networkidle2" }); await sleep(3000);
    free = await unchecked(page);
    log(`unchecked rows now: ${free}`);
  }
  if (free < 6) throw new Error("fewer than 6 unchecked rows — can't burst");

  // ── Burst 1: 3, then the fold, then a tap during the hold, then 6, then Undo all ──
  const names = [];
  for (let i = 0; i < 3; i++) { names.push(await checkNth(page, 0)); await sleep(350); }
  let t = await toasts(page);
  await shot(page, "burst-3");
  check("3 checks → 3 separate toasts", t.length === 3 && t.every((x) => !x.group && /checked · Undo$/i.test(x.text)), JSON.stringify(t.map((x) => x.text)));
  names.push(await checkNth(page, 0)); await sleep(350);
  t = await toasts(page);
  await shot(page, "burst-4");
  check("the 4th check folds into one group, n = 4", t.length === 1 && t[0].group && /^✓ 4 items in cart · Undo all$/i.test(t[0].text), JSON.stringify(t.map((x) => x.text)));
  check("All done waits while the group is up", !(await allDone(page)));
  // A tap on a row still in its hold (the newest, still struck through in its aisle) takes it out.
  const tapped = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button.shop-check[role="checkbox"][aria-checked="true"]')].pop();
    if (!b) return null; b.click(); return b.innerText.trim();
  });
  await sleep(400);
  t = await toasts(page);
  check("a tap during the hold lowers n to 3 and the group stays folded", t.length === 1 && t[0].group && /^✓ 3 items in cart/i.test(t[0].text), `tapped ${JSON.stringify(tapped)} → ${JSON.stringify(t.map((x) => x.text))}`);
  for (let i = 0; i < 3; i++) { await checkNth(page, 0); await sleep(350); }
  t = await toasts(page);
  await shot(page, "burst-6");
  check("three more checks → n = 6", t.length === 1 && /^✓ 6 items in cart/i.test(t[0].text), JSON.stringify(t.map((x) => x.text)));
  const clipped = await page.evaluate(() => { const el = document.querySelector(".check-undo-group .check-undo-text"); return el ? el.scrollWidth > el.clientWidth : null; });
  check("the group's text is not cut off on a phone-width screen", clipped === false, `clipped=${clipped}`);
  const before = await unchecked(page);
  await page.evaluate(() => [...document.querySelectorAll(".check-undo-group .check-undo-btn")][0].click());
  await sleep(2500);
  const after = await unchecked(page);
  t = await toasts(page);
  await shot(page, "burst-undone");
  check("Undo all puts all 6 back and the group goes", after - before === 6 && t.length === 0, `unchecked ${before} → ${after}; toasts ${t.length}`);

  // ── Burst 2: the group expires as one, UNDO_MS after the LAST check (5s) ──
  for (let i = 0; i < 4; i++) { await checkNth(page, 0); await sleep(300); }
  await sleep(3500);
  await checkNth(page, 0);                                 // restarts the group's clock
  await sleep(3500);                                       // 7s after the 4th check, 3.5s after the 5th
  t = await toasts(page);
  check("the group's timer restarted on the 5th check (still up 7s after the 4th)", t.length === 1 && /^✓ 5 items in cart/i.test(t[0].text), JSON.stringify(t.map((x) => x.text)));
  await sleep(2200);
  t = await toasts(page);
  check("…and the whole group drops UNDO_MS after the last check", t.length === 0, JSON.stringify(t.map((x) => x.text)));
  // Tidy: uncheck what burst 2 left checked, so the test list is as it was.
  const restored = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let n = 0;
    for (let k = 0; k < 5; k++) {
      const tray = [...document.querySelectorAll('button.shop-check[role="checkbox"][aria-checked="true"]')];
      if (!tray.length) break; tray[0].click(); n++; await sleep(700);
    }
    return n;
  });
  log(`tidied: unchecked ${restored} rows from burst 2`);
  if (addedNames.length) {
    // Put the list back as it was: the items this walk added go back to 0 from Browse.
    await page.goto("https://dev.ourprovisions.velayo.ai/#/browse", { waitUntil: "networkidle2" }); await sleep(2500);
    const removed = await page.evaluate(async (names) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let n = 0;
      for (const name of names) {
        const row = [...document.querySelectorAll(".item-row")].find((r) => (r.querySelector(".item-name") || r).innerText.split("\n")[0].trim() === name);
        const minus = row && [...row.querySelectorAll("button.qty-btn")].find((b) => b.innerText.trim() === "−");
        if (minus) { minus.click(); n++; await sleep(500); }
      }
      return n;
    }, addedNames);
    log(`tidied: set ${removed} of ${addedNames.length} added items back to 0`);
  }
  log(fails ? `${fails} FAILED` : "ALL PASS");
  await browser.disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log("SHOP-BURST ERROR:", e.message.split("\n")[0]); process.exit(1); });
