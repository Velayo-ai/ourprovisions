// Ask behind its flag (2026-11-12): a FLAG-OFF local build (REACT_APP_FEATURE_ASK unset) must show
// no trace of Ask and send nothing to the Ask schema. Run against a local build made WITHOUT the flag:
//   CI=true npx react-scripts build   (no REACT_APP_FEATURE_ASK)  →  node local/serve.js  →  this.
// Pass "on" as the first argument against a flag-ON build to check the inverse (Ask present).
// Signed in as the dev test account (dev DB, which HAS the Ask tables: so any request would succeed
// and be invisible on screen; the network log is what proves the flag-off build never asks).
const { LOCAL_URL } = require("./use-local.js");
const { sleep, log, connect, firstPage } = require("../lib.js");
const EXPECT_ON = process.argv[2] === "on";

const ASK_TRAFFIC = /\/rest\/v1\/(asks|ask_shelf_items|household_item_photos)\b|\/rpc\/(create_ask|update_ask|land_ask_picks|set_household_item_photo|remove_household_item_photo)\b|\/storage\/v1\/object\/[^?]*item-photos/;

let checks = 0, fails = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) fails++; log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

(async () => {
  const b = await connect(); const p = await firstPage(b);
  const askHits = [];
  p.on("request", (r) => { if (ASK_TRAFFIC.test(r.url())) askHits.push(r.method() + " " + r.url().replace(/\?.*/, "")); });
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const text = () => p.evaluate(() => document.body.innerText);

  await p.goto(LOCAL_URL + "#/browse", { waitUntil: "networkidle2" }); await p.reload({ waitUntil: "networkidle2" }); await sleep(3000);
  const marker = await p.evaluate(() => document.querySelector(".app-root")?.getAttribute("data-op-ask"));
  check(`the build's marker reads ${EXPECT_ON ? "op-ask:on" : "op-ask:off"}`, marker === (EXPECT_ON ? "op-ask:on" : "op-ask:off"), String(marker));

  const rail = await p.evaluate(() => [...document.querySelectorAll(".cat-pill")].map((e) => e.innerText.replace(/\s+/g, " ").trim()));
  const askPills = rail.filter((t) => /^(🧺 )?Ask\b|New shelf|\bmore$/.test(t) || t.includes("New shelf"));
  check(EXPECT_ON ? "Browse rail: + New shelf / Ask pills present" : "Browse rail: no + New shelf, no Ask pill, no +N more",
    EXPECT_ON ? askPills.length > 0 : askPills.length === 0, JSON.stringify(EXPECT_ON ? askPills : askPills.length ? askPills : rail.slice(0, 6)));
  check("Browse rail still has Staples and the categories", rail.some((t) => t.endsWith("Staples")) && rail.length >= 3, `${rail.length} pills`);
  const browseText = await text();
  if (!EXPECT_ON) check("Browse shows no Ask block, no \"Hand it to\"", !/Hand it to/.test(browseText) && !/\bAsk [A-Z]/.test(browseText.replace(/Ask the Galley/g, "")));

  // Manage categories
  const opened = await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((e) => /^Manage categories/.test(e.innerText.trim())); if (!b) return null; const t = b.innerText.trim(); b.click(); return t; });
  await sleep(800);
  const manage = await p.evaluate(() => { const d = document.querySelector('[role="dialog"][aria-label^="Manage categories"]'); return d ? { label: d.getAttribute("aria-label"), h2: d.querySelector("h2")?.innerText, asks: !!d.querySelector("#manage-asks"), newShelf: /New shelf/.test(d.innerText), newCat: /New category/.test(d.innerText) } : null; });
  if (EXPECT_ON) check("Manage: titled with asks, Asks section present", !!manage && manage.asks && /asks/.test(manage.h2), JSON.stringify({ opened, manage }));
  else check('Manage: button, heading and dialog say "Manage categories"; no Asks section, no New shelf; category create still there',
    opened === "Manage categories" && !!manage && manage.h2 === "Manage categories" && manage.label === "Manage categories" && !manage.asks && !manage.newShelf && manage.newCat, JSON.stringify({ opened, manage }));
  await p.keyboard.press("Escape"); await p.evaluate(() => document.querySelector(".modal-overlay")?.click()); await sleep(400);

  // Home, Plan, Shop
  for (const [hash, name] of [["#/home", "Home"], ["#/plan", "Plan"], ["#/shop", "Shop"]]) {
    await p.goto(LOCAL_URL + hash, { waitUntil: "networkidle2" }); await sleep(1800);
    const t = await text();
    if (!EXPECT_ON) check(`${name}: no Ask copy`, !/Hand it to|New shelf|\bAsk [A-Z][a-z]+\b(?<!Ask the)/.test(t.replace(/Ask the Galley/g, "").replace(/Ask for a fresh one/g, "")), "");
  }

  // Landscape on a sideways phone still shows Staples
  await p.goto(LOCAL_URL + "#/browse", { waitUntil: "networkidle2" }); await sleep(1500);
  await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true }); await sleep(1200);
  const ls = await p.evaluate(() => { const r = document.querySelector(".ls-root"); return { shown: !!r && getComputedStyle(r).display !== "none", head: r?.querySelector(".cat-title")?.innerText }; });
  check("landscape: the Staples palette shows", ls.shown && /staples/i.test(ls.head || ""), JSON.stringify(ls));
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: false }); await sleep(800);

  await sleep(2500);   // late reads (polls, the second fetch after settle)
  if (EXPECT_ON) check("network: the flag-on build reads the Ask schema", askHits.length > 0, `${askHits.length} requests, e.g. ${askHits[0] || "-"}`);
  else check("network: ZERO requests to Ask tables, Ask RPCs or the item-photos bucket across the whole walk", askHits.length === 0, askHits.slice(0, 5).join(" | "));

  log(`DONE ${checks - fails}/${checks} passed`);
  await b.disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log("ERROR:", e.message.split("\n")[0]); process.exit(1); });
