// signin.js — sign in to dev as the test account (Clerk modal, password, the device-trust code),
// and, if the welcome sheet shows (a first sign-in), name the first place. One process, start to end.
//   node signin.js [place name]      default place name: "Cody Test House"
const { env, sleep, log, connect, firstPage, bodyText, shot, DEV_URL } = require("./lib");

const PLACE = process.argv[2] || "Cody Test House";
const DEVICE_TRUST_CODE = "424242";   // dev only: +clerk_test accepts it
const modalText = (page) => page.evaluate(() => ((document.querySelector(".cl-modalContent") || document.querySelector(".cl-modalBackdrop"))?.innerText || "").replace(/\s+/g, " ").slice(0, 200));

(async () => {
  const browser = await connect();
  const page = await firstPage(browser);
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) log("NAV " + f.url().slice(0, 100)); });
  await page.goto(DEV_URL, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(() => window.Clerk && window.Clerk.loaded, { timeout: 30000 });
  if (await page.evaluate(() => !!window.Clerk.user)) {
    log("already signed in: " + await bodyText(page, 120));
  } else {
    await page.waitForSelector(".home-welcome-btn.ghost:not([disabled])", { timeout: 20000 });
    // The modal needs a beat after Clerk.loaded: tap, wait for the field, tap again if needed.
    let opened = false;
    for (let t = 0; t < 8 && !opened; t++) {
      await sleep(t === 0 ? 3000 : 2000);
      await page.click(".home-welcome-btn.ghost").catch(() => {});
      opened = await page.waitForSelector("input[name=identifier]", { visible: true, timeout: 5000 }).then(() => true).catch(() => false);
    }
    if (!opened) throw new Error("the sign-in modal never opened");
    await page.type("input[name=identifier]", env("OP_TEST_EMAIL"), { delay: 15 });
    if (await page.$("input[name=password]")) await page.type("input[name=password]", env("OP_TEST_PASSWORD"), { delay: 15 });
    await page.keyboard.press("Enter");
    log("submitted");
    let codeDone = false, pwDone = false;
    for (let i = 0; i < 45; i++) {
      await sleep(1000);
      const st = await page.evaluate(() => ({
        pwEmpty: (() => { const p = document.querySelector("input[name=password]"); return p ? p.value.length === 0 : null; })(),
        code: !!document.querySelector("input[name=code], input[autocomplete='one-time-code']"),
        modal: !!document.querySelector(".cl-modalContent, .cl-signIn-root, .cl-modalBackdrop"),
        user: !!(window.Clerk && window.Clerk.user),
      })).catch(() => ({}));
      if (st.user && !st.modal) { log("signed in"); break; }
      if (st.pwEmpty === true && !pwDone) { await page.type("input[name=password]", env("OP_TEST_PASSWORD"), { delay: 15 }); await page.keyboard.press("Enter"); pwDone = true; log("password step submitted"); continue; }
      if (st.code && !codeDone) {
        log("device trust: " + await modalText(page));
        const inp = await page.$("input[name=code], input[autocomplete='one-time-code']");
        await inp.focus(); await page.keyboard.type(DEVICE_TRUST_CODE, { delay: 80 }); codeDone = true;
        await sleep(2000);
        if (await page.$("input[name=code], input[autocomplete='one-time-code']")) await page.keyboard.press("Enter");
        continue;
      }
      if (i % 10 === 9) log(`t+${i + 1}s ${JSON.stringify(st)} :: ${await modalText(page)}`);
    }
  }
  // The welcome sheet (a first sign-in): name the place.
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const sel = "input[placeholder='Home, The Smiths, Lake house…']";
    if (await page.$(sel)) {
      await page.click(sel, { clickCount: 3 });
      await page.type(sel, PLACE, { delay: 20 });
      const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((b) => /^continue$/i.test(b.innerText.trim())); if (b) { b.click(); return b.innerText.trim(); } return null; });
      log(`welcome sheet: named "${PLACE}", tapped ${clicked}`);
      break;
    }
    if (await page.evaluate(() => /HOME PLAN BROWSE SHOP/.test(document.body.innerText.replace(/\s+/g, " ")))) { if (i >= 3) { log("no welcome sheet (the place is already named)"); break; } }
  }
  await sleep(3000);
  await shot(page, "signed-in");
  log("state: " + await bodyText(page, 200));
  await browser.disconnect();
})().catch((e) => { console.log("SIGNIN ERROR:", e.message.split("\n")[0]); process.exit(1); });
