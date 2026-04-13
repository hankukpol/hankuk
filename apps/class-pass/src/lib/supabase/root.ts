import { createClient } from '@supabase/supabase-js'

function getSupabaseEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
}

export function createRootServerClient() {
  const { url, key } = getSupabaseEnv()

  if (!url || !key) {
    throw new Error('Supabase environment variables are not configured.')
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
