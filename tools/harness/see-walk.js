// see-walk.js — "See" after an Ask (2026-11-15), on a long list, signed in as the dev test account.
//   node see-walk.js     (dev)     ·     node -r ./local/use-local.js see-walk.js     (a local build)
// Fills Cody Test House's list from Browse (~22 items), runs the 5-pick "Five" ask twice and checks: the
// toast still up at ~8.5s; See → Shop, the first landed row in view, 5 tinted rows, the bar; Next walks the
// tinted rows in list order and wraps; a check drops one row's tint; Done clears; leaving Shop clears.
// Screenshots to out/see-*.png; the list is set back to empty at the end.
const lib = require("./lib");
const { sleep, log, connect, firstPage, shot } = lib;
const BASE = lib.DEV_URL;

let fails = 0;
const check = (name, ok, detail = "") => { log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); if (!ok) fails++; };
const state = (p) => p.evaluate(() => {
  const rows = [...document.querySelectorAll(".list-item")].filter((r) => r.offsetParent && !r.closest(".tray-body"));
  const names = (els) => els.map((r) => r.querySelector(".li-name")?.innerText.split("\n")[0].trim());
  const tinted = rows.filter((r) => r.classList.contains("ask-landed-hl"));
  const mid = innerHeight / 2;
  const centred = rows.map((r) => ({ r, d: Math.abs(r.getBoundingClientRect().top + r.getBoundingClientRect().height / 2 - mid) })).sort((a, b) => a.d - b.d)[0];
  // what's free to see: below the pinned bar, above the Wrap up bar / the Helm
  const topEdge = document.querySelector(".landed-bar")?.getBoundingClientRect().bottom || 0;
  const bottomEdge = Math.min(...[".wrapbar", ".helm"].map((sel) => document.querySelector(sel)?.getBoundingClientRect().top).filter((v) => v > 0), innerHeight);
  const clear = (r) => { const b = r.getBoundingClientRect(); return b.top >= topEdge - 1 && b.bottom <= bottomEdge + 1; };
  return { hash: location.hash, rows: rows.length, tinted: names(tinted), clearTinted: names(tinted.filter(clear)), centred: centred ? names([centred.r])[0] : null,
    centredTinted: centred ? centred.r.classList.contains("ask-landed-hl") : false, bar: document.querySelector(".landed-bar")?.innerText.replace(/\s+/g, " ").trim() || null, scrollY: Math.round(scrollY) };
});

async function runFive(p) {
  await p.goto(BASE + "#/browse", { waitUntil: "networkidle2" }); await sleep(2500);
  const hit = await p.evaluate(() => { const x = [...document.querySelectorAll(".cat-rail .people-pill")].find((e) => e.innerText.trim() === "Ask Five"); if (x) { x.click(); return "pill"; } document.querySelector(".cat-rail .cat-pill-more").click(); return "more"; });
  if (hit === "more") { await sleep(600); await p.evaluate(() => [...document.querySelectorAll(".more-asks-row")].find((e) => e.innerText.trim() === "Ask Five").click()); }
  await p.waitForSelector(".ask-run"); await sleep(400);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === "Let's pick").click()); await sleep(800);
  for (let k = 0; k < 5; k++) { await p.evaluate((k) => document.querySelectorAll(".ask-tile")[k].click(), k); await sleep(700); }
  await p.evaluate(() => document.querySelector(".ask-thats-it").click()); await sleep(3300);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^Give it back/.test(x.innerText.trim())).click());
  return Date.now();
}
const tapSee = (p) => p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "See"); if (b) { b.click(); return true; } return false; });

