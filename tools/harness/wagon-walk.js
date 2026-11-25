// wagon-walk.js — SPEC_ask_wagon_handback verification 1–6 + SPEC_ask_handback_hold (H1–H11: the hold to give
// back, the arm delay, the finale hop, Explorer's swipe) at 375px, signed in as the dev test account.
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
// H1–H2: the hand-back is a hold, armed 1500 ms after Great picks appears.
const pressGiveBack = (p, ms) => p.evaluate(async (ms) => {
  const b = document.querySelector(".ask-give-back"); if (!b) return false;
  b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7 }));
  await new Promise((r) => setTimeout(r, ms));
  const btn = document.querySelector(".ask-give-back");
  if (btn) btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7 }));
  return true;
}, ms);
// The toddler's mash: a press, a release and a click, n times, quickly.
const mash = (p, sel, n = 6) => p.evaluate(async (sel, n) => {
  for (let k = 0; k < n; k++) {
    const b = document.querySelector(sel); if (!b) return k;
    b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 8 }));
    b.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 8 }));
    b.click();
    await new Promise((r) => setTimeout(r, 60));
  }
  return n;
}, sel, n);
const giveText = (p) => p.evaluate(() => document.querySelector(".ask-give-back .ask-give-text")?.innerText.replace(/\s+/g, " ").trim() || null);

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
  // H13 (rev 3): no That's it! button; full, "That's it!" pops onto the tub front, and a tap there sends.
  const tubState = await p.evaluate(() => {
    const words = document.querySelector(".ask-shelf .ask-tub-words"); const tap = document.querySelector(".ask-shelf .ask-tub-send");
    const r = tap && tap.getBoundingClientRect(); const cards = [...document.querySelectorAll(".ask-shelf .ask-wagon-pick")].map((c) => c.getBoundingClientRect());
    return { button: [...document.querySelectorAll(".ask-shelf button")].some((b) => /That's it!/.test(b.innerText)), words: words?.textContent || null,
      tap: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, top: Math.round(r.top) } : null, cardsBottom: Math.round(Math.max(...cards.map((c) => c.bottom))),
      done: document.querySelector(".ask-top .ask-done")?.getAttribute("aria-label"), send: document.querySelector(".ask-wagonwrap")?.getAttribute("aria-label") };
  });
  await shot(p, "wagon-2b-shopper-tub");
  check("H13: Shopper has no That's it! button; full, the tub says That's it!; Done reads 'Hold to send'; the wagon is 'Send the wagon'", !tubState.button && tubState.words === "That's it!" && tubState.done === "Hold to send" && tubState.send === "Send the wagon", JSON.stringify(tubState));
  await p.mouse.click(tubState.tap.x, tubState.tap.y);
  await sleep(3200);

  // ── 1, 4: Great picks → give it back → Browse toast → See ──
  await shot(p, "wagon-3-great-picks");
  const fin = await p.evaluate(() => ({ h: document.querySelector(".ask-finale h1")?.innerText.replace(/\s+/g, " "), line: document.querySelector(".ask-finale .ask-line")?.innerText,
    top: !!document.querySelector(".ask-top .ask-done"), btn: document.querySelector(".ask-give-back")?.innerText, cards: document.querySelectorAll(".ask-finale .ask-wagon-pick").length }));
  check("Great picks: title, W7 line, no top-right control, 4 cards", /^Great picks, Wagon!$/.test(fin.h) && fin.line === "Your picks are on our list!" && !fin.top && fin.cards === 4, JSON.stringify(fin));
  const gb = await giveText(p);
  check("Great picks: 'Give it back to {Parent}' with the signed-in member's first name", /^Give it back to \S+$/.test(gb || ""), JSON.stringify(gb));
  // H1: a tap (armed by now: Great picks has been up 3.2 s) only says "Hold to give back".
  await mash(p, ".ask-give-back", 1); await sleep(200);
  check("H1: a tap on Give it back only says 'Hold to give back'", !!(await p.$(".ask-finale")) && (await giveText(p)) === "Hold to give back", JSON.stringify(await giveText(p)));
  await sleep(1700);
  await pressGiveBack(p, 1250); await sleep(900);
  const after = await p.evaluate(() => ({ run: !!document.querySelector(".ask-run"), hash: location.hash, toast: [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "See") ? document.body.textContent.match(/Wagon added \d+/)?.[0] : null }));   // textContent: the button's uppercase styling changes innerText
  await shot(p, "wagon-4-browse-toast");
  check("give back: the run closes, Browse shows 'Wagon added 4 · See'", !after.run && /browse/.test(after.hash) && after.toast === "Wagon added 4", JSON.stringify(after));
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "See").click()); await sleep(700);
  const hl = await p.evaluate(() => ({ hash: location.hash, rows: [...document.querySelectorAll(".list-item.ask-landed-hl .li-name")].map((n) => n.innerText.split("\n")[0].trim()) }));
  await shot(p, "wagon-5-see-highlight");
  check("See opens the list with the 4 landed rows highlighted", /shop/.test(hl.hash) && hl.rows.length === 4, JSON.stringify(hl));
  await sleep(6000);   // See's highlight holds ~5.2 s after its scroll settles (useLandedHighlight HIGHLIGHT_MS)
  check("…and the highlight fades", (await p.evaluate(() => document.querySelectorAll(".ask-landed-hl").length)) === 0);

  // ── 1, 3 + H5–H11: Explorer (Simple), one pick — no ✓; the wagon is swiped; the singular copy ──
  await openRun(p, "Kid"); await sleep(3200);
  await shot(p, "wagon-6-kid-turn");
  g = await geom(p);
  check("Explorer turn: the wagon clears the ▶ button", g.wagon && g.btn && g.wagon.bottom < g.btn.top, JSON.stringify({ wagon: g.wagon?.bottom, btn: g.btn?.top }));
  await p.evaluate(() => document.querySelector(".ask-go").click()); await sleep(800);
  const simpleFit = await p.evaluate(() => { const t = document.querySelector(".ask-tiles"); return { scroll: t.scrollHeight > t.clientHeight + 1 }; });
  await p.evaluate(() => document.querySelectorAll(".ask-tile")[0].click()); await sleep(700);
  await shot(p, "wagon-7-kid-shelf-full");
  const fit2 = await p.evaluate(() => {
    const t = document.querySelector(".ask-tiles"); const w = document.querySelector(".ask-wagonwrap"); const r = w.getBoundingClientRect();
    return { tilesScroll: t.scrollHeight > t.clientHeight + 1, wagonW: Math.round(r.width), wagonBottom: Math.round(r.bottom), vh: innerHeight, vw: innerWidth,
      check: !!document.querySelector(".ask-thats-it"), full: w.classList.contains("full"), label: w.getAttribute("aria-label"), done: document.querySelector(".ask-top .ask-done")?.getAttribute("aria-label") };
  });
  check("H5: no ✓; the bigger wagon (min(88vw, 360px)) fits at 375×667 with the tiles, nothing scrolls", !fit2.check && !simpleFit.scroll && !fit2.tilesScroll && fit2.wagonBottom <= fit2.vh && Math.abs(fit2.wagonW - Math.min(fit2.vw * 0.88, 360)) <= 2, JSON.stringify({ simpleFit, fit2 }));
  check("H11 / H9: full, the wagon is the 'Send the wagon' button and Done reads 'Hold to send'", fit2.full && fit2.label === "Send the wagon" && fit2.done === "Hold to send", JSON.stringify(fit2));
  await sleep(3200);   // the fireworks, then the tug
  const tug = await p.evaluate(() => ({ tug: document.querySelector(".ask-wagonwrap").classList.contains("tug"), arrow: getComputedStyle(document.querySelector(".ask-send-hint")).animationName }));
  await shot(p, "wagon-7b-kid-tug");
  check("H8: after the fireworks the full wagon tugs, with the → animating beside it; no adult text", tug.tug && tug.arrow === "ask-arrow" && !(await p.evaluate(() => /grown-up|swipe/i.test(document.querySelector(".ask-shelf").innerText))), JSON.stringify(tug));
  // H6: a real drag with the mouse — short first (springs back), then past 60px (sent).
  const box = await p.evaluate(() => { const r = document.querySelector(".ask-wagonwrap").getBoundingClientRect(); return { x: r.left + r.width * 0.4, y: r.top + r.height * 0.85 }; });
  await p.mouse.move(box.x, box.y); await p.mouse.down();
  await p.mouse.move(box.x + 20, box.y, { steps: 4 });
  const mid = await p.evaluate(() => document.querySelector(".ask-wagonwrap").style.transform);
  await p.mouse.move(box.x + 40, box.y, { steps: 4 }); await p.mouse.up(); await sleep(500);
  const back = await p.evaluate(() => ({ t: document.querySelector(".ask-wagonwrap")?.style.transform, shelf: !!document.querySelector(".ask-shelf"), picks: document.querySelectorAll(".ask-shelf .ask-wagon-pick").length }));
  check("H6: the wagon follows the finger; a 40px drag springs back (still on the shelf, still full)", /translateX\(\d+(\.\d+)?px\)/.test(mid) && back.shelf && back.picks === 1 && (back.t === "" || back.t === "none"), JSON.stringify({ mid, back }));
  await p.mouse.move(box.x, box.y); await p.mouse.down();
  await p.mouse.move(box.x + 120, box.y, { steps: 8 }); await p.mouse.up();
  await sleep(250);
  const rolling = await p.evaluate(() => { const w = document.querySelector(".ask-wagonwrap"); return w ? { t: w.style.transform, rolling: w.classList.contains("rolling") } : "gone"; });
  // H2 + the real bug: the same mash keeps going as Great pick arrives — it must stay up.
  await p.waitForSelector(".ask-finale", { timeout: 6000 });
  const mashed = await mash(p, ".ask-give-back", 6);
  await sleep(600);
  const stay = await p.evaluate(() => ({ h: document.querySelector(".ask-finale h1")?.innerText.replace(/\s+/g, " "), line: document.querySelector(".ask-finale .ask-line")?.innerText }));
  await shot(p, "wagon-8-kid-great-pick");
  check("H6: a 120px drag sends it — it rolls off (wheels spinning), then Great pick", rolling === "gone" || /translateX\(130vw\)/.test(rolling.t), JSON.stringify(rolling));
  check("H2: a mash on the footer as Great pick arrives leaves it up ('Great pick, Kid! / Your pick is on our list!')", mashed === 6 && stay.h === "Great pick, Kid!" && stay.line === "Your pick is on our list!", JSON.stringify({ mashed, stay }));
  check("H2: no hint while unarmed (the label stayed 'Give it back to …')", /^Give it back to \S+$/.test((await giveText(p)) || ""), JSON.stringify(await giveText(p)));
  // H3: his taps get an answer — the wagon hops.
  await p.evaluate(() => document.querySelector(".ask-finale-hop").click());
  const hops = await p.evaluate(() => document.querySelector(".ask-finale-hop").getAnimations().length);
  check("H3: a tap on the Great pick wagon makes it hop", hops === 1, `animations ${hops}`);
  await sleep(1500);
  await pressGiveBack(p, 1250); await sleep(900);
  const kidBack = await p.evaluate(() => ({ run: !!document.querySelector(".ask-run"), toast: document.body.textContent.match(/Kid added \d+/)?.[0] || null }));
  check("H1: held, Give it back closes the run with 'Kid added 1 · See'", !kidBack.run && kidBack.toast === "Kid added 1", JSON.stringify(kidBack));

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
