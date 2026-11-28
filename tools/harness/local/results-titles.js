// One add: "This Week" and "Our list" are ONE results title (flag on). Reads each title's computed style, its
// top offset from the page's content top, the rule under its row, and the gap to the status line under it.
// The two FEEDERS share the other style: the Meals feeder's bar matches the List feeder's title bar (title
// font, the dark Done pill, the rule under the bar, a status line).
// Against a flag-on local build (see one-add.js), or the preview with `remote`. Adds one item for the
// non-empty List and takes it back off.
const lib = require("../lib.js");
const nav = require("../oneadd-nav.js");
const REMOTE = process.argv[2] === "remote";
const BASE = REMOTE ? lib.DEV_URL : require("./use-local.js").LOCAL_URL;
const { sleep, log, connect, firstPage } = lib;

let checks = 0, fails = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) fails++; log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

const read = (p, rowSel) => p.evaluate((rowSel) => {
  const row = document.querySelector(rowSel);
  if (!row) return null;
  const h = row.querySelector("h2");
  const st = row.querySelector(".results-status");
  const cs = getComputedStyle(h), rs = getComputedStyle(row);
  // content top = the top of the view's first child box (.container's padding edge)
  const c = row.closest(".container") || document.body;
  const ctop = c.getBoundingClientRect().top + parseFloat(getComputedStyle(c).paddingTop);
  const hb = h.getBoundingClientRect();
  return {
    text: h.textContent.trim(),
    font: `${cs.fontFamily.split(",")[0].replace(/"/g, "")} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight}`,
    color: cs.color, hBorder: cs.borderBottomWidth, rowBorder: rs.borderBottomStyle === "none" ? "0px" : rs.borderBottomWidth,
    rule: `${rs.borderBottomStyle} ${rs.borderBottomColor}`,
    done: (() => { const d = row.querySelector(".hdr-done"); if (!d) return null; const ds = getComputedStyle(d); return `${ds.backgroundColor} ${ds.color} ${ds.borderRadius}`; })(),
    top: Math.round(hb.top - ctop), rowMarginTop: rs.marginTop,
    statusGap: st ? Math.round(st.getBoundingClientRect().top - hb.bottom) : null, status: st ? st.textContent.trim() : null,
  };
}, rowSel);

// A feeder layer's title bar (both feeders are ItemSearchView): title font, Done, the rule, the status line.
const feederBar = (p, sel) => p.evaluate((sel) => {
  const t = document.querySelector(`${sel}.open .item-search-titlebar`);
  if (!t) return null;
  const h = t.querySelector("h2"), d = t.querySelector(".item-search-done");
  const cs = getComputedStyle(h), ds = getComputedStyle(d), ts = getComputedStyle(t);
  return { text: h.textContent.trim(), font: `${cs.fontFamily.split(",")[0].replace(/"/g, "")} ${cs.fontWeight} ${cs.fontSize}`, color: cs.color,
    done: `${ds.backgroundColor} ${ds.color} ${ds.borderRadius}`, rule: `${ts.borderBottomStyle} ${ts.borderBottomColor}`,
    status: t.querySelector(".item-search-sub")?.textContent.trim() || null };
}, sel);

(async () => {
  const b = await connect(); const p = await firstPage(b);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const go = async (h) => { await p.goto(BASE + h, { waitUntil: "networkidle2" }); await sleep(2500); };
  const out = {};
  await go("#/plan"); out.week = await read(p, ".plan-ctl");
  await p.evaluate(() => (document.querySelector(".plan-ctl .hdr-action") || document.querySelector(".plan-welcome-add"))?.click()); await sleep(1500);
  const mealsFeeder = await feederBar(p, ".meals-feeder");
  await p.evaluate(() => document.querySelector(".meals-feeder .item-search-done")?.click()); await sleep(700);
  await go("#/shop"); out.listEmpty = await read(p, ".list-header");
  const added = out.listEmpty && (await p.evaluate(() => !!document.querySelector(".list-header.empty"))) ? await nav.feederAdd(p, BASE, 1) : [];
  await go("#/shop"); out.list = await read(p, ".list-header");
  // the List feeder's title bar
  await nav.openFeeder(p, BASE);
  const listFeeder = await feederBar(p, ".item-picker");
  await nav.closeFeeder(p);
  for (const [k, v] of Object.entries(out)) log(`${k}: ${JSON.stringify(v)}`);
  log(`listFeeder: ${JSON.stringify(listFeeder)}`);
  log(`mealsFeeder: ${JSON.stringify(mealsFeeder)}`);

  const feeder = mealsFeeder;
  check("the Meals feeder's title = the List feeder's", !!feeder && feeder.text === "Add to this week" && feeder.font === listFeeder.font && feeder.color === listFeeder.color, `${feeder && feeder.font} vs ${listFeeder.font}`);
  check("both feeders: the dark Done pill, a rule under the bar, a status line",
    feeder.done === listFeeder.done && feeder.rule === listFeeder.rule && listFeeder.rule.startsWith("solid") && !!feeder.status && listFeeder.status === "What do we need?",
    JSON.stringify({ meals: [feeder.done, feeder.rule, feeder.status], list: [listFeeder.done, listFeeder.rule, listFeeder.status] }));
  const all = Object.values(out).filter(Boolean);
  check("all three results rows read", all.length === 3, Object.keys(out).filter((k) => !out[k]).join(","));
  check("one font on every title", new Set(all.map((v) => v.font)).size === 1, [...new Set(all.map((v) => v.font))].join(" | "));
  check("Playfair regular", all.every((v) => /^Playfair Display 400 /.test(v.font)));
  check("one colour", new Set(all.map((v) => v.color)).size === 1, [...new Set(all.map((v) => v.color))].join(" | "));
  check("no rule under any title or its row", all.every((v) => v.hBorder === "0px" && v.rowBorder === "0px"), all.map((v) => `${v.hBorder}/${v.rowBorder}`).join(" "));
  check("same top spacing", new Set(all.map((v) => v.top)).size === 1, all.map((v) => `${v.text}:${v.top}`).join(" "));
  const withStatus = all.filter((v) => v.status);
  check("status line directly below, one gap", withStatus.length >= 1 && withStatus.every((v) => v.statusGap === 4) && new Set(withStatus.map((v) => v.statusGap)).size === 1, withStatus.map((v) => `${v.text}:${v.statusGap}`).join(" "));

  if (added.length) log(`tidied: ${JSON.stringify(await nav.feederZero(p, BASE, added))} back to 0`);
  log(`${checks - fails}/${checks} ${fails ? "FAIL" : "ALL PASS"}`);
  b.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
