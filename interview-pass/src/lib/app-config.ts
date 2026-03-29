import { revalidateTag, unstable_cache } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { getTenantConfigByType, type TenantType } from '@/lib/tenant'
import { getServerTenantType } from '@/lib/tenant.server'
import {
  APP_CONFIG_DEFAULTS,
  APP_CONFIG_DESCRIPTIONS,
  type AppConfigSnapshot,
  type AppFeatureKey,
} from '@/lib/app-config.shared'

export const APP_CONFIG_TAG = 'app-config'

function getAppConfigDefaultsWithTenant(division: TenantType): AppConfigSnapshot {
  return {
    ...APP_CONFIG_DEFAULTS,
    app_name: getTenantConfigByType(division).defaultAppName,
  }
}

function getScopedConfigKey(division: TenantType, key: keyof AppConfigSnapshot) {
  return `${division}::${key}`
}

function normalizeStoredString(value: unknown, fallback: string) {
  if (typeof value === 'string') {
    return value.replace(/^"|"$/g, '')
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

const getCachedAppConfig = unstable_cache(
  async (division: TenantType): Promise<AppConfigSnapshot> => {
    const defaults = getAppConfigDefaultsWithTenant(division)
    const db = createServerClient()
    const { data } = await db
      .from('app_config')
      .select('config_key, config_value')
      .in('config_key', [
        ...Object.keys(defaults),
        ...Object.keys(defaults).map((key) => getScopedConfigKey(division, key as keyof AppConfigSnapshot)),
      ])

    const map: Record<string, unknown> = {}
    for (const row of data ?? []) {
      map[row.config_key] = row.config_value
    }

    const valueFor = <K extends keyof AppConfigSnapshot>(key: K) =>
      map[getScopedConfigKey(division, key)] ?? map[key]

    return {
      app_name: normalizeStoredString(valueFor('app_name'), defaults.app_name),
      theme_color: normalizeStoredString(valueFor('theme_color'), defaults.theme_color),
      student_login_enabled: normalizeStoredBoolean(
        valueFor('student_login_enabled'),
        defaults.student_login_enabled,
      ),
      student_receipt_enabled: normalizeStoredBoolean(
        valueFor('student_receipt_enabled'),
        defaults.student_receipt_enabled,
      ),
      receipt_qr_enabled: normalizeStoredBoolean(
        valueFor('receipt_qr_enabled'),
        defaults.receipt_qr_enabled,
      ),
      receipt_materials_enabled: normalizeStoredBoolean(
        valueFor('receipt_materials_enabled'),
        defaults.receipt_materials_enabled,
      ),
      staff_scan_enabled: normalizeStoredBoolean(
        valueFor('staff_scan_enabled'),
        defaults.staff_scan_enabled,
      ),
      staff_quick_distribution_enabled: normalizeStoredBoolean(
        valueFor('staff_quick_distribution_enabled'),
        defaults.staff_quick_distribution_enabled,
      ),
      admin_config_hub_enabled: normalizeStoredBoolean(
        valueFor('admin_config_hub_enabled'),
        defaults.admin_config_hub_enabled,
      ),
      admin_app_settings_enabled: normalizeStoredBoolean(
        valueFor('admin_app_settings_enabled'),
        defaults.admin_app_settings_enabled,
      ),
      admin_dashboard_overview_enabled: normalizeStoredBoolean(
        valueFor('admin_dashboard_overview_enabled'),
        defaults.admin_dashboard_overview_enabled,
      ),
      admin_student_management_enabled: normalizeStoredBoolean(
        valueFor('admin_student_management_enabled'),
        defaults.admin_student_management_enabled,
      ),
      admin_materials_enabled: normalizeStoredBoolean(
        valueFor('admin_materials_enabled'),
        defaults.admin_materials_enabled,
      ),
      admin_distribution_logs_enabled: normalizeStoredBoolean(
        valueFor('admin_distribution_logs_enabled'),
        defaults.admin_distribution_logs_enabled,
      ),
      admin_popup_management_enabled: normalizeStoredBoolean(
        valueFor('admin_popup_management_enabled'),
        defaults.admin_popup_management_enabled,
      ),
      admin_access_management_enabled: normalizeStoredBoolean(
        valueFor('admin_access_management_enabled'),
        defaults.admin_access_management_enabled,
      ),
      admin_cache_tools_enabled: normalizeStoredBoolean(
        valueFor('admin_cache_tools_enabled'),
        defaults.admin_cache_tools_enabled,
      ),
      monitor_enabled: normalizeStoredBoolean(
        valueFor('monitor_enabled'),
        defaults.monitor_enabled,
      ),
    }
  },
  ['app-config'],
  { tags: [APP_CONFIG_TAG], revalidate: 600 },
)

export async function getAppConfig() {
  const division = await getServerTenantType()
  return getCachedAppConfig(division)
}

export async function isAppFeatureEnabled(feature: AppFeatureKey) {
  const config = await getAppConfig()
  return config[feature]
}

export async function upsertAppConfig(values: Partial<AppConfigSnapshot>) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined) as Array<
    [keyof AppConfigSnapshot, AppConfigSnapshot[keyof AppConfigSnapshot]]
  >

  if (entries.length === 0) return

  const division = await getServerTenantType()
  const db = createServerClient()
  const updatedAt = new Date().toISOString()

  const payload = entries.map(([key, value]) => ({
    config_key: getScopedConfigKey(division, key),
    config_value: value,
    description: APP_CONFIG_DESCRIPTIONS[key],
    updated_at: updatedAt,
  }))

  const { error } = await db.from('app_config').upsert(payload)
  if (error) {
    throw new Error('앱 설정 저장에 실패했습니다.')
  }

  revalidateTag(APP_CONFIG_TAG)
}
