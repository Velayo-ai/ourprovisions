// src/lib/transientPhrases.js — the ONE transient-network vocabulary
// (SPEC_auth_state_ui_gating.md Amendment 2026-09-27, A1).
//
// Two classifiers read this list: classifyFetchError (a Supabase read or write
// that never reached the server) and authHealth.classifyTokenFailure (a Clerk
// getToken that never completed). Until 2026-09-27 each carried its own list,
// and they drifted: authHealth knew WebKit's "Load failed", the fetch classifier
// knew only Chrome's "Failed to fetch" — so on an iPhone every request that died
// on a cold radio was a "real" error, toasted, and (for bootstrap) terminal.
//
// Every phrase here means "the request never got an answer". A server that
// answered — 401, 403, 42501, a PostgREST error — is never transient by this
// list; the callers decide those on their own.
export const TRANSIENT_NETWORK_PHRASES = [
  'Failed to fetch',            // Chrome / Edge
  'Load failed',                // WebKit (iOS Safari, every iOS PWA)
  'NetworkError',               // Firefox ("NetworkError when attempting to fetch resource")
  'ERR_CONNECTION',
  'ERR_NETWORK',
  'ERR_INTERNET_DISCONNECTED',
  'ERR_NAME_NOT_RESOLVED',
];

export function hasTransientNetworkPhrase(message) {
  if (typeof message !== 'string') return false;
  return TRANSIENT_NETWORK_PHRASES.some((phrase) => message.includes(phrase));
}

// postgrest-js catches a rejected fetch and returns a NAMELESS plain object
// whose message is `${err.name}: ${err.message}` ("TypeError: Load failed").
// The browser's own TypeError carries the name on the object instead. This
// reads both shapes the same: name (if any) and the bare message.
export function splitErrorMessage(err) {
  const raw = err && typeof err.message === 'string' ? err.message : '';
  let name = err && typeof err.name === 'string' ? err.name : '';
  let message = raw;
  const m = /^([A-Za-z]*Error):\s*(.*)$/s.exec(raw);
  if (m) {
    if (!name) name = m[1];
    message = m[2];
  }
  return { name, message };
}
