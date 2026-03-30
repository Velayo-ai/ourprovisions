import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY

// Public client for unauthenticated queries (e.g. catalog)
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'op-public'
  }
})

// Authenticated client with Clerk token — different storageKey avoids GoTrueClient warning
let authedClient = null

export const getSupabaseWithToken = (token) => {
  if (!authedClient) {
    authedClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'op-authed'
      }
    })
  }
  return authedClient
}
