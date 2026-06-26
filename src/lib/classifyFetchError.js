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
  ];

  if (transientPhrases.some((phrase) => msg.includes(phrase))) return 'transient';

  if (err.name === 'TypeError' && /fetch|network/i.test(msg)) return 'transient';

  return 'real';
}
