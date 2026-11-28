// One add: This Week's meal card — the button before, the teal mark after (flag on). On the dev DB as the test
// account, through the app only: a meal is made in the Meals feeder (search → "Create “…” as a new meal", one
// ingredient: Apples; saved, it goes on This Week and its ingredients on the list). On This Week its card shows the
// teal mark "On the list" and no button — no Planned chip, no "Not on the list yet"; Home's ON DECK the same.
// Tidy: ⋯ → Remove (and take its items off the list), then the app's delete (recipe → Edit → Delete meal);
// the DB read back: no live meal, no open placement, nothing on the list. Flag-on build, signed in; local or `remote`.
// ("Everything's in" — the all-on-hand / wrapped-up state — is Jest's: src/lib/oneAdd.test.js.)
const lib = require("../lib.js");
const { restFor } = require("./rest.js");
const REMOTE = process.argv[2] === "remote";
const BASE = REMOTE ? lib.DEV_URL : require("./use-local.js").LOCAL_URL;
const HOUSE = process.env.OP_HOUSE || "Cody Test House";
const { sleep, log, connect, firstPage } = lib;

let checks = 0, fails = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) fails++; log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const NAME = `Week Card ${Date.now().toString(36).slice(-5)}`;

(async () => {
  const b = await connect(); const p = await firstPage(b);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { rest } = restFor(p);
  const HH = (await rest("GET", `households?select=id&name=eq.${encodeURIComponent(HOUSE)}&deleted_at=is.null`))[0]?.id;
  const card = () => p.evaluate((name) => {
    const c = [...document.querySelectorAll(".board-card")].find((e) => e.querySelector(".board-card-title")?.textContent.trim() === name);
    if (!c) return null;
    return { chip: c.querySelector(".board-chip")?.textContent.trim() || null, line: c.querySelector(".board-line")?.textContent.trim() || null,
      mark: c.querySelector(".board-mark")?.textContent.trim() || null,
      buttons: [...c.querySelectorAll(".board-actions > button")].map((x) => x.textContent.trim()).filter((t) => t !== "⋯") };
  }, NAME);
  // Home's ON DECK card (the meal is the only one on This Week, so it is on deck)
  const deck = async () => {
    await p.evaluate(() => { location.hash = "#/home"; }); await sleep(1800);
    const d = await p.evaluate(() => { const c = [...document.querySelectorAll(".home .deck")].find((e) => !e.classList.contains("home-list-card")); return c && {
      eyebrow: c.querySelector(".deck-eyebrow")?.innerText.trim(), title: c.querySelector(".deck-title")?.textContent.trim(), status: c.querySelector(".deck-status")?.textContent.trim() || null,
      mark: c.querySelector(".deck-mark")?.textContent.trim() || null, buttons: [...c.querySelectorAll(".deck-actions button")].map((x) => x.textContent.trim()) }; });
    await p.evaluate(() => { location.hash = "#/plan"; }); await sleep(1500);
    return d;
  };
  const dbRead = async () => {
    const m = await rest("GET", `meals?select=id,deleted_at&household_id=eq.${HH}&name=eq.${encodeURIComponent(NAME)}`);
    const ids = m.map((x) => x.id);
    const pl = ids.length ? await rest("GET", `meal_placements?select=meal_id,cooked_at,skipped_at&household_id=eq.${HH}&meal_id=in.(${ids.join(",")})`) : [];
    const live = await rest("GET", `list_items?select=id&household_id=eq.${HH}&quantity=gt.0&status=neq.bought&deleted_at=is.null`);
    return { live: m.filter((x) => !x.deleted_at).length, open: pl.filter((x) => !x.cooked_at && !x.skipped_at).length, listRows: live.length };
  };
  let made = false;
  try {
    // make the meal (one ingredient) in the Meals feeder; saved, it goes on This Week
    await p.goto(BASE + "#/plan", { waitUntil: "networkidle2" }); await sleep(2500);
    await p.evaluate(() => (document.querySelector('.plan-ctl .hdr-action[aria-label="Add a meal to this week"]') || document.querySelector(".plan-welcome-add"))?.click());
    await p.waitForSelector(".meals-feeder.open", { visible: true, timeout: 10000 }); await sleep(600);
    await p.type(".meals-feeder .item-search-field input", NAME, { delay: 12 }); await sleep(500);
    await p.evaluate(() => document.querySelector(".meals-feeder .meal-create")?.click()); await sleep(900);
    await p.type('.modal input.modal-input[placeholder="Search your catalog…"]', "Apples", { delay: 15 }); await sleep(700);
    await p.evaluate(() => [...document.querySelectorAll(".modal .add-btn")].find((e) => e.textContent.trim() === "+ Add")?.click()); await sleep(500);
    await p.evaluate(() => [...document.querySelectorAll(".modal .modal-confirm")].find((e) => /Save Meal/.test(e.textContent))?.click());
    await p.waitForFunction(() => !document.querySelector('.modal input.modal-input[placeholder="Taco Night"]'), { timeout: 15000 }); await sleep(2500);
    made = true;
    await p.evaluate(() => document.querySelector(".meals-feeder .item-search-done")?.click()); await sleep(1500);

    // Adding a meal adds its ingredients: the card has the mark at once (the "Add to list" button is the offline /
    // pre-change case — local/meal-auto-add.js checks it).
    const c = await card();
    check("planned → its ingredients on the list at once: the teal mark \"On the list\", no button, no Planned chip, no \"Not on the list yet\"",
      !!c && c.mark === "✓On the list" && c.buttons.length === 0 && !c.chip && !c.line, JSON.stringify(c));
    const d = await deck();
    check("Home's ON DECK: the same mark, no button (label ON DECK)", !!d && d.eyebrow === "ON DECK" && d.title === NAME && d.mark === "✓On the list" && !d.status && d.buttons.length === 0, JSON.stringify(d));
    const db = await dbRead();
    check("the DB: the meal on This Week, its ingredient on the list", db.live === 1 && db.open === 1 && db.listRows >= 1, JSON.stringify(db));
  } catch (e) {
    check("the walk ran to the end", false, e.message);
  } finally {
    try {
      if (made) {
        await p.goto(BASE + "#/plan", { waitUntil: "networkidle2" }); await sleep(2500);
        // ⋯ → Remove (and take its items off the list)
        await p.evaluate((name) => [...document.querySelectorAll(".board-card")].find((e) => e.querySelector(".board-card-title")?.textContent.trim() === name)?.querySelector(".board-more")?.click(), NAME); await sleep(400);
        await p.evaluate(() => [...document.querySelectorAll(".board-menu button")].find((e) => /^Remove/.test(e.textContent.trim()))?.click()); await sleep(2500);
        // the app's delete: the Meals feeder → the card → the recipe → Edit → Delete meal → Yes
        await p.evaluate(() => (document.querySelector('.plan-ctl .hdr-action[aria-label="Add a meal to this week"]') || document.querySelector(".plan-welcome-add"))?.click());
        await p.waitForSelector(".meals-feeder.open", { visible: true, timeout: 10000 }); await sleep(600);
        await p.evaluate(() => { const i = document.querySelector(".meals-feeder .item-search-field input"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ""); i.dispatchEvent(new Event("input", { bubbles: true })); });
        await p.type(".meals-feeder .item-search-field input", NAME, { delay: 10 }); await sleep(500);
        await p.evaluate((name) => [...document.querySelectorAll(".meals-feeder .lib-gcard, .meals-feeder .lib-row")].find((e) => (e.querySelector(".lib-gname, .lib-rname")?.textContent || "") === name)?.querySelector(".lib-gbody, .lib-rbody")?.click(), NAME);
        await p.waitForSelector(".rv-edit", { visible: true, timeout: 10000 }); await p.evaluate(() => document.querySelector(".rv-edit").click()); await sleep(900);
        await p.evaluate(() => [...document.querySelectorAll(".modal button")].find((e) => /^Delete meal$/.test(e.textContent.trim()))?.click()); await sleep(400);
        await p.evaluate(() => [...document.querySelectorAll(".modal button")].find((e) => /Yes, delete meal/.test(e.textContent))?.click()); await sleep(2500);
        if (await p.$(".meals-feeder.open")) await p.evaluate(() => document.querySelector(".meals-feeder .item-search-done")?.click());
      }
    } catch (e) { log(`tidy: ${e.message}`); }
    const d = await dbRead();
    check("tidied: no live meal, no open placement, nothing on the list", d.live === 0 && d.open === 0 && d.listRows === 0, JSON.stringify(d));
  }
  log(`${checks - fails}/${checks} ${fails ? "FAIL" : "ALL PASS"}`);
  b.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
