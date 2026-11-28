// One add: adding a meal adds its ingredients (flag on). On the dev DB as the test account, through the app only.
//   plan     a meal made in the Meals feeder (one ingredient, Apples; saved → planned) → Apples is on the list,
//            the This Week card shows the teal mark "On the list", the feeder card "This week"
//   unplan   the feeder's ✓ again → Apples (that meal's alone) leaves. A person adds Carrots (List feeder, return);
//            in one visit B (Bananas) then C (Apples, Bananas, Carrots) → Apples 1, Bananas 2, Carrots 2; un-plan C →
//            Apples leaves, Bananas (B's) and Carrots (the person's) stay at 1; C again → its items back
//   progress the subtitle: arrival "What sounds good?" → "1 meal added" → back on un-plan; "1 meal added" → "2 meals
//            added" → un-plan → "1 meal added" → "2 meals added"; Done plain; the toast on close "2 meals added · 4 items on the list"; none when nothing was added
//   offline  the browser reports offline (navigator.onLine false, this tab) when a meal is saved → planned only, its
//            card shows "Add to list"; back online, the tap adds it and the mark shows
//   review   a meal with Garlic and Lemons (Lemons "I have this") → Garlic added, Lemons skipped; ⋯ → Review
//            ingredients → the on-hand sheet with Lemons → Buy it → Lemons on the list, Garlic not added twice
//   all in   a meal whose only ingredient is on hand → nothing added, "✓ Everything's in" with Cooked it beside it on
//            This Week and on Home's ON DECK; un-planned again
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
const B = `Auto Shared ${tag}`;
const C = `Auto Three ${tag}`;
const D = `Auto Offline ${tag}`;
const E = `Auto Review ${tag}`;
const F = `Auto Allset ${tag}`;
const nav = require("../oneadd-nav.js");

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
    await p.waitForSelector('.plan-ctl .hdr-action[aria-label="Add a meal to this week"], .plan-welcome-add', { visible: true, timeout: 15000 });
    await p.evaluate(() => (document.querySelector('.plan-ctl .hdr-action[aria-label="Add a meal to this week"]') || document.querySelector(".plan-welcome-add"))?.click());
    await p.waitForSelector(".meals-feeder.open", { visible: true, timeout: 10000 }); await sleep(600);
  };
  const closeMeals = async () => { if (await p.$(".meals-feeder.open")) { await p.evaluate(() => document.querySelector(".meals-feeder .item-search-done").click()); await sleep(1200); } };
  // a meal made in the Meals feeder: search → "Create “…” as a new meal" → the ingredients → Save (it goes on This Week)
  const createMeal = async (name, ingredients, onHand = []) => {
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
    // ingredients marked on hand: the staged row's "I have this"
    for (const ing of onHand) {
      await p.evaluate((ing) => {
        const nm = [...document.querySelectorAll(".modal [id^=ing-name-]")].find((e) => e.textContent.trim() === ing);
        if (!nm) return;
        [...document.querySelectorAll(".modal button")].find((bt) => (bt.getAttribute("aria-labelledby") || "").split(" ").includes(nm.id) && bt.textContent.trim() === "I have this")?.click();
      }, ing); await sleep(300);
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

  const sub = () => p.evaluate(() => { const e = document.querySelector(".meals-feeder .item-search-sub"); return e ? { text: e.textContent.trim(), progress: !!e.querySelector(".feeder-progress svg circle") } : null; });
  const toastNow = () => p.evaluate(() => [...document.querySelectorAll(".app-root div")].map((e) => e.textContent.trim()).find((t) => /meals? added/.test(t) && t.length < 80) || null);
  const unplan = async (name) => {
    await openMeals();
    await clearField(".meals-feeder .item-search-field input");
    await p.type(".meals-feeder .item-search-field input", name, { delay: 10 }); await sleep(500);
    await p.evaluate((name) => [...document.querySelectorAll(".meals-feeder .lib-gcard, .meals-feeder .lib-row")].find((e) => (e.querySelector(".lib-gname, .lib-rname")?.textContent || "") === name)?.querySelector("button.lib-plan.on")?.click(), name);
    await sleep(3500);
    await clearField(".meals-feeder .item-search-field input");
  };

  try {
    await p.goto(BASE + "#/plan", { waitUntil: "networkidle2" }); await p.reload({ waitUntil: "networkidle2" }); await sleep(2500);
    // ── everything's in: a meal whose only ingredient is on hand → nothing added; "Everything's in" + Cooked it ──
    await createMeal(F, ["Lemons"], ["Lemons"]);
    await clearField(".meals-feeder .item-search-field input"); await sleep(400);
    let rf = await listRows();
    await closeMeals();
    await sleep(2800);
    const wf = await weekCard(F);
    check("all on hand: nothing added; the This Week card shows \"✓ Everything's in\" and Cooked it beside it", !rf.Lemons && !!wf && wf.mark === "✓Everything's in" && wf.buttons.join() === "Cooked it", JSON.stringify({ rf, wf }));
    await p.evaluate(() => { location.hash = "#/home"; }); await sleep(1800);
    const df = await p.evaluate(() => { const c = [...document.querySelectorAll(".home .deck")].find((e) => !e.classList.contains("home-list-card")); return c && { title: c.querySelector(".deck-title")?.textContent.trim(), mark: c.querySelector(".deck-mark")?.textContent.trim() || null, buttons: [...c.querySelectorAll(".deck-actions button")].map((x) => x.textContent.trim()) }; });
    check("… Home's ON DECK too: the mark and Cooked it", !!df && df.title === F && df.mark === "✓Everything's in" && df.buttons.includes("Cooked it"), JSON.stringify(df));
    await p.evaluate(() => { location.hash = "#/plan"; }); await sleep(1500);
    await unplan(F);
    await closeMeals(); await sleep(2800);
    // ── plan: the ingredients go on the list; the progress line counts ──
    await openMeals();
    let st = await sub();
    check("arrival: \"What sounds good?\" (no counts), Done plain", st?.text === "What sounds good?" && !st.progress && (await p.evaluate(() => document.querySelector(".meals-feeder .item-search-done")?.textContent.trim())) === "Done", JSON.stringify(st));
    await createMeal(A, ["Apples"]);
    await clearField(".meals-feeder .item-search-field input"); await sleep(400);
    st = await sub();
    check("plan → \"1 meal added\" (the teal check-circle before it)", st?.text === "1 meal added" && st.progress, JSON.stringify(st));
    const fc = await feederCard(A);
    check("plan: the feeder card reads \"This week\" (· To buy) with the ✓", !!fc && /^This week/.test(fc.sub || "") && fc.tick, JSON.stringify(fc));
    let rows = await listRows();
    check("plan: its ingredient (Apples) is on the list — added by the plan, no \"Add to list\" tap", rows.Apples?.qty === 1 && rows.Apples?.status === "pending", JSON.stringify(rows));
    // ── un-plan: only this meal's own unchecked items leave; the line counts down ──
    await unplan(A);
    rows = await listRows();
    const fa = await feederCard(A);
    st = await sub();
    check("un-plan (the ✓ again): its own item (Apples) leaves the list, the card is back to +", !rows.Apples && !!fa && !fa.sub && !fa.tick, JSON.stringify({ rows, fa }));
    check("… and the line is back to \"What sounds good?\"", st?.text === "What sounds good?" && !st.progress, JSON.stringify(st));
    await closeMeals();
    check("nothing added this visit: no toast on close", !(await toastNow()));
    await sleep(2500);
    // a person adds Carrots first: the List feeder, typed, return
    await nav.openFeeder(p, BASE);
    await p.type(".item-picker .item-search-field input", "Carrots", { delay: 12 }); await sleep(400);
    await p.keyboard.press("Enter"); await sleep(2500);
    await nav.closeFeeder(p);
    await sleep(2800);   // its "1 added" toast goes
    await p.goto(BASE + "#/plan", { waitUntil: "networkidle2" }); await sleep(2000);
    // one visit: B (Bananas), then C (Apples, Bananas, Carrots)
    await createMeal(B, ["Bananas"]);
    st = await sub();
    check("B → \"1 meal added\"", st?.text === "1 meal added", JSON.stringify(st));
    await createMeal(C, ["Apples", "Bananas", "Carrots"]);
    await clearField(".meals-feeder .item-search-field input"); await sleep(400);
    st = await sub();
    check("C → \"2 meals added\"", st?.text === "2 meals added", JSON.stringify(st));
    rows = await listRows();
    check("set-up: Apples 1 (C), Bananas 2 (B + C), Carrots 2 (a person + C)", rows.Apples?.qty === 1 && rows.Bananas?.qty === 2 && rows.Carrots?.qty === 2, JSON.stringify(rows));
    // un-plan C in the same visit: the line counts down; only C's own unchecked item leaves
    await unplan(C);
    rows = await listRows();
    st = await sub();
    check("un-plan C: Apples (C's alone) leaves; Bananas (B needs it) and Carrots (a person added it) stay, at 1", !rows.Apples && rows.Bananas?.qty === 1 && rows.Carrots?.qty === 1, JSON.stringify(rows));
    check("… the line counts down: \"1 meal added\"", st?.text === "1 meal added", JSON.stringify(st));
    // plan C again (its + on the card): "2 meals added", its items back
    await clearField(".meals-feeder .item-search-field input");
    await p.type(".meals-feeder .item-search-field input", C, { delay: 10 }); await sleep(500);
    await p.evaluate((name) => [...document.querySelectorAll(".meals-feeder .lib-gcard, .meals-feeder .lib-row")].find((e) => (e.querySelector(".lib-gname, .lib-rname")?.textContent || "") === name)?.querySelector("button.lib-plan:not(.on)")?.click(), C);
    await sleep(3500);
    await clearField(".meals-feeder .item-search-field input"); await sleep(400);
    st = await sub();
    rows = await listRows();
    check("plan C again → \"2 meals added\", its items back (Apples 1, Bananas 2, Carrots 2)", st?.text === "2 meals added" && rows.Apples?.qty === 1 && rows.Bananas?.qty === 2 && rows.Carrots?.qty === 2, JSON.stringify({ st, rows }));
    await closeMeals();
    const wc = await weekCard(C);
    check("plan: the This Week card shows the teal mark \"On the list\", no button", !!wc && wc.mark === "✓On the list" && wc.buttons.length === 0, JSON.stringify(wc));
    const t2 = await toastNow();
    check("close: \"2 meals added · 4 items on the list\" (B's 1 + C's 3)", t2 === "2 meals added · 4 items on the list", t2);
    await sleep(2800);
    // ── offline: the browser says offline when the meal is planned → planned only; its card shows "Add to list" ──
    const applesBefore = (await listRows()).Apples?.qty || 0;   // C (still planned) has Apples on the list
    await p.evaluate(() => { window.__onLine = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine"); Object.defineProperty(Navigator.prototype, "onLine", { get: () => false, configurable: true }); });
    await createMeal(D, ["Apples"]);
    await clearField(".meals-feeder .item-search-field input"); await sleep(400);
    rows = await listRows();
    await p.evaluate(() => { if (window.__onLine) Object.defineProperty(Navigator.prototype, "onLine", window.__onLine); });
    await closeMeals();
    let wd = await weekCard(D);
    check("offline: the meal is planned but nothing is added (Apples unchanged); its card shows \"Add to list\"", (rows.Apples?.qty || 0) === applesBefore && !!wd && !wd.mark && wd.buttons.join() === "Add to list", JSON.stringify({ applesBefore, rows, wd }));
    await p.evaluate((name) => [...document.querySelectorAll(".board-card")].find((e) => e.querySelector(".board-card-title")?.textContent.trim() === name)?.querySelector(".board-lock")?.click(), D);
    await sleep(3500);
    wd = await weekCard(D);
    rows = await listRows();
    check("… back online, \"Add to list\" adds it (Apples +1), the teal mark", rows.Apples?.qty === applesBefore + 1 && !!wd && wd.mark === "✓On the list" && wd.buttons.length === 0, JSON.stringify({ applesBefore, rows, wd }));
    await sleep(2800);

    // ── Review ingredients: a skipped on-hand item, added from the card's ⋯ ──
    await createMeal(E, ["Garlic", "Lemons"], ["Lemons"]);
    await clearField(".meals-feeder .item-search-field input"); await sleep(400);
    rows = await listRows();
    check("plan with an on-hand ingredient: Garlic added, Lemons (I have this) skipped", rows.Garlic?.qty === 1 && !rows.Lemons, JSON.stringify(rows));
    await closeMeals();
    await p.evaluate((name) => [...document.querySelectorAll(".board-card")].find((e) => e.querySelector(".board-card-title")?.textContent.trim() === name)?.querySelector(".board-more")?.click(), E); await sleep(400);
    const menu = await p.evaluate(() => [...document.querySelectorAll(".board-menu button")].map((x) => x.textContent.trim()));
    check("⋯ offers \"Review ingredients\"", menu.includes("Review ingredients"), JSON.stringify(menu));
    await p.evaluate(() => [...document.querySelectorAll(".board-menu button")].find((x) => x.textContent.trim() === "Review ingredients")?.click()); await sleep(700);
    const sheet = await p.evaluate(() => { const m = document.querySelector('[role=dialog][aria-label="Already on hand"]'); return m && { items: [...m.querySelectorAll(".onhand-row")].map((r) => r.textContent.replace(/\s+/g, " ").trim()) }; });
    check("… opens the on-hand sheet with the skipped item (Lemons)", !!sheet && sheet.items.length === 1 && /Lemons/.test(sheet.items[0]), JSON.stringify(sheet));
    await p.evaluate(() => [...document.querySelectorAll('[role=dialog][aria-label="Already on hand"] .onhand-row button')].find((x) => /^Buy it/.test(x.textContent.trim()))?.click()); await sleep(300);
    await p.evaluate(() => document.querySelector('[role=dialog][aria-label="Already on hand"] .modal-confirm')?.click()); await sleep(3000);
    rows = await listRows();
    check("Buy it → Lemons on the list (Garlic unchanged — nothing added twice)", rows.Lemons?.qty === 1 && rows.Garlic?.qty === 1, JSON.stringify(rows));
    await sleep(2800);
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
    // the person's Carrots (and anything else the walk left) off the list, through the app's own RPC
    for (const r of await rest("GET", `list_items?select=catalog_item_id&household_id=eq.${HH}&quantity=gt.0&status=neq.bought&deleted_at=is.null`)) {
      await restFor(p).rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: r.catalog_item_id }).catch((e) => log(`unlist: ${e.message}`));
    }
    const live = await rest("GET", `meals?select=id&household_id=eq.${HH}&deleted_at=is.null`);
    const open = await rest("GET", `meal_placements?select=meal_id&household_id=eq.${HH}&cooked_at=is.null&skipped_at=is.null`);
    const lr = await rest("GET", `list_items?select=id&household_id=eq.${HH}&quantity=gt.0&status=neq.bought&deleted_at=is.null`);
    check(`tidied: no live meal, no open placement, nothing on the list (${made.length} made)`, live.length === 0 && open.length === 0 && lr.length === 0, `meals ${live.length} · open ${open.length} · list ${lr.length}`);
  }
  log(`${checks - fails}/${checks} ${fails ? "FAIL" : "ALL PASS"}`);
  b.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
