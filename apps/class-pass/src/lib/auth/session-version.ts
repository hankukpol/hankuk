import { createServerClient } from '@/lib/supabase/server'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { getServerTenantType } from '@/lib/tenant.server'

export type SessionRole = 'admin' | 'staff'

export const DEFAULT_SESSION_VERSION = 1

const SESSION_VERSION_CACHE_TTL_MS = 5_000
const _sessionVersionCache = new Map<string, { value: number; ts: number }>()

function getCacheKey(division: string, role: SessionRole) {
  return `${division}::${role}`
}

function getConfigKey(division: string, role: SessionRole) {
  return `${division}::${role}_session_version`
}

function normalizeSessionVersion(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isInteger(parsed) && parsed >= 1) {
      return parsed
    }
  }

  return DEFAULT_SESSION_VERSION
}

export async function getSessionVersion(role: SessionRole): Promise<number> {
  const division = await getServerTenantType()
  const cacheKey = getCacheKey(division, role)
  const cached = _sessionVersionCache.get(cacheKey)

  if (cached && Date.now() - cached.ts < SESSION_VERSION_CACHE_TTL_MS) {
    return cached.value
  }

  const db = createServerClient()
  const row = unwrapSupabaseResult(
    `sessionVersion.${role}.get`,
    await db
      .from('app_config')
      .select('value')
      .eq('key', getConfigKey(division, role))
      .maybeSingle(),
  ) as { value?: unknown } | null

  const version = normalizeSessionVersion(row?.value)
  _sessionVersionCache.set(cacheKey, { value: version, ts: Date.now() })
  return version
}

export async function rotateSessionVersion(role: SessionRole): Promise<number> {
  const division = await getServerTenantType()
  const nextVersion = (await getSessionVersion(role)) + 1
  const db = createServerClient()
  const { error } = await db.from('app_config').upsert({
    key: getConfigKey(division, role),
    value: String(nextVersion),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })

  if (error) {
    throw new Error(`Failed to rotate ${role} session version.`)
  }

  _sessionVersionCache.set(getCacheKey(division, role), {
    value: nextVersion,
    ts: Date.now(),
  })

  return nextVersion
}
