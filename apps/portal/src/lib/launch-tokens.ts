import 'server-only'

import { createHash, randomBytes } from 'crypto'
import type { HankukAppKey, HankukPortalTargetRole } from '@hankuk/config'
import { createServiceSupabaseClient } from '@/lib/supabase'

export type PortalTargetRole = HankukPortalTargetRole

const LAUNCH_TOKEN_TTL_SEC = 60
const EXPIRED_TOKEN_CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let lastExpiredTokenCleanupAt = 0

export class PortalLaunchInfraError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PortalLaunchInfraError'
  }
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function isMissingPortalLaunchInfra(message: string) {
  const normalized = message.toLowerCase()
  return (
    (normalized.includes('portal_launch_tokens') && normalized.includes('schema cache')) ||
    normalized.includes("could not find the table 'public.portal_launch_tokens'") ||
    normalized.includes("could not find the function public.consume_portal_launch_token")
  )
}

async function cleanupExpiredLaunchTokens() {
  const now = Date.now()
  if (now - lastExpiredTokenCleanupAt < EXPIRED_TOKEN_CLEANUP_INTERVAL_MS) {
    return
  }

  lastExpiredTokenCleanupAt = now

  const db = createServiceSupabaseClient()
  const { error } = await db
    .from('portal_launch_tokens')
    .delete()
    .lt('expires_at', new Date(now).toISOString())

  if (error) {
    console.warn('[portal-launch] Failed to cleanup expired launch tokens.', error.message)
  }
}

export async function issuePortalLaunchToken(input: {
  userId: string
  appKey: HankukAppKey
  divisionSlug?: string | null
  targetPath: string
  targetRole: PortalTargetRole
}) {
  const plainToken = randomBytes(32).toString('base64url')
  const db = createServiceSupabaseClient()
  const expiresAt = new Date(Date.now() + LAUNCH_TOKEN_TTL_SEC * 1000).toISOString()

  await cleanupExpiredLaunchTokens()

  const { error } = await db.from('portal_launch_tokens').insert({
    token_hash: hashToken(plainToken),
    user_id: input.userId,
    app_key: input.appKey,
    division_slug: input.divisionSlug ?? null,
    target_path: input.targetPath,
    target_role: input.targetRole,
    expires_at: expiresAt,
  })

  if (error) {
    if (isMissingPortalLaunchInfra(error.message)) {
      throw new PortalLaunchInfraError(
        '포털 실행 토큰용 DB 구조가 아직 적용되지 않았습니다. `supabase/migrations/20260412143000_add_class_pass_and_portal_registry.sql`을 먼저 실행해 주세요.',
      )
    }

    throw new Error(`Failed to issue portal launch token: ${error.message}`)
  }

  return plainToken
}
