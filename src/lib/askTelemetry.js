// Ask telemetry (A24 as amended 2026-11-15, Dan: "push to dev"). A24 allowed one span, ask_completed
// (the count). These add the funnel and the failures, under the same rule: counts, a screen name and a
// database error CODE only. Never an ask id (a stable handle on one person), a label, item ids or names,
// the screen style (Simple says something about who is picking) or an error MESSAGE (create_ask's name
// the label). household_id rides every span as a global attribute (rum.js setHousehold).
//
//   ask_started       a run opened fresh (not a reload)                      —
//   ask_resumed       a run reopened after a reload                          screen
//   ask_abandoned     Close / Done held before the picks landed              screen, pick_count
//   ask_land_failed   That's it! didn't reach the list (the wagon is kept)   error_code, pick_count
//   ask_admin_failed  reading, making, editing or deleting an Ask failed     op, error_code
//   ask_completed     (unchanged, lib/askPicks) the picks landed             pick_count
import { trace } from "@opentelemetry/api";

const SCREENS = new Set(["turn", "shelf"]);
const OPS = new Set(["read", "create", "update", "delete"]);

// A Postgres SQLSTATE (5 chars, e.g. 23505, P0001, 42501) or a PostgREST code (PGRST116) passes as
// is. A fetch that never reached the server is "network". Anything else is "unknown" — never the text.
export function askErrorCode(err) {
  const code = err && typeof err.code === "string" ? err.code : null;
  if (code && (/^[0-9A-Z]{5}$/.test(code) || /^PGRST\d{3}$/.test(code))) return code;
  if (err && (err.name === "TypeError" || /fetch|network|load failed/i.test(String(err.message || "")))) return "network";
  if (code === "no_live_row") return code;
  return "unknown";
}

const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
const screen = (s) => (SCREENS.has(s) ? s : "unknown");

export const askEventAttributes = {
  ask_started: () => ({}),
  ask_resumed: (s) => ({ screen: screen(s) }),
  ask_abandoned: (s, picks) => ({ screen: screen(s), pick_count: count(picks) }),
  ask_land_failed: (err, picks) => ({ error_code: askErrorCode(err), pick_count: count(picks) }),
  ask_admin_failed: (op, err) => ({ op: OPS.has(op) ? op : "unknown", error_code: askErrorCode(err) }),
};

// Emit one span. Telemetry never breaks the run: a failure here is a console warning, nothing more.
export function emitAskEvent(name, ...args) {
  const build = askEventAttributes[name];
  if (!build) return;
  try {
    trace.getTracer("ourprovisions-app").startSpan(name, { attributes: { "workflow.name": name, ...build(...args) } }).end();
  } catch (e) {
    console.warn(`[rum] ${name} event failed:`, e);
  }
}
