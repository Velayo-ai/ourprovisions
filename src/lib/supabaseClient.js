// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";
 
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
 
export function createSupabaseClient(getToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionFromUrl: false,
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