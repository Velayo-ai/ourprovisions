// flagoff-extra.js — the rest of the flag-off check (2026-11-14), beside ask-off.js. Run against a
// FLAG-OFF local build (REACT_APP_FEATURE_ASK unset), signed in as the dev test account:
//   node -r ./local/use-local.js local/flagoff-extra.js
// Checks: no Ask run reachable by URL or by a held run in storage; no Ask screen or ghost anywhere;
// Your categories works end to end (create → item into it by search-first New item → rename → delete
// with items: the move-to confirm has a target and no empty choice, Delete waits for one, the item
// lands in the target, nothing orphaned); search-first New item (Save waits for a category, then
// creates + adds, search clears). Zero requests to the Ask schema across all of it.
// Leaves behind: one custom catalog item "Flagoff Zucchini <n>" in Cody Test House, at quantity 0.
const { LOCAL_URL } = require("./use-local.js");
const { sleep, log, connect, firstPage, shot } = require("../lib.js");

const ASK_TRAFFIC = /\/rest\/v1\/(asks|ask_shelf_items|household_item_photos)\b|\/rpc\/(create_ask|update_ask|land_ask_picks|set_household_item_photo|remove_household_item_photo)\b|\/storage\/v1\/object\/[^?]*item-photos/;
let checks = 0, fails = 0;
const check = async (p, name, ok, detail = "") => {
  checks++; if (!ok) { fails++; await shot(p, "flagoff-FAIL-" + checks); }
  log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const stamp = String(Date.now()).slice(-5);
const CAT = `Flagoff Cat ${stamp}`, CAT2 = `Flagoff Renamed ${stamp}`, ITEM = `Flagoff Zucchini ${stamp}`;

const clickBtn = (p, re, scope = "button") => p.evaluate((src, scope) => {
  const r = new RegExp(src, "i");
  const b = [...document.querySelectorAll(scope)].find((b) => b.offsetParent !== null && r.test(b.innerText.replace(/\s+/g, " ").trim()));
  if (!b) return null; b.click(); return b.innerText.replace(/\s+/g, " ").trim();
}, re.source, scope);
const setInput = (p, sel, value) => p.evaluate((sel, value) => {
  const el = document.querySelector(sel); if (!el) return false;
  const proto = Object.getPrototypeOf(el);
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true })); return true;
}, sel, value);
const organize = async (p) => { await p.click('button[aria-label="Filters"]'); await sleep(700); return p.$('[role="dialog"][aria-label="View and organize"]'); };
const closeOrganize = async (p) => { await clickBtn(p, /^Done$/, '[role="dialog"][aria-label="View and organize"] button'); await sleep(500); };
const catRows = (p) => p.evaluate(() => [...document.querySelectorAll('[role="dialog"][aria-label="View and organize"] [aria-labelledby="manage-categories"] [role="listitem"]')]
  .map((r) => r.innerText.split("\n")[0].trim()));

