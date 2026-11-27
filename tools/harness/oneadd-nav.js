// The walks' way around a build WITHOUT Browse (one add, SPEC_results_feeder_standard: REACT_APP_FEATURE_ONE_ADD,
// the exp/one-add preview). The walks read the build's marker (data-op-one-add on .app-root) and, on a one-add
// build, add / zero items and open Ask runs through List's + Add feeder instead of Browse. On any other build
// they keep their Browse paths: nothing here runs.
const { sleep } = require("./lib");

const isOneAdd = (p) => p.evaluate(() => document.querySelector(".app-root")?.getAttribute("data-op-one-add") === "op-one-add:on");

async function openFeeder(p, BASE) {
  // Already on the app: a hash change, no load (the offline walks open runs with the network blocked).
  if (p.url().startsWith(BASE.replace(/\/$/, "").replace(/#.*$/, ""))) { await p.evaluate(() => { window.location.hash = "#/shop"; }); await sleep(1500); }
  else { await p.goto(BASE + "#/shop", { waitUntil: "networkidle2" }); await sleep(2000); }
  await closeFeeder(p);
  const sel = (await p.$(".list-header .hdr-action")) ? ".list-header .hdr-action" : ".list-guide-row.teal";
  await p.click(sel);
  await p.waitForSelector(".item-picker.open", { visible: true, timeout: 10000 }); await sleep(500);
}
async function closeFeeder(p) {
  if (await p.$(".item-picker.open")) { await p.click(".item-picker .item-search-done"); await sleep(700); }
}

// Add the first n items that aren't on the list (the circle +); returns their names.
async function feederAdd(p, BASE, n) {
  await openFeeder(p, BASE);
  const names = await p.evaluate(async (n) => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = [];
    for (const r of [...document.querySelectorAll(".item-picker .pick-group .pick-row:not(.on)")].slice(0, n)) {
      out.push((r.querySelector(".pick-name")?.innerText || "").replace(/^★\s*/, "").trim());
      (r.querySelector(".pick-hit") || r).click(); await s(500);
    }
    return out;
  }, n);
  await sleep(1500);
  await closeFeeder(p);
  return names;
}

// Take items back off with the stepper's − until each row is off the list. names: an array, or null for
// every row the feeder shows as on the list. Returns the names it took off.
async function feederZero(p, BASE, names) {
  await openFeeder(p, BASE);
  const out = await p.evaluate(async (names) => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const nameOf = (r) => (r.querySelector(".pick-name")?.innerText || "").replace(/^★\s*/, "").trim();
    const rowFor = (n) => [...document.querySelectorAll(".item-picker .pick-group .pick-row")].find((r) => nameOf(r) === n);
    const targets = names || [...document.querySelectorAll(".item-picker .pick-group .pick-row.on")].map(nameOf);
    const done = [];
    for (const n of [...new Set(targets)]) {
      for (let k = 0; k < 20; k++) {
        const r = rowFor(n);
        if (!r || !r.classList.contains("on")) break;
        r.querySelector('.pick-step-btn[aria-label="One fewer"]').click(); await s(600);
      }
      const r = rowFor(n);
      if (r && !r.classList.contains("on")) done.push(n);
    }
    return done;
  }, names);
  await sleep(1200);
  await closeFeeder(p);
  return out;
}

// The rail's Ask: "Ask {label}" when it is the only ask, else "Ask…" → the chooser's row.
async function feederAskLabels(p, BASE) {
  await openFeeder(p, BASE);
  const pill = await p.evaluate(() => [...document.querySelectorAll(".item-picker .feeder-rail .people-pill")].map((b) => b.innerText.replace(/\s+/g, " ").trim())[0] || null);
  let labels = [];
  if (pill === "Ask…") {
    await p.evaluate(() => document.querySelector(".item-picker .feeder-rail .people-pill").click()); await sleep(700);
    labels = await p.evaluate(() => [...document.querySelectorAll(".more-asks-row")].map((b) => b.innerText.replace(/\s+/g, " ").trim()).filter((t) => /^Ask /.test(t)));
    await p.evaluate(() => document.querySelector(".modal-overlay")?.click()); await sleep(500);
  } else if (pill) labels = [pill];
  await closeFeeder(p);
  return labels;
}
async function feederOpenRun(p, BASE, label) {
  await openFeeder(p, BASE);
  const hit = await p.evaluate((label) => {
    const b = [...document.querySelectorAll(".item-picker .feeder-rail .people-pill")][0];
    if (!b) return null;
    const t = b.innerText.replace(/\s+/g, " ").trim();
    b.click();
    return t === `Ask ${label}` ? "pill" : t === "Ask…" ? "chooser" : null;
  }, label);
  if (hit === "chooser") {
    await sleep(700);
    await p.evaluate((label) => [...document.querySelectorAll(".more-asks-row")].find((b) => b.innerText.replace(/\s+/g, " ").trim() === `Ask ${label}`)?.click(), label);
  }
  await p.waitForSelector(".ask-run", { visible: true, timeout: 15000 });
}
// The View & filter sheet, from the feeder (where "+ New ask" lives in this build).
async function feederOpenSheet(p, BASE) {
  await openFeeder(p, BASE);
  await p.click('.item-picker .pick-tool[aria-label="View and filter"]'); await sleep(700);
}

module.exports = { isOneAdd, openFeeder, closeFeeder, feederAdd, feederZero, feederAskLabels, feederOpenRun, feederOpenSheet };
