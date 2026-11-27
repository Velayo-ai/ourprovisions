// PostgREST as the signed-in test account, from a page that has Clerk loaded (the token is the app's own
// "supabase" template). Dev only: refuses unless .env.local points at the dev project.
const fs = require("fs");
const path = require("path");
const lib = require("../lib");

function envLocal(name) {
  const raw = fs.readFileSync(path.join(lib.ROOT, ".env.local"), "utf8");
  const m = raw.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!m) throw new Error(`${name} missing from .env.local`);
  return m[1].trim();
}
const URL_ = envLocal("REACT_APP_SUPABASE_URL");
const ANON = envLocal("REACT_APP_SUPABASE_ANON_KEY");
if (!/zxwtxjjmssykhqrghouf/.test(URL_)) throw new Error("rest.js runs on dev only — .env.local is not dev");

function restFor(page) {
  const token = async () => {
    await page.waitForFunction(() => window.Clerk && window.Clerk.loaded && window.Clerk.session, { timeout: 30000 });
    return page.evaluate(() => window.Clerk.session.getToken({ template: "supabase" }));
  };
  const rest = async (method, p, body, prefer = "return=representation") => {
    const t = await token();
    const r = await fetch(`${URL_}/rest/v1/${p}`, {
      method,
      headers: { apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json", Prefer: prefer },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!r.ok) throw new Error(`${method} ${p.replace(/\?.*/, "")} ${r.status} ${data && data.code} ${data && data.message}`);
    return data;
  };
  const rpc = (fn, args) => rest("POST", `rpc/${fn}`, args);
  // Take named items off a household's list (every catalog row of that name), then read the list back.
  // Returns what is still live, plus "?<name>" for a name no catalog row has (a mis-read name must not pass).
  const unlist = async (householdName, names) => {
    const HH = (await rest("GET", `households?select=id&name=eq.${encodeURIComponent(householdName)}&deleted_at=is.null`))[0]?.id;
    if (!HH) throw new Error(`no ${householdName}`);
    const unknown = [];
    for (const n of names) {
      const rows = await rest("GET", `catalog_items?select=id&name=eq.${encodeURIComponent(n)}&deleted_at=is.null`);
      if (rows.length === 0) unknown.push(`?${n}`);
      for (const r of rows) await rpc("remove_list_item", { p_household_id: HH, p_catalog_item_id: r.id }).catch(() => {});
    }
    const live = await rest("GET", `list_items?select=quantity,catalog_items(name)&household_id=eq.${HH}&quantity=gt.0&status=neq.bought&deleted_at=is.null`);
    return [...live.map((r) => r.catalog_items?.name).filter((n) => names.includes(n)), ...unknown];
  };
  return { rest, rpc, unlist };
}

module.exports = { restFor, URL_ };
