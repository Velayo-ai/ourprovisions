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

// The new cook's id at the afterglow (SPEC_meal_photos_v1, 2026-10-21 amendment S3). cook_meal
// returns the cook timestamp and writes the SAME value to meal_cooks.cooked_at (one v_now for
// both tables, proven to the microsecond 2026-09-29), so the row is found by (household, meal,
// cooked_at = the returned value) — cook_meal itself is not changed. Exactly one row → its id.
// 0 or 2+ rows (or a read error) → null and the count, never a guess: the afterglow then shows
// no rating or photo controls. Returns { id, count }.
export async function resolveCookId(db, { householdId, mealId, cookedAt }) {
  if (!db || !householdId || !mealId || !cookedAt) return { id: null, count: 0 };
  const { data, error } = await db
    .from("meal_cooks")
    .select("id")
    .eq("household_id", householdId)
    .eq("meal_id", mealId)
    .eq("cooked_at", cookedAt);
  if (error) {
    console.warn("[cook id] lookup failed (no afterglow controls):", error.message);
    return { id: null, count: -1 };
  }
  const rows = data || [];
  if (rows.length !== 1) {
    console.warn(`[cook id] lookup found ${rows.length} rows for one cook (no afterglow controls)`);
    return { id: null, count: rows.length };
  }
  return { id: rows[0].id, count: 1 };
}

export default cooksFromRows;
