// One list's telemetry (SPEC_one_list Telemetry + SPEC_one_list_dashboard "How the events reach a chart").
// Splunk RUM turns a custom span into the metric rum.workflow.count only when it carries workflow.name, so every
// one-list span sets workflow.name to its own event name (the invite-health pattern). Counts are buckets,
// never raw numbers as a dimension; household_id stays a span attribute for session drill-down only, never a
// dashboard dimension, and nothing here ever carries a name. Telemetry never throws into, or blocks, the UI.
import { trace } from "@opentelemetry/api";
import { openBucket } from "./listPicker";

const tracer = trace.getTracer("ourprovisions-app");

// picker_closed's added_bucket: 0 · 1 · 2-4 · 5+.
export function addedBucket(n) {
  const k = Math.max(0, n || 0);
  if (k === 0) return "0";
  if (k === 1) return "1";
  if (k <= 4) return "2-4";
  return "5+";
}

export function oneListSpan(name, attributes = {}) {
  try {
    tracer.startSpan(name, { attributes: { "workflow.name": name, ...attributes } }).end();
  } catch (e) {
    console.warn(`[rum] ${name} failed:`, e);
  }
}

const hh = (householdId) => ({ household_id: householdId || null });

// from: list_add | helm | guide
export const pickerOpened = (from, householdId) => oneListSpan("picker_opened", { from, ...hh(householdId) });
// added: what was still added at Done (R8 revised); open_s: a bucket.
export const pickerClosed = (added, openMs, householdId) =>
  oneListSpan("picker_closed", { added, added_bucket: addedBucket(added), open_s: openBucket(openMs), ...hh(householdId) });
// A tap on a row already on the list: the quantity-friction signal.
export const pickerTapOnListed = (householdId) => oneListSpan("picker_tap_on_listed", hh(householdId));
// choice: add | browse | plan; browse_kind (browse only): aisles | staples.
export const listGuideCta = (choice, browseKind, householdId) =>
  oneListSpan("list_guide_cta", { choice, ...(choice === "browse" ? { browse_kind: browseKind } : {}), ...hh(householdId) });
// after: guide | welcome; s: the time from first seeing it to the first add, as a bucket.
export const firstItemAdded = (after, ms, householdId) => oneListSpan("first_item_added", { after, s: openBucket(ms), ...hh(householdId) });
export const listWelcomeDismissed = (householdId) => oneListSpan("list_welcome_dismissed", hh(householdId));
