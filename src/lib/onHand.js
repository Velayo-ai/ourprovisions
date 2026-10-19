// All on hand (SPEC_all_on_hand, 2026-10-19). Add all's batch toast when one or more of
// the meals had every ingredient on hand — 064 stamped those placements ready instead of
// adding rows. n = meals that put rows on the list, m = meals stamped ready on hand.
//   n > 0, m > 0 → "3 meals added · 1 already on hand — ready to cook"
//   n = 0, m > 0 → "1 already on hand — ready to cook"   (nothing was added; never "0 meals added")
// The caller keeps its existing line ("… added · K to get") when m is 0.
export function addAllOnHandLine(n, m) {
  const ready = `${m} already on hand — ready to cook`;
  if (!n) return ready;
  return `${n} meal${n === 1 ? "" : "s"} added · ${ready}`;
}

export default addAllOnHandLine;
