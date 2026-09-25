// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";
import { reportToken, classifyTokenFailure } from "./authHealth";
 
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
 
// `storageKey` MUST be distinct per caller. Two clients built by this factory coexist for
// the life of a session — useProvisions' and ActiveHouseholdContext's — and without a key
// each they both take GoTrue's default and collide, which is what raises
// "Multiple GoTrueClient instances detected in the same browser context".
//
// Benign here (persistSession is false, and request auth rides the Clerk JWT injected by
// the fetch wrapper below, never a GoTrue session) — but a console warning everyone learns
// to scroll past is how a real one gets missed later.
//
// This lesson was learned once before, in the since-deleted `src/supabase.js`, which
// assigned `op-public`/`op-authed` for exactly this reason — and it never got carried into
// this newer factory. Anything that creates a THIRD client needs its own key too.
// D1 (SPEC_auth_state_ui_gating.md): the wrapper REFUSES when there is no Clerk
// token. It never downgrades to apikey-only — that is the "silent anon downgrade"
// (prod, 2026-09-24: loadPlacements 401 every 2s under a SIGN IN header).
// postgrest-js catches a rejected fetch and hands callers
// { error: { message: "AuthTokenMissing: …", code: "" }, status: 0 }, so the
// name is the discriminator — see isAuthTokenMissing.
export class AuthTokenMissing extends Error {
  constructor(failClass) {
    super(`no Clerk token (${failClass || "clerk"}) — refusing to query as anon`);
    this.name = "AuthTokenMissing";
    this.failClass = failClass || "clerk";   // 'network' | 'clerk' — see authHealth.classifyTokenFailure
  }
}

export function isAuthTokenMissing(err) {
  if (!err) return false;
  if (err.name === "AuthTokenMissing") return true;
  return typeof err.message === "string" && err.message.startsWith("AuthTokenMissing");
}

export function createSupabaseClient(getToken, storageKey) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionFromUrl: false,
      storageKey,
    },
    global: {
      headers: {
        apikey: SUPABASE_ANON_KEY,
      },
      fetch: async (url, options = {}) => {
        // Amendment 2026-09-24 (offline is not auth loss): getToken can REJECT,
        // not just return null — offline, the request to Clerk never completes.
        // Catch it, classify it (network vs Clerk-reported), report it, refuse.
        // Both classes are a hold upstream; neither ends the session.
        let token = null;
        let failClass = null;
        try {
          token = await getToken({ template: "supabase" });
          if (!token) failClass = "clerk";
        } catch (err) {
          failClass = classifyTokenFailure(err);
        }
        reportToken(!!token, failClass);   // authHealth: the streak App.js derives authPhase from
        if (!token) throw new AuthTokenMissing(failClass);
        const headers = new Headers(options.headers);
        headers.set("apikey", SUPABASE_ANON_KEY);
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(url, { ...options, headers });
      },
    },
  });
}