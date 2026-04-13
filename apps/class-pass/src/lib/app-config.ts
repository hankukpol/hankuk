import { revalidateTag } from 'next/cache'
import {
  APP_CONFIG_DEFAULTS,
  APP_CONFIG_KEYS,
  APP_FEATURE_KEYS,
  APP_TEXT_CONFIG_KEYS,
  type AppConfigKey,
  type AppConfigSnapshot,
  type AppFeatureKey,
  type AppTextConfigKey,
} from '@/lib/app-config.shared'
import { upsertBranch } from '@/lib/branch-ops'
import { createServerClient } from '@/lib/supabase/server'
import { normalizeTrackType } from '@/lib/tenant'
import {
  getServerTenantConfig,
  getServerTenantType,
  invalidateServerTenantConfigCache,
} from '@/lib/tenant.server'

export const APP_CONFIG_TAG = 'app-config'

const configCache = new Map<string, { data: AppConfigSnapshot; ts: number }>()
const CONFIG_CACHE_TTL_MS = 5_000

const STRING_CONFIG_KEYS = APP_TEXT_CONFIG_KEYS.filter(
  (key): key is Exclude<AppTextConfigKey, 'branch_track_type'> => key !== 'branch_track_type',
)

function getScopedConfigKey(division: string, key: AppConfigKey) {
  return `${division}::${key}`
}

function normalizeStoredString(value: unknown, fallback: string) {
  if (typeof value === 'string') {
    return value.replace(/^"|"$/g, '').trim() || fallback
  }

  return fallback
}

function normalizeStoredBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/^"|"$/g, '').trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }

  return fallback
}

function normalizeStoredTrack(value: unknown, fallback: AppConfigSnapshot['branch_track_type']) {
  if (typeof value === 'string') {
    return normalizeTrackType(value.replace(/^"|"$/g, '').trim()) ?? fallback
  }

  return fallback
}

function buildDefaultConfig(tenant: Awaited<ReturnType<typeof getServerTenantConfig>>): AppConfigSnapshot {
  return {
    ...APP_CONFIG_DEFAULTS,
    branch_name: tenant.branchName,
    branch_track_type: tenant.trackType,
    branch_description: tenant.defaultDescription,
    branch_admin_title: tenant.adminTitle,
    branch_series_label: tenant.labels.series,
    branch_region_label: tenant.labels.region,
    app_name: tenant.defaultAppName,
    theme_color: tenant.defaultThemeColor,
  }
}

function hydrateConfig(
  defaults: AppConfigSnapshot,
  valueMap: Record<string, unknown>,
  division: string,
): AppConfigSnapshot {
  const result: AppConfigSnapshot = { ...defaults }

  const getValue = (key: AppConfigKey) =>
    valueMap[getScopedConfigKey(division, key)] ?? valueMap[key]

  for (const key of STRING_CONFIG_KEYS) {
    result[key] = normalizeStoredString(getValue(key), defaults[key])
  }

  result.branch_track_type = normalizeStoredTrack(
    getValue('branch_track_type'),
    defaults.branch_track_type,
  )

  for (const key of APP_FEATURE_KEYS) {
    result[key] = normalizeStoredBoolean(getValue(key), defaults[key])
  }

  return result
}

export async function getAppConfig(): Promise<AppConfigSnapshot> {
  const division = await getServerTenantType()
  const cached = configCache.get(division)
  if (cached && Date.now() - cached.ts < CONFIG_CACHE_TTL_MS) {
    return cached.data
  }

  const tenant = await getServerTenantConfig()
  const db = createServerClient()
  const defaults = buildDefaultConfig(tenant)
  const { data } = await db
    .from('app_config')
    .select('key,value')
    .in('key', [
      ...APP_CONFIG_KEYS,
      ...APP_CONFIG_KEYS.map((key) => getScopedConfigKey(division, key)),
    ])

  const valueMap: Record<string, unknown> = {}
  for (const row of data ?? []) {
    valueMap[row.key] = row.value
  }

  const result = hydrateConfig(defaults, valueMap, division)
  configCache.set(division, { data: result, ts: Date.now() })
  return result
}

export async function isAppFeatureEnabled(feature: AppFeatureKey) {
  const config = await getAppConfig()
  return config[feature]
}

export async function upsertAppConfig(values: Partial<AppConfigSnapshot>) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined) as Array<
    [AppConfigKey, AppConfigSnapshot[AppConfigKey]]
  >

  if (entries.length === 0) {
    return
  }

  const division = await getServerTenantType()
  const db = createServerClient()
  const payload = entries.map(([key, value]) => ({
    key: getScopedConfigKey(division, key),
    value: String(value ?? ''),
    updated_at: new Date().toISOString(),
  }))

  const { error } = await db.from('app_config').upsert(payload, { onConflict: 'key' })
  if (error) {
    throw new Error('설정을 저장하지 못했습니다.')
  }

  const merged = {
    ...(await getAppConfig()),
    ...values,
  }

  await upsertBranch({
    slug: division,
    name: merged.branch_name,
    track_type: merged.branch_track_type,
    description: merged.branch_description,
    admin_title: merged.branch_admin_title,
    series_label: merged.branch_series_label,
    region_label: merged.branch_region_label,
    app_name: merged.app_name,
    theme_color: merged.theme_color,
  }).catch(() => null)

  configCache.delete(division)
  invalidateServerTenantConfigCache(division)
  revalidateTag(APP_CONFIG_TAG)
}
