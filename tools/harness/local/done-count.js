// One add: the live count on the List feeder's Done (flag on). Plain "Done" on open; add 3 (the circle +) →
// "Done · 3"; take one back off (the stepper's − at 1) → "Done · 2"; Done → the "2 added" toast. The two left
// are taken back off and the list read back. (The Meals feeder's count is checked in local/new-meal.js, where
// real meals go onto This Week.) Flag-on build, signed in; local or `remote`.
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
  const done = () => p.evaluate(() => document.querySelector(".item-picker .item-search-done")?.textContent.trim());
  let names = [];
  try {
    await nav.openFeeder(p, BASE);
    check("plain \"Done\" on open", (await done()) === "Done", await done());
    names = await p.evaluate(async () => {
      const s = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      for (const r of [...document.querySelectorAll(".item-picker .pick-group .pick-row:not(.on)")].slice(0, 3)) {
        out.push((r.querySelector(".pick-name")?.textContent || "").replace(/^★\s*/, "").trim());
        (r.querySelector(".pick-hit") || r).click(); await s(700);
      }
      return out;
    });
    await sleep(1200);
    check("add 3 → \"Done · 3\"", names.length === 3 && (await done()) === "Done · 3", JSON.stringify({ names, done: await done() }));
    // undo one: the stepper's − at 1 takes it off
    await p.evaluate((n) => {
      const r = [...document.querySelectorAll(".item-picker .pick-group .pick-row")].find((e) => (e.querySelector(".pick-name")?.textContent || "").replace(/^★\s*/, "").trim() === n);
      r?.querySelector('.pick-step-btn[aria-label="One fewer"]')?.click();
    }, names[0]);
    await sleep(1800);
    check("undo 1 → \"Done · 2\"", (await done()) === "Done · 2", await done());
    await p.evaluate(() => document.querySelector(".item-picker .item-search-done").click()); await sleep(600);
    // the app's toast (an inline-styled pill): found by its words
    const toast = await p.evaluate(() => [...document.querySelectorAll(".app-root div")].map((e) => e.textContent.trim()).find((t) => /^\d+ added$/.test(t)) || null);
    check("Done closes with the \"2 added\" toast", /^2 added/.test(toast || ""), toast);
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
