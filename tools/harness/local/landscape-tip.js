// One add: the landscape tip's gate (flag on). Read-only; this browser's own localStorage record is reset at the
// start and removed at the end. Needs an EMPTY list in the test house (8+ staples there: Cody Test House has 38).
//   - a phone (coarse pointer, short side ≤ 500): the empty List shows "Tip: turn your phone sideways to add our
//     staples." (rotating-phone icon); Home's empty list card shows "+ Add items · or turn your phone sideways
//     for our staples"
//   - one shared record: List, Home, List = 3 shows, then neither shows
//   - the first landscape use ends it at once (and after a reload)
//   - a desktop (fine pointer) never sees it; fewer than 8 staples never (this tab's staples read faked empty)
// The Ask-run term (no tip during a run) is Jest's (src/lib/oneAdd.test.js).
const lib = require("../lib.js");
const REMOTE = process.argv[2] === "remote";
const BASE = REMOTE ? lib.DEV_URL : require("./use-local.js").LOCAL_URL;
const { sleep, log, connect, firstPage } = lib;
const KEY = "op_one_add_landscape_tip";

let checks = 0, fails = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) fails++; log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

(async () => {
  const b = await connect(); const p = await firstPage(b);
  const cdp = await p.createCDPSession();
  const media = (features) => cdp.send("Emulation.setEmulatedMedia", { features });
  // isLandscape: screen.orientation follows (the landscape hook's guard reads it)
  const phone = async (w = 390, h = 844) => { await p.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: w > h }); await media([{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }]); };
  const record = () => p.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return "unreadable"; } }, KEY);
  const reset = () => p.evaluate((k) => localStorage.removeItem(k), KEY);
  const load = async (hash) => { await p.goto(BASE + hash, { waitUntil: "networkidle2" }); await p.reload({ waitUntil: "networkidle2" }); await sleep(3000); };
  const go = async (hash) => { await p.evaluate((h) => { location.hash = h; }, hash); await sleep(1500); };
  const tips = () => p.evaluate(() => ({
    list: document.querySelector(".list-landscape-tip")?.textContent.trim() || null,
    listIcon: !!document.querySelector(".list-landscape-tip .tip-rotate"),
    home: document.querySelector(".home-list-card .home-list-tip")?.textContent.trim() || null,
    // the card's action line: the button, then the tip beside it (two elements; the layout's gap spaces them)
    homeLine: (() => { const a = document.querySelector(".home-list-card .deck-actions"); return a ? [...a.children].map((e) => e.textContent.replace(/\s+/g, " ").trim()).join(" ") : null; })(),
    emptyList: !!document.querySelector(".list-guide"), emptyHome: document.querySelector(".home-list-card .deck-title")?.textContent.trim() === "Our list is empty",
    screen: Math.min(screen.width, screen.height), coarse: matchMedia("(pointer: coarse)").matches,
  }));
  try {
    await phone();
    await load("#/shop"); await reset(); await load("#/shop");
    let t = await tips();
    check("the test house's list is empty (the guide shows)", t.emptyList, JSON.stringify(t));
    check("phone, empty List: \"Tip: turn your phone sideways to add our staples.\" with the rotating-phone icon", t.list === "Tip: turn your phone sideways to add our staples." && t.listIcon, JSON.stringify(t));
    check("… one show counted", (await record())?.shows === 1, JSON.stringify(await record()));
    await go("#/home"); t = await tips();
    check("Home's empty list card: \"+ Add items · or turn your phone sideways for our staples\"", t.emptyHome && t.homeLine === "+ Add items · or turn your phone sideways for our staples", JSON.stringify(t));
    check("… the same record: two shows", (await record())?.shows === 2, JSON.stringify(await record()));
    await go("#/shop"); t = await tips();
    check("the List again: the third show", !!t.list && (await record())?.shows === 3, JSON.stringify(await record()));
    await go("#/home"); t = await tips();
    const homeAfter = t.home;
    await go("#/shop"); t = await tips();
    check("after 3 shows: neither Home nor the List shows it", !homeAfter && !t.list && (await record())?.shows === 3, JSON.stringify({ home: homeAfter, list: t.list, rec: await record() }));

    // the first landscape use ends it
    await reset(); await load("#/shop");
    t = await tips();
    const before = !!t.list;
    await phone(844, 390); await sleep(1500);
    const lsShown = await p.evaluate(() => { const r = document.querySelector(".ls-root"); return !!r && getComputedStyle(r).display !== "none"; });
    await phone(); await sleep(1200);
    t = await tips();
    check("turned sideways (the landscape view shows): the record says used, the tip is gone at once", before && lsShown && (await record())?.used === true && !t.list, JSON.stringify({ before, lsShown, rec: await record(), list: t.list }));
    await load("#/home"); t = await tips();
    check("… and after a reload, on Home too", !t.home && !t.list, JSON.stringify(t));

    // a desktop never
    await reset();
    await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false }); await media([{ name: "hover", value: "hover" }, { name: "pointer", value: "fine" }]);
    await load("#/shop"); t = await tips();
    const d1 = t.list; await go("#/home"); t = await tips();
    check("a desktop (fine pointer): no tip on the List or Home, nothing counted", !d1 && !t.home && !(await record()), JSON.stringify({ list: d1, home: t.home, rec: await record() }));

    // fewer than 8 staples never (this tab's staples read faked empty; writes aborted)
    await phone(); await reset();
    await p.setRequestInterception(true);
    const onStaples = (r) => { if (!/\/rest\/v1\/household_staples\?/.test(r.url()) || r.method() === "OPTIONS") return r.continue(); if (r.method() !== "GET") return r.abort(); r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "[]" }); };
    p.on("request", onStaples);
    await load("#/shop"); t = await tips();
    check("a phone with no staples (read faked empty): no tip", t.emptyList && !t.list && !(await record()), JSON.stringify({ list: t.list, rec: await record() }));
    p.off("request", onStaples); await p.setRequestInterception(false);
  } catch (e) {
    check("the walk ran to the end", false, e.message);
  } finally {
    await reset().catch(() => {});
    await media([]);
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await p.reload({ waitUntil: "networkidle2" }).catch(() => {});
  }
  log(`${checks - fails}/${checks} ${fails ? "FAIL" : "ALL PASS"}`);
  b.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
