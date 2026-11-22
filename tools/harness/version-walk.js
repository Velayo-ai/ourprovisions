// version-walk.js — SPEC_app_version_check pre-walk (the harness rule, 2026-11-21). Signed in already
// (signin.js), dev only. Intercepts /asset-manifest.json to stand in for "a new version was deployed",
// then drives what a phone can't be scripted to do on demand. One process, start to end; prints
// PASS/FAIL per step and exits 1 on any FAIL.
//   node version-walk.js [askLabel]        default askLabel: Test (Cody Test House's "Ask Test")
const { DEV_URL, sleep, log, connect, firstPage, clickText, shot } = require("./lib");

const LABEL = process.argv[2] || "Test";
const STUB_MAIN = "/static/js/main.harnessstub0.js";   // never a real bundle: always "newer"
let mode = "pass";                                      // pass | newer | fail
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };

(async () => {
  const browser = await connect();
  const page = await firstPage(browser);
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (!req.url().endsWith("/asset-manifest.json") || mode === "pass") return req.continue();
    if (mode === "fail") return req.respond({ status: 500, contentType: "text/plain", body: "harness: failing on purpose" });
    return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ files: { "main.js": STUB_MAIN }, entrypoints: [STUB_MAIN.slice(1)] }) });
  });
  const notice = () => page.$(".op-version-notice").then((h) => !!h);
  const foreground = () => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const waitNotice = async (want, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if ((await notice()) === want) return true; await sleep(250); } return (await notice()) === want; };

  // ── A fresh load of the deployed build, manifest untouched ──
  await page.goto(DEV_URL, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(() => window.Clerk && window.Clerk.loaded && window.Clerk.user, { timeout: 30000 }).catch(() => {});
  await sleep(3000);
  const running = await page.evaluate(() => { const s = document.querySelector('script[src*="/static/js/main."]'); return s ? s.getAttribute("src") : null; });
  log("running " + running);
  const tag = await page.evaluate(() => { const t = document.querySelector(".op-build-tag"); return t ? t.textContent : null; });
  check("V3 build tag shows dev · <sha7>", /^dev · [0-9a-f]{7}$/.test(tag || ""), String(tag));
  const geo = await page.evaluate(() => {
    const t = document.querySelector(".op-build-tag"), h = document.querySelector("nav.helm");
    if (!t || !h) return null;
    const a = t.getBoundingClientRect(), b = h.getBoundingClientRect();
    return { tagTop: a.top, tagBottom: a.bottom, helmBottom: b.bottom, vh: window.innerHeight, pe: getComputedStyle(t).pointerEvents, z: getComputedStyle(t).zIndex };
  });
  check("V3 tag sits under the Helm, on screen, takes no taps", !!geo && geo.tagTop >= geo.helmBottom && geo.tagBottom <= geo.vh && geo.pe === "none", JSON.stringify(geo));
  await shot(page, "version-tag");
  await foreground(); await sleep(2500);
  check("V1 same bundle deployed: no notice", !(await notice()));

  // ── "A new version is deployed" ──
  mode = "newer";
  await foreground();
  check("V1 foreground with a newer manifest: the notice appears", await waitNotice(true));
  check("V2 the notice reads 'A new version is ready.' with Reload and ✕",
    await page.evaluate(() => { const n = document.querySelector(".op-version-notice"); return !!n && /A new version is ready\./.test(n.innerText) && !!n.querySelector('button[aria-label="Dismiss"]') && /reload/i.test(n.innerText); }));
  await shot(page, "version-notice");
  await page.click('.op-version-notice button[aria-label="Dismiss"]');
  check("V2 ✕ hides it", await waitNotice(false, 2000));
  await sleep(1500);
  check("V2 it stays hidden in the same foreground", !(await notice()));
  await foreground();
  check("V2 the next foreground shows it again (still old)", await waitNotice(true));
  await page.click('.op-version-notice button[aria-label="Dismiss"]');
  await waitNotice(false, 2000);

  // ── Held during an Ask run ──
  log("tap Browse: " + await clickText(page, /^browse$/i, "button, a"));
  await sleep(2500);
  const pillRe = new RegExp(`Ask\\s*${LABEL}$`);
  const opened = await page.evaluate((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll("button.cat-pill.people-pill")].find((b) => r.test(b.innerText.replace(/\s+/g, " ").trim())); if (b) { b.click(); return true; } return false; }, pillRe.source);
  if (!opened) {
    check(`run hold: Ask ${LABEL} pill found`, false, "no pill — run ask-run.js first");
  } else {
    await page.waitForSelector(".ask-run", { visible: true, timeout: 15000 });
    await sleep(1500);
    await foreground();
    await sleep(4000);
    check("V2 during an Ask run: no notice (held)", !(await notice()));
    // Close the run: Close is a 1 s hold.
    const box = await page.$eval('.ask-run button[aria-label="Hold to close"]', (b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(box.x, box.y); await page.mouse.down(); await sleep(1400); await page.mouse.up();
    const closed = await page.waitForSelector(".ask-run", { hidden: true, timeout: 5000 }).then(() => true).catch(() => false);
    check("run closed by the hold", closed);
    check("V2 after the run ends: the notice appears", await waitNotice(true));
  }

  // ── Offline: a known new version hides (Reload would strand the app), and comes back online ──
  await foreground();
  check("the notice is up before going offline", await waitNotice(true));
  await page.setOfflineMode(true);
  check("V1 offline with a newer bundle known: the notice hides", await waitNotice(false, 4000));
  await page.setOfflineMode(false);
  check("back online: the notice returns", await waitNotice(true));

  // ── From a clean state (the real manifest again): offline, then a failed fetch, show nothing ──
  mode = "pass";
  await foreground();
  check("clean state: the real manifest clears it", await waitNotice(false));
  mode = "newer";
  await page.setOfflineMode(true);
  await foreground(); await sleep(3000);
  check("V1 offline foreground (newer deployed meanwhile): no fetch, no notice", !(await notice()));
  await page.setOfflineMode(false);
  mode = "fail";
  const errs = [];
  const onErr = (m) => { if (m.type() === "error") errs.push(m.text()); };
  page.on("console", onErr);
  await foreground(); await sleep(3000);
  page.off("console", onErr);
  check("V1 a failed manifest fetch: no notice, no app error", !(await notice()) && !errs.some((t) => !/500|Failed to load resource/i.test(t)), errs.slice(0, 2).join(" | "));

  // ── Reload: a plain location.reload(), and the fresh page is quiet ──
  mode = "newer";
  await foreground();
  await waitNotice(true);
  mode = "pass";   // after the reload the manifest is the real one again
  const nav = page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).then(() => true).catch(() => false);
  await page.click(".op-version-notice button:not([aria-label])");
  check("V2 Reload reloads the page", await nav);
  await sleep(3000);
  check("V2 after Reload on the current bundle: no notice", !(await notice()));
  const tag2 = await page.evaluate(() => { const t = document.querySelector(".op-build-tag"); return t ? t.textContent : null; });
  check("V3 the tag is still there after Reload", /^dev · [0-9a-f]{7}$/.test(tag2 || ""), String(tag2));

  await page.setRequestInterception(false);
  await browser.disconnect();
  const failed = results.filter((r) => !r.ok).length;
  log(`${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("VERSION-WALK ERROR:", e.message.split("\n")[0]); process.exit(1); });