(async () => {
  const b = await connect(); const p = await firstPage(b);
  const askHits = [];
  p.on("request", (r) => { if (ASK_TRAFFIC.test(r.url())) askHits.push(r.method() + " " + r.url().replace(/\?.*/, "")); });
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  // ── 1. No Ask run by URL or by state ──
  await p.goto(LOCAL_URL + "#/home", { waitUntil: "networkidle2" });
  await p.evaluate(() => localStorage.setItem("op_ask_held", JSON.stringify({ ask_id: "00000000-0000-4000-8000-000000000001", screen: "shelf", catalog_item_ids: [] })));
  await p.reload({ waitUntil: "networkidle2" }); await sleep(3500);
  await check(p, "a held Ask run in storage does not resume", !(await p.$(".ask-run")));
  for (const h of ["#/ask", "#/ask/run", "#/browse/ask", "#/new-ask"]) {
    await p.goto(LOCAL_URL + h, { waitUntil: "networkidle2" }); await sleep(1500);
    const s = await p.evaluate(() => ({ run: !!document.querySelector(".ask-run"), editor: !!document.querySelector(".ask-editor") }));
    await check(p, `URL ${h}: no Ask run, no Ask screen`, !s.run && !s.editor, JSON.stringify(s));
  }
  await p.evaluate(() => localStorage.removeItem("op_ask_held"));

  // ── 2. Browse: no ghost; View & organize: no Asks; Your categories — create ──
  await p.goto(LOCAL_URL + "#/browse", { waitUntil: "networkidle2" }); await sleep(2500);
  const rail = await p.evaluate(() => [...document.querySelectorAll(".cat-rail .cat-pill")].map((e) => e.innerText.replace(/\s+/g, " ").trim()));
  await check(p, "Browse rail: no 'Ask someone…' ghost, no people pill", !rail.some((t) => /Ask/.test(t)) && !(await p.$(".people-pill")), JSON.stringify(rail.slice(0, 4)));
  await organize(p);
  await clickBtn(p, /New category$/, '[role="dialog"][aria-label="View and organize"] button');
  await sleep(300);
  await setInput(p, 'input[aria-label="New category name"]', CAT);
  await clickBtn(p, /^Create$/, '[role="dialog"][aria-label="View and organize"] button');
  await sleep(600);
  await check(p, `Your categories: "+ New category" creates "${CAT}"`, (await catRows(p)).includes(CAT), JSON.stringify(await catRows(p)));
  await closeOrganize(p);

  // ── 3. Search-first New item, filed into the new category ──
  await setInput(p, 'input[placeholder="Search your catalog…"]', ITEM); await sleep(900);
  const card = await clickBtn(p, new RegExp(`^Add "${ITEM}"`), '[role="button"]');
  await sleep(700);
  const sheet = await p.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-label="New item"]'); if (!d) return null;
    const save = [...d.querySelectorAll("button.modal-confirm")].pop();
    return { title: d.querySelector("h2")?.innerText, name: d.querySelector("input.modal-input")?.value, saveBlocked: getComputedStyle(save).pointerEvents === "none",
      sub: d.querySelector(".picker-sub")?.innerText, toggle: !!d.querySelector(".add-seg") };
  });
  await check(p, "search no-results card opens 'New item' with the name filled, no category, Save waiting, no Item/Ask toggle",
    !!card && !!sheet && sheet.title === "New item" && sheet.name === ITEM && sheet.saveBlocked && /Pick a category/.test(sheet.sub || "") && !sheet.toggle, JSON.stringify(sheet));
  await clickBtn(p, new RegExp(`${CAT}$`), '[role="dialog"][aria-label="New item"] .cat-grid button');
  await sleep(300);
  await clickBtn(p, /^Add to List$/, '[role="dialog"][aria-label="New item"] button');
  await sleep(2500);
  const afterAdd = await p.evaluate((item) => ({
    sheet: !!document.querySelector('[role="dialog"][aria-label="New item"]'),
    search: document.querySelector('input[placeholder="Search your catalog…"]')?.value,
    onList: [...document.querySelectorAll(".item-row.has-qty .item-name")].some((n) => n.innerText.trim() === item),
  }), ITEM);
  await check(p, "Add to List creates the item AND adds it (qty 1), closes the sheet, clears the search", !afterAdd.sheet && afterAdd.search === "" && afterAdd.onList, JSON.stringify(afterAdd));

  // ── 4. Rename (the category now has an item, so opening the sheet doesn't prune it) ──
  await organize(p);
  await check(p, "the category with an item survives the open-time prune", (await catRows(p)).includes(CAT), JSON.stringify(await catRows(p)));
  await p.evaluate((cat) => {
    const row = [...document.querySelectorAll('[aria-labelledby="manage-categories"] [role="listitem"]')].find((r) => r.innerText.split("\n")[0].trim() === cat);
    row.querySelector('button[aria-label="Rename this category"]').click();
  }, CAT);
  await sleep(300);
  await setInput(p, 'input[aria-label="Category name"]', CAT2);
  await clickBtn(p, /^Save$/, '[role="dialog"][aria-label="View and organize"] button');
  await sleep(2500);
  if (!(await p.$('[role="dialog"][aria-label="View and organize"]'))) await organize(p);
  const rows = await catRows(p);
  await check(p, `rename: "${CAT}" → "${CAT2}"`, rows.includes(CAT2) && !rows.includes(CAT), JSON.stringify(rows));

  // ── 5. Delete with items: the move-to confirm ──
  await p.evaluate((cat) => {
    const row = [...document.querySelectorAll('[aria-labelledby="manage-categories"] [role="listitem"]')].find((r) => r.innerText.split("\n")[0].trim() === cat);
    row.querySelector('button[aria-label="Delete this category"]').click();
  }, CAT2);
  await sleep(600);
  const confirm = await p.evaluate(() => {
    const d = document.querySelector('[role="alertdialog"][aria-labelledby="delete-category-title"]'); if (!d) return null;
    const sel = d.querySelector("select"); const btn = d.querySelector("button.modal-remove");
    const overlayZ = Number(d.parentElement.style.zIndex), sheetZ = Number(document.querySelector('[role="dialog"][aria-label="View and organize"]')?.parentElement.style.zIndex);
    return { title: d.querySelector("h2").innerText, sub: d.querySelector(".modal-subtitle")?.innerText, emptyOption: sel ? [...sel.options].some((o) => o.value === "") : null,
      target: sel ? sel.options[sel.selectedIndex]?.text : null, deleteEnabled: btn ? !btn.disabled : null, label: btn?.innerText, above: overlayZ > sheetZ };
  });
  await check(p, "the delete confirm opens above View & organize and names the items to move", !!confirm && confirm.above && /1 item/.test(confirm.sub || ""), JSON.stringify(confirm));
  await check(p, "the move-to picker has no empty choice (a target is always picked: Pantry preselected); Delete is enabled only with it",
    !!confirm && confirm.emptyOption === false && !!confirm.target && confirm.deleteEnabled === true, JSON.stringify({ target: confirm?.target, emptyOption: confirm?.emptyOption }));
  await p.evaluate(() => {
    const sel = document.querySelector('[role="alertdialog"][aria-labelledby="delete-category-title"] select');
    const i = [...sel.options].findIndex((o) => /^Pantry$/i.test(o.text.trim()));
    if (i >= 0) { const proto = Object.getPrototypeOf(sel); Object.getOwnPropertyDescriptor(proto, "value").set.call(sel, sel.options[i].value); sel.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await clickBtn(p, /move|delete/i, '[role="alertdialog"][aria-labelledby="delete-category-title"] button.modal-remove');
  await sleep(3000);
  const gone = await p.evaluate(() => !document.querySelector('[role="alertdialog"][aria-labelledby="delete-category-title"]'));
  if (!(await p.$('[role="dialog"][aria-label="View and organize"]'))) await organize(p);
  const rowsAfter = await catRows(p);
  await check(p, "delete moves and removes the category", gone && !rowsAfter.includes(CAT2), JSON.stringify(rowsAfter));
  await closeOrganize(p);

  // ── 6. Nothing orphaned: the item is in Pantry, still on the list ──
  await p.reload({ waitUntil: "networkidle2" }); await sleep(3000);
  const where = await p.evaluate((item) => {
    for (const block of document.querySelectorAll(".category-block")) {
      const names = [...block.querySelectorAll(".item-name")].map((n) => n.innerText.trim());
      if (names.includes(item)) return { block: block.querySelector(".cat-title")?.innerText.replace(/\s+/g, " ").trim(), qty: !!block.querySelector(".item-row.has-qty") };
    }
    return null;
  }, ITEM);
  await check(p, `nothing orphaned: "${ITEM}" now sits in Pantry, still on the list`, !!where && /pantry/i.test(where.block || "") && where.qty, JSON.stringify(where));

  // Tidy: the item back to 0 (it stays in the test household's catalog as a custom item).
  const tidied = await p.evaluate((item) => {
    const row = [...document.querySelectorAll(".item-row")].find((r) => r.querySelector(".item-name")?.innerText.trim() === item);
    const minus = row && [...row.querySelectorAll("button.qty-btn")].find((b) => b.innerText.trim() === "−");
    if (minus) { minus.click(); return true; } return false;
  }, ITEM);
  await sleep(1500);
  log(`tidied: "${ITEM}" back to 0: ${tidied}`);

  await check(p, "network: ZERO requests to Ask tables, Ask RPCs or the item-photos bucket", askHits.length === 0, askHits.slice(0, 3).join(", "));
  log(`DONE ${checks - fails}/${checks} passed`);
  await b.disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log("FLAGOFF-EXTRA ERROR:", e.message.split("\n")[0]); process.exit(1); });
