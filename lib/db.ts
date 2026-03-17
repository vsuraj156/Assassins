import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Browser client (uses anon key, RLS enforced)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server client (uses service role key, bypasses RLS — use only in server-side code)
export function createServerClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  })
}
