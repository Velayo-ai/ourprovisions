// src/lib/checkQueue.js — the offline check-off queue and the cached list, on this device only
// (SPEC_offline_checkoff.md 2026-11-08 + amendment 2026-11-23, slice 1).
//
// THE QUEUE holds checks and unchecks that couldn't reach the server: { [listItemId]: { want, tapAt } }.
//   want  — true = bought (checked), false = pending (unchecked): the row's final intent.
//   tapAt — ISO time of the tap on this phone. Sent as status_changed_at; the write applies only if the
//           row's check hasn't changed on the server since (088). Never a send time.
// Several taps on one row collapse to the last one; a final intent that equals the row's last-synced
// state is no change at all and leaves the queue (an offline check, then its Undo, sends nothing).
//
// THE CACHE is the household's last-loaded list — what the Shop renders from (listRows, contributors) and
// the household's id / name — so a reload on weak signal (the shell loads, the API doesn't) shows it.
//
// KEYING. Both live under `<prefix><clerkId>:<householdId>`. A key for any other person or place is
// discarded on load, never sent or shown (a shared phone must never show the previous user's list or send
// their queue). Sign-out and a household switch clear every key of both kinds.
//
// Every storage call is wrapped: private mode, a full disk or blocked storage leaves the queue in memory
// for this session, which is what today's code did with nothing at all.
export const QUEUE_PREFIX = "op_check_queue:";
export const CACHE_PREFIX = "op_list_cache:";
const CACHE_VERSION = 1;

export const queueKey = (clerkId, householdId) => `${QUEUE_PREFIX}${clerkId}:${householdId}`;
export const cacheKey = (clerkId, householdId) => `${CACHE_PREFIX}${clerkId}:${householdId}`;

export const defaultStorage = () => {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch (e) { return null; }
};

const ownKeys = (store) => {
  const out = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && (k.startsWith(QUEUE_PREFIX) || k.startsWith(CACHE_PREFIX))) out.push(k);
    }
  } catch (e) { /* storage unavailable */ }
  return out;
};

// Removes every queue and cache key that isn't this person's at this place. Returns the keys removed.
export function discardForeign(clerkId, householdId, store = defaultStorage()) {
  if (!store) return [];
  const keep = new Set([queueKey(clerkId, householdId), cacheKey(clerkId, householdId)]);
  const gone = ownKeys(store).filter((k) => !keep.has(k));
  gone.forEach((k) => { try { store.removeItem(k); } catch (e) { /* storage unavailable */ } });
  return gone;
}

// Sign-out and a household switch: every queue and cache key, whoever's.
export function clearCheckStorage(store = defaultStorage()) {
  if (!store) return;
  ownKeys(store).forEach((k) => { try { store.removeItem(k); } catch (e) { /* storage unavailable */ } });
}

const validEntry = (e) => !!e && typeof e.want === "boolean" && typeof e.tapAt === "string" && !Number.isNaN(Date.parse(e.tapAt));
// An entry as stored: want, tapAt, and the row's catalog item id when it was known at the tap (cid) — the
// confirmed check is logged against it, whether or not the list has loaded by the time it lands.
const cleanEntry = (e) => (typeof e.cid === "string" && e.cid ? { want: e.want, tapAt: e.tapAt, cid: e.cid } : { want: e.want, tapAt: e.tapAt });

