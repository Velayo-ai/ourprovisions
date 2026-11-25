// src/lib/askQueue.js — Ask landings that wait on this phone (SPEC_ask_offline D1–D5; migration 089).
//
// THE QUEUE is an ordered list of sends that couldn't reach the server: the wagon went off grid, or the call
// failed for want of a network. Each entry is one run's landing:
//   { runId, askId, ids, tapAt, label, style, items, landed }
//   runId  — the uuid land_ask_picks records (089, O3). The same id on the first try and every replay, so a
//            reply lost on a weak signal can't land the picks twice.
//   ids    — the picks' catalog item ids, in wagon order (1–48, unique).
//   tapAt  — when the wagon was sent, on this phone (ISO). Sent as p_tapped_at on a replay (089 A, B).
//   label, style, items — for THIS phone only: the overlay's "Picked by" line, the telemetry style and the
//            names of picks that aren't on the list yet. Never sent; the server reads the label from asks
//            (A22).
//   landed — the replay has landed; the entry stays until the list read after it is in and its held checks
//            are re-keyed (D3: so nothing blinks).
// Keying, the foreign discard and the clear on sign-out / household switch are checkQueue's (ASK_PREFIX
// there). Storage calls are wrapped: blocked storage keeps the queue in memory for the session.
//
// THE SYNTHETIC CHECK KEY (D4). A check on a row that exists only in the overlay has no list-item id yet. It
// is queued in the check queue under ask:<runId>:<catalogItemId>, and re-keyed to the real row's id once its
// landing has replayed and the list has been read. A synthetic key NEVER reaches the network.
//
// THE OVERLAY (D3) is what Paige's list shows meanwhile: the server rows with each queued landing applied the
// way land_ask_picks (087/089) applies it. Display only; the server stays the truth.
import { askKey, defaultStorage, isOfflineSkip } from "./checkQueue";
import { classifyFetchError } from "./classifyFetchError";
import { isAuthTokenMissing } from "./supabaseClient";

export const ASK_LAND_TIMEOUT_MS = 8000;   // ruling 2c: a hang on one bar becomes a queued send
export const SYNTH_PREFIX = "ask:";
const MAX_PICKS = 48;
const MAX_LABELS = 8;

const isStr = (x) => typeof x === "string" && x.length > 0;
const validTime = (x) => isStr(x) && !Number.isNaN(Date.parse(x));

function cleanItems(items, ids) {
  const want = new Set(ids);
  return (Array.isArray(items) ? items : [])
    .filter((it) => it && isStr(it.id) && want.has(it.id) && isStr(it.name))
    .map((it) => ({ id: it.id, name: it.name, category: typeof it.category === "string" ? it.category : null }));
}

// One entry as stored, or null when it isn't one.
export function cleanLanding(e) {
  if (!e || !isStr(e.runId) || !isStr(e.askId) || !validTime(e.tapAt) || !Array.isArray(e.ids)) return null;
  const ids = e.ids.filter(isStr);
  if (ids.length < 1 || ids.length > MAX_PICKS || ids.length !== e.ids.length || new Set(ids).size !== ids.length) return null;
  return {
    runId: e.runId,
    askId: e.askId,
    ids,
    tapAt: e.tapAt,
    label: typeof e.label === "string" ? e.label : null,
    style: typeof e.style === "string" ? e.style : null,
    items: cleanItems(e.items, ids),
    landed: e.landed === true,
  };
}

// A new entry for a send that is going to the queue.
export function makeAskLanding({ runId, askId, ids, tapAt, label = null, style = null, items = [] }) {
  return cleanLanding({ runId, askId, ids: [...(ids || [])], tapAt, label, style, items, landed: false });
}

