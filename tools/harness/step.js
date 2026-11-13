// step.js — one ad-hoc action against the running harness Chrome, then a screenshot and a text
// dump (out/<name>.png, out/<name>.txt). For poking at a page; a flow belongs in one process.
//   node step.js <name> open <url> | click <selector> | clickText <text> [scope] | type <selector> <ENV:VAR|text>
//                       | press <key> | wait <ms> | eval <js> | shot
// A value written as ENV:NAME is read from .env.test.local and typed into the field only, never
// printed; the dump masks input values.
const fs = require("fs");
const path = require("path");
const { env, sleep, connect, OUT } = require("./lib");

const resolveValue = (v) => (v.startsWith("ENV:") ? env(v.slice(4)) : v);

(async () => {
  const [name, action, ...args] = process.argv.slice(2);
  if (!name || !action) { console.log("usage: node step.js <name> <action> [args]"); process.exit(2); }
  const browser = await connect();
  const pages = await browser.pages();
  const page = pages[pages.length - 1] || (await browser.newPage());
  page.setDefaultTimeout(20000);
  try {
    switch (action) {
      case "open": await page.goto(args[0], { waitUntil: "networkidle2", timeout: 60000 }); break;
      case "click": await page.waitForSelector(args[0], { visible: true }); await page.click(args[0]); break;
      case "clickText": {
        const [text, scope = "button, a, [role=button], [role=radio]"] = args;
        const ok = await page.evaluate((text, scope) => {
          const els = [...document.querySelectorAll(scope)];
          const el = els.find((e) => e.innerText.trim() === text) || els.find((e) => e.innerText.trim().includes(text));
          if (!el) return false;
          el.click();
          return true;
        }, text, scope);
        if (!ok) throw new Error(`no element with text ${JSON.stringify(text)}`);
        break;
      }
      case "type": await page.waitForSelector(args[0], { visible: true }); await page.click(args[0], { clickCount: 3 }); await page.type(args[0], resolveValue(args[1]), { delay: 20 }); break;
      case "press": await page.keyboard.press(args[0]); break;
      case "wait": await sleep(Number(args[0])); break;
      case "eval": console.log(JSON.stringify(await page.evaluate(args[0]))); break;
      case "shot": break;
      default: throw new Error(`unknown action ${action}`);
    }
    await sleep(1200);
  } catch (e) {
    console.log("STEP ERROR:", e.message.split("\n")[0]);
  }
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  const text = await page.evaluate(() => {
    const acc = [];
    const walk = (n) => {
      if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) acc.push(t); return; }
      if (n.nodeType !== 1) return;
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      if (n.tagName === "INPUT") { acc.push(`[input ${n.name || n.type}${n.placeholder ? ` "${n.placeholder}"` : ""}${n.value ? " *" : ""}]`); return; }
      if (n.tagName === "BUTTON" || n.getAttribute("role") === "button") { acc.push(`[button: ${(n.getAttribute("aria-label") || n.innerText || "").trim().slice(0, 60)}]`); return; }
      for (const c of n.childNodes) walk(c);
    };
    walk(document.body);
    return acc.join(" | ");
  });
  fs.writeFileSync(path.join(OUT, `${name}.txt`), text);
  console.log("URL:", page.url());
  console.log("TEXT:", text.slice(0, 1500));
  await browser.disconnect();
})();
