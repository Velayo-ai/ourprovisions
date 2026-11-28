// One add: the List feeder's progress (flag on). Done stays plain; the subtitle carries the count. Arrival "What do
// we need?"; add 3 (the circle +) → "3 items added" (a teal outlined check-circle before it); take one back off (the
// stepper's − at 1) → "2 items added"; Done → the "2 added" toast. A new visit starts at "What do we need?" again;
// add 1 → "1 item added"; take it off → back to "What do we need?". Everything taken back off and the list read
// back. (The Meals feeder's line is checked in local/meal-auto-add.js and local/new-meal.js.)
// Flag-on build, signed in; local or `remote`.
const lib = require("../lib.js");
const nav = require("../oneadd-nav.js");
const { restFor } = require("./rest.js");
const REMOTE = process.argv[2] === "remote";
const BASE = REMOTE ? lib.DEV_URL : require("./use-local.js").LOCAL_URL;
const HOUSE = process.env.OP_HOUSE || "Cody Test House";
const { sleep, log, connect, firstPage } = lib;

let checks = 0, fails = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) fails++; log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

(async () => {
  const b = await connect(); const p = await firstPage(b);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { rest } = restFor(p);
  const state = () => p.evaluate(() => {
    const t = document.querySelector(".item-picker .item-search-titlebar");
    const sub = t?.querySelector(".item-search-sub");
    return { done: t?.querySelector(".item-search-done")?.textContent.trim(), sub: sub?.textContent.trim() || null,
      progress: !!sub?.querySelector(".feeder-progress"), icon: !!sub?.querySelector(".feeder-progress svg circle"),
      teal: sub?.querySelector(".feeder-progress") ? getComputedStyle(sub.querySelector(".feeder-progress")).color : null };
  });
  const addRows = (n) => p.evaluate(async (n) => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = [];
    for (const r of [...document.querySelectorAll(".item-picker .pick-group .pick-row:not(.on)")].slice(0, n)) {
      out.push((r.querySelector(".pick-name")?.textContent || "").replace(/^★\s*/, "").trim());
      (r.querySelector(".pick-hit") || r).click(); await s(700);
    }
    return out;
  }, n);
  const takeOff = (name) => p.evaluate((n) => {
    const r = [...document.querySelectorAll(".item-picker .pick-group .pick-row")].find((e) => (e.querySelector(".pick-name")?.textContent || "").replace(/^★\s*/, "").trim() === n);
    r?.querySelector('.pick-step-btn[aria-label="One fewer"]')?.click();
  }, name);
  let names = [], more = [];
  try {
    await nav.openFeeder(p, BASE);
    let s = await state();
    check("arrival: \"What do we need?\", Done plain", s.sub === "What do we need?" && !s.progress && s.done === "Done", JSON.stringify(s));
    names = await addRows(3); await sleep(1200);
    s = await state();
    check("add 3 → \"3 items added\" (teal, the check-circle before it); Done stays plain", names.length === 3 && s.sub === "3 items added" && s.progress && s.icon && s.teal === "rgb(10, 119, 109)" && s.done === "Done", JSON.stringify({ names, s }));
    await takeOff(names[0]); await sleep(1800);
    s = await state();
    check("undo 1 → \"2 items added\"", s.sub === "2 items added" && s.done === "Done", JSON.stringify(s));
    await p.evaluate(() => document.querySelector(".item-picker .item-search-done").click()); await sleep(600);
    const toast = await p.evaluate(() => [...document.querySelectorAll(".app-root div")].map((e) => e.textContent.trim()).find((t) => /^\d+ added$/.test(t)) || null);
    check("Done closes with the \"2 added\" toast", toast === "2 added", toast);
    await sleep(2500);
    // a new visit: the arrival line; add one, take it off → back to the arrival line
    await nav.openFeeder(p, BASE);
    s = await state();
    check("a new visit starts at \"What do we need?\"", s.sub === "What do we need?" && !s.progress, JSON.stringify(s));
    more = await addRows(1); await sleep(1200);
    const s1 = await state();
    await takeOff(more[0]); await sleep(1800);
    s = await state();
    check("add 1 → \"1 item added\" (singular); take it off → back to \"What do we need?\"", s1.sub === "1 item added" && s.sub === "What do we need?" && !s.progress, JSON.stringify({ s1, s }));
    await nav.closeFeeder(p);
  } catch (e) {
    check("the walk ran to the end", false, e.message);
  } finally {
    if (names.length) log(`tidied: ${JSON.stringify(await nav.feederZero(p, BASE, names.slice(1)))} back to 0`);
    const HH = (await rest("GET", `households?select=id&name=eq.${encodeURIComponent(HOUSE)}&deleted_at=is.null`))[0]?.id;
    const live = await rest("GET", `list_items?select=id&household_id=eq.${HH}&quantity=gt.0&status=neq.bought&deleted_at=is.null`);
    check("the list read back empty", live.length === 0, `live rows ${live.length}`);
  }
  log(`${checks - fails}/${checks} ${fails ? "FAIL" : "ALL PASS"}`);
  b.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