export function readAskQueue(clerkId, householdId, store = defaultStorage()) {
  if (!store || !clerkId || !householdId) return [];
  try {
    const raw = store.getItem(askKey(clerkId, householdId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    return parsed.map(cleanLanding).filter((e) => e && !seen.has(e.runId) && seen.add(e.runId));
  } catch (e) { return []; }
}

export function writeAskQueue(clerkId, householdId, list, store = defaultStorage()) {
  if (!store || !clerkId || !householdId) return;
  try {
    if (!list || list.length === 0) store.removeItem(askKey(clerkId, householdId));
    else store.setItem(askKey(clerkId, householdId), JSON.stringify(list.map(cleanLanding).filter(Boolean)));
  } catch (e) { /* storage unavailable: the queue lives in memory for this session */ }
}

// The queue in tap order (a stable sort: two sends at the same millisecond keep their order).
export function byTap(list) {
  return (list || []).map((e, i) => [e, i])
    .sort((a, b) => (Date.parse(a[0].tapAt) - Date.parse(b[0].tapAt)) || (a[1] - b[1]))
    .map(([e]) => e);
}

// ── The synthetic check key ──
export const synthKey = (runId, catalogItemId) => `${SYNTH_PREFIX}${runId}:${catalogItemId}`;
export const isSynthKey = (id) => typeof id === "string" && id.startsWith(SYNTH_PREFIX);
export function parseSynthKey(id) {
  if (!isSynthKey(id)) return null;
  const rest = id.slice(SYNTH_PREFIX.length);
  const i = rest.indexOf(":");
  if (i <= 0 || i === rest.length - 1) return null;
  return { runId: rest.slice(0, i), catalogItemId: rest.slice(i + 1) };
}

// After a run's landing has replayed and the list is read: its held checks move to the real rows' ids.
// idOfCid(catalogItemId) → the live row's id, or null when the pick didn't land (skipped; it has no row).
// A real-id entry already there keeps whichever tap is newer (the queue's one-intent-per-row rule).
// Returns { entries, moved: [[from, to]], dropped: [keys] }; the input is never mutated.
export function rekeySynth(entries, runId, idOfCid) {
  const next = { ...entries };
  const moved = [];
  const dropped = [];
  Object.keys(entries || {}).forEach((k) => {
    const p = parseSynthKey(k);
    if (!p || p.runId !== runId) return;
    const e = entries[k];
    delete next[k];
    const to = idOfCid(p.catalogItemId);
    if (!to) { dropped.push(k); return; }
    const have = next[to];
    if (!have || Date.parse(e.tapAt) >= Date.parse(have.tapAt)) next[to] = { ...e, cid: p.catalogItemId };
    moved.push([k, to]);
  });
  return { entries: next, moved, dropped };
}

// Every held check of one run (a dropped landing takes them with it).
export function synthKeysOf(entries, runId) {
  return Object.keys(entries || {}).filter((k) => parseSynthKey(k)?.runId === runId);
}

// ── The send (D1) ──
// Is this failed send one to queue (true) or a real error the run shows (false)? Transient = the request
// never got an answer: classifyFetchError's class, the send skipped offline, our own 8 s timeout (2c), and —
// for the Ask send only (2a) — a missing Clerk token while the app already knows it is off grid.
export function askSendIsTransient(err, { timedOut = false, offline = false } = {}) {
  if (timedOut) return true;
  if (!err) return false;
  if (isOfflineSkip(err)) return true;
  if (classifyFetchError(err) === "transient") return true;
  if (offline && isAuthTokenMissing(err)) return true;
  return false;
}

// ── The overlay (D3) ──
// Landings the overlay still applies: every queued one, and a landed one until a list read that STARTED
// after it landed has been applied (appliedReadNo > landedSeq). landedSeq is the in-memory read counter at
// the moment the replay landed. An entry restored from storage already landed has none and retires at once:
// the server has it, and a cached list that already holds it must not show it twice.
export function liveLandings(list, appliedReadNo) {
  return byTap((list || []).filter((e) => !e.landed || !(appliedReadNo > (Number.isInteger(e.landedSeq) ? e.landedSeq : -1))));
}

function withLabel(labels, label) {
  if (!isStr(label)) return labels ?? null;
  if (!Array.isArray(labels) || labels.length === 0) return [label];
  if (labels.includes(label) || labels.length >= MAX_LABELS) return labels;
  return [...labels, label];
}

// rows / quantities / checked — the hook's server-side state (listRows, keyed by list-item id).
// checkEntries — the check queue ({ id: { want, tapAt } }).
// landings — liveLandings(...). me — the internal user id (a new row's added_by, as the server writes it).
// For each landing in tap order and each pick, land_ask_picks' branches:
//   live pending          → quantity +1, the label appended once (at most 8);
//   live, not pending     → a new need: pending at 1, the label reset to this one;
//   no row (or tombstone) → a new pending row at 1, id ask:<runId>:<cid>.
// "Not pending" counts a queued check tapped before the landing. A row the overlay touched shows checked
// only when a queued check of it was tapped AFTER its last landing. addIds = the rows it touched (they get
// the "not shared yet" dot). With no landings the inputs come back as they are (no new objects).
export function applyAskOverlay({ rows, quantities = {}, checked = {}, checkEntries = {}, landings = [], me = null }) {
  if (!landings || landings.length === 0) return { rows, quantities, checked, addIds: [] };
  const out = (rows || []).map((r) => ({ ...r }));
  const at = new Map();
  out.forEach((r, i) => { if (r && r.catalogItemId && !at.has(r.catalogItemId)) at.set(r.catalogItemId, i); });
  const qty = { ...quantities };
  const chk = { ...checked };
  const touched = new Map();   // row id → tap time (ms) of its last landing
  byTap(landings).forEach((L) => {
    const t = Date.parse(L.tapAt);
    L.ids.forEach((cid) => {
      const i = at.get(cid);
      if (i === undefined) {
        const item = (L.items || []).find((it) => it.id === cid);
        if (!item) return;   // no name to draw it with: the server row arrives on the replay's read
        const row = {
          id: synthKey(L.runId, cid), catalogItemId: cid, name: item.name, category: item.category ?? null,
          isStaple: false, quantity: 1, status: "pending", pricePerUnit: null, addedBy: me,
          pickedByLabels: isStr(L.label) ? [L.label] : null,
        };
        at.set(cid, out.length);
        out.push(row);
        qty[row.id] = 1;
        touched.set(row.id, t);
        return;
      }
      const r = out[i];
      const prevT = touched.has(r.id) ? touched.get(r.id) : -Infinity;
      let pending = touched.has(r.id) ? true : (r.status || "pending") === "pending";
      const e = checkEntries[r.id];
      if (e && Date.parse(e.tapAt) > prevT && Date.parse(e.tapAt) < t) pending = !e.want;
      if (pending) {
        const base = Number.isFinite(qty[r.id]) ? qty[r.id] : (r.quantity || 0);
        r.quantity = base + 1;
        r.pickedByLabels = withLabel(r.pickedByLabels, L.label);
      } else {
        r.quantity = 1;
        r.pickedByLabels = isStr(L.label) ? [L.label] : null;
      }
      r.status = "pending";
      qty[r.id] = r.quantity;
      touched.set(r.id, t);
    });
  });
  touched.forEach((t, id) => {
    const e = checkEntries[id];
    chk[id] = !!(e && Date.parse(e.tapAt) > t && e.want);
  });
  return { rows: out, quantities: qty, checked: chk, addIds: [...touched.keys()] };
}

// What the hook hands the app (D3): the server state with the live landings laid over it, and the "not
// shared yet" set (queuedChecks) widened to the rows the overlay touched, so each gets the small dot (C1).
// One place, at the hook's return; the hook's own refs, the list cache and its signature never see it.
// With nothing queued every input comes back as it is.
export function shownListState({ listRows, quantities, checked, queuedChecks, askQueue, appliedReadNo, me = null }) {
  const o = applyAskOverlay({ rows: listRows, quantities, checked, checkEntries: queuedChecks || {}, landings: liveLandings(askQueue, appliedReadNo), me });
  const extra = o.addIds.filter((id) => !(queuedChecks || {})[id]);
  return {
    listRows: o.rows,
    quantities: o.quantities,
    checked: o.checked,
    queuedChecks: extra.length ? { ...queuedChecks, ...Object.fromEntries(extra.map((id) => [id, { add: true }])) } : queuedChecks,
  };
}

// Must this check wait in the queue for a landing (D4)? A synthetic key always does: it never reaches the
// network. A real row does while a landing that hasn't replayed covers it and was sent BEFORE this check's
// tap (tapAt; a new tap, when omitted): that check has to land after the pick, as it would have online. A
// check tapped before the pick goes first. rows = the server rows.
export function heldByLanding(id, rows, list, tapAt = null) {
  if (isSynthKey(id)) return true;
  const row = (rows || []).find((r) => r.id === id);
  if (!row || !row.catalogItemId) return false;
  const t = tapAt ? Date.parse(tapAt) : Infinity;
  return (list || []).some((e) => !e.landed && e.ids.includes(row.catalogItemId) && Date.parse(e.tapAt) < t);
}

// One step of the flush (D4): the next boundary in tap order (a queued landing or the queued Wrap up), and
// the checks to send before it (tapped at or before it). With no boundary left, every remaining check. A
// synthetic key is never in `send`: it waits for its landing's re-key.
//   → { send: [ids], boundary: { kind: "land", tapAt, entry } | { kind: "wrap", tapAt, wrap } | null }
export function planFlushStep(entries, landings, wrap) {
  const bounds = byTap(landings || []).map((e) => ({ kind: "land", tapAt: e.tapAt, entry: e }));
  if (wrap) bounds.push({ kind: "wrap", tapAt: wrap.tapAt, wrap });
  bounds.sort((a, b) => Date.parse(a.tapAt) - Date.parse(b.tapAt));
  const boundary = bounds[0] || null;
  const ids = Object.keys(entries || {}).filter((id) => !isSynthKey(id));
  const at = boundary ? Date.parse(boundary.tapAt) : Infinity;
  return { send: ids.filter((id) => Date.parse(entries[id].tapAt) <= at), boundary };
}
