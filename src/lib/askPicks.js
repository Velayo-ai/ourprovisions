// Ask picks (SPEC_ask + 2026-11-03 amendment; 077). Pure helpers for the three places the
// client touches a landed pick: the land request, its one span, and the swipe confirm.
// Kept out of App.js / useProvisions so each rule has a test beside it.

// A22: the request carries ids only — NEVER the label. The server reads the label from the ask.
export function landAskPicksArgs(householdId, askId, catalogItemIds) {
  return {
    p_household_id: householdId,
    p_ask_id: askId,
    p_catalog_item_ids: [...(catalogItemIds || [])],
  };
}

// A24 / R5: exactly one attribute, the count. No ask id (a stable handle on one person), no
// label, no item ids or names, no screen style. household_id rides every span as a global
// attribute (rum.js setHousehold), so the event is household-scoped, not anonymous.
export function askCompletedAttributes(count) {
  const n = Number.isInteger(count) && count > 0 ? count : 0;
  return { pick_count: n };
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

// The In cart tray's picker initials (A19; Dan's two-E ruling, C4.1, 2026-11-07): one letter per
// picker, in label order. When two or more pickers on the SAME row share a first letter, those
// pickers show two letters — "Easton & Everett" → ["Ea", "Ev"]; a picker whose letter is unique
// keeps one. If two letters still collide ("Eva", "Evan"), both show as-is: no further rule.
export function pickInitials(labels) {
  const names = [...new Set((labels || []).filter((l) => typeof l === "string" && l.trim()))]
    .map((l) => Array.from(l.trim().replace(/\s+/g, "")));
  const first = (chars) => chars[0].toUpperCase();
  const seen = {};
  names.forEach((chars) => { seen[first(chars)] = (seen[first(chars)] || 0) + 1; });
  return names.map((chars) => (seen[first(chars)] > 1 ? first(chars) + (chars[1] || "").toLowerCase() : first(chars)));
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
