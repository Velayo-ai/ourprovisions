// One add: the Meals feeder's two "+ New meal" doors, end to end on the dev DB (normal app use, as the test
// account). (b) a search with no match offers "Create “{query}” as a new meal": the new-meal sheet opens with
// the name prefilled; Save puts the meal on This Week and its card shows the teal "This week". (a) the
// section link ("+ New meal" on "No type yet"; local/meal-sections.js checks the typed ones): the sheet opens
// empty; the same on save. "✨ Ask the Galley" is the first card, above the sections. Both meals are deleted at the end
// through the app's own delete (recipe → Edit → Delete meal → Yes), and the DB is read back: no live meal of
// either name, no open placement. Flag-on build, signed in; a local build (see one-add.js) or `remote`.
const lib = require("../lib.js");
const { restFor } = require("./rest.js");
const REMOTE = process.argv[2] === "remote";
const BASE = REMOTE ? lib.DEV_URL : require("./use-local.js").LOCAL_URL;
const HOUSE = process.env.OP_HOUSE || "Cody Test House";
const { sleep, log, connect, firstPage } = lib;

let checks = 0, fails = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) fails++; log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const stamp = Date.now().toString(36).slice(-5);
const SEARCHED = `Harness Soup ${stamp}`;
const HEADED = `Harness Stew ${stamp}`;

