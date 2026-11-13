// chrome.js start | stop — the harness Chrome: headless, remote debugging on :9333, its own
// profile under tools/harness/profile, the iPhone user-agent as a BROWSER-LEVEL flag (see README).
// `stop` matches the process by this profile path only, so it never touches the person's own Chrome.
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const { CHROME, PROFILE, PORT, UA } = require("./lib");

const cmd = process.argv[2];

function alive() {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: "/json/version", timeout: 1500 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

(async () => {
  if (cmd === "start") {
    if (await alive()) { console.log(`Chrome already on :${PORT}`); return; }
    fs.mkdirSync(PROFILE, { recursive: true });
    const child = spawn(CHROME, [
      "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
      "--no-first-run", "--no-default-browser-check", "--window-size=390,844", `--user-agent=${UA}`, "about:blank",
    ], { detached: true, stdio: "ignore" });
    child.unref();
    for (let i = 0; i < 20; i++) { if (await alive()) { console.log(`Chrome up on :${PORT} (pid ${child.pid})`); return; } await new Promise((r) => setTimeout(r, 500)); }
    console.log("Chrome did not answer on the debugging port");
    process.exit(1);
  } else if (cmd === "stop") {
    // Match on the profile folder's last two path parts and the debugging port: slash direction
    // differs between what we pass and what Chrome reports, and -like treats \ literally.
    const parts = PROFILE.split(/[\\/]/).slice(-2).join("*");
    const ps = `$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*${parts.replace(/'/g, "''")}*' -and $_.CommandLine -like '*remote-debugging-port=${PORT}*' }; ($p | Measure-Object).Count; $p | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }`;
    const n = execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim().split(/\r?\n/)[0];
    console.log(`stopped ${n} harness Chrome process(es)`);
  } else {
    console.log("usage: node chrome.js start | stop");
    process.exit(2);
  }
})();
