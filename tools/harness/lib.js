// Shared bits for the harness: the credentials file, the Chrome connection, small helpers.
// Nothing here prints a credential.
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const ENV_FILE = path.join(ROOT, ".env.test.local");
const OUT = path.join(__dirname, "out");
const PROFILE = path.join(__dirname, "profile");
const PORT = 9333;
const CHROME = process.env.OP_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
// Not "HeadlessChrome": Clerk refuses to load under it. A browser-level flag, never per session.
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const DEV_URL = "https://dev.ourprovisions.velayo.ai/";
const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

fs.mkdirSync(OUT, { recursive: true });

// A value from .env.test.local by name. Thrown, never printed, when missing.
function env(name) {
  const raw = fs.readFileSync(ENV_FILE, "utf8").replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && line.slice(0, i).trim() === name) return line.slice(i + 1).trim();
  }
  throw new Error(`${name} is not in .env.test.local`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(new Date().toISOString().slice(11, 19), s);

// Connect to the running harness Chrome (chrome.js start), retrying while it comes up.
async function connect() {
  for (let i = 0; i < 20; i++) {
    try { return await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: VIEWPORT }); }
    catch (e) { await sleep(1000); }
  }
  throw new Error(`no Chrome on :${PORT} — run: node chrome.js start`);
}

async function firstPage(browser) {
  const pages = await browser.pages();
  return pages[0] || (await browser.newPage());
}

// The page's visible text, inputs masked, buttons named — for logs and dumps.
const bodyText = (page, n = 300) => page.evaluate((n) => document.body.innerText.replace(/\s+/g, " ").slice(0, n), n);

// Click the first button (or `scope` element) whose text matches `re`; returns its text or null.
const clickText = (page, re, scope = "button") => page.evaluate((src, flags, scope) => {
  const r = new RegExp(src, flags);
  const b = [...document.querySelectorAll(scope)].find((b) => r.test(b.innerText.replace(/\s+/g, " ").trim()));
  if (!b) return null;
  b.click();
  return b.innerText.replace(/\s+/g, " ").trim().slice(0, 40);
}, re.source, re.flags, scope);

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });

module.exports = { ROOT, ENV_FILE, OUT, PROFILE, PORT, CHROME, UA, DEV_URL, VIEWPORT, env, sleep, log, connect, firstPage, bodyText, clickText, shot };
