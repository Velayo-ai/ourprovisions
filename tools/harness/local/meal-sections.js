// One add: the Meals feeder's sections (flag on). Read-only: this tab's meals + placements READS are faked (one
// meal per type, plus untyped ones); any write to those tables is aborted.
//   - "✨ Ask the Galley" is the first card, above the sections; no "+ New meal" card
//   - By type (the default): one section per type in the app's order, "No type yet" last, the List feeder's
//     header style; each link "+ New {type} meal", "+ New meal" on "No type yet"; never wrapped (the short form
//     where the long one won't fit), at 390 and 320 wide
//   - "+ New Dinner meal" opens the new-meal sheet with Dinner picked; Cancel
//   - a rail chip: everything shown under that one section
//   - View & filter → View: "By type" / "A–Z"; A–Z = letter headers and one "+ New meal" at the top
// Flag-on build, signed in; local or `remote`.
const lib = require("../lib.js");
const REMOTE = process.argv[2] === "remote";
const BASE = REMOTE ? lib.DEV_URL : require("./use-local.js").LOCAL_URL;
const { sleep, log, connect, firstPage } = lib;

let checks = 0, fails = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) fails++; log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

const now = new Date().toISOString();
const meal = (n, name, occasion) => ({ id: `00000000-0000-4000-8000-0000000000${n}`, name, kind: "meal", from_meal_ids: null, occasion, attribution: null, base_servings: 1, instructions: null, created_by: null, created_at: now, meal_ingredients: [] });
const MEALS = [
  meal(40, "Chicken Curry", ["dinner"]), meal(41, "Pad Thai", ["dinner", "lunch"]), meal(42, "Club Sandwich", ["lunch"]),
  meal(43, "Shakshuka", ["breakfast"]), meal(44, "Tiramisu", ["dessert"]), meal(45, "Lemonade", ["drink"]),
  meal(46, "Stuffed Peppers", ["appetizer"]), meal(47, "Mystery Stew", []), meal(48, "Apple Crumble", []),
];
const ORDER = ["Dinner", "Breakfast", "Lunch", "Appetizers", "Dessert", "Drinks", "No type yet"];   // the types present, in the app's order

