// The item search layer (List's + Add picker; the Ask's item search) and the desktop phone frame.
// On a desktop (past COLUMN_MIN_WIDTH, fine pointer, hover) the layer takes the frame's box; on a phone —
// portrait, or sideways (past COLUMN_MIN_WIDTH, the frame live) — it is still the whole screen, a body child.
// Signed in; against a local build (see one-add.js) or the preview with `remote`. Read-only: opens + closes.
const lib = require("../lib.js");
const nav = require("../oneadd-nav.js");
const REMOTE = process.argv[2] === "remote";
const BASE = REMOTE ? lib.DEV_URL : require("./use-local.js").LOCAL_URL;
const { sleep, log, connect, firstPage } = lib;

let checks = 0, fails = 0;
const check = (name, ok, detail = "") => { checks++; if (!ok) fails++; log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const box = (r) => r && `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`;

async function openPicker(p) {
  if (await nav.isOneAdd(p)) { await nav.openFeeder(p, BASE); return; }
  await p.goto(BASE + "#/shop", { waitUntil: "networkidle2" }); await sleep(2000);
  if (await p.$(".list-welcome-ok")) { await p.evaluate(() => document.querySelector(".list-welcome-ok").click()); await sleep(600); }
  await p.evaluate(() => (document.querySelector(".list-header .hdr-action") || document.querySelector(".list-guide-row.teal")).click());
  await p.waitForSelector(".item-picker.open", { visible: true, timeout: 10000 }); await sleep(500);
}
const read = (p) => p.evaluate(() => {
  const v = document.querySelector(".item-picker.open"), f = document.querySelector(".phone-frame");
  const r = (e) => { const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; };
  return { parent: v?.parentElement === document.body ? "body" : v?.parentElement?.className, view: v && r(v), frame: f && r(f),
    win: { width: innerWidth, height: innerHeight }, radius: v && getComputedStyle(v).borderTopLeftRadius,
    frameLive: !!f && getComputedStyle(f).position === "fixed" };
});
const near = (a, b) => Math.abs(a - b) <= 1;

(async () => {
  const b = await connect(); const p = await firstPage(b);
  // hover / pointer through CDP (puppeteer's emulateMediaFeatures allows neither); read back with matchMedia.
  const cdp = await p.createCDPSession();
  const media = (features) => cdp.send("Emulation.setEmulatedMedia", { features });
  const desk = () => p.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches);
  const cases = [
    { name: "desktop 1280×800", vp: { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, media: [{ name: "hover", value: "hover" }, { name: "pointer", value: "fine" }], framed: true },
    { name: "phone portrait 390×844", vp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, media: [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }], framed: false },
    { name: "phone sideways 844×390 (frame live)", vp: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, media: [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }], framed: false },
  ];
  for (const c of cases) {
    await p.setViewport(c.vp); await media(c.media);
    await openPicker(p);
    check(`${c.name}: the emulated pointer reads ${c.framed ? "fine + hover" : "coarse, no hover"}`, (await desk()) === c.framed);
    const s = await read(p);
    log(`${c.name}: ${JSON.stringify({ parent: s.parent, view: box(s.view), frame: box(s.frame), frameLive: s.frameLive, radius: s.radius })}`);
    check(`${c.name}: still a body child`, s.parent === "body");
    if (c.framed) {
      check(`${c.name}: the layer takes the frame's box`, s.frameLive && ["left", "top", "width", "height"].every((k) => near(s.view[k], s.frame[k])), `${box(s.view)} vs frame ${box(s.frame)}`);
      check(`${c.name}: the frame's radius`, s.radius === "22px", s.radius);
    } else {
      check(`${c.name}: the whole screen, as today`, near(s.view.left, 0) && near(s.view.top, 0) && near(s.view.width, s.win.width) && near(s.view.height, s.win.height), `${box(s.view)} in ${s.win.width}×${s.win.height}`);
      check(`${c.name}: no radius`, s.radius === "0px", s.radius);
    }
    await nav.closeFeeder(p);
  }
  await media([]);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  log(`${checks - fails}/${checks} ${fails ? "FAIL" : "ALL PASS"}`);
  b.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
