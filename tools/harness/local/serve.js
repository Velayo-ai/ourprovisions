// Static server for the CRA production build, with the SPA fallback. No dependencies.
//   node local/serve.js [buildDir] [port]      defaults: <repo>/build, OP_LOCAL_PORT or 3000
// Nothing is cached, so a rebuild is picked up on the next page load.
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve(process.argv[2] || path.join(__dirname, "..", "..", "..", "build"));
const port = Number(process.argv[3] || process.env.OP_LOCAL_PORT || 3000);
const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".map": "application/json", ".txt": "text/plain", ".woff2": "font/woff2" };
if (!fs.existsSync(path.join(root, "index.html"))) { console.log(`no build at ${root} — run: CI=true npx react-scripts build`); process.exit(1); }
http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, "index.html");
  res.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(p).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} on http://localhost:${port}/`));
