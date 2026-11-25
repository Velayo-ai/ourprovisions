// Ask telemetry (A24 as amended 2026-11-15, Dan: "push to dev"; ask.style added the same day, Dan:
// "how do we see explorer vs shopper"). A24 allowed one span, ask_completed
// (the count). These add the funnel and the failures, under the same rule: counts, a screen name and a
// database error CODE only, plus ask.style ("explorer" | "shopper"). Never an ask id (a stable handle on
// one person), a label, item ids or names, or an error MESSAGE (create_ask's name the label).
// household_id rides every span as a global attribute (rum.js setHousehold) — so ask.style does tell
// Splunk that a household has an Explorer (a younger picker). Dan accepted that, to split the funnel.
//
//   ask_started       a run opened fresh (not a reload)                      ask.style
//   ask_resumed       a run reopened after a reload                          screen, ask.style
//   ask_abandoned     Close / Done held before the picks landed              screen, pick_count, ask.style
//   ask_land_failed   That's it! didn't reach the list (the wagon is kept)   error_code, pick_count, ask.style
//   ask_admin_failed  reading, making, editing or deleting an Ask failed     op, error_code
//   ask_completed     (lib/askPicks) the picks landed                        pick_count, ask.style
//                     (a queued send: once, when its replay lands, with the server's count)
//   ask_land_queued   the send waits on this phone (off grid, SPEC_ask_offline) pick_count, ask.style
//   ask_land_dropped  a queued landing the server refused on replay (D5)     error_code
//   ask_see_tapped    the parent tapped See on "{Label} added N · See"       pick_count, ask.style
//                     (÷ ask_completed ≈ how often the hand-back toast gets used)
//
// Making an Ask (2026-11-15, Dan: "the workflow that created the Ask from Browse"):
//   ask_create_opened     the New ask screen opened                          entry
//   ask_created           create_ask succeeded — a TIMED span: its duration   ask.style, pick_target, shelf_size
//                         is open → created, so Custom Workflow Duration
//                         reads "how long it takes a parent to make an Ask"
//   ask_create_abandoned  the New ask screen closed without an Ask            —
//   (a failed save is ask_admin_failed {op: create}, above)
//   entry: "rail" (Browse's "Ask someone…", shown when there are no Asks yet) |
//          "organize" (View & organize → "+ New ask")
import { trace } from "@opentelemetry/api";

const SCREENS = new Set(["turn", "shelf"]);
const ENTRIES = new Set(["rail", "organize"]);
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

// The Ask's screen style as Splunk sees it: Simple is Explorer, anything else is Shopper (the default).
export function askStyle(screenStyle) {
  return screenStyle === "simple" ? "explorer" : "shopper";
}

const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
const screen = (s) => (SCREENS.has(s) ? s : "unknown");

export const askEventAttributes = {
  ask_started: (style) => ({ "ask.style": askStyle(style) }),
  ask_resumed: (s, style) => ({ screen: screen(s), "ask.style": askStyle(style) }),
  ask_abandoned: (s, picks, style) => ({ screen: screen(s), pick_count: count(picks), "ask.style": askStyle(style) }),
  // The two failures carry Splunk's error flag, so they count in Custom Workflow Error Rates (and can be
  // alerted on). error.message is the CODE again — Splunk groups errors by it — never the database's text.
  ask_create_opened: (entry) => ({ entry: ENTRIES.has(entry) ? entry : "unknown" }),
  ask_created: (draft) => ({
    "ask.style": askStyle(draft && draft.style),
    pick_target: count(draft && draft.target),
    shelf_size: count(draft && draft.itemIds ? [...draft.itemIds].length : 0),
  }),
  ask_create_abandoned: () => ({}),
  ask_see_tapped: (picks, style) => ({ pick_count: count(picks), "ask.style": askStyle(style) }),
  ask_land_queued: (picks, style) => ({ pick_count: count(picks), "ask.style": askStyle(style) }),
  // D5: the code only. A dropped landing is said nowhere on screen (C3), so this is the one record of it.
  ask_land_dropped: (err) => {
    const code = askErrorCode(err);
    return { error: true, "error.message": code, error_code: code };
  },
  ask_land_failed: (err, picks, style) => {
    const code = askErrorCode(err);
    return { error: true, "error.message": code, error_code: code, pick_count: count(picks), "ask.style": askStyle(style) };
  },
  ask_admin_failed: (op, err) => {
    const code = askErrorCode(err);
    return { error: true, "error.message": code, op: OPS.has(op) ? op : "unknown", error_code: code };
  },
};

// Emit one span. Telemetry never breaks the run: a failure here is a console warning, nothing more.
export function emitAskEvent(name, ...args) {
  emitTimed(name, null, args);
}

// The same, timed from startMs (Date.now() when the step began) to now, so Splunk's Custom Workflow
// Duration measures the step. A missing or future start falls back to an instant span.
export function emitAskTimedEvent(name, startMs, ...args) {
  emitTimed(name, Number.isFinite(startMs) && startMs <= Date.now() ? startMs : null, args);
}

function emitTimed(name, startMs, args) {
  const build = askEventAttributes[name];
  if (!build) return;
  try {
    const opts = { attributes: { "workflow.name": name, ...build(...args) } };
    if (startMs !== null) opts.startTime = startMs;
    trace.getTracer("ourprovisions-app").startSpan(name, opts).end();
  } catch (e) {
    console.warn(`[rum] ${name} event failed:`, e);
  }
}