(async () => {
  const browser = await connect();
  const p = await firstPage(browser);
  await p.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto(BASE + "#/browse", { waitUntil: "networkidle2" });
  await p.waitForFunction(() => window.Clerk && window.Clerk.user, { timeout: 30000 }); await sleep(2500);
  log("bundle " + await p.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /main\.[a-z0-9]+\.js|bundle\.js/.test(s)).replace(/.*\//, "")));
  // a long list: add every visible item not yet on it, up to 22
  const added = await p.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms)); const out = [];
    for (const b of [...document.querySelectorAll("button.add-btn")].filter((x) => x.offsetParent && x.innerText.trim() === "Add").slice(0, 22)) { b.scrollIntoView({ block: "center" }); b.click(); out.push(b.closest(".item-row")?.querySelector(".item-name")?.innerText.trim()); await s(350); } return out; });
  log(`list filled: ${added.length} items`);
  await sleep(2000);

  // ── run 1: the toast waits; See; Next wraps; a check drops one; Done ──
  const t0 = await runFive(p);
  await sleep(Math.max(0, 8500 - (Date.now() - t0)));
  const toastAt = await p.evaluate(() => ({ see: [...document.querySelectorAll("button")].some((x) => x.textContent.trim() === "See"), text: document.body.textContent.match(/Five added \d+/)?.[0] || null }));
  check("the toast is still up ~8.5s after the hand-back", toastAt.see && toastAt.text === "Five added 5", JSON.stringify(toastAt));
  check("See tapped", await tapSee(p));
  await sleep(1200);
  let st = await state(p);
  await shot(p, "see-1-after-see");
  check("See → Shop, 5 tinted rows on a long list, the bar reads 'Five's 5 picks · Next ↓ · Done'", /shop/.test(st.hash) && st.tinted.length === 5 && st.rows >= 20 && st.bar === "Five's 5 picks Next ↓ Done", JSON.stringify({ rows: st.rows, tinted: st.tinted, bar: st.bar }));
  check("…and the first landed row (list order) is fully in view, clear of the bar and the Helm", st.clearTinted.includes(st.tinted[0]), JSON.stringify({ first: st.tinted[0], clear: st.clearTinted, scrollY: st.scrollY }));
  // Next: each press lands on the next tinted row in list order, wrapping — that row must be fully in view
  // (a row near the list's top or end can't be centred, so "in view" is the test, not "in the middle").
  const visits = [];
  for (let k = 0; k < 5; k++) {
    await p.evaluate(() => [...document.querySelectorAll(".landed-bar-btn")].find((b) => b.innerText.startsWith("Next")).click());
    await sleep(1100);
    const s2 = await state(p); const want = st.tinted[(k + 1) % st.tinted.length];
    visits.push({ want, inView: s2.clearTinted.includes(want), scrollY: s2.scrollY });
    if (k === 1) await shot(p, "see-2-after-next");
    if (k === 3) await shot(p, "see-2b-next-near-end");
  }
  check("Next walks the tinted rows in list order and wraps to the first, each fully in view", visits.every((v) => v.inView) && visits[4].want === st.tinted[0], JSON.stringify(visits));
  await sleep(2500);
  check("a minute's wait is not needed: after ~10s of Next-ing the tint is all still there", (await state(p)).tinted.length === 5);
  // a check drops one row's tint
  const checkedName = st.tinted[2];
  await p.evaluate((n) => { const row = [...document.querySelectorAll(".list-item")].find((r) => r.querySelector(".li-name")?.innerText.split("\n")[0].trim() === n && !r.closest(".tray-body")); row.querySelector('button.shop-check[role="checkbox"]').click(); }, checkedName);
  await sleep(4500);   // the 3s hold, then into the tray
  st = await state(p);
  await shot(p, "see-3-after-check");
  check(`checking "${checkedName}" drops its tint only; the bar stays`, st.tinted.length === 4 && !st.tinted.includes(checkedName) && !!st.bar, JSON.stringify({ tinted: st.tinted, bar: st.bar }));
  await p.evaluate(() => [...document.querySelectorAll(".landed-bar-btn")].find((b) => b.innerText === "Done").click()); await sleep(600);
  st = await state(p);
  await shot(p, "see-4-after-done");
  check("Done clears the tint and the bar", st.tinted.length === 0 && !st.bar, JSON.stringify({ tinted: st.tinted, bar: st.bar }));

  // ── run 2: leaving Shop clears it ──
  await runFive(p); await sleep(1500);
  await tapSee(p); await sleep(1200);
  st = await state(p);
  check("run 2: See shows the tint and the bar again", st.tinted.length >= 4 && !!st.bar, JSON.stringify({ tinted: st.tinted.length, bar: st.bar }));
  await p.evaluate(() => [...document.querySelectorAll("button, a")].find((x) => x.innerText.trim() === "BROWSE" || x.innerText.trim() === "Browse").click()); await sleep(1200);
  await p.evaluate(() => [...document.querySelectorAll("button, a")].find((x) => /^SHOP/i.test(x.innerText.trim())).click()); await sleep(1500);
  st = await state(p);
  check("leaving Shop (to Browse and back) clears the tint and the bar", /shop/.test(st.hash) && st.tinted.length === 0 && !st.bar, JSON.stringify({ hash: st.hash, tinted: st.tinted, bar: st.bar }));

  // tidy: the whole list back to 0
  await p.goto(BASE + "#/browse", { waitUntil: "networkidle2" }); await sleep(2500);
  const removed = await p.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms)); let n = 0;
    for (let k = 0; k < 60; k++) { const row = [...document.querySelectorAll(".item-row.has-qty")][0]; if (!row) break; const qty = Number(row.querySelector(".qty-display")?.innerText || 1);
      const m = [...row.querySelectorAll("button.qty-btn")].find((x) => x.innerText.trim() === "−"); row.scrollIntoView({ block: "center" }); for (let q = 0; q < qty; q++) { m.click(); await s(400); } n++; await s(400); } return n; });
  log(`tidied: ${removed} rows back to 0`);
  log(fails ? `${fails} FAILED` : "ALL PASS");
  await browser.disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log("SEE-WALK ERROR:", e.message.split("\n")[0]); process.exit(1); });
