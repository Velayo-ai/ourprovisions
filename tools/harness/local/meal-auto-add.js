// One add: adding a meal adds its ingredients (flag on). On the dev DB as the test account, through the app only.
//   plan     a meal made in the Meals feeder (one ingredient, Apples; saved → planned) → Apples is on the list,
//            the This Week card shows the teal mark "On the list", the feeder card "This week"
// Tidy: ⋯ Remove (and take its items off the list) → the app's delete (recipe → Edit → Delete meal); the DB read
// back: no live meal of the walk's names, no open placement, nothing on the list. Flag-on build, signed in;
// local or `remote`. Needs an empty list in the test house to start.
const lib = require("../lib.js");
const { restFor } = require("./rest.js");
const REMOTE = process.argv[2] === "remote";
const BASE = REMOTE ? lib.DEV_URL : require("./use-local.js").LOCAL_URL;
const HOUSE = process.env.OP_HOUSE || "Cody Test House";
const { sleep, log, connect, firstPage } = lib;

let checks = 0, fails = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) fails++; log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const tag = Date.now().toString(36).slice(-4);
const A = `Auto Add ${tag}`;

(async () => {
  const b = await connect(); const p = await firstPage(b);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { rest } = restFor(p);
  const HH = (await rest("GET", `households?select=id&name=eq.${encodeURIComponent(HOUSE)}&deleted_at=is.null`))[0]?.id;
  const made = [];

  const clearField = (sel) => p.evaluate((sel) => { const i = document.querySelector(sel); if (!i) return; i.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ""); i.dispatchEvent(new Event("input", { bubbles: true })); }, sel);
  const openMeals = async () => {
    if (await p.$(".meals-feeder.open")) return;
    if (!/#\/plan/.test(p.url())) { await p.goto(BASE + "#/plan", { waitUntil: "networkidle2" }); await sleep(2500); }
    await p.evaluate(() => (document.querySelector('.plan-ctl .hdr-action[aria-label="Add a meal to this week"]') || document.querySelector(".plan-welcome-add"))?.click());
    await p.waitForSelector(".meals-feeder.open", { visible: true, timeout: 10000 }); await sleep(600);
  };
  const closeMeals = async () => { if (await p.$(".meals-feeder.open")) { await p.evaluate(() => document.querySelector(".meals-feeder .item-search-done").click()); await sleep(1200); } };
  // a meal made in the Meals feeder: search → "Create “…” as a new meal" → the ingredients → Save (it goes on This Week)
  const createMeal = async (name, ingredients) => {
    await openMeals();
    await clearField(".meals-feeder .item-search-field input");
    await p.type(".meals-feeder .item-search-field input", name, { delay: 10 }); await sleep(500);
    await p.evaluate(() => document.querySelector(".meals-feeder .meal-create")?.click()); await sleep(900);
    for (const ing of ingredients) {
      await clearField('.modal input.modal-input[placeholder="Search your catalog…"]');
      await p.type('.modal input.modal-input[placeholder="Search your catalog…"]', ing, { delay: 12 }); await sleep(600);
      await p.evaluate((ing) => {
        const row = [...document.querySelectorAll(".modal .add-btn")].map((btn) => ({ btn, name: btn.parentElement?.querySelector("[id^=ing-result-]")?.textContent.trim() })).find((r) => r.name === ing && r.btn.textContent.trim() === "+ Add");
        row?.btn.click();
      }, ing); await sleep(400);
    }
    await p.evaluate(() => [...document.querySelectorAll(".modal .modal-confirm")].find((e) => /Save Meal/.test(e.textContent))?.click());
    await p.waitForFunction(() => !document.querySelector('.modal input.modal-input[placeholder="Taco Night"]'), { timeout: 15000 }); await sleep(3000);
    made.push(name);
  };
  const listRows = async () => {
    const rows = await rest("GET", `list_items?select=quantity,status,catalog_items(name)&household_id=eq.${HH}&quantity=gt.0&deleted_at=is.null`);
    return Object.fromEntries(rows.map((r) => [r.catalog_items?.name, { qty: r.quantity, status: r.status }]));
  };
  const weekCard = (name) => p.evaluate((name) => {
    const c = [...document.querySelectorAll(".board-card")].find((e) => e.querySelector(".board-card-title")?.textContent.trim() === name);
    return c ? { mark: c.querySelector(".board-mark")?.textContent.trim() || null, buttons: [...c.querySelectorAll(".board-actions > button")].map((x) => x.textContent.trim()).filter((t) => t !== "⋯") } : null;
  }, name);
  const feederCard = (name) => p.evaluate((name) => {
    const c = [...document.querySelectorAll(".meals-feeder .lib-gcard, .meals-feeder .lib-row")].find((e) => (e.querySelector(".lib-gname, .lib-rname")?.textContent || "") === name);
    return c ? { sub: c.querySelector(".lib-onsub")?.textContent || null, tick: !!c.querySelector(".lib-plan.on") } : null;
  }, name);

  try {
    // ── plan: the ingredients go on the list ──
    await createMeal(A, ["Apples"]);
    await clearField(".meals-feeder .item-search-field input"); await sleep(400);
    const fc = await feederCard(A);
    check("plan: the feeder card reads \"This week\" (· To buy) with the ✓", !!fc && /^This week/.test(fc.sub || "") && fc.tick, JSON.stringify(fc));
    let rows = await listRows();
    check("plan: its ingredient (Apples) is on the list — added by the plan, no \"Add to list\" tap", rows.Apples?.qty === 1 && rows.Apples?.status === "pending", JSON.stringify(rows));
    await closeMeals();
    const wc = await weekCard(A);
    check("plan: the This Week card shows the teal mark \"On the list\", no button", !!wc && wc.mark === "✓On the list" && wc.buttons.length === 0, JSON.stringify(wc));
  } catch (e) {
    check("the walk ran to the end", false, e.message);
  } finally {
    for (const name of made) {
      try {
        await closeMeals();
        await p.goto(BASE + "#/plan", { waitUntil: "networkidle2" }); await sleep(2000);
        const has = await weekCard(name);
        if (has) {
          await p.evaluate((name) => [...document.querySelectorAll(".board-card")].find((e) => e.querySelector(".board-card-title")?.textContent.trim() === name)?.querySelector(".board-more")?.click(), name); await sleep(400);
          await p.evaluate(() => [...document.querySelectorAll(".board-menu button")].find((e) => /^Remove/.test(e.textContent.trim()))?.click()); await sleep(2500);
        }
        await openMeals();
        await clearField(".meals-feeder .item-search-field input");
        await p.type(".meals-feeder .item-search-field input", name, { delay: 10 }); await sleep(500);
        await p.evaluate((name) => [...document.querySelectorAll(".meals-feeder .lib-gcard, .meals-feeder .lib-row")].find((e) => (e.querySelector(".lib-gname, .lib-rname")?.textContent || "") === name)?.querySelector(".lib-gbody, .lib-rbody")?.click(), name);
        await p.waitForSelector(".rv-edit", { visible: true, timeout: 10000 }); await p.evaluate(() => document.querySelector(".rv-edit").click()); await sleep(900);
        await p.evaluate(() => [...document.querySelectorAll(".modal button")].find((e) => /^Delete meal$/.test(e.textContent.trim()))?.click()); await sleep(400);
        await p.evaluate(() => [...document.querySelectorAll(".modal button")].find((e) => /Yes, delete meal/.test(e.textContent))?.click()); await sleep(2500);
      } catch (e) { log(`tidy ${name}: ${e.message}`); }
    }
    await closeMeals();
    const live = await rest("GET", `meals?select=id&household_id=eq.${HH}&deleted_at=is.null`);
    const open = await rest("GET", `meal_placements?select=meal_id&household_id=eq.${HH}&cooked_at=is.null&skipped_at=is.null`);
    const lr = await rest("GET", `list_items?select=id&household_id=eq.${HH}&quantity=gt.0&status=neq.bought&deleted_at=is.null`);
    check(`tidied: no live meal, no open placement, nothing on the list (${made.length} made)`, live.length === 0 && open.length === 0 && lr.length === 0, `meals ${live.length} · open ${open.length} · list ${lr.length}`);
  }
  log(`${checks - fails}/${checks} ${fails ? "FAIL" : "ALL PASS"}`);
  b.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
