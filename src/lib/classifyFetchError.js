export function classifyFetchError(err) {
  if (!err) return 'real';

  if (err.name === 'AbortError') return 'transient';

  const msg = typeof err.message === 'string' ? err.message : '';

  const transientPhrases = [
    'Failed to fetch',
    'NetworkError',
    'ERR_CONNECTION',
    'ERR_NETWORK',
    'ERR_INTERNET_DISCONNECTED',
    'ERR_NAME_NOT_RESOLVED',
    // Clock skew between GoTrue's token `iat` and PostgREST's validation clock.
    // Self-resolves in ~1-2s, so it is transient in the strict sense: nothing is
    // wrong, the token is simply early. Unlike the entries above it is not a
    // transport failure — it is a successful round-trip that the server rejected —
    // but the user-facing consequence is identical (a brief, self-healing gap), and
    // the quiet "Reconnecting…" pill is the honest surface for it rather than a
    // raw error toast naming a JWT.
    //
    // NOTE: refreshCatalog retries this ONE phrase once before classifying. Reaching
    // here means that retry already failed, so this is the second failure, not the
    // first. Do not add a retry for the other phrases on the strength of this one —
    // blindly retrying a genuinely dead connection just hammers it.
    'JWT not yet valid',
  ];

  if (transientPhrases.some((phrase) => msg.includes(phrase))) return 'transient';

  if (err.name === 'TypeError' && /fetch|network/i.test(msg)) return 'transient';

  return 'real';
}
