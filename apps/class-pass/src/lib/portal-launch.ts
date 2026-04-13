import 'server-only'

import { createRootServerClient } from '@/lib/supabase/root'
import { CLASS_PASS_APP_KEY } from '@/lib/branch-ops'

type ConsumedPortalLaunch = {
  user_id: string
  division_slug: string | null
  target_path: string
  target_role: 'super_admin' | 'admin' | 'assistant' | 'staff'
}

export async function consumePortalLaunchToken(token: string) {
  const root = createRootServerClient()
  const { data, error } = await root.rpc('consume_portal_launch_token', {
    p_plain_token: token,
    p_app_key: CLASS_PASS_APP_KEY,
  })

  if (error) {
    throw new Error(`Failed to consume portal launch token: ${error.message}`)
  }

  const row = Array.isArray(data) ? data[0] : null
  if (!row) {
    return null
  }

  return row as ConsumedPortalLaunch
}
