// One add: Home's list card (flag on). Empty list → LIST / "Let's build our list." + "+ Add items", which opens the List
// feeder (focused, on List, so Done lands on Our list). With items → "N things to get" + "Open list" → List.
// The card sits near the top: above the On deck card, in its style; the old list line is gone. Adds two items
// through the feeder and takes them back off (stepper −). Flag-on build, signed in; local or `remote`.
const lib = require("../lib.js");
const nav = require("../oneadd-nav.js");
const REMOTE = process.argv[2] === "remote";
const BASE = REMOTE ? lib.DEV_URL : require("./use-local.js").LOCAL_URL;
const { sleep, log, connect, firstPage } = lib;

let checks = 0, fails = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) fails++; log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

const readCard = (p) => p.evaluate(() => {
  const c = document.querySelector(".home .home-list-card");
  if (!c) return null;
  const deck = [...document.querySelectorAll(".home .deck")];
  const cs = getComputedStyle(c), ds = deck.find((d) => d !== c);
  return {
    eyebrow: c.querySelector(".deck-eyebrow")?.textContent.trim(), title: c.querySelector(".deck-title")?.textContent.trim(),
    button: c.querySelector(".deck-actions button")?.textContent.trim(), firstCard: deck[0] === c,
    // the meal card's shape (the colour is the highlight's business: teal when empty, sand with items — checked below)
    sameStyle: !!ds && cs.borderRadius === getComputedStyle(ds).borderRadius && c.classList.contains("deck"),
    listLine: !!document.querySelector(".home .home-line"),
  };
});

(async () => {
  const b = await connect(); const p = await firstPage(b);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const home = async () => { await p.goto(BASE + "#/home", { waitUntil: "networkidle2" }); await sleep(3000); };
  let added = [];
  try {
    await home();
    check("a one-add build", await nav.isOneAdd(p));
    // the meal card, nothing on deck: "+ Add a meal" and the empty List's Plan line
    const deck = await p.evaluate(() => { const d = [...document.querySelectorAll(".home .deck")].find((e) => !e.classList.contains("home-list-card")); return d && { title: d.querySelector(".deck-title")?.textContent.trim(), status: d.querySelector(".deck-status")?.textContent.trim(), button: d.querySelector(".deck-primary")?.textContent.trim() }; });
    if (deck && deck.title === "What sounds good?") check("the meal card: \"+ Add a meal\", \"Build or choose a meal, and we'll add what it needs.\"", deck.button === "+ Add a meal" && deck.status === "Build or choose a meal, and we'll add what it needs.", JSON.stringify(deck));
    else log(`SKIP  the meal card's empty state: something is on deck here (${deck && deck.title})`);
    let c = await readCard(p);
    check("the card sits near the top: first card, above On deck, the meal card's style; no list line", !!c && c.firstCard && c.sameStyle && !c.listLine, JSON.stringify(c));
    if (c && c.title === "Let's build our list.") {
      const look = await p.evaluate(() => { const t = document.querySelector(".home .home-list-card .deck-title"), d = [...document.querySelectorAll(".home .deck .deck-title")].find((e) => e !== t), e = document.querySelector(".home .home-list-card .deck-eyebrow"); const f = (x) => x && `${getComputedStyle(x).fontFamily.split(",")[0]} ${getComputedStyle(x).fontWeight} ${getComputedStyle(x).fontSize}`; return { title: f(t), deck: f(d), eyebrowShown: e && e.innerText.trim() }; });
      check("empty: LIST / \"Let's build our list.\" (the deck's title style, as \"What sounds good?\") + \"+ Add items\"", c.button === "+ Add items" && look.eyebrowShown === "LIST" && !!look.title && look.title === look.deck, JSON.stringify({ c, look }));
      const hl = await p.evaluate(() => {
        const c = document.querySelector(".home .home-list-card"), d = [...document.querySelectorAll(".home .deck")].find((e) => e !== c), b = c.querySelector(".deck-actions button");
        const cs = getComputedStyle(c), ds = getComputedStyle(d), bs = getComputedStyle(b);
        return { card: cs.backgroundColor, border: `${cs.borderTopWidth} ${cs.borderTopColor}`, button: bs.backgroundColor, buttonInk: bs.color, deck: ds.backgroundColor, deckBorder: ds.borderTopWidth };
      });
      check("empty: the highlight — light teal fill, teal border, a teal \"+ Add items\"; ON DECK stays sand (one highlight)",
        hl.card === "rgb(227, 241, 238)" && hl.border === "2px rgb(19, 135, 124)" && hl.button === "rgb(19, 135, 124)" && hl.buttonInk === "rgb(255, 255, 255)" && hl.deck !== hl.card && hl.deckBorder === "0px", JSON.stringify(hl));
      await p.evaluate(() => document.querySelector(".home .home-list-card .deck-actions button").click());
      await p.waitForSelector(".item-picker.open", { visible: true, timeout: 10000 }); await sleep(600);
      const st = await p.evaluate(() => ({ focused: document.activeElement === document.querySelector(".item-picker .item-search-field input"), hash: location.hash }));
      check("+ Add items opens the List feeder, its field focused, on List", st.focused && /shop/.test(st.hash), JSON.stringify(st));
      await nav.closeFeeder(p);
      check("… and Done lands on Our list", await p.evaluate(() => !!document.querySelector(".list-header .list-title") && /shop/.test(location.hash)));
    } else log(`SKIP  the empty state: the list is not empty here (${c && c.title})`);
    added = await nav.feederAdd(p, BASE, 2);
    await home();
    c = await readCard(p);
    const n = c && Number((c.title.match(/^(\d+) things? to get$/) || [])[1]);
    check("with items: \"N things to get\" + \"Open list\"", !!c && n >= 2 && c.button === "Open list", JSON.stringify(c));
    const sand = await p.evaluate(() => { const c = document.querySelector(".home .home-list-card"), d = [...document.querySelectorAll(".home .deck")].find((e) => e !== c); return { hl: c.classList.contains("hl"), card: getComputedStyle(c).backgroundColor, deck: getComputedStyle(d).backgroundColor }; });
    check("with items: sand, like ON DECK (no highlight)", !sand.hl && sand.card === sand.deck, JSON.stringify(sand));
    await p.evaluate(() => document.querySelector(".home .home-list-card .deck-actions button").click()); await sleep(1200);
    check("Open list → List", await p.evaluate(() => /shop/.test(location.hash) && !!document.querySelector(".list-header .list-title")));
  } catch (e) {
    check("the walk ran to the end", false, e.message);
  } finally {
    if (added.length) log(`tidied: ${JSON.stringify(await nav.feederZero(p, BASE, added))} back to 0`);
  }
  log(`${checks - fails}/${checks} ${fails ? "FAIL" : "ALL PASS"}`);
  b.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
