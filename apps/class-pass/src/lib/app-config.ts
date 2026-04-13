import { revalidateTag } from 'next/cache'
import { upsertBranch } from '@/lib/branch-ops'
import { invalidateServerTenantConfigCache, getServerTenantConfig, getServerTenantType } from '@/lib/tenant.server'
import { normalizeTrackType } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import {
  APP_CONFIG_DEFAULTS,
  type AppConfigSnapshot,
  type AppFeatureKey,
} from '@/lib/app-config.shared'

export const APP_CONFIG_TAG = 'app-config'

const configCache = new Map<string, { data: AppConfigSnapshot; ts: number }>()
const CONFIG_CACHE_TTL_MS = 5_000

function getScopedConfigKey(division: string, key: keyof AppConfigSnapshot) {
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

export async function getAppConfig(): Promise<AppConfigSnapshot> {
  const division = await getServerTenantType()
  const cached = configCache.get(division)
  if (cached && Date.now() - cached.ts < CONFIG_CACHE_TTL_MS) {
    return cached.data
  }

  const tenant = await getServerTenantConfig()
  const db = createServerClient()
  const defaults: AppConfigSnapshot = {
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

  const { data } = await db
    .from('app_config')
    .select('key,value')
    .in('key', [
      ...Object.keys(defaults),
      ...Object.keys(defaults).map((key) => getScopedConfigKey(division, key as keyof AppConfigSnapshot)),
    ])

  const valueMap: Record<string, unknown> = {}
  for (const row of data ?? []) {
    valueMap[row.key] = row.value
  }

  const getValue = <K extends keyof AppConfigSnapshot>(key: K) =>
    valueMap[getScopedConfigKey(division, key)] ?? valueMap[key]

  const result: AppConfigSnapshot = {
    branch_name: normalizeStoredString(getValue('branch_name'), defaults.branch_name),
    branch_track_type: normalizeStoredTrack(getValue('branch_track_type'), defaults.branch_track_type),
    branch_description: normalizeStoredString(getValue('branch_description'), defaults.branch_description),
    branch_admin_title: normalizeStoredString(getValue('branch_admin_title'), defaults.branch_admin_title),
    branch_series_label: normalizeStoredString(getValue('branch_series_label'), defaults.branch_series_label),
    branch_region_label: normalizeStoredString(getValue('branch_region_label'), defaults.branch_region_label),
    app_name: normalizeStoredString(getValue('app_name'), defaults.app_name),
    theme_color: normalizeStoredString(getValue('theme_color'), defaults.theme_color),
    student_login_enabled: normalizeStoredBoolean(getValue('student_login_enabled'), defaults.student_login_enabled),
    student_courses_enabled: normalizeStoredBoolean(getValue('student_courses_enabled'), defaults.student_courses_enabled),
    student_pass_enabled: normalizeStoredBoolean(getValue('student_pass_enabled'), defaults.student_pass_enabled),
    staff_scan_enabled: normalizeStoredBoolean(getValue('staff_scan_enabled'), defaults.staff_scan_enabled),
    admin_course_management_enabled: normalizeStoredBoolean(
      getValue('admin_course_management_enabled'),
      defaults.admin_course_management_enabled,
    ),
    admin_student_management_enabled: normalizeStoredBoolean(
      getValue('admin_student_management_enabled'),
      defaults.admin_student_management_enabled,
    ),
    admin_seat_management_enabled: normalizeStoredBoolean(
      getValue('admin_seat_management_enabled'),
      defaults.admin_seat_management_enabled,
    ),
    admin_material_management_enabled: normalizeStoredBoolean(
      getValue('admin_material_management_enabled'),
      defaults.admin_material_management_enabled,
    ),
    admin_log_view_enabled: normalizeStoredBoolean(
      getValue('admin_log_view_enabled'),
      defaults.admin_log_view_enabled,
    ),
    admin_config_enabled: normalizeStoredBoolean(getValue('admin_config_enabled'), defaults.admin_config_enabled),
  }

  configCache.set(division, { data: result, ts: Date.now() })
  return result
}

export async function isAppFeatureEnabled(feature: AppFeatureKey) {
  const config = await getAppConfig()
  return config[feature]
}

export async function upsertAppConfig(values: Partial<AppConfigSnapshot>) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined) as Array<
    [keyof AppConfigSnapshot, AppConfigSnapshot[keyof AppConfigSnapshot]]
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
