// THE SESSION FOR AN ACTION (SPEC_shop_lens_instore_capture D10/D11; SPEC_one_list R5, 2026-11-26).
//
// The one place a client opens or joins a shopping session. useProvisions' ensureSession is a thin
// wrapper that hands it the hook's refs. A check, an uncheck or the offline check flush may START a
// trip: a check-off is what a trip is. An add never may (R5): it passes adoptOnly and gets this
// person's open session or null, never a new one.
//
// Why a re-read rather than this phone's activeSession: the copy here can be stale. The trip may have
// been wrapped up on another phone, or passed the 8 h expiry, since the last read. reload() is
// loadSessions, which reads the household's open sessions, ends a stale own one and sets the current
// one (or null), so current() after it is the database's answer.
//
// starting: the hook's sessionStartingRef ({ current: Promise | null }). Only a call that may start
// holds it, so two quick taps can't open two sessions during the GPS wait. An adoptOnly call never
// holds it: it can't make a concurrent check wait on a read that will never start the trip. It does
// JOIN a start already in flight, so an add right after the first check-off lands in that trip.
export async function ensureTripSession({ starting, reload, current, start, adoptOnly = false }) {
  if (starting.current) return starting.current;
  if (adoptOnly) {
    await reload();
    return current() || null;
  }
  starting.current = (async () => {
    await reload();
    const cur = current();
    if (cur) return cur;
    return start();
  })();
  try {
    return await starting.current;
  } finally {
    starting.current = null;
  }
}
