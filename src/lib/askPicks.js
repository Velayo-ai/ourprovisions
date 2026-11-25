import { askStyle } from "./askTelemetry";
// Ask picks (SPEC_ask + 2026-11-03 amendment; 077). Pure helpers for the three places the
// client touches a landed pick: the land request, its one span, and the swipe confirm.
// Kept out of App.js / useProvisions so each rule has a test beside it.

// A22: the request carries ids only — NEVER the label. The server reads the label from the ask.
// 089 (SPEC_ask_offline O3): every send carries its run id, so a reply lost on a weak signal can't land the
// picks twice; a replay from the queue also carries its tap time (089 rulings A, B). Both are omitted when
// not given, so the request stays the 3-arg shape the old client sends.
export function landAskPicksArgs(householdId, askId, catalogItemIds, runId = null, tappedAt = null) {
  return {
    p_household_id: householdId,
    p_ask_id: askId,
    p_catalog_item_ids: [...(catalogItemIds || [])],
    ...(runId ? { p_run_id: runId } : {}),
    ...(tappedAt ? { p_tapped_at: tappedAt } : {}),
  };
}

// A24 / R5: exactly one attribute, the count. No ask id (a stable handle on one person), no
// label, no item ids or names, no screen style. household_id rides every span as a global
// attribute (rum.js setHousehold), so the event is household-scoped, not anonymous.
export function askCompletedAttributes(count, screenStyle) {
  const n = Number.isInteger(count) && count > 0 ? count : 0;
  // workflow.name makes it a Splunk Custom Event (Digital Experience → Custom Events), like the other Ask events.
  return { "workflow.name": "ask_completed", pick_count: n, "ask.style": askStyle(screenStyle) };
}

// "Easton", "Easton & Everett", "Easton, Everett & Nina" — the provenance line's join.
export function joinPickLabels(labels) {
  const n = [...new Set((labels || []).filter((l) => typeof l === "string" && l.trim()))];
  if (n.length === 0) return "";
  if (n.length === 1) return n[0];
  return `${n.slice(0, -1).join(", ")} & ${n[n.length - 1]}`;
}

// Shop's provenance line (SPEC_ask_slice2 C4; the 11-04 ruling: "Picked by" sits on the "Added by"
// line). One clay line: "Added by you", "Picked by Easton & Everett", or both joined by " · ",
// "Added by" first; null when neither applies. The caller wraps the WHOLE line in .op-name (Dan,
// 2026-11-07): it carries member names and picker names alike.
export function provenanceClayLine(contributorNames, pickedByLabels) {
  const added = joinPickLabels(contributorNames);
  const picked = joinPickLabels(pickedByLabels);
  const parts = [];
  if (added) parts.push(`Added by ${added}`);
  if (picked) parts.push(`Picked by ${picked}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// The In cart tray's picker initials (A19; Dan's two-E ruling, C4.1, made household-wide in C4.3,
// 2026-11-07). The collision check runs over the HOUSEHOLD's picker names (pickLabelPool), not one
// row: any two names there that share a first letter (trimmed, case-insensitive) always show two
// letters, on every row — Easton is "Ea" even when he picked alone, because Everett exists. A
// unique first letter stays one letter. A two-letter collision ("Eva", "Evan") shows as-is: no
// further rule. The row's own labels always join the pool, so a row is never ambiguous.
const cleanLabels = (labels) =>
  [...new Set((labels || []).filter((l) => typeof l === "string" && l.trim()).map((l) => l.trim()))];
const labelChars = (l) => Array.from(l.replace(/\s+/g, ""));
const firstUpper = (chars) => chars[0].toUpperCase();

// The household's picker names: live asks' labels ∪ every label on the rows currently loaded (a
// deleted ask's label lives on in picked_by_labels, so it still counts).
export function pickLabelPool(askLabels, rows) {
  return cleanLabels([...(askLabels || []), ...(rows || []).flatMap((r) => r?.pickedByLabels || [])]);
}

export function pickInitials(labels, pool = []) {
  const names = cleanLabels(labels);
  const people = new Map();   // one entry per name, case-insensitive: "Easton" and "easton" are one picker
  [...cleanLabels(pool), ...names].forEach((l) => people.set(l.toLowerCase().replace(/\s+/g, ""), labelChars(l)));
  const seen = {};
  people.forEach((chars) => { seen[firstUpper(chars)] = (seen[firstUpper(chars)] || 0) + 1; });
  return names.map((l) => {
    const chars = labelChars(l);
    return seen[firstUpper(chars)] > 1 ? firstUpper(chars) + (chars[1] || "").toLowerCase() : firstUpper(chars);
  });
}

// SHOP swipe-to-remove (R3, 2026-11-03). Returns null to remove at once, or what the shared-item
// confirm needs. A row someone picked through an Ask always confirms: a picker has no account, so
// no member can be "the picker", and an unresolved identity is never proof of ownership. A pick
// row has no contributor rows (A22), so this check comes first; the contributor rule after it is
// the one SHOP had before 077, unchanged.
export function swipeRemoveConfirm(item, myClerkId) {
  const picked = joinPickLabels(item?.pickedByLabels);
  if (picked) return { verb: "picked", byName: picked };
  const contributors = item?.contributors || [];
  const sharedByOther = contributors.some((c) => c.clerkId && c.clerkId !== myClerkId);
  if (!sharedByOther) return null;
  return {
    verb: "added",
    byName: item.addedBy || contributors.find((c) => c.clerkId !== myClerkId)?.fullName || "someone else",
  };
}
