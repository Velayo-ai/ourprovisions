// One add: "This Week" and "Our list" are ONE results title (flag on). Reads each title's computed style, its
// top offset from the page's content top, the rule under its row, and the gap to the status line under it.
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
    top: Math.round(hb.top - ctop), rowMarginTop: rs.marginTop,
    statusGap: st ? Math.round(st.getBoundingClientRect().top - hb.bottom) : null, status: st ? st.textContent.trim() : null,
  };
}, rowSel);

(async () => {
  const b = await connect(); const p = await firstPage(b);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const go = async (h) => { await p.goto(BASE + h, { waitUntil: "networkidle2" }); await sleep(2500); };
  const out = {};
  await go("#/plan"); out.week = await read(p, ".plan-ctl");
  await p.evaluate(() => (document.querySelector(".plan-ctl .hdr-action") || document.querySelector(".plan-welcome-add"))?.click()); await sleep(1500);
  out.feeder = await read(p, ".plan-ctl");
  await go("#/shop"); out.listEmpty = await read(p, ".list-header");
  const added = out.listEmpty && (await p.evaluate(() => !!document.querySelector(".list-header.empty"))) ? await nav.feederAdd(p, BASE, 1) : [];
  await go("#/shop"); out.list = await read(p, ".list-header");
  for (const [k, v] of Object.entries(out)) log(`${k}: ${JSON.stringify(v)}`);

  const all = Object.values(out).filter(Boolean);
  check("all four rows read", all.length === 4, Object.keys(out).filter((k) => !out[k]).join(","));
  check("one font on every title", new Set(all.map((v) => v.font)).size === 1, [...new Set(all.map((v) => v.font))].join(" | "));
  check("Playfair regular", all.every((v) => /^Playfair Display 400 /.test(v.font)));
  check("one colour", new Set(all.map((v) => v.color)).size === 1, [...new Set(all.map((v) => v.color))].join(" | "));
  check("no rule under any title or its row", all.every((v) => v.hBorder === "0px" && v.rowBorder === "0px"), all.map((v) => `${v.hBorder}/${v.rowBorder}`).join(" "));
  check("same top spacing", new Set(all.map((v) => v.top)).size === 1, all.map((v) => `${v.text}:${v.top}`).join(" "));
  const withStatus = all.filter((v) => v.status);
  check("status line directly below, one gap", withStatus.length >= 2 && new Set(withStatus.map((v) => v.statusGap)).size === 1, withStatus.map((v) => `${v.text}:${v.statusGap}`).join(" "));

  if (added.length) log(`tidied: ${JSON.stringify(await nav.feederZero(p, BASE, added))} back to 0`);
  log(`${checks - fails}/${checks} ${fails ? "FAIL" : "ALL PASS"}`);
  b.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
