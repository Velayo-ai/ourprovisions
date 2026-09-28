import { isAuthTokenMissing } from "./supabaseClient";
import { hasTransientNetworkPhrase, splitErrorMessage } from "./transientPhrases";

// §Polling discipline (SPEC_auth_state_ui_gating.md). Auth failures are a class
// of their own, checked BEFORE transient/real: neither retries nor toasts.
//   'missing'  — the fetch wrapper refused: no Clerk token (authHealth already
//                counted the tick; the poller just skips it)
//   'rejected' — the server answered 401/403 to a request that carried a token
//   null       — not an auth failure; classifyFetchError decides from here
export function classifyAuthFailure(error, status) {
  if (status === 401 || status === 403) return 'rejected';
  if (isAuthTokenMissing(error)) return 'missing';
  return null;
}

export function classifyFetchError(err) {
  if (!err) return 'real';

  // postgrest-js hands a rejected fetch back as a NAMELESS object with message
  // "TypeError: Load failed" (status 0); the browser's own error carries the
  // name. Read both shapes the same (Amendment 2026-09-27, A1).
  const { name, message: msg } = splitErrorMessage(err);

  if (name === 'AbortError') return 'transient';

  // The shared network vocabulary — one list with authHealth.classifyTokenFailure,
  // so WebKit's "Load failed" and Chrome's "Failed to fetch" are transient on
  // every path and the two classifiers cannot drift again.
  if (hasTransientNetworkPhrase(msg)) return 'transient';

  // Clock skew between GoTrue's token `iat` and PostgREST's validation clock.
  // Self-resolves in ~1-2s, so it is transient in the strict sense: nothing is
  // wrong, the token is simply early. Unlike the network phrases it is not a
  // transport failure — it is a successful round-trip that the server rejected —
  // but the user-facing consequence is identical (a brief, self-healing gap), and
  // the quiet "Reconnecting…" pill is the honest surface for it rather than a
  // raw error toast naming a JWT.
  //
  // NOTE: refreshCatalog retries this ONE phrase once before classifying. Reaching
  // here means that retry already failed, so this is the second failure, not the
  // first. Do not add a retry for the other phrases on the strength of this one —
  // blindly retrying a genuinely dead connection just hammers it.
  if (msg.includes('JWT not yet valid')) return 'transient';

  if (name === 'TypeError' && /fetch|network/i.test(msg)) return 'transient';

  return 'real';
}