export function readQueue(clerkId, householdId, store = defaultStorage()) {
  if (!store || !clerkId || !householdId) return {};
  try {
    const raw = store.getItem(queueKey(clerkId, householdId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out = {};
    Object.keys(parsed || {}).forEach((id) => { if (validEntry(parsed[id])) out[id] = cleanEntry(parsed[id]); });
    return out;
  } catch (e) { return {}; }
}

export function writeQueue(clerkId, householdId, entries, store = defaultStorage()) {
  if (!store || !clerkId || !householdId) return;
  try {
    if (Object.keys(entries).length === 0) store.removeItem(queueKey(clerkId, householdId));
    else store.setItem(queueKey(clerkId, householdId), JSON.stringify(entries));
  } catch (e) { /* storage unavailable: the queue lives in memory for this session */ }
}

// A tap's final intent for a row. syncedWant = the row's status as the server last said it (true =
// bought), or null when unknown. cid = the row's catalog item id, kept from an earlier entry when this
// tap doesn't know it. Returns the new entries; the input is never mutated.
export function putEntry(entries, id, want, tapAt, syncedWant, cid = null) {
  const next = { ...entries };
  if (syncedWant !== null && syncedWant !== undefined && want === syncedWant) delete next[id];
  else next[id] = cleanEntry({ want, tapAt, cid: cid || entries[id]?.cid || null });
  return next;
}

// The household this person's cached list is for (the newest, if several survived) — the restore's
// fallback when no place has been remembered on this phone (the remembered key is written on a switch).
export function cachedHouseholdFor(clerkId, store = defaultStorage()) {
  if (!store || !clerkId) return null;
  const prefix = `${CACHE_PREFIX}${clerkId}:`;
  let best = null;
  ownKeys(store).filter((k) => k.startsWith(prefix)).forEach((k) => {
    let at = 0;
    try { at = Date.parse(JSON.parse(store.getItem(k)).savedAt) || 0; } catch (e) { at = 0; }
    if (!best || at > best.at) best = { id: k.slice(prefix.length), at };
  });
  return best ? best.id : null;
}

// A write for this row settled (sent, or found already there): its entry leaves the queue — unless a
// newer tap replaced it meanwhile (the entry's tapAt is later than the one that settled).
export function settleEntry(entries, id, tapAt) {
  const e = entries[id];
  if (!e) return entries;
  if (tapAt && Date.parse(e.tapAt) > Date.parse(tapAt)) return entries;
  const next = { ...entries };
  delete next[id];
  return next;
}

// The earliest queued tap that checks something — the trip's true start (R3). null when none.
export function earliestCheckTap(entries) {
  let best = null;
  Object.values(entries).forEach((e) => {
    if (!e.want) return;
    if (best === null || Date.parse(e.tapAt) < Date.parse(best)) best = e.tapAt;
  });
  return best;
}

// The cache. rows = listRows (useProvisions), contributors = contributorsMap, household = { id, name,
// budget_goal }. The saved row status is the server's; the queue overlays its own intents on load.
export function writeListCache(clerkId, householdId, { household, rows, contributors }, store = defaultStorage()) {
  if (!store || !clerkId || !householdId || !household || household.id !== householdId) return;
  try {
    store.setItem(cacheKey(clerkId, householdId), JSON.stringify({
      v: CACHE_VERSION,
      savedAt: new Date().toISOString(),
      household: { id: household.id, name: household.name ?? null, budget_goal: household.budget_goal ?? null },
      rows: Array.isArray(rows) ? rows : [],
      contributors: contributors || {},
    }));
  } catch (e) { /* storage unavailable or full: no cache, as before */ }
}

export function readListCache(clerkId, householdId, store = defaultStorage()) {
  if (!store || !clerkId || !householdId) return null;
  try {
    const raw = store.getItem(cacheKey(clerkId, householdId));
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || c.v !== CACHE_VERSION || !c.household || c.household.id !== householdId || !Array.isArray(c.rows)) return null;
    return c;
  } catch (e) { return null; }
}

// The cheap "did the list move" signature the cache is rewritten on (ids, quantities, statuses, and who
// added what). A quiet 2 s poll leaves it byte-identical and writes nothing.
export function listCacheSignature(householdId, rows, contributors) {
  const r = (rows || []).map((x) => `${x.id}:${x.quantity}:${x.status}`).join(",");
  const c = Object.keys(contributors || {}).sort().map((k) => `${k}=${(contributors[k] || []).map((p) => `${p.userId}:${p.quantityAdded}`).join("+")}`).join(";");
  return `${householdId}|${r}|${c}`;
}

// A queued write that failed because the device is offline or the request never got an answer. Same class
// that today rolls a check back (classifyFetchError 'transient'), plus the send skipped while
// navigator.onLine is false.
export const OFFLINE_SKIP = Object.freeze({ name: "OfflineSkip", message: "OfflineSkip: navigator.onLine is false — not sent" });
export const isOfflineSkip = (err) => !!err && (err === OFFLINE_SKIP || err.name === "OfflineSkip");
