// One add: the List feeder's search create (Dan's household test), on the dev DB as the test account.
//   - placeholder "Type anything, or scroll and tap"
//   - a name with no exact match: the FIRST row is the teal "+ Add “{name}”", its aisle guessed from the
//     household's catalog ("… apples" → Produce) as a pill; RETURN creates it in that aisle and puts it on the
//     list, the field empties and keeps the focus
//   - the pill changes the aisle: a name with no guess shows "Other"; pick Household; the teal row adds it there
//   - an exact match: no "+ Add" row; RETURN adds that item
//   - the section links read "+ New {aisle} item", or "+ New item" where the long form would wrap — never a
//     wrapped link, at 390 and at 320 wide
// Tidy: the two new items off the list and deleted (the app's own remove_list_item / delete_custom_catalog_item
// RPCs), the exact-match item back off the list; all read back. Flag-on build, signed in; local or `remote`.
const lib = require("../lib.js");
const nav = require("../oneadd-nav.js");
const { restFor } = require("./rest.js");
const REMOTE = process.argv[2] === "remote";
const BASE = REMOTE ? lib.DEV_URL : require("./use-local.js").LOCAL_URL;
const HOUSE = process.env.OP_HOUSE || "Cody Test House";
const { sleep, log, connect, firstPage } = lib;

let checks = 0, fails = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) fails++; log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const stamp = Date.now().toString(36).slice(-5);
// No word in common between the two (a shared word would make the second guess the first's aisle).
const GUESSED = `Gala apples ${stamp}g`;
const PICKED = `Zorbly ${stamp}w`;

