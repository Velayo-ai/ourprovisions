// supabase/functions/meal-photo-sweep/index.ts
//
// !! main's source includes the item-photos pass needing migration 084; do not deploy to prod
// !! until 084 ships with Ask. (2026-11-12: Ask went to prod behind REACT_APP_FEATURE_ASK, OFF;
// !! 077 / 078 / 083 / 084 are dev-only. Prod runs the meal-only version deployed from dev b0282a6.
// !! If it is deployed early anyway, the item pass skips itself: see MISSING_RPC below.)
//
// OurProvisions — the photo sweep. The project's THIRD Edge Function, and the first that
// runs as service role. Spec: SPEC_photo_sweep.md (+ Amendment 2026-10-25); the item pass:
// SPEC_ask_slice4.md S4-8.
//
// WHAT IT DOES: once a day (the Actions schedule), permanently deletes, in two passes:
//   PASS 1, meal-photos (070's RPCs):
//   1. soft-deleted meal photos past the 30-day grace (D1, D2): both objects through
//      the Storage API, then — only if remove() returned no error — the rows (D5, C3);
//   2. orphan objects in meal-photos older than 7 days that match no row at all (D4).
//   PASS 2, item-photos (084's RPCs; A23's bucket, the household item photos of Ask):
//   the same two steps with household_item_photos — a replaced or removed photo past 30
//   days, then orphans past 7 days. Never a live row's objects (084's expired read skips a
//   deleted row whose paths a live row also names). Deleting an ask removes no photo.
// Reads go through the RPCs, so every cutoff is computed in the database, never on this
// function's clock. One run, both buckets: one secret, one schedule, one SWEEP_LIVE.
//
// DRY RUN UNLESS TWO KEYS AGREE (D8, Amendment C4): it deletes only when the body says
// {"dry_run": false} AND the function secret SWEEP_LIVE is "true". Until SWEEP_LIVE is
// set, every call is a dry run whatever it asks for.
//
// AUTH: a shared secret in x-sweep-secret (SWEEP_SECRET; the Actions job sends it).
// verify_jwt = false — the caller is a scheduled job, not a user. A missing or wrong
// secret → 401 before anything is read.
//
// LOGS AND OUTPUT ARE COUNTS ONLY: object paths carry household, meal and item uuids, so
// no path, id or household id is ever logged or returned — not even in an error.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const MAX_EXPIRED = 500;                      // D7: photos per run (1000 paths = one remove())
const MAX_ORPHANS = 1000;                     // D7: orphan objects per run; remove()'s per-call cap
// The shape both buckets enforce (065 add_meal_photo, 077 set_household_item_photo):
// <household>/<meal or item>/<stem>-(thumb|view).(webp|jpg).
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH_RE = new RegExp(`^${UUID}/${UUID}/${UUID}-(thumb|view)\\.(webp|jpg)$`);

// The two passes. D6's bucket guard: each pass touches its one bucket, hard-coded here.
const PASSES = [
  { key: "", bucket: "meal-photos", expired: "meal_photo_sweep_expired", orphans: "meal_photo_sweep_orphans", deleteRows: "meal_photo_sweep_delete_rows" },
  { key: "item_", bucket: "item-photos", expired: "item_photo_sweep_expired", orphans: "item_photo_sweep_orphans", deleteRows: "item_photo_sweep_delete_rows" },
] as const;

type Counts = {
  expired_found: number; expired_removed: number; rows_deleted: number;
  orphans_found: number; orphans_removed: number;
  skipped_bad_path: number;                   // expired rows (either path bad) + orphan objects
  capped: boolean;                            // a pass hit its limit; "found" is a lower bound
  skipped_missing_rpc: boolean;               // the pass's RPCs are not on this project (item pass before 084)
};

// "This RPC does not exist here": PostgREST's not-in-schema-cache code, and Postgres's own. A pass whose
// expired read gets one of these is skipped whole (no orphan step, no error counted): the item pass on a
// project without 084 is a no-op, not a failed run. Any other error is still an error.
const MISSING_RPC = new Set(["PGRST202", "42883"]);

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

// One bucket's two steps. Counts only; errors go to `errs` with the pass's stage names.
// deno-lint-ignore no-explicit-any
async function sweep(db: any, pass: typeof PASSES[number], dryRun: boolean, errs: ReturnType<typeof errKind>[]): Promise<Counts> {
  const bucket = db.storage.from(pass.bucket);
  const c: Counts = { expired_found: 0, expired_removed: 0, rows_deleted: 0, orphans_found: 0, orphans_removed: 0, skipped_bad_path: 0, capped: false, skipped_missing_rpc: false };

  // 1. Expired photos — storage first, then the row (D5).
  const exp = await db.rpc(pass.expired, { p_limit: MAX_EXPIRED });
  if (exp.error && MISSING_RPC.has(exp.error.code)) {
    c.skipped_missing_rpc = true;
    return c;
  }
  if (exp.error) {
    errs.push(errKind(pass.key + "expired_read", exp.error));
  } else {
    const rows = (exp.data ?? []) as { id: string; thumb_path: string; view_path: string }[];
    c.expired_found = rows.length;
    if (rows.length >= MAX_EXPIRED) c.capped = true;
    const good = rows.filter(r => PATH_RE.test(r.thumb_path) && PATH_RE.test(r.view_path));
    c.skipped_bad_path += rows.length - good.length;
    if (!dryRun && good.length) {
      // remove() succeeding means no error, not every path echoed back — an object
      // already gone is not a failure (Amendment C3; Verification 11).
      const rm = await bucket.remove(good.flatMap(r => [r.thumb_path, r.view_path]));
      if (rm.error) {
        errs.push(errKind(pass.key + "expired_remove", rm.error));
      } else {
        c.expired_removed = good.length;
        const del = await db.rpc(pass.deleteRows, { p_ids: good.map(r => r.id) });
        if (del.error) errs.push(errKind(pass.key + "rows_delete", del.error));
        else c.rows_deleted = (del.data as number) ?? 0;
      }
    }
  }

  // 2. Orphans — after the expired step, so a row whose objects failed to remove still
  //    claims them and they're never mistaken for orphans.
  const orph = await db.rpc(pass.orphans, { p_limit: MAX_ORPHANS });
  if (orph.error) {
    errs.push(errKind(pass.key + "orphans_read", orph.error));
  } else {
    const names = ((orph.data ?? []) as { name: string }[]).map(r => r.name);
    c.orphans_found = names.length;
    if (names.length >= MAX_ORPHANS) c.capped = true;
    const good = names.filter(n => PATH_RE.test(n));
    c.skipped_bad_path += names.length - good.length;
    if (!dryRun && good.length) {
      const rm = await bucket.remove(good);
      if (rm.error) errs.push(errKind(pass.key + "orphans_remove", rm.error));
      else c.orphans_removed = good.length;
    }
  }
  return c;
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

  // The meal pass keeps its original keys (the Actions log reads the same as before); the
  // item pass's are prefixed item_. One shared error count.
  const errs: ReturnType<typeof errKind>[] = [];
  const out: Record<string, number | boolean> = { dry_run: dryRun };
  for (const pass of PASSES) {
    const c = await sweep(db, pass, dryRun, errs);
    for (const [k, v] of Object.entries(c)) out[pass.key + k] = v;
  }
  out.errors = errs.length;

  console.log("[sweep]", JSON.stringify(out), errs.length ? JSON.stringify(errs) : "");
  return json(out);
});
