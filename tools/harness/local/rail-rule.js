// One add: the rail rule, both feeders. Read-only (rail taps only; the Meals half fakes the meals READS).
// List feeder: a category chip is single-select (another switches, the selected one clears); ★ Staples toggles
// and combines with the category as the INTERSECTION (that aisle's staples only); an empty intersection says
// "No {aisle} staples yet. Star one to keep it up front." with "Show all {aisle}", which clears Staples; the
// Ask pill never shows selected. Meals feeder: the occasion chips follow the same single-select rule.
// Flag-on build, signed in; local or `remote`.
const lib = require("../lib.js");
const nav = require("../oneadd-nav.js");
const REMOTE = process.argv[2] === "remote";
const BASE = REMOTE ? lib.DEV_URL : require("./use-local.js").LOCAL_URL;
const { sleep, log, connect, firstPage } = lib;

let checks = 0, fails = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) fails++; log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

(async () => {
  const b = await connect(); const p = await firstPage(b);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const state = () => p.evaluate(() => {
    const rail = [...document.querySelectorAll(".item-picker .feeder-rail .cat-pill")];
    const label = (e) => e.textContent.replace(e.querySelector(".cat-em")?.textContent || "", "").replace(/\s+/g, " ").trim();
    return {
      on: rail.filter((e) => e.classList.contains("on")).map((e) => e.textContent.replace(/\s+/g, " ").trim()),
      askOn: rail.some((e) => e.classList.contains("people-pill") && e.classList.contains("on")),
      cats: rail.filter((e) => !e.classList.contains("people-pill") && !/Staples/.test(e.textContent)).map(label),
      sections: [...document.querySelectorAll(".item-picker .pick-aisle-name")].map((e) => e.textContent.replace(/^\S+\s/, "").trim()),
      rows: [...document.querySelectorAll(".item-picker .pick-group .pick-row")].map((r) => ({ name: r.querySelector(".pick-name")?.textContent.trim(), star: !!r.querySelector(".pick-star") })),
      note: document.querySelector(".item-picker .pick-empty-note .pick-empty")?.textContent.trim() || null,
      link: document.querySelector(".item-picker .pick-empty-link")?.textContent.trim() || null,
    };
  });
  const tap = (text) => p.evaluate((text) => [...document.querySelectorAll(".item-picker .feeder-rail .cat-pill")].find((e) => e.textContent.replace(/\s+/g, " ").trim().endsWith(text))?.click(), text);
  try {
    await nav.openFeeder(p, BASE);
    let s = await state();
    if (s.on.length) { for (const t of s.on) await tap(t); await sleep(300); s = await state(); }   // start clear
    const [c1, c2] = s.cats;
    check("the rail starts clear, the Ask pill not selected", s.on.length === 0 && !s.askOn && !!c1 && !!c2, JSON.stringify({ on: s.on, cats: s.cats }));
    const glyphs = await p.evaluate(() => [...document.querySelectorAll(".item-picker .feeder-rail .cat-pill")].map((e) => ({ t: e.textContent.replace(/\s+/g, " ").trim(), em: !!e.querySelector(".cat-em"), kind: /Staples/.test(e.textContent) ? "staples" : e.classList.contains("people-pill") ? "ask" : "cat" })));
    check("rail chips are text only — ★ Staples and the Ask pill keep their symbols", glyphs.filter((g) => g.kind === "cat").every((g) => !g.em) && glyphs.filter((g) => g.kind !== "cat").every((g) => g.em), JSON.stringify(glyphs));
    await tap(c1); await sleep(400); s = await state();
    check(`a category tap selects it alone (${c1}): one section`, s.on.length === 1 && s.on[0].endsWith(c1) && s.sections.length === 1, JSON.stringify({ on: s.on, sections: s.sections }));
    await tap(c2); await sleep(400); s = await state();
    check(`another category switches (${c2}), never both`, s.on.length === 1 && s.on[0].endsWith(c2) && s.sections.length === 1, JSON.stringify({ on: s.on, sections: s.sections }));
    await tap(c2); await sleep(400); s = await state();
    check("the selected one again clears it: every aisle back", s.on.length === 0 && s.sections.length > 1, JSON.stringify({ on: s.on, sections: s.sections.length }));

    // Staples + a category: the intersection; find an aisle with staples and one without
    await tap("Staples"); await sleep(400); s = await state();
    const withStaples = s.sections;
    const without = s.cats.find((c) => !withStaples.includes(c));
    check("★ Staples toggles on and combines (only starred rows)", s.on.some((t) => /Staples/.test(t)) && s.rows.length > 0 && s.rows.every((r) => r.star), JSON.stringify({ on: s.on, rows: s.rows.length }));
    if (withStaples[0]) {
      await tap(withStaples[0]); await sleep(400); s = await state();
      check(`Staples + ${withStaples[0]}: that aisle's staples only`, s.on.length === 2 && s.sections.length === 1 && s.sections[0] === withStaples[0] && s.rows.every((r) => r.star), JSON.stringify({ on: s.on, sections: s.sections, rows: s.rows.length }));
    }
    if (without) {
      await tap(without); await sleep(400); s = await state();
      check(`Staples + ${without} (no staples): the empty intersection says so`, s.sections.length === 0 && s.note === `No ${without} staples yet. Star one to keep it up front.` && s.link === `Show all ${without}`, JSON.stringify({ sections: s.sections, note: s.note, link: s.link }));
      await p.evaluate(() => document.querySelector(".item-picker .pick-empty-link").click()); await sleep(400); s = await state();
      check(`"Show all ${without}" clears Staples and shows that aisle`, !s.on.some((t) => /Staples/.test(t)) && s.sections.length === 1 && s.sections[0] === without && s.rows.length > 0, JSON.stringify({ on: s.on, sections: s.sections, rows: s.rows.length }));
      await tap(without); await sleep(300);
    } else log("the empty intersection: every aisle here has a staple — checked below with the staples read faked empty");
    s = await state();
    if (s.on.length) { for (const t of s.on) await tap(t); await sleep(300); s = await state(); }
    check("the Ask pill never showed selected", !s.askOn);
    await nav.closeFeeder(p);

    // the empty intersection, for sure: this tab's staples READ faked empty (writes aborted) → Staples + any aisle
    if (!without) {
      await p.setRequestInterception(true);
      const onStaples = (r) => { if (!/\/rest\/v1\/household_staples\?/.test(r.url()) || r.method() === "OPTIONS") return r.continue(); if (r.method() !== "GET") return r.abort(); r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "[]" }); };
      p.on("request", onStaples);
      await p.goto(BASE + "#/home", { waitUntil: "networkidle2" }); await p.reload({ waitUntil: "networkidle2" }); await sleep(2500);   // a real load (a hash change reloads nothing)
      await nav.openFeeder(p, BASE);
      await tap("Staples"); await tap(c1); await sleep(500); s = await state();
      check(`Staples + ${c1} with no staples: "No ${c1} staples yet. Star one to keep it up front." + "Show all ${c1}"`, s.sections.length === 0 && s.note === `No ${c1} staples yet. Star one to keep it up front.` && s.link === `Show all ${c1}`, JSON.stringify({ on: s.on, sections: s.sections, note: s.note, link: s.link }));
      await p.evaluate(() => document.querySelector(".item-picker .pick-empty-link")?.click()); await sleep(400); s = await state();
      check(`"Show all ${c1}" clears Staples and shows that aisle`, !s.on.some((t) => /Staples/.test(t)) && s.sections.length === 1 && s.sections[0] === c1 && s.rows.length > 0, JSON.stringify({ on: s.on, sections: s.sections, rows: s.rows.length }));
      await tap(c1); await sleep(300);
      await nav.closeFeeder(p);
      p.off("request", onStaples); await p.setRequestInterception(false);
      await p.reload({ waitUntil: "networkidle2" }); await sleep(2000);   // the real staples again
    }

    // the Meals rail (fake meals in this tab; writes aborted)
    const now = new Date().toISOString();
    const OCC = ["dinner", "lunch", "breakfast"];
    const MEALS = Array.from({ length: 6 }, (_, k) => ({ id: `00000000-0000-4000-8000-0000000000${k + 30}`, name: `Rail Meal ${k + 1}`, kind: "meal", from_meal_ids: null, occasion: [OCC[k % 3]], attribution: null, base_servings: 1, instructions: null, created_by: null, created_at: now, meal_ingredients: [] }));
    await p.setRequestInterception(true);
    p.on("request", (r) => { const h = /\/rest\/v1\/(meals|meal_placements)\?/.exec(r.url()); if (!h || r.method() === "OPTIONS") return r.continue(); if (r.method() !== "GET") return r.abort(); r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(h[1] === "meals" ? MEALS : []) }); });
    await p.goto(BASE + "#/plan", { waitUntil: "networkidle2" }); await sleep(2500);
    await p.evaluate(() => (document.querySelector('.plan-ctl .hdr-action[aria-label="Add a meal to this week"]') || document.querySelector(".plan-welcome-add"))?.click());
    await p.waitForSelector(".meals-feeder.open", { visible: true, timeout: 10000 }); await sleep(600);
    const ms = () => p.evaluate(() => ({ on: [...document.querySelectorAll(".meals-feeder .lib-rail .cat-pill.on")].map((e) => e.textContent.trim()), all: [...document.querySelectorAll(".meals-feeder .lib-rail .cat-pill")].map((e) => e.textContent.trim()), cards: document.querySelectorAll(".meals-feeder .lib-gcard, .meals-feeder .lib-row").length }));
    const mtap = (t) => p.evaluate((t) => [...document.querySelectorAll(".meals-feeder .lib-rail .cat-pill")].find((e) => e.textContent.trim() === t)?.click(), t);
    let m = await ms();
    check("Meals rail: no All chip, none selected (all meals)", !m.all.includes("All") && m.on.length === 0 && m.cards === 6, JSON.stringify(m));
    await mtap("Dinner"); await sleep(300); const m1 = await ms();
    await mtap("Lunch"); await sleep(300); const m2 = await ms();
    await mtap("Lunch"); await sleep(300); const m3 = await ms();
    check("Meals rail: single-select — Dinner, then Lunch switches, Lunch again clears", m1.on.join() === "Dinner" && m1.cards === 2 && m2.on.join() === "Lunch" && m2.cards === 2 && m3.on.length === 0 && m3.cards === 6, JSON.stringify([m1, m2, m3]));
    await p.evaluate(() => document.querySelector(".meals-feeder .item-search-done")?.click()); await sleep(500);
    p.removeAllListeners("request"); await p.setRequestInterception(false);
  } catch (e) {
    check("the walk ran to the end", false, e.message);
  }
  log(`${checks - fails}/${checks} ${fails ? "FAIL" : "ALL PASS"}`);
  b.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
