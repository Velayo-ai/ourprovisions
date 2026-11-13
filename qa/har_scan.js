// V22 HAR scan: node har_scan.js <file.har> <codes.txt>
// Splits Splunk RUM ingest requests into spans (/v1/rum) and replay (/v1/rumreplay), expands every
// layer it can (base64, gzip / deflate / raw deflate / brotli, JSON, nested strings), and counts needles.
const fs = require('fs');
const zlib = require('zlib');

const [harPath, codesPath] = process.argv.slice(2);
const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
const codes = fs.readFileSync(codesPath, 'utf8').split(/[\s,]+/).filter(Boolean);

const NEEDLES = {
  'gift code': (t) => codes.reduce((n, c) => n + count(t.toUpperCase(), c.toUpperCase()), 0),
  'ref=': (t) => count(t, 'ref='),
  'invite=': (t) => count(t, 'invite='),
  'token=': (t) => count(t, 'token='),
  '/g/': (t) => count(t, '/g/') + count(t, '%2Fg%2F') + count(t.toLowerCase(), '%2fg%2f'),
  // info only: bare words can hit DOM text ("Invite someone") or "href"/"referrer"
  '(info) invite': (t) => count(t.toLowerCase(), 'invite'),
  '(info) documentLoad': (t) => count(t, 'documentLoad'),
};

function count(hay, needle) {
  let n = 0, i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

function tryInflate(buf) {
  for (const f of [zlib.gunzipSync, zlib.inflateSync, zlib.inflateRawSync, zlib.brotliDecompressSync]) {
    try { const out = f(buf); if (out.length) return out; } catch (e) { /* next */ }
  }
  return null;
}

const B64 = /^[A-Za-z0-9+/_-]{40,}={0,2}$/;

// Returns the fully expanded text of a value: decoded layers appended after the original.
function expand(str, depth = 0) {
  if (depth > 6 || typeof str !== 'string') return '';
  // A layer that decodes REPLACES its raw form, so every hit is counted once.
  const s = str.trim();
  if (s.startsWith('{') || s.startsWith('[')) {
    try { return walk(JSON.parse(s), depth + 1); } catch (e) { /* not JSON */ }
  }
  if (B64.test(s)) {
    const buf = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const inflated = tryInflate(buf);
    if (inflated) return expand(inflated.toString('utf8'), depth + 1);
    const asText = buf.toString('utf8');
    if (/^[\x09\x0a\x0d\x20-\x7e]+$/.test(asText)) return str + '\n' + expand(asText, depth + 1);
  }
  return str;
}

function walk(v, depth) {
  if (typeof v === 'string') return expand(v, depth);
  if (Array.isArray(v)) return v.map((x) => walk(x, depth)).join('\n');
  if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => k + ':' + walk(x, depth)).join('\n');
  return String(v);
}

function bodyText(req) {
  const pd = req.postData;
  if (!pd || pd.text == null) return { text: '', decoded: false };
  let raw = pd.text;
  const enc = (req.headers || []).find((h) => /content-encoding/i.test(h.name));
  // Chrome may store binary bodies base64 (pd.encoding) or as latin1 text.
  for (const buf of [pd.encoding === 'base64' ? Buffer.from(raw, 'base64') : null, Buffer.from(raw, 'latin1'), Buffer.from(raw, 'utf8')]) {
    if (!buf) continue;
    const inflated = tryInflate(buf);
    if (inflated) return { text: expand(inflated.toString('utf8')), decoded: true, enc: enc && enc.value };
  }
  // Chrome stores a gzip-encoded fetch body already decompressed (seen 2026-11-01), so the header proves
  // nothing — the body counts as decoded when it parses as JSON.
  let parses = false;
  try { JSON.parse(raw); parses = true; } catch (e) { /* not JSON */ }
  return { text: expand(raw), decoded: parses, enc: enc && enc.value };
}

const pipes = { spans: { requests: 0, bytes: 0, undecoded: 0, hits: {} }, replay: { requests: 0, bytes: 0, undecoded: 0, hits: {} } };
let pageHits = {};
for (const e of har.log.entries) {
  const url = e.request.url;
  // us1 ingest is rum-ingest.us1.observability.splunkcloud.com (seen 2026-11-01); signalfx.com kept for older agents.
  if (!/rum-ingest\.[a-z0-9.]+\.(signalfx|splunkcloud)\.com/.test(url)) continue;
  if (e.request.method !== 'POST') continue; // OPTIONS preflights carry no body
  const pipe = /rumreplay/.test(url) ? 'replay' : (/\/v1\/rum/.test(url) ? 'spans' : null);
  if (!pipe) continue;
  const p = pipes[pipe];
  p.requests++;
  const { text, decoded } = bodyText(e.request);
  p.bytes += text.length;
  if (!decoded || !text) p.undecoded++;
  for (const [k, f] of Object.entries(NEEDLES)) {
    const n = f(text) + f(url);
    p.hits[k] = (p.hits[k] || 0) + n;
  }
}
// Also: the visited page URLs themselves (context, not a gate)
for (const e of har.log.entries) {
  if (e.request.method === 'GET' && /ourprovisions\.velayo\.ai/.test(e.request.url) && /text\/html/.test((e.response.content || {}).mimeType || '')) {
    pageHits[e.request.url.replace(/[A-Z0-9]{16}/g, '<CODE>')] = true;
  }
}

console.log('HAR:', harPath, '| entries', har.log.entries.length, '| codes checked', codes.length);
for (const [name, p] of Object.entries(pipes)) {
  console.log(`\n${name.toUpperCase()}: ${p.requests} POSTs, ${p.requests - p.undecoded} decoded, ${p.undecoded} not decoded, ${p.bytes} chars expanded`);
  for (const [k, n] of Object.entries(p.hits)) console.log(`  ${k.padEnd(20)} ${n}`);
}
console.log('\nHTML documents loaded (codes masked):', Object.keys(pageHits));

// Verdict. Zero decoded payloads in either pipeline is a FAILED scan, not a clean one — nothing was looked at.
const reasons = [];
if (codes.length === 0) reasons.push('no gift codes to check');
for (const [name, p] of Object.entries(pipes)) {
  const decoded = p.requests - p.undecoded;
  if (decoded < 1) reasons.push(`${name}: 0 decoded POSTs (${p.requests} seen)`);
  for (const [k, n] of Object.entries(p.hits)) {
    if (!k.startsWith('(info)') && n > 0) reasons.push(`${name}: ${k} = ${n}`);
  }
}
console.log(`\nDECODED: spans ${pipes.spans.requests - pipes.spans.undecoded} · replay ${pipes.replay.requests - pipes.replay.undecoded}`);
if (reasons.length) {
  console.log('VERDICT: FAIL');
  reasons.forEach((r) => console.log('  - ' + r));
  process.exitCode = 1;
} else {
  console.log('VERDICT: PASS (0 on every gate in both pipelines)');
}
