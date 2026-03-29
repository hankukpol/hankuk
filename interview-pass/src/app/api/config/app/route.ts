import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAppConfig, upsertAppConfig } from '@/lib/app-config'
import { APP_FEATURE_KEYS } from '@/lib/app-config.shared'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  app_name: z.string().min(1).max(50).optional(),
  theme_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  student_login_enabled: z.boolean().optional(),
  student_receipt_enabled: z.boolean().optional(),
  receipt_qr_enabled: z.boolean().optional(),
  receipt_materials_enabled: z.boolean().optional(),
  staff_scan_enabled: z.boolean().optional(),
  staff_quick_distribution_enabled: z.boolean().optional(),
  admin_config_hub_enabled: z.boolean().optional(),
  admin_app_settings_enabled: z.boolean().optional(),
  admin_dashboard_overview_enabled: z.boolean().optional(),
  admin_student_management_enabled: z.boolean().optional(),
  admin_materials_enabled: z.boolean().optional(),
  admin_distribution_logs_enabled: z.boolean().optional(),
  admin_popup_management_enabled: z.boolean().optional(),
  admin_access_management_enabled: z.boolean().optional(),
  admin_cache_tools_enabled: z.boolean().optional(),
  monitor_enabled: z.boolean().optional(),
})

export async function GET() {
  const config = await getAppConfig()
  return NextResponse.json(config)
}

export async function PATCH(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '설정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const payload = parsed.data
  const payloadKeys = Object.keys(payload) as Array<keyof typeof payload>
  const containsAppSettingsUpdate = payloadKeys.some(
    (key) => key === 'app_name' || key === 'theme_color',
  )
  const containsFeatureToggleUpdate = payloadKeys.some((key) =>
    APP_FEATURE_KEYS.includes(key as (typeof APP_FEATURE_KEYS)[number]),
  )

  if (!containsAppSettingsUpdate && !containsFeatureToggleUpdate) {
    return NextResponse.json(
      { error: '저장할 수 있는 설정 항목이 포함되어 있지 않습니다.' },
      { status: 400 },
    )
  }

  if (containsAppSettingsUpdate) {
    const featureError = await requireAppFeature('admin_app_settings_enabled')
    if (featureError) {
      return featureError
    }
  }

  try {
    await upsertAppConfig(payload)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '앱 설정 저장에 실패했습니다.' },
      { status: 500 },
    )
  }
}
