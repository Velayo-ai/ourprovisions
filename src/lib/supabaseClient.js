// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";
 
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
        const token = await getToken({ template: "supabase" });
        const headers = new Headers(options.headers);
        headers.set("apikey", SUPABASE_ANON_KEY);
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        return fetch(url, { ...options, headers });
      },
    },
  });
}