(async () => {
  const b = await connect(); const p = await firstPage(b);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.setRequestInterception(true);
  p.on("request", (r) => { const h = /\/rest\/v1\/(meals|meal_placements)\?/.exec(r.url()); if (!h || r.method() === "OPTIONS") return r.continue(); if (r.method() !== "GET") { log(`aborted a ${r.method()} to ${h[1]}`); return r.abort(); } r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(h[1] === "meals" ? MEALS : []) }); });
  const read = () => p.evaluate(() => {
    const lib = document.querySelector(".meals-feeder .ask-search-list .lib");
    const first = lib && [...lib.children].find((e) => !e.classList.contains("sr-only"));
    const heads = [...document.querySelectorAll(".meals-feeder .meal-section .pick-aisle")].map((h) => {
      const nm = h.querySelector(".pick-aisle-name"), bt = h.querySelector("button.pick-aisle-new");
      const nb = nm.getBoundingClientRect(), bb = bt ? bt.getBoundingClientRect() : null;
      const full = nm.textContent.trim();
      return { full, name: full.replace(/^[^A-Za-z]+\s/, ""), link: bt ? bt.textContent.trim() : null, oneLine: !bb || (Math.abs(nb.top - bb.top) < nb.height && bb.right <= h.getBoundingClientRect().right + 1),
        cards: [...h.parentElement.querySelectorAll(".lib-gname, .lib-rname")].map((e) => e.textContent.trim()) };
    });
    const letters = [...document.querySelectorAll(".meals-feeder .meal-section .pick-letter")].map((e) => e.textContent.trim());
    return { first: first?.className, heads, letters, azTop: document.querySelector(".meals-feeder .meal-az-top button")?.textContent.trim() || null,
      newCard: !!document.querySelector(".meals-feeder .lib-newcard"), headStyle: (() => { const h = document.querySelector(".meals-feeder .pick-aisle-name"); return h ? getComputedStyle(h).fontFamily.split(",")[0].replace(/"/g, "") + " " + getComputedStyle(h).fontWeight : null; })() };
  });
  try {
    await p.goto(BASE + "#/plan", { waitUntil: "networkidle2" }); await p.reload({ waitUntil: "networkidle2" }); await sleep(2500);
    await p.evaluate(() => (document.querySelector('.plan-ctl .hdr-action[aria-label="Add a meal to this week"]') || document.querySelector(".plan-welcome-add"))?.click());
    await p.waitForSelector(".meals-feeder.open", { visible: true, timeout: 10000 }); await sleep(700);
    let s = await read();
    check("\"✨ Ask the Galley\" first, above the sections; no \"+ New meal\" card", s.first === "lib-newrow galley" && !s.newCard, JSON.stringify({ first: s.first, newCard: s.newCard }));
    check("By type: one section per type in the app's order, \"No type yet\" last", JSON.stringify(s.heads.map((h) => h.name)) === JSON.stringify(ORDER), JSON.stringify(s.heads.map((h) => h.name)));
    check("the List feeder's header style (Playfair 700)", s.headStyle === "Playfair Display 700", s.headStyle);
    const icons = { Dinner: "🍽️", Lunch: "🥪", Dessert: "🍰", Drinks: "🍹" };
    check("type headers carry the aisle-style icon (🍽️ Dinner, 🥪 Lunch, 🍰 Dessert, 🍹 Drinks); \"No type yet\" none",
      Object.entries(icons).every(([n, g]) => s.heads.find((h) => h.name === n)?.full === `${g} ${n}`) && s.heads.find((h) => h.name === "No type yet")?.full === "No type yet",
      JSON.stringify(s.heads.map((h) => h.full)));
    const slots = await p.evaluate(() => [...document.querySelectorAll(".meals-feeder .lib-gcard")].map((c) => ({ name: c.querySelector(".lib-gname")?.textContent.trim(), glyph: c.querySelector(".lib-slot-glyph")?.textContent || null, svg: !!c.querySelector(".lib-slot svg") })));
    const sl = (n) => slots.find((x) => x.name === n) || {};
    check("photo-less cards: the type's icon (Tiramisu 🍰, Lemonade 🍹, Club Sandwich 🥪, Chicken Curry 🍽️); untyped the neutral plate",
      sl("Tiramisu").glyph === "🍰" && sl("Lemonade").glyph === "🍹" && sl("Club Sandwich").glyph === "🥪" && sl("Chicken Curry").glyph === "🍽️" && !sl("Mystery Stew").glyph && sl("Mystery Stew").svg,
      JSON.stringify(slots));
    const chips = await p.evaluate(() => [...document.querySelectorAll(".meals-feeder .lib-rail .cat-pill")].map((e) => ({ t: e.textContent.trim(), em: !!e.querySelector(".cat-em") })));
    check("the Meals rail chips are text only", chips.length > 0 && chips.every((c) => !c.em && /^[A-Za-z]/.test(c.t)), JSON.stringify(chips));
    const want = { Dinner: "＋ New Dinner meal", Breakfast: "＋ New Breakfast meal", Lunch: "＋ New Lunch meal", Appetizers: "＋ New Appetizer meal", Dessert: "＋ New Dessert meal", Drinks: "＋ New Drink meal", "No type yet": "＋ New meal" };
    check("each link: \"+ New {type} meal\"; \"+ New meal\" on \"No type yet\" (at 390 wide)", s.heads.every((h) => h.link === want[h.name] && h.oneLine), JSON.stringify(s.heads.map((h) => `${h.name} | ${h.link} | ${h.oneLine}`)));
    check("a meal sits under its first type (Pad Thai: dinner, lunch → Dinner); untyped under \"No type yet\"", s.heads.find((h) => h.name === "Dinner")?.cards.includes("Pad Thai") && !s.heads.find((h) => h.name === "Lunch")?.cards.includes("Pad Thai") && s.heads.find((h) => h.name === "No type yet")?.cards.length === 2, JSON.stringify(s.heads.map((h) => [h.name, h.cards])));
    await p.setViewport({ width: 320, height: 760, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await sleep(700);
    s = await read();
    check("320 wide: no link wraps — the long form, or \"+ New meal\"", s.heads.every((h) => h.oneLine && (h.link === want[h.name] || h.link === "＋ New meal")), JSON.stringify(s.heads.map((h) => `${h.name} | ${h.link} | ${h.oneLine}`)));
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await sleep(500);

    // + New Dinner meal → the sheet with Dinner picked
    await p.evaluate(() => [...document.querySelectorAll(".meals-feeder .meal-section .pick-aisle")].find((h) => /(^|\s)Dinner$/.test(h.querySelector(".pick-aisle-name")?.textContent.trim() || ""))?.querySelector("button.pick-aisle-new")?.click()); await sleep(900);
    const sheet = await p.evaluate(() => {
      const m = document.querySelector(".modal"); if (!m) return null;
      const on = [...m.querySelectorAll(".gf-chip.on")].map((e) => e.firstChild?.textContent.trim());   // the Good for chips; the first carries "On card"
      return { name: m.querySelector('input.modal-input[placeholder="Taco Night"]')?.value, dinnerOn: on.length === 1 && on[0] === "Dinner", on };
    });
    check("\"+ New Dinner meal\" opens the new-meal sheet with Dinner picked", !!sheet && sheet.name === "" && sheet.dinnerOn, JSON.stringify(sheet));
    await p.evaluate(() => [...document.querySelectorAll(".modal .modal-cancel")].find((e) => /Cancel/.test(e.textContent))?.click()); await sleep(700);

    // a rail chip: one section
    await p.evaluate(() => [...document.querySelectorAll(".meals-feeder .lib-rail .cat-pill")].find((e) => e.textContent.trim() === "Lunch")?.click()); await sleep(400);
    s = await read();
    check("a rail chip (Lunch): everything shown under that one section (Pad Thai included)", s.heads.length === 1 && s.heads[0].name === "Lunch" && s.heads[0].cards.includes("Pad Thai") && s.heads[0].cards.includes("Club Sandwich"), JSON.stringify(s.heads));
    await p.evaluate(() => [...document.querySelectorAll(".meals-feeder .lib-rail .cat-pill")].find((e) => e.textContent.trim() === "Lunch")?.click()); await sleep(400);

    // View & filter → A–Z
    await p.evaluate(() => document.querySelector('.meals-feeder .pick-tool[aria-label^="View and filter"]')?.click()); await sleep(700);
    const opts = await p.evaluate(() => [...document.querySelectorAll('[role=dialog][aria-label="View and filter"] [role=radiogroup][aria-labelledby="meals-organize"] [role=radio]')].map((e) => e.querySelector("span")?.textContent.trim()));
    check("View & filter → View offers \"By type\" / \"A–Z\"", JSON.stringify(opts) === JSON.stringify(["By type", "A–Z"]), JSON.stringify(opts));
    await p.evaluate(() => [...document.querySelectorAll('[role=dialog][aria-label="View and filter"] [role=radio]')].find((e) => /^A–Z/.test(e.textContent.trim()))?.click()); await sleep(300);
    await p.evaluate(() => document.querySelector(".modal-overlay")?.click()); await sleep(600);
    s = await read();
    check("A–Z: letter headers, one \"+ New meal\" at the top, no type sections", s.heads.length === 0 && s.letters.join("") === "ACLMPST" && s.azTop === "＋ New meal", JSON.stringify({ letters: s.letters, azTop: s.azTop, heads: s.heads.length }));
    await p.evaluate(() => document.querySelector('.meals-feeder .pick-tool[aria-label^="View and filter"]')?.click()); await sleep(600);
    await p.evaluate(() => [...document.querySelectorAll('[role=dialog][aria-label="View and filter"] [role=radio]')].find((e) => /^By type/.test(e.textContent.trim()))?.click()); await sleep(300);
    await p.evaluate(() => document.querySelector(".modal-overlay")?.click()); await sleep(600);
    s = await read();
    check("back to By type", s.heads.length === ORDER.length && s.letters.length === 0, JSON.stringify(s.heads.map((h) => h.name)));
    await p.evaluate(() => document.querySelector(".meals-feeder .item-search-done")?.click()); await sleep(500);
  } catch (e) {
    check("the walk ran to the end", false, e.message);
  } finally {
    p.removeAllListeners("request"); await p.setRequestInterception(false).catch(() => {});
  }
  log(`${checks - fails}/${checks} ${fails ? "FAIL" : "ALL PASS"}`);
  b.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
