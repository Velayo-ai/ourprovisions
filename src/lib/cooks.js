// The household's cook map — meal_id → { lastCookedAt, count } — from meal_cooks rows read
// newest first. Lifted out of useProvisions' loadCooks unchanged (2026-10-19) so the count
// can be proven exact: the map is ALWAYS rebuilt from the server's rows, never adjusted on
// the client. A Cooked it re-reads it (markCooked → loadCooks) instead of adding 1, so a
// placements poll that re-read the log mid-cook (cookChanged) cannot make one cook count
// twice — the dev walk's "5 times" over 4 rows.
export function cooksFromRows(rows) {
  const next = {};
  (rows || []).forEach((r) => {
    const cur = next[r.meal_id];
    if (cur) cur.count += 1;                                            // newest first: the first row set lastCookedAt
    else next[r.meal_id] = { lastCookedAt: r.cooked_at, count: 1 };
  });
  return next;
}

export default cooksFromRows;
