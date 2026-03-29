import { createClient } from '@supabase/supabase-js'

function getServerSupabaseEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
}

export function hasServerSupabaseEnv() {
  const { url, key } = getServerSupabaseEnv()
  return Boolean(url && key)
}

// Server-only service_role client. Do not import from client components.
export function createServerClient() {
  const { url, key } = getServerSupabaseEnv()

  if (!url || !key) {
    throw new Error('Supabase environment variables are not configured.')
  }

  return createClient(url, key, {
    db: { schema: 'interview' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
