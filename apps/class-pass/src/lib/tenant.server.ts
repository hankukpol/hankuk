import { cookies, headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { getBranchBySlug } from '@/lib/branch-ops'
import {
  DEFAULT_TENANT_TYPE,
  TENANT_COOKIE,
  TENANT_HEADER,
  buildFallbackTenantConfig,
  getTrackLabel,
  normalizeTenantType,
  normalizeTrackType,
  parseTenantTypeFromPathname,
  type TenantConfig,
  type TenantType,
} from '@/lib/tenant'

const TENANT_CONFIG_CACHE_TTL_MS = 5_000
const tenantConfigCache = new Map<string, { data: TenantConfig; ts: number }>()

const TENANT_METADATA_KEYS = [
  'app_name',
  'theme_color',
  'branch_name',
  'branch_track_type',
  'branch_description',
  'branch_admin_title',
  'branch_series_label',
  'branch_region_label',
] as const

function getScopedConfigKey(tenant: string, key: (typeof TENANT_METADATA_KEYS)[number]) {
  return `${tenant}::${key}`
}

function normalizeStoredString(value: unknown, fallback: string) {
  if (typeof value === 'string') {
    const normalized = value.replace(/^"|"$/g, '').trim()
    if (normalized) {
      return normalized
    }
  }

  return fallback
}

function normalizeStoredColor(value: unknown, fallback: string) {
  if (typeof value === 'string') {
    const normalized = value.replace(/^"|"$/g, '').trim()
    if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
      return normalized
    }
  }

  return fallback
}

function getPathnameFromUrlLike(value: string | null | undefined) {
  if (!value) {
    return null
  }

  try {
    return new URL(value).pathname
  } catch {
    return value
  }
}

export function invalidateServerTenantConfigCache(tenant?: TenantType) {
  if (!tenant) {
    tenantConfigCache.clear()
    return
  }

  tenantConfigCache.delete(tenant)
}

export async function getServerTenantType(): Promise<TenantType> {
  const headerStore = await headers()
  const cookieStore = await cookies()
  const refererPathname = getPathnameFromUrlLike(headerStore.get('referer'))

  return (
    parseTenantTypeFromPathname(headerStore.get('x-hankuk-original-pathname'))
    ?? normalizeTenantType(headerStore.get(TENANT_HEADER))
    ?? parseTenantTypeFromPathname(refererPathname)
    ?? normalizeTenantType(cookieStore.get(TENANT_COOKIE)?.value)
    ?? DEFAULT_TENANT_TYPE
  )
}

export async function getServerTenantConfig(): Promise<TenantConfig> {
  const tenant = await getServerTenantType()
  const cached = tenantConfigCache.get(tenant)
  if (cached && Date.now() - cached.ts < TENANT_CONFIG_CACHE_TTL_MS) {
    return cached.data
  }

  const fallback = buildFallbackTenantConfig(tenant)

  const branch = await getBranchBySlug(tenant)
  if (branch) {
    const branchConfig: TenantConfig = {
      ...fallback,
      branchName: branch.name,
      trackType: branch.track_type,
      trackLabel: getTrackLabel(branch.track_type),
      defaultAppName: branch.app_name,
      defaultDescription: branch.description,
      defaultThemeColor: branch.theme_color,
      adminTitle: branch.admin_title,
      labels: {
        series: branch.series_label,
        region: branch.region_label,
      },
    }

    tenantConfigCache.set(tenant, { data: branchConfig, ts: Date.now() })
    return branchConfig
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('app_config')
    .select('key,value')
    .in('key', [
      ...TENANT_METADATA_KEYS,
      ...TENANT_METADATA_KEYS.map((key) => getScopedConfigKey(tenant, key)),
    ])

  if (error) {
    tenantConfigCache.set(tenant, { data: fallback, ts: Date.now() })
    return fallback
  }

  const valueMap: Record<string, unknown> = {}
  for (const row of data ?? []) {
    valueMap[row.key] = row.value
  }

  const getValue = (key: (typeof TENANT_METADATA_KEYS)[number]) =>
    valueMap[getScopedConfigKey(tenant, key)] ?? valueMap[key]

  const trackType = normalizeTrackType(
    typeof getValue('branch_track_type') === 'string' ? String(getValue('branch_track_type')) : null,
  ) ?? fallback.trackType

  const config: TenantConfig = {
    ...fallback,
    branchName: normalizeStoredString(getValue('branch_name'), fallback.branchName),
    trackType,
    trackLabel: getTrackLabel(trackType),
    defaultAppName: normalizeStoredString(getValue('app_name'), fallback.defaultAppName),
    defaultDescription: normalizeStoredString(getValue('branch_description'), fallback.defaultDescription),
    defaultThemeColor: normalizeStoredColor(getValue('theme_color'), fallback.defaultThemeColor),
    adminTitle: normalizeStoredString(getValue('branch_admin_title'), fallback.adminTitle),
    labels: {
      series: normalizeStoredString(getValue('branch_series_label'), fallback.labels.series),
      region: normalizeStoredString(getValue('branch_region_label'), fallback.labels.region),
    },
  }

  tenantConfigCache.set(tenant, { data: config, ts: Date.now() })
  return config
}
