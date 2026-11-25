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
// THE QUEUED WRAP UP (SPEC_offline_calm C6) is a Wrap up tapped while offline (or while checks still wait):
// { tapAt, dropIds, hideIds }. It replays on the same flush, AFTER every check tapped before it.
//   dropIds — rows this phone showed unchecked that the person chose NOT to carry forward: the only pending
//             rows the replay may archive. Anything else pending on the server by then (a partner's add, a
//             check that lost a conflict) is carried forward, never archived.
//   hideIds — every row this phone had at the tap except the ones carried: the trip it just finished,
//             kept off screen until the replay lands, so the list looks wrapped up.
//
// THE ASK QUEUE (SPEC_ask_offline D2) lives in lib/askQueue under its own prefix, ASK_PREFIX below, so the
// keying, discard and clear rules here cover it too.
//
// KEYING. All four live under `<prefix><clerkId>:<householdId>`. A key for any other person or place is
// discarded on load, never sent or shown (a shared phone must never show the previous user's list or send
// their queue). Sign-out and a household switch clear every key of both kinds.
//
// Every storage call is wrapped: private mode, a full disk or blocked storage leaves the queue in memory
// for this session, which is what today's code did with nothing at all.
export const QUEUE_PREFIX = "op_check_queue:";
export const CACHE_PREFIX = "op_list_cache:";
export const WRAP_PREFIX = "op_wrap_queue:";
export const ASK_PREFIX = "op_ask_queue:";
const CACHE_VERSION = 1;

export const queueKey = (clerkId, householdId) => `${QUEUE_PREFIX}${clerkId}:${householdId}`;
export const cacheKey = (clerkId, householdId) => `${CACHE_PREFIX}${clerkId}:${householdId}`;
export const wrapKey = (clerkId, householdId) => `${WRAP_PREFIX}${clerkId}:${householdId}`;
export const askKey = (clerkId, householdId) => `${ASK_PREFIX}${clerkId}:${householdId}`;

export const defaultStorage = () => {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch (e) { return null; }
};

const ownKeys = (store) => {
  const out = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && (k.startsWith(QUEUE_PREFIX) || k.startsWith(CACHE_PREFIX) || k.startsWith(WRAP_PREFIX) || k.startsWith(ASK_PREFIX))) out.push(k);
    }
  } catch (e) { /* storage unavailable */ }
  return out;
};

// Removes every queue and cache key that isn't this person's at this place. Returns the keys removed.
export function discardForeign(clerkId, householdId, store = defaultStorage()) {
  if (!store) return [];
  const keep = new Set([queueKey(clerkId, householdId), cacheKey(clerkId, householdId), wrapKey(clerkId, householdId), askKey(clerkId, householdId)]);
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

// ── The queued Wrap up (C6) ──
const idList = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === "string" && x) : []);

// rows = the list this phone shows at the tap (listRows: { id, name }), checked = its checked map,
// rollIds = the unchecked rows the person chose to carry forward.
export function makeQueuedWrap({ tapAt, rows, checked, rollIds }) {
  const roll = new Set(idList(rollIds));
  const ids = (rows || []).map((r) => r.id).filter(Boolean);
  return {
    tapAt,
    dropIds: ids.filter((id) => !checked?.[id] && !roll.has(id)),
    hideIds: ids.filter((id) => !roll.has(id)),
  };
}

export function readWrap(clerkId, householdId, store = defaultStorage()) {
  if (!store || !clerkId || !householdId) return null;
  try {
    const raw = store.getItem(wrapKey(clerkId, householdId));
    if (!raw) return null;
    const w = JSON.parse(raw);
    if (!w || typeof w.tapAt !== "string" || Number.isNaN(Date.parse(w.tapAt))) return null;
    return { tapAt: w.tapAt, dropIds: idList(w.dropIds), hideIds: idList(w.hideIds) };
  } catch (e) { return null; }
}

export function writeWrap(clerkId, householdId, wrap, store = defaultStorage()) {
  if (!store || !clerkId || !householdId) return;
  try {
    if (!wrap) store.removeItem(wrapKey(clerkId, householdId));
    else store.setItem(wrapKey(clerkId, householdId), JSON.stringify(wrap));
  } catch (e) { /* storage unavailable: the queued Wrap up lives in memory for this session */ }
}

// What the replay carries forward: every row pending on the server now, except the ones the person chose
// not to carry. These are both archive_trip_items' keep list and close_cycle's roll list.
export function wrapKeepIds(serverPendingIds, dropIds) {
  const drop = new Set(idList(dropIds));
  return idList(serverPendingIds).filter((id) => !drop.has(id));
}

// The trip a queued Wrap up finished stays off screen until the replay lands.
export function hideForWrap(rows, wrap, idOf = (r) => r.id) {
  if (!wrap || !wrap.hideIds || wrap.hideIds.length === 0) return rows;
  const hide = new Set(wrap.hideIds);
  return (rows || []).filter((r) => !hide.has(idOf(r)));
}

// Order on the flush (SPEC_ask_offline D4): the queue's checks split at every boundary, a queued Ask landing
// or the queued Wrap up, by tap time. Segment i holds the checks tapped after boundary i-1 and at or before
// boundary i; the last segment, the checks after every boundary. The flush sends a segment, then replays
// its boundary, then moves on. taps = the boundaries' tap times (ISO), in any order. Returns taps.length + 1
// arrays of ids.
export function splitAtTaps(entries, taps) {
  const at = (taps || []).map((t) => Date.parse(t)).sort((a, b) => a - b);
  const segments = at.map(() => []).concat([[]]);
  Object.keys(entries || {}).forEach((id) => {
    const t = Date.parse(entries[id].tapAt);
    let i = 0;
    while (i < at.length && t > at[i]) i++;
    segments[i].push(id);
  });
  return segments;
}

// The Wrap up's own split (C6): checks tapped before it go first (they're part of the trip it closes); a check
// tapped after it belongs to the next trip and waits until the Wrap up has landed.
export function splitAroundWrap(entries, wrap) {
  if (!wrap) return { before: Object.keys(entries || {}), after: [] };
  const [before, after] = splitAtTaps(entries, [wrap.tapAt]);
  return { before, after };
}
