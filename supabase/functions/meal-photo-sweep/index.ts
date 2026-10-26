// supabase/functions/meal-photo-sweep/index.ts
//
// OurProvisions — the meal photo sweep. The project's THIRD Edge Function, and the
// first that runs as service role. Spec: SPEC_photo_sweep.md (+ Amendment 2026-10-25).
//
// WHAT IT DOES: once a day (071's cron job), permanently deletes
//   1. soft-deleted meal photos past the 30-day grace (D1, D2): both objects through
//      the Storage API, then — only if remove() returned no error — the rows (D5, C3);
//   2. orphan objects in meal-photos older than 7 days that match no row at all (D4).
// Reads go through 070's three RPCs, so every cutoff is computed in the database,
// never on this function's clock.
//
// DRY RUN UNLESS TWO KEYS AGREE (D8, Amendment C4): it deletes only when the body says
// {"dry_run": false} AND the function secret SWEEP_LIVE is "true". Until SWEEP_LIVE is
// set, every call is a dry run whatever it asks for.
//
// AUTH: a shared secret in x-sweep-secret (SWEEP_SECRET; Vault holds the copy the cron
// job sends). verify_jwt = false — the caller is pg_net, not a user. A missing or wrong
// secret → 401 before anything is read.
//
// LOGS AND OUTPUT ARE COUNTS ONLY: object paths carry household and meal uuids, so no
// path, id or household id is ever logged or returned — not even in an error.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const BUCKET = "meal-photos";                 // D6 bucket guard: the only bucket touched
const MAX_EXPIRED = 500;                      // D7: photos per run (1000 paths = one remove())
const MAX_ORPHANS = 1000;                     // D7: orphan objects per run; remove()'s per-call cap
// The shape add_meal_photo enforces (065): <household>/<meal>/<stem>-(thumb|view).(webp|jpg).
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH_RE = new RegExp(`^${UUID}/${UUID}/${UUID}-(thumb|view)\\.(webp|jpg)$`);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// Constant-time compare, so the secret can't be guessed a byte at a time from timing.
function secretMatches(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

// An error's kind, never its message — a Storage or PostgREST message can echo a path.
function errKind(stage: string, err: { name?: string; code?: string; status?: number } | null) {
  return { stage, name: err?.name ?? null, code: err?.code ?? null, status: err?.status ?? null };
}

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get("SWEEP_SECRET");
  if (!secret) {
    console.error("[sweep] SWEEP_SECRET is not set — refusing every call");
    return json({ error: "misconfigured" }, 500);
  }
  if (!secretMatches(req.headers.get("x-sweep-secret"), secret)) return json({ error: "unauthorized" }, 401);
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: { dry_run?: unknown } = {};
  try { body = await req.json(); } catch (_e) { /* empty or non-JSON body → defaults */ }
  const dryRun = !(body.dry_run === false && Deno.env.get("SWEEP_LIVE") === "true");

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = db.storage.from(BUCKET);

  const out = {
    dry_run: dryRun,
    expired_found: 0, expired_removed: 0, rows_deleted: 0,
    orphans_found: 0, orphans_removed: 0,
    skipped_bad_path: 0,                      // expired rows (either path bad) + orphan objects
    capped: false,                            // a pass hit its limit; "found" is a lower bound
    errors: 0,
  };
  const errs: ReturnType<typeof errKind>[] = [];

  // 1. Expired photos — storage first, then the row (D5).
  const exp = await db.rpc("meal_photo_sweep_expired", { p_limit: MAX_EXPIRED });
  if (exp.error) {
    out.errors++; errs.push(errKind("expired_read", exp.error));
  } else {
    const rows = (exp.data ?? []) as { id: string; thumb_path: string; view_path: string }[];
    out.expired_found = rows.length;
    if (rows.length >= MAX_EXPIRED) out.capped = true;
    const good = rows.filter(r => PATH_RE.test(r.thumb_path) && PATH_RE.test(r.view_path));
    out.skipped_bad_path += rows.length - good.length;
    if (!dryRun && good.length) {
      // remove() succeeding means no error, not every path echoed back — an object
      // already gone is not a failure (Amendment C3; Verification 11).
      const rm = await bucket.remove(good.flatMap(r => [r.thumb_path, r.view_path]));
      if (rm.error) {
        out.errors++; errs.push(errKind("expired_remove", rm.error));
      } else {
        out.expired_removed = good.length;
        const del = await db.rpc("meal_photo_sweep_delete_rows", { p_ids: good.map(r => r.id) });
        if (del.error) { out.errors++; errs.push(errKind("rows_delete", del.error)); }
        else out.rows_deleted = (del.data as number) ?? 0;
      }
    }
  }

  // 2. Orphans — after the expired pass, so a row whose objects failed to remove still
  //    claims them and they're never mistaken for orphans.
  const orph = await db.rpc("meal_photo_sweep_orphans", { p_limit: MAX_ORPHANS });
  if (orph.error) {
    out.errors++; errs.push(errKind("orphans_read", orph.error));
  } else {
    const names = ((orph.data ?? []) as { name: string }[]).map(r => r.name);
    out.orphans_found = names.length;
    if (names.length >= MAX_ORPHANS) out.capped = true;
    const good = names.filter(n => PATH_RE.test(n));
    out.skipped_bad_path += names.length - good.length;
    if (!dryRun && good.length) {
      const rm = await bucket.remove(good);
      if (rm.error) { out.errors++; errs.push(errKind("orphans_remove", rm.error)); }
      else out.orphans_removed = good.length;
    }
  }

  console.log("[sweep]", JSON.stringify(out), errs.length ? JSON.stringify(errs) : "");
  return json(out);
});
