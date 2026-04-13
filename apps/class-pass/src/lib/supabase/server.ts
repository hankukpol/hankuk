import { createClient } from '@supabase/supabase-js'

function getServerSupabaseEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
}

export function createServerClient() {
  const { url, key } = getServerSupabaseEnv()

  if (!url || !key) {
    throw new Error('Supabase environment variables are not configured.')
  }

  return createClient(url, key, {
    db: { schema: 'class_pass' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
