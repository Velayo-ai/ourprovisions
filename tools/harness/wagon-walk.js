// wagon-walk.js — SPEC_ask_wagon_handback verification 1–6 at 375px, signed in as the dev test account.
//   node wagon-walk.js                          against dev (Ask on)
//   node -r ./local/use-local.js wagon-walk.js  against a local build / the dev server
// Makes (once) two asks in Cody Test House: "Wagon" (Shopper, pick 4, 5 tiles) and "Kid" (Explorer,
// pick 1, 4 tiles). Screenshots to out/wagon-*.png. Leaves the asks; sets the landed items back to 0.
const lib = require("./lib");
const { sleep, log, connect, firstPage, shot } = lib;
const BASE = lib.DEV_URL;
const VIEW = { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

let fails = 0;
const check = (name, ok, detail = "") => { log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); if (!ok) fails++; };
const clickText = (p, re, scope = "button") => p.evaluate((src, scope) => {
  const r = new RegExp(src, "i");
  const b = [...document.querySelectorAll(scope)].find((b) => b.offsetParent !== null && r.test(b.innerText.replace(/\s+/g, " ").trim()));
  if (!b) return null; b.scrollIntoView({ block: "center" }); b.click(); return b.innerText.replace(/\s+/g, " ").trim();
}, re.source, scope);
const setInput = (p, sel, value) => p.evaluate((sel, value) => {
  const el = document.querySelector(sel); if (!el) return false;
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true })); return true;
}, sel, value);
const pills = (p) => p.evaluate(() => [...document.querySelectorAll(".cat-rail .people-pill")].map((b) => b.innerText.replace(/\s+/g, " ").trim()));

async function browse(p) { await p.goto(BASE + "#/browse", { waitUntil: "networkidle2" }); await sleep(2500); }
async function ensureAsk(p, label, look, target, nItems) {
  await browse(p);
  const all = await p.evaluate(() => [...document.querySelectorAll(".people-pill, .more-asks-row")].map((b) => b.innerText.trim()));
  if ((await pills(p)).some((t) => t === `Ask ${label}`)) return "exists";
  await p.click('button[aria-label="Filters"]'); await sleep(700);
  const listed = await p.evaluate(() => [...document.querySelectorAll('[aria-labelledby="manage-asks"] [role="listitem"]')].map((r) => r.innerText.split("\n")[0].trim()));
  if (listed.includes(`Ask ${label}`)) { await p.keyboard.press("Escape"); await p.evaluate(() => document.querySelector(".modal-overlay")?.click()); await sleep(400); return "exists (in more)"; }
  await clickText(p, /New ask$/, '[role="dialog"][aria-label="View and organize"] button'); await sleep(900);
  await setInput(p, "#new-shelf-label", label);
  await setInput(p, "#new-shelf-noun", "snacks");
  await clickText(p, new RegExp(`^${look}`), '[role="radio"]');
  await clickText(p, new RegExp(`^${target}$`), '[role="radio"]');
  await p.evaluate((n) => [...document.querySelectorAll("[data-testid=new-shelf-catalog] button")].slice(0, n).forEach((b) => b.click()), nItems);
  await sleep(400);
  await clickText(p, /^Save ask$/); await sleep(3500);
  void all;
  return "created";
}
async function openRun(p, label) {
  await browse(p);
  const hit = await p.evaluate((label) => {
    const b = [...document.querySelectorAll(".cat-rail .people-pill")].find((x) => x.innerText.trim() === `Ask ${label}`);
    if (b) { b.click(); return "pill"; }
    const more = document.querySelector(".cat-rail .cat-pill-more"); if (more) { more.click(); return "more"; }
    return null;
  }, label);
  if (hit === "more") { await sleep(600); await clickText(p, new RegExp(`Ask ${label}$`), ".more-asks-row"); }
  await p.waitForSelector(".ask-run", { visible: true, timeout: 15000 });
}
const geom = (p) => p.evaluate(() => {
  const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), h: Math.round(b.height), w: Math.round(b.width) }; };
  return { vh: innerHeight, line: r(".ask-turn .ask-line"), wagon: r(".ask-turn .ask-wagon"), btn: r(".ask-turn .ask-foot .ask-primary"), title: r(".ask-turn .ask-h1"),
    top: document.querySelector(".ask-top .ask-done")?.innerText, scrolls: [...document.querySelectorAll(".ask-run *")].some((e) => e.scrollHeight > e.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(e).overflowY)) };
});