(async () => {
  const b = await connect(); const p = await firstPage(b);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { rest } = restFor(p);
  const field = ".meals-feeder .item-search-field input";
  const open = async () => {
    if (await p.$(".meals-feeder.open")) return;
    await p.goto(BASE + "#/plan", { waitUntil: "networkidle2" }); await sleep(2500);
    await p.evaluate(() => (document.querySelector('.plan-ctl .hdr-action[aria-label="Add a meal to this week"]') || document.querySelector(".plan-welcome-add"))?.click());
    await p.waitForSelector(".meals-feeder.open", { visible: true, timeout: 10000 }); await sleep(600);
  };
  const setQuery = async (text) => {
    await p.evaluate((sel) => { const i = document.querySelector(sel); i.focus(); }, field);
    await p.evaluate((sel) => { const i = document.querySelector(sel); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ""); i.dispatchEvent(new Event("input", { bubbles: true })); }, field);
    if (text) await p.type(field, text, { delay: 15 });
    await sleep(400);
  };
  const sheetName = () => p.evaluate(() => document.querySelector('.modal input.modal-input[placeholder="Taco Night"]')?.value ?? null);
  const save = async () => {
    await p.evaluate(() => [...document.querySelectorAll(".modal .modal-confirm")].find((e) => /Save Meal/.test(e.textContent))?.click());
    await p.waitForFunction(() => !document.querySelector('.modal input.modal-input[placeholder="Taco Night"]'), { timeout: 15000 });
    await sleep(2500);
  };
  // the card for a name: its teal line and its control, with the layer back (not suspended)
  const cardFor = (name) => p.evaluate((name) => {
    const v = document.querySelector(".meals-feeder.open");
    const c = [...document.querySelectorAll(".meals-feeder .lib-gcard, .meals-feeder .lib-row")].find((e) => (e.querySelector(".lib-gname, .lib-rname")?.textContent || "") === name);
    return { layer: !!v && !v.classList.contains("suspended"), card: !!c, sub: c?.querySelector(".lib-onsub")?.textContent || null, tick: !!c?.querySelector(".lib-plan.on"), plus: !!c?.querySelector(".lib-plan:not(.on)") };
  }, name);
  const HH = (await rest("GET", `households?select=id&name=eq.${encodeURIComponent(HOUSE)}&deleted_at=is.null`))[0]?.id;
  const dbRead = async (name) => {
    const m = await rest("GET", `meals?select=id,deleted_at&household_id=eq.${HH}&name=eq.${encodeURIComponent(name)}`);
    const live = m.filter((x) => !x.deleted_at);
    // every row of that name, deleted ones included: a delete must close its placement too
    const pl = m.length ? await rest("GET", `meal_placements?select=meal_id,cooked_at,skipped_at&household_id=eq.${HH}&meal_id=in.(${m.map((x) => x.id).join(",")})`) : [];
    return { all: m, live: live.length, open: pl.filter((x) => !x.cooked_at && !x.skipped_at).length, ids: m.map((x) => x.id) };
  };
  const made = [];
  try {
    // (b) the no-match row
    await open();
    await setQuery(SEARCHED);
    const row = await p.evaluate(() => document.querySelector(".meals-feeder .meal-create")?.textContent.replace(/\s+/g, " ").trim() || null);
    check("(b) a search with no match shows \"Create “{query}” as a new meal\"", row === `Create “${SEARCHED}” as a new meal`, row);
    await p.evaluate(() => document.querySelector(".meals-feeder .meal-create")?.click()); await sleep(900);
    check("(b) the new-meal sheet opens with the name prefilled, the layer stepped aside", (await sheetName()) === SEARCHED && !!(await p.$(".meals-feeder.open.suspended")), await sheetName());
    await save(); made.push(SEARCHED);
    const cb = await cardFor(SEARCHED);
    check("(b) on save: back on the layer, the card shows the teal \"This week\" and the ✓", cb.layer && cb.card && cb.sub === "This week" && cb.tick && !cb.plus, JSON.stringify(cb));
    const db1 = await dbRead(SEARCHED);
    check("(b) the DB: one live meal of that name, on This Week (an open placement)", db1.live === 1 && db1.open === 1, JSON.stringify(db1));

    // (a) the section link: the meal from (b) has no type, so it sits under "No type yet", whose link is "+ New meal"
    await setQuery("");
    const head = await p.evaluate(() => {
      const list = document.querySelector(".meals-feeder .ask-search-list .lib");
      const first = list && [...list.children].find((e) => !e.classList.contains("sr-only"));
      const t = (e) => (e ? [...e.querySelectorAll(".lib-new-t, .lib-new-s")].map((x) => x.textContent.trim()).join(" | ") : null);
      const heads = [...document.querySelectorAll(".meals-feeder .meal-section .pick-aisle")].map((h) => ({ name: h.querySelector(".pick-aisle-name")?.textContent.trim(), link: h.querySelector("button.pick-aisle-new")?.textContent.trim() }));
      return { first: first?.className, firstText: t(first), heads, newCard: !!document.querySelector(".meals-feeder .lib-newcard") };
    });
    check("(a) \"✨ Ask the Galley\" is first, above the sections; no \"+ New meal\" card; \"No type yet\" carries \"+ New meal\"",
      head.first === "lib-newrow galley" && head.firstText === "Ask the Galley | Not sure what to cook? Get ideas." && !head.newCard
      && head.heads.length >= 1 && head.heads[head.heads.length - 1].name === "No type yet" && head.heads[head.heads.length - 1].link === "＋ New meal", JSON.stringify(head));
    // ✨ Ask the Galley: the new-meal sheet, opened at its Galley card (on screen), the name empty; Cancel
    await p.evaluate(() => document.querySelector(".meals-feeder .lib-newrow.galley")?.click()); await sleep(1200);
    const gal = await p.evaluate(() => { const c = document.querySelector(".modal .op-galley"); if (!c) return null; const r = c.getBoundingClientRect(); return { onScreen: r.top >= 0 && r.top < innerHeight - 40, name: document.querySelector('.modal input.modal-input[placeholder="Taco Night"]')?.value, suspended: !!document.querySelector(".meals-feeder.open.suspended") }; });
    check("✨ Ask the Galley opens the new-meal sheet at the Galley (on screen), the layer stepped aside", !!gal && gal.onScreen && gal.name === "" && gal.suspended, JSON.stringify(gal));
    await p.evaluate(() => [...document.querySelectorAll(".modal .modal-cancel")].find((e) => /Cancel/.test(e.textContent))?.click()); await sleep(800);
    check("the placeholder reads \"Type a meal, or scroll and tap\"", (await p.$eval(field, (i) => i.placeholder)) === "Type a meal, or scroll and tap");
    await p.evaluate(() => { const h = [...document.querySelectorAll(".meals-feeder .meal-section .pick-aisle")].find((e) => e.querySelector(".pick-aisle-name")?.textContent.trim() === "No type yet"); h?.querySelector("button.pick-aisle-new")?.click(); }); await sleep(900);
    check("(a) the new-meal sheet opens empty", (await sheetName()) === "", JSON.stringify(await sheetName()));
    await p.click('.modal input.modal-input[placeholder="Taco Night"]'); await p.type('.modal input.modal-input[placeholder="Taco Night"]', HEADED, { delay: 15 });
    await save(); made.push(HEADED);
    const ca = await cardFor(HEADED);
    check("(a) on save: the card shows the teal \"This week\" and the ✓", ca.layer && ca.card && ca.sub === "This week" && ca.tick, JSON.stringify(ca));
    const db2 = await dbRead(HEADED);
    check("(a) the DB: one live meal of that name, on This Week", db2.live === 1 && db2.open === 1, JSON.stringify(db2));
  } catch (e) {
    check("the walk ran to the end", false, e.message);
  } finally {
    // tidy through the app's own delete: the card → the recipe → Edit → Delete meal → Yes, delete meal
    for (const name of [SEARCHED, HEADED]) {
      try {
        if (!(await dbRead(name)).live) continue;
        await open(); await setQuery(name);
        await p.evaluate((name) => [...document.querySelectorAll(".meals-feeder .lib-gcard, .meals-feeder .lib-row")].find((e) => (e.querySelector(".lib-gname, .lib-rname")?.textContent || "") === name)?.querySelector(".lib-gbody, .lib-rbody")?.click(), name);
        await p.waitForSelector(".rv-edit", { visible: true, timeout: 10000 }); await p.evaluate(() => document.querySelector(".rv-edit").click()); await sleep(900);
        await p.evaluate(() => [...document.querySelectorAll(".modal button")].find((e) => /^Delete meal$/.test(e.textContent.trim()))?.click()); await sleep(400);
        await p.evaluate(() => [...document.querySelectorAll(".modal button")].find((e) => /Yes, delete meal/.test(e.textContent))?.click()); await sleep(2500);
      } catch (e) { log(`tidy ${name}: ${e.message}`); }
    }
    await setQuery("").catch(() => {});
    if (await p.$(".meals-feeder.open")) { await p.evaluate(() => document.querySelector(".meals-feeder .item-search-done").click()); await sleep(600); }
    const left = [];
    for (const name of [SEARCHED, HEADED]) { const d = await dbRead(name); if (d.live || d.open) left.push(`${name}: live ${d.live}, open ${d.open}`); }
    check(`tidied through the app's delete: no live meal and no open placement left (${made.length} made)`, left.length === 0, left.join("; "));
  }
  log(`${checks - fails}/${checks} ${fails ? "FAIL" : "ALL PASS"}`);
  b.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
