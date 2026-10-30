// Run: CI=true npx react-scripts test --watchAll=false src/lib/supabaseAnon
//
// The anon client's boundary (ruled by Dan, 2026-10-29, Phase A Commit 1): exactly one
// importer — the gift card — and exactly two calls inside the module. Read from disk, so a
// new import anywhere under src/ fails this test before it reaches a build.
import fs from "fs";
import path from "path";

const SRC = path.join(__dirname, "..");

function walk(dir, out = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out);
    else if (/\.js$/.test(d.name) && !/\.test\.js$/.test(d.name)) out.push(p);
  });
  return out;
}
const rel = (p) => path.relative(SRC, p).split(path.sep).join("/");

describe("src/lib/supabaseAnon.js", () => {
  test("is imported by src/components/GiftCard.js and nothing else", () => {
    const importers = walk(SRC)
      .filter((p) => /from\s+["'][^"']*\/supabaseAnon["']|require\(["'][^"']*\/supabaseAnon["']\)/.test(fs.readFileSync(p, "utf8")))
      .map(rel);
    expect(importers).toEqual(["components/GiftCard.js"]);
  });

  test("makes exactly two calls: rpc preview_meal_gift_public and a gift-photos signed URL", () => {
    const src = fs.readFileSync(path.join(SRC, "lib", "supabaseAnon.js"), "utf8");
    const code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");   // drop comment lines
    expect(code.match(/\.rpc\(/g)).toHaveLength(1);
    expect(code).toMatch(/\.rpc\("preview_meal_gift_public"/);
    expect(code.match(/createSignedUrlCache\(\{ bucket: "gift-photos" \}\)/g)).toHaveLength(1);
    expect(code).not.toMatch(/\.from\(/);          // no table reads, no direct storage.from
    expect(code).not.toMatch(/meal-photos/);
    expect(code).toMatch(/storageKey: "op-gift"/);
    expect(code).toMatch(/persistSession: false/);
  });
});