(async () => {
  const browser = await connect();
  const p = await firstPage(browser);
  await p.setViewport(VIEW);
  await p.goto(BASE + "#/browse", { waitUntil: "networkidle2" });
  await p.waitForFunction(() => window.Clerk && window.Clerk.user, { timeout: 30000 });
  const bundle = await p.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /main\.[a-z0-9]+\.js|bundle\.js/.test(s)) || "");
  log("bundle " + bundle.replace(/.*\//, ""));
  log("ask Wagon: " + await ensureAsk(p, "Wagon", "Shopper", 4, 5));
  log("ask Kid: " + await ensureAsk(p, "Kid", "Explorer", 1, 4));

  // ── 1, 5: the turn screen (after its motion) ──
  await openRun(p, "Wagon");
  await sleep(3200);
  await shot(p, "wagon-1-turn");
  let g = await geom(p);
  check("turn: the top-right control is the quiet 'Close'", g.top === "Close", JSON.stringify(g.top));
  check("turn: the wagon sits below the pick line and clears the button", g.wagon && g.line && g.btn && g.wagon.top > g.line.bottom && g.wagon.bottom < g.btn.top, JSON.stringify({ line: g.line?.bottom, wagon: [g.wagon?.top, g.wagon?.bottom], btn: g.btn?.top }));
  // a short tap on Close does not exit
  await p.evaluate(() => { const b = document.querySelector(".ask-top .ask-done"); b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); });
  await sleep(250);
  await p.evaluate(() => { const b = document.querySelector(".ask-top .ask-done"); b.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })); });
  await sleep(300);
  check("turn: a tap on Close only hints (the hold is needed)", !!(await p.$(".ask-run")) && /Hold to close/.test(await p.evaluate(() => document.querySelector(".ask-top .ask-done").innerText)));
  await clickText(p, /^Let's pick$/); await sleep(800);

  // ── 2: the shelf at 1, 2, 3, 4 picks ──
  check("shelf: the control reads 'Done'", (await p.evaluate(() => document.querySelector(".ask-top .ask-done")?.innerText)) === "Done");
  const tileNames = await p.evaluate(() => [...document.querySelectorAll(".ask-tile")].map((t) => (t.getAttribute("aria-label") || t.innerText).replace("✓", "").trim()));
  for (let k = 0; k < 4; k++) {
    await p.evaluate((k) => document.querySelectorAll(".ask-tile")[k].click(), k); await sleep(700);
    await shot(p, `wagon-2-shelf-${k + 1}`);
    const cards = await p.evaluate(() => [...document.querySelectorAll(".ask-wagon .ask-wagon-pick")].map((c) => ({ t: c.getAttribute("transform"), face: c.querySelector("image") ? "photo" : (c.querySelector("text")?.textContent || "") })));
    check(`shelf: ${k + 1} pick(s) → ${k + 1} card(s) in the wagon`, cards.length === k + 1, JSON.stringify(cards));
  }
  const faces = await p.evaluate(() => [...document.querySelectorAll(".ask-wagon .ask-wagon-pick")].map((c) => c.querySelector("image") ? "photo" : (/\p{Extended_Pictographic}/u.test(c.querySelector("text")?.textContent || "") ? "glyph" : "name")));
  log(`card faces on this shelf: ${JSON.stringify(faces)} (tiles ${JSON.stringify(tileNames.slice(0, 4))})`);
  await p.evaluate(() => document.querySelectorAll(".ask-wagon .ask-wagon-pick")[1].dispatchEvent(new MouseEvent("click", { bubbles: true }))); await sleep(500);
  check("shelf: tapping a card in the wagon takes it out", (await p.evaluate(() => document.querySelectorAll(".ask-wagon .ask-wagon-pick").length)) === 3);
  await p.evaluate(() => [...document.querySelectorAll(".ask-tile")].find((t) => t.getAttribute("aria-pressed") === "false").click()); await sleep(600);
  await clickText(p, /^That's it!$/); await sleep(3200);

  // ── 1, 4: Great picks → give it back → Browse toast → See ──
  await shot(p, "wagon-3-great-picks");
  const fin = await p.evaluate(() => ({ h: document.querySelector(".ask-finale h1")?.innerText.replace(/\s+/g, " "), line: document.querySelector(".ask-finale .ask-line")?.innerText,
    top: !!document.querySelector(".ask-top .ask-done"), btn: document.querySelector(".ask-give-back")?.innerText, cards: document.querySelectorAll(".ask-finale .ask-wagon-pick").length }));
  check("Great picks: title, W7 line, no top-right control, 4 cards", /^Great picks, Wagon!$/.test(fin.h) && fin.line === "Your picks are on our list!" && !fin.top && fin.cards === 4, JSON.stringify(fin));
  check("Great picks: 'Give it back to {Parent}' with the signed-in member's first name", /^Give it back to \S+$/.test(fin.btn || ""), JSON.stringify(fin.btn));
  await clickText(p, /^Give it back/); await sleep(900);
  const after = await p.evaluate(() => ({ run: !!document.querySelector(".ask-run"), hash: location.hash, toast: [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "See") ? document.body.textContent.match(/Wagon added \d+/)?.[0] : null }));   // textContent: the button's uppercase styling changes innerText
  await shot(p, "wagon-4-browse-toast");
  check("give back: the run closes, Browse shows 'Wagon added 4 · See'", !after.run && /browse/.test(after.hash) && after.toast === "Wagon added 4", JSON.stringify(after));
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "See").click()); await sleep(700);
  const hl = await p.evaluate(() => ({ hash: location.hash, rows: [...document.querySelectorAll(".list-item.ask-landed-hl .li-name")].map((n) => n.innerText.split("\n")[0].trim()) }));
  await shot(p, "wagon-5-see-highlight");
  check("See opens the list with the 4 landed rows highlighted", /shop/.test(hl.hash) && hl.rows.length === 4, JSON.stringify(hl));
  await sleep(3000);
  check("…and the highlight fades", (await p.evaluate(() => document.querySelectorAll(".ask-landed-hl").length)) === 0);

  // ── 1, 3: Explorer (Simple), one pick: fits without scrolling; the singular copy ──
  await openRun(p, "Kid"); await sleep(3200);
  await shot(p, "wagon-6-kid-turn");
  g = await geom(p);
  check("Explorer turn: the wagon clears the ▶ button", g.wagon && g.btn && g.wagon.bottom < g.btn.top, JSON.stringify({ wagon: g.wagon?.bottom, btn: g.btn?.top }));
  await p.evaluate(() => document.querySelector(".ask-go").click()); await sleep(800);
  const simpleFit = await p.evaluate(() => { const t = document.querySelector(".ask-tiles"); return { scroll: t.scrollHeight > t.clientHeight + 1, run: document.querySelector(".ask-screen").scrollHeight <= innerHeight + 1, ok: !!document.querySelector(".ask-thats-it") }; });
  await p.evaluate(() => document.querySelectorAll(".ask-tile")[0].click()); await sleep(700);
  await shot(p, "wagon-7-kid-shelf");
  const fit2 = await p.evaluate(() => { const t = document.querySelector(".ask-tiles"); const a = document.querySelector(".ask-thats-it").getBoundingClientRect(); return { tilesScroll: t.scrollHeight > t.clientHeight + 1, okBottom: Math.round(a.bottom), vh: innerHeight }; });
  check("Explorer shelf fits at 375×667 without scrolling (tiles and ✓ on screen)", !simpleFit.scroll && !fit2.tilesScroll && fit2.okBottom <= fit2.vh, JSON.stringify({ simpleFit, fit2 }));
  await p.evaluate(() => document.querySelector(".ask-thats-it").click()); await sleep(3200);
  const one = await p.evaluate(() => ({ h: document.querySelector(".ask-finale h1")?.innerText.replace(/\s+/g, " "), line: document.querySelector(".ask-finale .ask-line")?.innerText }));
  await shot(p, "wagon-8-kid-great-pick");
  check("one pick: 'Great pick, Kid! / Your pick is on our list!'", one.h === "Great pick, Kid!" && one.line === "Your pick is on our list!", JSON.stringify(one));
  await clickText(p, /^Give it back/); await sleep(900);

  // ── 6: reduced motion ──
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await openRun(p, "Wagon"); await sleep(250);
  const rm = await p.evaluate(() => {
    const anims = document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest(".ask-run"));
    const w = document.querySelector(".ask-roll-turn"); const sun = document.querySelector(".ask-sun");
    return { running: anims.length, roll: getComputedStyle(w).transform, sun: getComputedStyle(sun).transform };
  });
  await shot(p, "wagon-9-reduced-motion-turn");
  check("reduced motion: no animation in the run; the wagon and sun rest at their final place at once", rm.running === 0 && rm.roll === "none" && rm.sun === "none", JSON.stringify(rm));
  await p.emulateMediaFeatures([]);
  // leave the run (hold Close)
  await p.evaluate(() => { const b = document.querySelector(".ask-top .ask-done"); b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); });
  await sleep(1300);
  await p.evaluate(() => { const b = document.querySelector(".ask-top .ask-done"); if (b) b.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })); });
  await sleep(600);
  check("a held Close leaves the run", !(await p.$(".ask-run")));

  // tidy: the landed items back to 0
  await browse(p);
  const removed = await p.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms)); const out = [];
    for (let k = 0; k < 20; k++) {
      const row = [...document.querySelectorAll(".item-row.has-qty")][0]; if (!row) break;
      const name = row.querySelector(".item-name").innerText.trim(); const qty = Number(row.querySelector(".qty-display")?.innerText || 1);
      const minus = [...row.querySelectorAll("button.qty-btn")].find((x) => x.innerText.trim() === "−");
      for (let q = 0; q < qty; q++) { minus.click(); await s(450); }
      out.push(name); await s(500);
    }
    return out;
  });
  log(`tidied: ${JSON.stringify(removed)} back to 0`);
  log(fails ? `${fails} FAILED` : "ALL PASS");
  await browser.disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log("WAGON-WALK ERROR:", e.message.split("\n")[0]); process.exit(1); });