(async () => {
  const b = await connect(); const p = await firstPage(b);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { rest, rpc } = restFor(p);
  const field = ".item-picker .item-search-field input";
  const HH = (await rest("GET", `households?select=id&name=eq.${encodeURIComponent(HOUSE)}&deleted_at=is.null`))[0]?.id;
  const catalogRow = async (name) => (await rest("GET", `catalog_items?select=id,name,category,is_global&name=eq.${encodeURIComponent(name)}&deleted_at=is.null`))[0] || null;
  const onList = async (id) => (await rest("GET", `list_items?select=quantity&household_id=eq.${HH}&catalog_item_id=eq.${id}&quantity=gt.0&status=neq.bought&deleted_at=is.null`)).length > 0;
  const type = async (text) => {
    await p.evaluate((sel) => { const i = document.querySelector(sel); i.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ""); i.dispatchEvent(new Event("input", { bubbles: true })); }, field);
    if (text) await p.type(field, text, { delay: 12 });
    await sleep(400);
  };
  const searchState = () => p.evaluate((sel) => {
    const list = document.querySelector(".item-picker .ask-search-list");
    const first = list && [...list.querySelectorAll(".pick-row")][0];
    const card = document.querySelector(".item-picker .pick-addcard");
    return {
      firstIsAdd: !!first && first.classList.contains("pick-add-new"),
      add: card ? card.querySelector(".pick-add-new .pick-name")?.textContent.replace(/\s+/g, " ").trim() : null,
      mark: card ? card.querySelector(".pick-add-new .pick-mark")?.textContent.trim() : null,
      aisle: card ? card.querySelector(".pick-aisle-pill")?.textContent.replace("▾", "").replace(/\s+/g, " ").trim() : null,
      value: document.querySelector(sel)?.value, focused: document.activeElement === document.querySelector(sel),
    };
  }, field);
  const made = [];
  let exactName = null;
  try {
    await nav.openFeeder(p, BASE);
    check("placeholder \"Type anything, or scroll and tap\"", (await p.$eval(field, (i) => i.placeholder)) === "Type anything, or scroll and tap");

    // a guessable name, added with RETURN
    await type(GUESSED);
    let st = await searchState();
    check("no exact match: the first row is the teal \"+ Add “…”\", the aisle guessed as a pill (Produce)", st.firstIsAdd && st.mark === "+" && st.add === `Add “${GUESSED}”` && /Produce$/.test(st.aisle || ""), JSON.stringify(st));
    await p.keyboard.press("Enter"); await sleep(2500);
    st = await searchState();
    const g = await catalogRow(GUESSED); if (g) made.push(g);
    check("return creates it in the guessed aisle and puts it on the list", !!g && g.category === "Produce" && !g.is_global && await onList(g.id), JSON.stringify(g));
    check("… then the field empties and keeps the focus", st.value === "" && st.focused, JSON.stringify(st));

    // no guess → Other; pick Bakery with the pill; the teal row adds it there
    await type(PICKED);
    st = await searchState();
    check("a name with nothing to go on: the pill reads Other", /Other$/.test(st.aisle || ""), JSON.stringify(st));
    await p.evaluate(() => document.querySelector(".item-picker .pick-aisle-pill").click()); await sleep(400);
    const pills = await p.evaluate(() => [...document.querySelectorAll(".item-picker .pick-addcard .cat-grid .cat-pill")].map((e) => e.textContent.trim()));
    check("the pill opens every aisle (the Ask create card's pills: the household's aisles + Other)", pills.length >= 3 && pills.some((t) => /Household/.test(t)) && pills.some((t) => /Other/.test(t)), JSON.stringify(pills));
    await p.evaluate(() => [...document.querySelectorAll(".item-picker .pick-addcard .cat-grid .cat-pill")].find((e) => /Household/.test(e.textContent))?.click()); await sleep(300);
    st = await searchState();
    check("… picking Household changes the pill", /Household$/.test(st.aisle || ""), JSON.stringify(st));
    await p.evaluate(() => document.querySelector(".item-picker .pick-add-new").click()); await sleep(2500);
    const w = await catalogRow(PICKED); if (w) made.push(w);
    check("the teal row adds it in the picked aisle, on the list", !!w && w.category === "Household" && await onList(w.id), JSON.stringify(w));

    // an exact match: no + Add row; RETURN adds that item
    exactName = await p.evaluate(() => {
      const r = [...document.querySelectorAll(".item-picker .pick-group .pick-row:not(.on)")].find((e) => e.querySelector(".pick-name"));
      return r ? r.querySelector(".pick-name").textContent.replace(/^★\s*/, "").trim() : null;
    });
    await type(exactName);
    st = await searchState();
    check(`an exact match (${exactName}): no "+ Add" row`, !st.add && !st.firstIsAdd, JSON.stringify(st));
    await p.keyboard.press("Enter"); await sleep(2000);
    const ex = await catalogRow(exactName);
    check("… return adds that item", !!ex && await onList(ex.id), exactName);
    await type("");

    // the section links, at 390 and 320 wide
    for (const width of [390, 320]) {
      await p.setViewport({ width, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await sleep(600);
      const heads = await p.evaluate(() => [...document.querySelectorAll(".item-picker .pick-aisle")].map((h) => {
        const nm = h.querySelector(".pick-aisle-name"), btn = h.querySelector("button.pick-aisle-new");
        const nb = nm.getBoundingClientRect(), bb = btn.getBoundingClientRect();
        return { name: nm.textContent.trim(), link: btn.textContent.trim(), oneLine: Math.abs(nb.top - bb.top) < nb.height && bb.right <= h.getBoundingClientRect().right + 1 };
      }));
      const longForm = heads.filter((h) => /^＋ New .+ item$/.test(h.link) && h.link !== "＋ New item");
      check(`${width} wide: every link on one line beside its header, "+ New {aisle} item" or "+ New item"`, heads.length > 0 && heads.every((h) => h.oneLine && /^＋ New (.+ )?item$/.test(h.link)), JSON.stringify(heads.map((h) => `${h.name} | ${h.link} | ${h.oneLine}`)));
      if (width === 390) check("390 wide: the long form shows (e.g. \"+ New Produce item\")", longForm.some((h) => h.link === "＋ New Produce item"), JSON.stringify(longForm.map((h) => h.link)));
    }
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  } catch (e) {
    check("the walk ran to the end", false, e.message);
  } finally {
    await nav.closeFeeder(p).catch(() => {});
    for (const r of made) {
      await rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: r.id }).catch((e) => log(`unlist ${r.name}: ${e.message}`));
      await rpc("delete_custom_catalog_item", { p_household_id: HH, p_catalog_item_id: r.id }).catch((e) => log(`delete ${r.name}: ${e.message}`));
    }
    if (exactName) { const ex = await catalogRow(exactName); if (ex) await rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: ex.id }).catch(() => {}); }
    const left = [];
    for (const n of [GUESSED, PICKED]) if (await catalogRow(n)) left.push(`${n} still in the catalog`);
    if (exactName) { const ex = await catalogRow(exactName); if (ex && await onList(ex.id)) left.push(`${exactName} still on the list`); }
    const live = await rest("GET", `list_items?select=id&household_id=eq.${HH}&quantity=gt.0&status=neq.bought&deleted_at=is.null`);
    check(`tidied: both new items deleted, nothing left on the list (${made.length} made)`, left.length === 0 && live.length === 0, `${left.join("; ")} · live rows ${live.length}`);
  }
  log(`${checks - fails}/${checks} ${fails ? "FAIL" : "ALL PASS"}`);
  b.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
